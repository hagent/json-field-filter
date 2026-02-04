import * as vscode from 'vscode';
import { FieldInfo, MessageToWebview, MessageFromWebview, Preset } from './types';

export class SidebarProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'jsonFieldFilter.sidebar';

  private _view?: vscode.WebviewView;
  private _fields: FieldInfo[] = [];
  private _sourceUri: string | null = null;
  private _isLoading = false;
  private _error: string | null = null;
  private _presets: Preset[] = [];

  constructor(
    private readonly _extensionUri: vscode.Uri,
    private readonly _onFieldToggle: (fieldName: string, hidden: boolean) => void,
    private readonly _onOpenFilteredView: () => void,
    private readonly _onExtractFields: () => void,
    private readonly _onApplyPreset: (presetName: string) => void
  ) {}

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ): void {
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this._extensionUri, 'media')],
    };

    webviewView.webview.html = this._getHtmlContent();

    webviewView.webview.onDidReceiveMessage((message: MessageFromWebview) => {
      switch (message.type) {
        case 'toggleField':
          this._onFieldToggle(message.fieldName, message.hidden);
          break;
        case 'openFilteredView':
          this._onOpenFilteredView();
          break;
        case 'extractFields':
          this._onExtractFields();
          break;
        case 'applyPreset':
          this._onApplyPreset(message.presetName);
          break;
        case 'ready':
          this._sendCurrentState();
          break;
      }
    });
  }

  public updateFields(fields: FieldInfo[]): void {
    this._fields = fields;
    this._postMessage({ type: 'updateFields', fields });
  }

  public setLoading(isLoading: boolean): void {
    this._isLoading = isLoading;
    this._postMessage({ type: 'setLoading', isLoading });
  }

  public setError(error: string | null): void {
    this._error = error;
    this._postMessage({ type: 'setError', error });
  }

  public setSourceUri(uri: string | null): void {
    this._sourceUri = uri;
    if (this._view) {
      this._view.title = uri || 'Fields';
    }
    this._postMessage({ type: 'setSourceUri', uri });
  }

  public setPresets(presets: Preset[]): void {
    this._presets = presets;
    this._postMessage({ type: 'setPresets', presets });
  }

  private _sendCurrentState(): void {
    this._postMessage({ type: 'setSourceUri', uri: this._sourceUri });
    this._postMessage({ type: 'updateFields', fields: this._fields });
    this._postMessage({ type: 'setLoading', isLoading: this._isLoading });
    this._postMessage({ type: 'setError', error: this._error });
    this._postMessage({ type: 'setPresets', presets: this._presets });
  }

  private _postMessage(message: MessageToWebview): void {
    this._view?.webview.postMessage(message);
  }

  private _getHtmlContent(): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline';">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html, body { height: 100%; }
    body { padding: 10px; font-family: var(--vscode-font-family); font-size: var(--vscode-font-size); color: var(--vscode-foreground); }
    #app { display: flex; flex-direction: column; height: 100%; }
    #controls { display: flex; flex-direction: column; gap: 8px; margin-bottom: 10px; }
    #search { width: 100%; padding: 6px 8px; border: 1px solid var(--vscode-input-border); background: var(--vscode-input-background); color: var(--vscode-input-foreground); border-radius: 2px; }
    .btn { padding: 6px 12px; border: none; border-radius: 2px; cursor: pointer; font-size: 12px; }
    .btn-primary { background: var(--vscode-button-background); color: var(--vscode-button-foreground); }
    .btn-primary:hover { background: var(--vscode-button-hoverBackground); }
    .btn-secondary { background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); }
    .btn-secondary:hover { background: var(--vscode-button-secondaryHoverBackground); }
    #hidden-only-toggle { display: flex; align-items: center; gap: 8px; cursor: pointer; font-size: 12px; }
    #hidden-only-toggle input { display: none; }
    .toggle-switch { position: relative; width: 32px; height: 16px; background: var(--vscode-input-background); border: 1px solid var(--vscode-input-border); border-radius: 8px; transition: background 0.2s; }
    .toggle-switch::after { content: ''; position: absolute; top: 2px; left: 2px; width: 10px; height: 10px; background: var(--vscode-foreground); border-radius: 50%; transition: transform 0.2s; }
    #hidden-only:checked + .toggle-switch { background: var(--vscode-button-background); }
    #hidden-only:checked + .toggle-switch::after { transform: translateX(16px); }
    #preset-select { width: 100%; padding: 6px 8px; border: 1px solid var(--vscode-input-border); background: var(--vscode-input-background); color: var(--vscode-input-foreground); border-radius: 2px; font-size: 12px; }
    #status { padding: 15px; text-align: center; color: var(--vscode-descriptionForeground); }
    #error { padding: 10px; color: var(--vscode-errorForeground); text-align: center; }
    .hidden { display: none !important; }
    #fields-container { display: flex; flex-direction: column; flex: 1; min-height: 0; }
    #fields-header { display: flex; justify-content: space-between; align-items: center; padding: 8px 0; border-bottom: 1px solid var(--vscode-widget-border); margin-bottom: 8px; }
    #fields-header label { display: flex; align-items: center; gap: 6px; cursor: pointer; }
    #field-count { font-size: 11px; color: var(--vscode-descriptionForeground); }
    #fields-list { flex: 1; overflow-y: auto; min-height: 0; }
    #empty-message { padding: 20px; text-align: center; color: var(--vscode-descriptionForeground); font-size: 12px; }
    .field-item { display: flex; align-items: center; gap: 8px; padding: 4px 6px; border-radius: 3px; cursor: pointer; }
    .field-item:hover { background: var(--vscode-list-hoverBackground); }
    .field-name { font-family: var(--vscode-editor-font-family); font-size: 12px; }
  </style>
