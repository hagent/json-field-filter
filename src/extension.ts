import * as vscode from 'vscode';
import { SidebarProvider } from './sidebarProvider';
import {
  FilteredJsonProvider,
  FILTERED_JSON_SCHEME,
  createFilteredJsonUri,
  getSourceUriFromFilteredUri,
} from './virtualDocProvider';
import { extractFieldNamesFromContent } from './jsonFieldExtractor';
import { FieldInfo, Preset } from './types';

let sidebarProvider: SidebarProvider;
let virtualDocProvider: FilteredJsonProvider;

// Current active source (original file, not filtered view)
let currentSourceUri: vscode.Uri | null = null;

// Store field states per source file
const fieldStatesMap = new Map<string, FieldInfo[]>();

export function activate(context: vscode.ExtensionContext) {
  virtualDocProvider = new FilteredJsonProvider();

  context.subscriptions.push(
    vscode.workspace.registerTextDocumentContentProvider(FILTERED_JSON_SCHEME, virtualDocProvider)
  );

  sidebarProvider = new SidebarProvider(
    context.extensionUri,
    handleFieldToggle,
    handleOpenFilteredView,
    handleExtractFields,
    handleApplyPreset
  );

  // Load and send presets
  const presets = getPresets();
  sidebarProvider.setPresets(presets);

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(SidebarProvider.viewType, sidebarProvider)
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('jsonFieldFilter.openFilteredView', handleOpenFilteredView)
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('jsonFieldFilter.extractFields', handleExtractFields)
  );

  // Listen for active editor changes
  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor((editor) => {
      handleEditorChanged(editor);
    })
  );

  // Initialize with current editor
  handleEditorChanged(vscode.window.activeTextEditor);
}

function isUntitledDocument(document: vscode.TextDocument): boolean {
  return document.uri.scheme === 'untitled';
}

function getDisplayName(document: vscode.TextDocument): string {
  if (isUntitledDocument(document)) {
    return 'Untitled';
  }
  return document.fileName.split('/').pop() || document.fileName;
}

function handleEditorChanged(editor: vscode.TextEditor | undefined): void {
  if (!editor) {
    currentSourceUri = null;
    sidebarProvider.setSourceUri(null);
    sidebarProvider.updateFields([]);
    sidebarProvider.setError(null);
    return;
  }

  const document = editor.document;

  // If it's a filtered view, get the original source URI
  if (document.uri.scheme === FILTERED_JSON_SCHEME) {
    const sourceUri = getSourceUriFromFilteredUri(document.uri);
    if (sourceUri) {
      // Keep showing the same source file's fields
      if (currentSourceUri?.toString() === sourceUri.toString()) {
        // Same source, do nothing - keep current state
        return;
      }
      // Different source in filtered view - restore its state
      currentSourceUri = sourceUri;
      const savedFields = fieldStatesMap.get(sourceUri.toString());
      if (savedFields) {
        sidebarProvider.setSourceUri(sourceUri.fsPath.split('/').pop() || 'Filtered');
        sidebarProvider.updateFields(filterFieldsForDisplay(savedFields));
        sidebarProvider.setError(null);
        updateVirtualDocProvider(sourceUri, savedFields);
      }
    }
    return;
  }

  // Regular file
  const uriString = document.uri.toString();

  // Check if it's the same source we're already showing
  if (currentSourceUri?.toString() === uriString) {
    return;
  }

  // Switching to a different file
  currentSourceUri = document.uri;
  const displayName = getDisplayName(document);

  // Check if we have saved state for this file
  const savedFields = fieldStatesMap.get(uriString);
  if (savedFields) {
    sidebarProvider.setSourceUri(displayName);
    sidebarProvider.updateFields(filterFieldsForDisplay(savedFields));
    sidebarProvider.setError(null);
    updateVirtualDocProvider(document.uri, savedFields);
  } else {
    // No saved state - show empty
    sidebarProvider.setSourceUri(displayName);
    sidebarProvider.updateFields([]);
    sidebarProvider.setError(null);
  }
}

// Hide simple fields from display if there are fewer than 5 of them
// Exception: always show fields that are already hidden (for presets)
function filterFieldsForDisplay(fields: FieldInfo[]): FieldInfo[] {
  const config = vscode.workspace.getConfiguration('jsonFieldFilter');
  const threshold = config.get<number>('simpleFieldThreshold') ?? 5;

  if (threshold === 0) {
    return fields;
  }

  const simpleFields = fields.filter(f => !f.isComplex);
  const simpleFieldCount = simpleFields.length;

  if (simpleFieldCount >= threshold) {
    return fields;
  }

  // Hide simple fields from panel unless they're already marked as filtered out
  return fields.filter(f => f.isComplex || f.hidden);
}

function updateVirtualDocProvider(sourceUri: vscode.Uri, fields: FieldInfo[]): void {
  const isUntitled = sourceUri.scheme === 'untitled';
  virtualDocProvider.setSource(sourceUri, isUntitled ? null : sourceUri.fsPath);

  const hiddenFields = new Set<string>();
  for (const field of fields) {
    if (field.hidden) {
      hiddenFields.add(field.name);
    }
  }
  virtualDocProvider.setHiddenFields(hiddenFields);
}

