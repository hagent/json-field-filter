import * as fs from 'fs';
import * as vscode from 'vscode';
import { parser } from 'stream-json';
import { Readable } from 'stream';

export interface FieldMeta {
  isComplex: boolean;
  count: number;
}

export async function extractFieldNames(
  filePath: string,
  token?: vscode.CancellationToken
): Promise<Map<string, FieldMeta>> {
  return new Promise((resolve, reject) => {
    const fieldMeta = new Map<string, FieldMeta>();
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
        return new Promise<Map<string, FieldMeta>>((resolveProgress, rejectProgress) => {
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
              const existing = fieldMeta.get(pendingKey);
              if (existing) {
                existing.count++;
                if (isComplex) existing.isComplex = true;
              } else {
                fieldMeta.set(pendingKey, { isComplex, count: 1 });
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
            resolveProgress(fieldMeta);
          });

          stream.pipe(jsonParser);
        });
      }
    );

    (progress as Promise<Map<string, FieldMeta>>).then(resolve).catch(reject);
  });
}

export async function extractFieldNamesQuick(
  filePath: string,
  token?: vscode.CancellationToken
): Promise<Map<string, FieldMeta>> {
  const fileSize = fs.statSync(filePath).size;
  const isLargeFile = fileSize > 5 * 1024 * 1024; // 5MB

  if (isLargeFile) {
    return extractFieldNames(filePath, token);
  }

  // For small files, use simpler approach
  return new Promise((resolve, reject) => {
    const fieldMeta = new Map<string, FieldMeta>();
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
        const existing = fieldMeta.get(pendingKey);
        if (existing) {
          existing.count++;
          if (isComplex) existing.isComplex = true;
        } else {
          fieldMeta.set(pendingKey, { isComplex, count: 1 });
        }
        pendingKey = null;
      }
    });

    stream.on('error', reject);
    jsonParser.on('error', reject);
    jsonParser.on('end', () => resolve(fieldMeta));

    stream.pipe(jsonParser);
  });
}

export async function extractFieldNamesFromContent(
  content: string,
  token?: vscode.CancellationToken
): Promise<Map<string, FieldMeta>> {
  return new Promise((resolve, reject) => {
    const fieldMeta = new Map<string, FieldMeta>();
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
        const existing = fieldMeta.get(pendingKey);
        if (existing) {
          existing.count++;
          if (isComplex) existing.isComplex = true;
        } else {
          fieldMeta.set(pendingKey, { isComplex, count: 1 });
        }
        pendingKey = null;
      }
    });

    stream.on('error', reject);
    jsonParser.on('error', reject);
    jsonParser.on('end', () => resolve(fieldMeta));

    stream.pipe(jsonParser);
  });
}
