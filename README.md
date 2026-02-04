# JSON Field Filter

VS Code extension for filtering and previewing specific fields from large JSON files.

## Features

- Extract all field names from JSON files
- Toggle visibility of fields with checkboxes
- Live filtered preview in side-by-side view
- Streaming parser for large files (5MB+)
- Presets for quickly hiding common field sets
- "Hidden only" filter to see what's being filtered

## Installation

Since this extension is not published to the marketplace, install it locally:

```bash
# Clone the repo
git clone https://github.com/hagent/json-field-filter.git
cd json-field-filter

# Install dependencies
npm install

# Build and install
npm run deploy
```

After installation, reload VS Code window.

## Usage

1. Open a JSON file
2. Click the filter icon in the activity bar (left sidebar)
3. Click "Extract Fields" to scan the document
4. Check fields you want to hide
5. Click "Open Filtered View" to see the result

## Configuration

Add presets in your VS Code `settings.json`:

```json
"jsonFieldFilter.presets": [
  {
    "name": "My Preset",
    "fields": ["field1", "field2", "field3"]
  }
]
```

## Development

See [DEVELOPMENT.md](DEVELOPMENT.md) for architecture and code details.

```bash
npm run compile    # Build
npm run watch      # Watch mode
npm run lint       # Lint
npm run deploy     # Build + package + install
```
