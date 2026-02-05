import * as vscode from 'vscode';
import { filterJson, filterJsonContent } from './jsonFilter';

export const FILTERED_JSON_SCHEME = 'filtered-json';

export class FilteredJsonProvider implements vscode.TextDocumentContentProvider {
  private _onDidChange = new vscode.EventEmitter<vscode.Uri>();
  readonly onDidChange = this._onDidChange.event;

  private hiddenFields: Set<string> = new Set();
  private sourceFilePath: string | null = null;
  private sourceUri: vscode.Uri | null = null;

  setSource(uri: vscode.Uri, filePath: string | null): void {
    this.sourceUri = uri;
    this.sourceFilePath = filePath;
  }

  setHiddenFields(fields: Set<string>): void {
    this.hiddenFields = new Set(fields);
  }

  updateHiddenField(fieldName: string, hidden: boolean): void {
    if (hidden) {
      this.hiddenFields.add(fieldName);
    } else {
      this.hiddenFields.delete(fieldName);
    }
  }

  fireChange(uri: vscode.Uri): void {
    this._onDidChange.fire(uri);
  }

  async provideTextDocumentContent(
    uri: vscode.Uri,
    token: vscode.CancellationToken
  ): Promise<string> {
    if (!this.sourceUri) {
      const decoded = getSourceUriFromFilteredUri(uri);
      if (decoded) {
        this.sourceUri = decoded;
        this.sourceFilePath = decoded.scheme === 'untitled' ? null : decoded.fsPath;
      } else {
        return '// No JSON file selected';
      }
    }

    try {
      let filtered: string;

      if (this.sourceFilePath) {
        // Saved file - but check if there are unsaved changes
        try {
          const doc = await vscode.workspace.openTextDocument(this.sourceUri);
          if (doc.isDirty) {
            // Has unsaved changes - use document content
            const content = doc.getText();
            filtered = await filterJsonContent(content, this.hiddenFields, token);
          } else {
            // No unsaved changes - read from disk
            filtered = await filterJson(this.sourceFilePath, this.hiddenFields, token);
          }
        } catch {
          // Fallback to file
          filtered = await filterJson(this.sourceFilePath, this.hiddenFields, token);
        }
      } else {
        // Unsaved file - read from document
        const doc = await vscode.workspace.openTextDocument(this.sourceUri);
        const content = doc.getText();
        filtered = await filterJsonContent(content, this.hiddenFields, token);
      }

      return filtered;
    } catch (err) {
      if (err instanceof Error && err.message === 'Cancelled') {
        return '// Operation cancelled';
      }
      return `// Error filtering JSON: ${err instanceof Error ? err.message : String(err)}`;
    }
  }

  dispose(): void {
    this._onDidChange.dispose();
  }
}

export function createFilteredJsonUri(sourceUri: vscode.Uri): vscode.Uri {
  const encodedUri = encodeURIComponent(sourceUri.toString());
  return vscode.Uri.parse(`${FILTERED_JSON_SCHEME}:/${encodedUri}.filtered.json`);
}

export function getSourceUriFromFilteredUri(filteredUri: vscode.Uri): vscode.Uri | null {
  if (filteredUri.scheme !== FILTERED_JSON_SCHEME) {
    return null;
  }

  // Path is like /encodedUri.filtered.json
  let path = filteredUri.path;
  if (path.startsWith('/')) {
    path = path.substring(1);
  }
  if (path.endsWith('.filtered.json')) {
    path = path.substring(0, path.length - '.filtered.json'.length);
  }

  try {
    const decodedUri = decodeURIComponent(path);
    return vscode.Uri.parse(decodedUri);
  } catch {
    return null;
  }
}