async function handleExtractFields(): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showWarningMessage('No active editor');
    return;
  }

  let document = editor.document;

  // If viewing filtered doc, get the original
  if (document.uri.scheme === FILTERED_JSON_SCHEME) {
    const sourceUri = getSourceUriFromFilteredUri(document.uri);
    if (sourceUri) {
      const sourceDoc = await vscode.workspace.openTextDocument(sourceUri);
      document = sourceDoc;
    } else {
      vscode.window.showWarningMessage('Cannot find source document');
      return;
    }
  }

  const isUntitled = isUntitledDocument(document);
  const displayName = getDisplayName(document);

  sidebarProvider.setSourceUri(displayName);
  sidebarProvider.setLoading(true);
  sidebarProvider.setError(null);

  try {
    const content = document.getText();
    const fieldTypes = await extractFieldNamesFromContent(content);

    // Get existing state to preserve checkbox values
    const existingFields = fieldStatesMap.get(document.uri.toString());
    const existingHidden = new Map<string, boolean>();
    if (existingFields) {
      for (const f of existingFields) {
        existingHidden.set(f.name, f.hidden);
      }
    }

    // Create fields, preserving hidden state for existing ones
    const fields = Array.from(fieldTypes.entries())
      .sort((a, b) => a[0].toLowerCase().localeCompare(b[0].toLowerCase()))
      .map(([name, isComplex]) => ({
        name,
        hidden: existingHidden.get(name) ?? false,
        isComplex,
      }));

    currentSourceUri = document.uri;

    // Save state
    fieldStatesMap.set(document.uri.toString(), fields);

    // Calculate hidden fields
    const hiddenFields = new Set<string>();
    for (const field of fields) {
      if (field.hidden) {
        hiddenFields.add(field.name);
      }
    }

    virtualDocProvider.setSource(document.uri, isUntitled ? null : document.uri.fsPath);
    virtualDocProvider.setHiddenFields(hiddenFields);

    // Filter fields for display: hide simple fields if < 5 of them (unless already hidden)
    const displayFields = filterFieldsForDisplay(fields);
    sidebarProvider.updateFields(displayFields);
    sidebarProvider.setLoading(false);

    // Refresh filtered view if open
    const filteredUri = createFilteredJsonUri(document.uri);
    virtualDocProvider.fireChange(filteredUri);
  } catch (err) {
    sidebarProvider.setLoading(false);
    sidebarProvider.setError('Not valid JSON');
  }
}

function handleFieldToggle(fieldName: string, hidden: boolean): void {
  if (!currentSourceUri) return;

  const uriString = currentSourceUri.toString();
  const fields = fieldStatesMap.get(uriString);
  if (!fields) return;

  const field = fields.find((f) => f.name === fieldName);
  if (field) {
    field.hidden = hidden;
  }

  virtualDocProvider.updateHiddenField(fieldName, hidden);

  // Refresh filtered view
  const filteredUri = createFilteredJsonUri(currentSourceUri);
  virtualDocProvider.fireChange(filteredUri);
}

async function handleOpenFilteredView(): Promise<void> {
  if (!currentSourceUri) {
    vscode.window.showWarningMessage('Extract fields first');
    return;
  }

  const filteredUri = createFilteredJsonUri(currentSourceUri);

  try {
    const doc = await vscode.workspace.openTextDocument(filteredUri);
    await vscode.window.showTextDocument(doc, {
      viewColumn: vscode.ViewColumn.Beside,
      preview: false,
    });
  } catch (err) {
    vscode.window.showErrorMessage(
      `Error opening filtered view: ${err instanceof Error ? err.message : String(err)}`
    );
  }
}

function getPresets(): Preset[] {
  const config = vscode.workspace.getConfiguration('jsonFieldFilter');
  return config.get<Preset[]>('presets') || [];
}

function handleApplyPreset(presetName: string): void {
  if (!currentSourceUri) return;

  const presets = getPresets();
  const preset = presets.find(p => p.name === presetName);
  if (!preset) return;

  const uriString = currentSourceUri.toString();
  const fields = fieldStatesMap.get(uriString);
  if (!fields) return;

  const presetFieldSet = new Set(preset.fields);

  // Mark fields as hidden if they're in the preset
  for (const field of fields) {
    if (presetFieldSet.has(field.name)) {
      field.hidden = true;
    }
  }

  // Update virtual doc provider
  const hiddenFields = new Set<string>();
  for (const field of fields) {
    if (field.hidden) {
      hiddenFields.add(field.name);
    }
  }
  virtualDocProvider.setHiddenFields(hiddenFields);

  // Update sidebar with filtered display
  const displayFields = filterFieldsForDisplay(fields);
  sidebarProvider.updateFields(displayFields);

  // Refresh filtered view
  const filteredUri = createFilteredJsonUri(currentSourceUri);
  virtualDocProvider.fireChange(filteredUri);
}

export function deactivate() {
  virtualDocProvider?.dispose();
}
