# JSON Field Filter

VS Code extension for filtering and previewing specific fields from large JSON files.

## Demo

https://github.com/hagent/json-field-filter/raw/master/media/demo.mp4

## Features

- Hide/show JSON fields via sidebar checkboxes
- Side-by-side live filtered preview
- Presets for quickly hiding common field sets

## Installation

Search for "JSON Field Filter" in the VS Code Extensions view, or install from the [Marketplace](https://marketplace.visualstudio.com/items?itemName=hagent.json-field-filter).

## Usage

1. Open a JSON file
2. Click the filter icon in the activity bar (left sidebar)
3. Click "Extract Fields" to scan the document
4. Check fields you want to hide
5. Click "Open Filtered File" to see the result

## Configuration

| Setting | Default | Description |
|---------|---------|-------------|
| `jsonFieldFilter.presets` | `[]` | Presets for quickly hiding common field sets |
| `jsonFieldFilter.fieldCountThreshold` | `5` | Hide simple (non-object/array) fields from panel if there are fewer than this many. Set to 0 to always show all fields. |

### Presets

Presets let you quickly hide a predefined set of fields. When you apply a preset from the sidebar dropdown, every field whose name appears in the preset's `fields` list gets marked as hidden. Fields not in the list remain unchanged, so you can layer a preset on top of manual selections.

Example in `settings.json`:

```json
"jsonFieldFilter.presets": [
  {
    "name": "Hide Metadata",
    "fields": ["_id", "_rev", "_timestamp", "_etag"]
  },
  {
    "name": "Essentials Only",
    "fields": ["debug", "trace", "internal", "raw"]
  }
]
```

### Field Count Threshold

By default, simple fields (non-object/array) that appear fewer than 5 times across the JSON are hidden from the sidebar panel to reduce clutter. Fields that are already marked hidden (e.g. via a preset) are always shown regardless of count.

Set to `0` to always show all fields:

```json
"jsonFieldFilter.fieldCountThreshold": 0
```

## Development

See [CLAUDE.md](CLAUDE.md) for architecture and code details.

```bash
npm run compile    # Build
npm run watch      # Watch mode
npm run lint       # Lint
npm run package     # Build + package
npm run publish    # Publish to marketplace
```
