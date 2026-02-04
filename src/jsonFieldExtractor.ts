import * as fs from 'fs';
import * as vscode from 'vscode';
import { parser } from 'stream-json';
import { Readable } from 'stream';

export interface ExtractedField {
  name: string;
  isComplex: boolean;
}

export async function extractFieldNames(
  filePath: string,
  token?: vscode.CancellationToken
): Promise<Map<string, boolean>> {
  return new Promise((resolve, reject) => {
    // Map from field name to isComplex (true if any occurrence is object/array)
    const fieldTypes = new Map<string, boolean>();
    const fileSize = fs.statSync(filePath).size;
    let bytesRead = 0;
    let pendingKey: string | null = null;

    const progress = vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: 'Extracting JSON fields...',
        cancellable: true,
      },
      async (progressReporter, progressToken) => {
        return new Promise<Map<string, boolean>>((resolveProgress, rejectProgress) => {
          const stream = fs.createReadStream(filePath, { highWaterMark: 64 * 1024 });
          const jsonParser = parser();

          const cleanup = () => {
            stream.destroy();
            jsonParser.destroy();
          };

          if (token) {
            token.onCancellationRequested(() => {
              cleanup();
              rejectProgress(new Error('Cancelled'));
            });
          }

          progressToken.onCancellationRequested(() => {
            cleanup();
            rejectProgress(new Error('Cancelled'));
          });

          stream.on('data', (chunk: Buffer | string) => {
            bytesRead += typeof chunk === 'string' ? chunk.length : chunk.length;
            const percent = Math.round((bytesRead / fileSize) * 100);
            progressReporter.report({ increment: 0, message: `${percent}%` });
          });

          jsonParser.on('data', (tok: { name: string; value?: string }) => {
            if (tok.name === 'keyValue' && typeof tok.value === 'string') {
              pendingKey = tok.value;
            } else if (pendingKey !== null) {
              const isComplex = tok.name === 'startObject' || tok.name === 'startArray';
              // Mark as complex if any occurrence is complex
              if (isComplex || !fieldTypes.has(pendingKey)) {
                fieldTypes.set(pendingKey, isComplex || (fieldTypes.get(pendingKey) ?? false));
              }
              pendingKey = null;
            }
          });

          stream.on('error', (err) => {
            cleanup();
            rejectProgress(err);
          });

          jsonParser.on('error', (err: Error) => {
            cleanup();
            rejectProgress(err);
          });

          jsonParser.on('end', () => {
            resolveProgress(fieldTypes);
          });

          stream.pipe(jsonParser);
        });
      }
    );

    (progress as Promise<Map<string, boolean>>).then(resolve).catch(reject);
  });
}

export async function extractFieldNamesQuick(
  filePath: string,
  token?: vscode.CancellationToken
): Promise<Map<string, boolean>> {
  const fileSize = fs.statSync(filePath).size;
  const isLargeFile = fileSize > 5 * 1024 * 1024; // 5MB

  if (isLargeFile) {
    return extractFieldNames(filePath, token);
  }

  // For small files, use simpler approach
  return new Promise((resolve, reject) => {
    const fieldTypes = new Map<string, boolean>();
    let pendingKey: string | null = null;

    const stream = fs.createReadStream(filePath);
    const jsonParser = parser();

    if (token) {
      token.onCancellationRequested(() => {
        stream.destroy();
        jsonParser.destroy();
        reject(new Error('Cancelled'));
      });
    }

    jsonParser.on('data', (tok: { name: string; value?: string }) => {
      if (tok.name === 'keyValue' && typeof tok.value === 'string') {
        pendingKey = tok.value;
      } else if (pendingKey !== null) {
        const isComplex = tok.name === 'startObject' || tok.name === 'startArray';
        if (isComplex || !fieldTypes.has(pendingKey)) {
          fieldTypes.set(pendingKey, isComplex || (fieldTypes.get(pendingKey) ?? false));
        }
        pendingKey = null;
      }
    });

    stream.on('error', reject);
    jsonParser.on('error', reject);
    jsonParser.on('end', () => resolve(fieldTypes));

    stream.pipe(jsonParser);
  });
}

export async function extractFieldNamesFromContent(
  content: string,
  token?: vscode.CancellationToken
): Promise<Map<string, boolean>> {
  return new Promise((resolve, reject) => {
    const fieldTypes = new Map<string, boolean>();
    let pendingKey: string | null = null;

    const stream = Readable.from([content]);
    const jsonParser = parser();

    if (token) {
      token.onCancellationRequested(() => {
        stream.destroy();
        jsonParser.destroy();
        reject(new Error('Cancelled'));
      });
    }

    jsonParser.on('data', (tok: { name: string; value?: string }) => {
      if (tok.name === 'keyValue' && typeof tok.value === 'string') {
        pendingKey = tok.value;
      } else if (pendingKey !== null) {
        const isComplex = tok.name === 'startObject' || tok.name === 'startArray';
        if (isComplex || !fieldTypes.has(pendingKey)) {
          fieldTypes.set(pendingKey, isComplex || (fieldTypes.get(pendingKey) ?? false));
        }
        pendingKey = null;
      }
    });

    stream.on('error', reject);
    jsonParser.on('error', reject);
    jsonParser.on('end', () => resolve(fieldTypes));

    stream.pipe(jsonParser);
  });
}