</head>
<body>
  <div id="app">
    <div id="controls">
      <button id="extract-btn" class="btn btn-primary">Extract Fields</button>
      <select id="preset-select" class="hidden">
        <option value="">Apply preset...</option>
      </select>
      <input type="text" id="search" placeholder="Search fields..." class="hidden" />
      <label id="hidden-only-toggle" class="hidden">
        <input type="checkbox" id="hidden-only" />
        <span class="toggle-switch"></span>
        <span>Hidden only</span>
      </label>
      <button id="open-btn" class="btn btn-secondary hidden">Open Filtered View</button>
    </div>
    <div id="status" class="hidden">Extracting...</div>
    <div id="error" class="hidden"></div>
    <div id="fields-container" class="hidden">
      <div id="fields-header">
        <label>
          <input type="checkbox" id="select-all" />
          <span>Hide All</span>
        </label>
        <span id="field-count"></span>
      </div>
      <div id="fields-list"></div>
    </div>
  </div>

  <script>
    (function() {
      const vscode = acquireVsCodeApi();

      let allFields = [];
      let searchQuery = '';
      let hiddenOnly = false;

      const searchInput = document.getElementById('search');
      const fieldsList = document.getElementById('fields-list');
      const fieldsContainer = document.getElementById('fields-container');
      const statusEl = document.getElementById('status');
      const errorEl = document.getElementById('error');
      const selectAllCheckbox = document.getElementById('select-all');
      const fieldCountEl = document.getElementById('field-count');
      const openBtn = document.getElementById('open-btn');
      const extractBtn = document.getElementById('extract-btn');
      const hiddenOnlyToggle = document.getElementById('hidden-only-toggle');
      const hiddenOnlyCheckbox = document.getElementById('hidden-only');
      const presetSelect = document.getElementById('preset-select');

      let debounceTimeout = null;
      let presets = [];

      searchInput.addEventListener('input', (e) => {
        clearTimeout(debounceTimeout);
        debounceTimeout = setTimeout(() => {
          searchQuery = e.target.value.toLowerCase();
          renderFields();
        }, 150);
      });

      hiddenOnlyCheckbox.addEventListener('change', (e) => {
        hiddenOnly = e.target.checked;
        renderFields();
      });

      selectAllCheckbox.addEventListener('change', (e) => {
        const hidden = e.target.checked;
        const filteredFields = getFilteredFields();
        filteredFields.forEach(field => {
          field.hidden = hidden;
          vscode.postMessage({ type: 'toggleField', fieldName: field.name, hidden });
        });
        renderFields();
      });

      openBtn.addEventListener('click', () => {
        vscode.postMessage({ type: 'openFilteredView' });
      });

      extractBtn.addEventListener('click', () => {
        vscode.postMessage({ type: 'extractFields' });
      });

      presetSelect.addEventListener('change', (e) => {
        const presetName = e.target.value;
        if (presetName) {
          vscode.postMessage({ type: 'applyPreset', presetName });
          e.target.value = ''; // Reset to placeholder
        }
      });

      function getFilteredFields() {
        let result = allFields;
        if (hiddenOnly) {
          result = result.filter(f => f.hidden);
        }
        if (searchQuery) {
          result = result.filter(f => f.name.toLowerCase().includes(searchQuery));
        }
        return result;
      }

      function renderFields() {
        const filtered = getFilteredFields();
        fieldCountEl.textContent = searchQuery || hiddenOnly
          ? filtered.length + ' / ' + allFields.length
          : allFields.length + ' fields';

        const allHidden = filtered.length > 0 && filtered.every(f => f.hidden);
        const someHidden = filtered.some(f => f.hidden);
        selectAllCheckbox.checked = allHidden;
        selectAllCheckbox.indeterminate = !allHidden && someHidden;

        if (filtered.length === 0) {
          let message = 'No fields found';
          if (hiddenOnly && !searchQuery) {
            message = 'No hidden fields';
          } else if (hiddenOnly && searchQuery) {
            message = 'No hidden fields match your search';
          } else if (searchQuery) {
            message = 'No fields match your search';
          }
          fieldsList.innerHTML = '<div id="empty-message">' + message + '</div>';
          return;
        }

        fieldsList.innerHTML = filtered.map(field =>
          '<label class="field-item">' +
            '<input type="checkbox" data-field="' + escapeHtml(field.name) + '"' +
            (field.hidden ? ' checked' : '') + ' />' +
            '<span class="field-name">' + escapeHtml(field.name) + '</span>' +
          '</label>'
        ).join('');

        fieldsList.querySelectorAll('input[type="checkbox"]').forEach(cb => {
          cb.addEventListener('change', (e) => {
            const fieldName = e.target.dataset.field;
            const hidden = e.target.checked;
            const field = allFields.find(f => f.name === fieldName);
            if (field) {
              field.hidden = hidden;
            }
            vscode.postMessage({ type: 'toggleField', fieldName, hidden });
            updateSelectAllState();
          });
        });
      }

      function updateSelectAllState() {
        const filtered = getFilteredFields();
        const allHidden = filtered.length > 0 && filtered.every(f => f.hidden);
        const someHidden = filtered.some(f => f.hidden);
        selectAllCheckbox.checked = allHidden;
        selectAllCheckbox.indeterminate = !allHidden && someHidden;
      }

      function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
      }

      function show(el) { el.classList.remove('hidden'); }
      function hide(el) { el.classList.add('hidden'); }

      window.addEventListener('message', (event) => {
        const message = event.data;
        switch (message.type) {
          case 'updateFields':
            allFields = message.fields || [];
            if (allFields.length > 0) {
              show(fieldsContainer);
              show(searchInput);
              show(hiddenOnlyToggle);
              show(openBtn);
              if (presets.length > 0) show(presetSelect);
              hide(statusEl);
              hide(errorEl);
            } else {
              hide(fieldsContainer);
              hide(searchInput);
              hide(hiddenOnlyToggle);
              hide(presetSelect);
              hide(openBtn);
            }
            renderFields();
            break;
          case 'setLoading':
            if (message.isLoading) {
              show(statusEl);
              hide(errorEl);
              hide(fieldsContainer);
              hide(searchInput);
              hide(hiddenOnlyToggle);
              hide(presetSelect);
              hide(openBtn);
            } else {
              hide(statusEl);
            }
            break;
          case 'setError':
            if (message.error) {
              errorEl.textContent = message.error;
              show(errorEl);
            } else {
              hide(errorEl);
            }
            break;
          case 'setPresets':
            presets = message.presets || [];
            presetSelect.innerHTML = '<option value="">Apply preset...</option>' +
              presets.map(p => '<option value="' + escapeHtml(p.name) + '">' + escapeHtml(p.name) + '</option>').join('');
            if (presets.length > 0 && allFields.length > 0) {
              show(presetSelect);
            } else {
              hide(presetSelect);
            }
            break;
        }
      });

      vscode.postMessage({ type: 'ready' });
    })();
  </script>
</body>
</html>`;
  }
}
