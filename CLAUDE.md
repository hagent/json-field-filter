# JSON Field Filter - VS Code Extension

VS Code extension for filtering and previewing specific fields from large JSON files.

## Commands

```bash
npm run compile    # Build TypeScript to ./out/
npm run watch      # Watch mode for development
npm run lint       # ESLint check
```

To debug: F5 in VS Code (launches Extension Development Host)

## Architecture

- **extension.ts** - Entry point, state management (`fieldStatesMap`), event coordination
- **sidebarProvider.ts** - Webview UI with inline HTML, message-based communication
- **virtualDocProvider.ts** - Custom `filtered-json://` URI scheme for preview documents
- **jsonFilter.ts** - Streaming JSON filter using stream-json
- **jsonFieldExtractor.ts** - Field extraction with progress tracking
- **types.ts** - Shared types (`FieldInfo`, message contracts)

## Key Patterns

- **Streaming for large files** - 5MB threshold triggers stream-json parser instead of JSON.parse
- **Per-file state** - `fieldStatesMap: Map<URI, FieldInfo[]>` tracks field visibility per source file
- **Webview messaging** - Typed `MessageToWebview`/`MessageFromWebview` contracts between sidebar and extension
- **Virtual documents** - Filtered view uses custom URI scheme, content regenerated on field toggle

## Code Style

- TypeScript strict mode
- Private fields: underscore prefix (`_view`, `_fields`)
- Handlers: `handle*` prefix
- No bundler - raw CommonJS output
