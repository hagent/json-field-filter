import * as fs from 'fs';
import * as vscode from 'vscode';
import { parser } from 'stream-json';
import { Readable } from 'stream';

interface Token {
  name: string;
  value?: string | number | boolean | null;
}

export async function filterJson(
  filePath: string,
  hiddenFields: Set<string>,
  token?: vscode.CancellationToken
): Promise<string> {
  return new Promise((resolve, reject) => {
    const fileSize = fs.statSync(filePath).size;
    const isLargeFile = fileSize > 5 * 1024 * 1024;

    const doFilter = async (
      progressReporter?: vscode.Progress<{ increment: number; message: string }>
    ): Promise<string> => {
      return new Promise((resolveFilter, rejectFilter) => {
        const stream = fs.createReadStream(filePath, { highWaterMark: 64 * 1024 });
        let bytesRead = 0;

        stream.on('data', (chunk: Buffer | string) => {
          if (progressReporter) {
            bytesRead += typeof chunk === 'string' ? chunk.length : chunk.length;
            const percent = Math.round((bytesRead / fileSize) * 100);
            progressReporter.report({ increment: 0, message: `Filtering: ${percent}%` });
          }
        });

        filterStream(stream, hiddenFields, token)
          .then(resolveFilter)
          .catch(rejectFilter);
      });
    };

    if (isLargeFile) {
      vscode.window
        .withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            title: 'Filtering JSON...',
            cancellable: true,
          },
          async (progressReporter, progressToken) => {
            if (token) {
              progressToken.onCancellationRequested(() => {
                token.onCancellationRequested(() => {});
              });
            }
            return doFilter(progressReporter);
          }
        )
        .then(resolve, reject);
    } else {
      doFilter().then(resolve, reject);
    }
  });
}

export async function filterJsonContent(
  content: string,
  hiddenFields: Set<string>,
  token?: vscode.CancellationToken
): Promise<string> {
  const stream = Readable.from([content]);
  return filterStream(stream, hiddenFields, token);
}

async function filterStream(
  stream: NodeJS.ReadableStream,
  hiddenFields: Set<string>,
  token?: vscode.CancellationToken
): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: string[] = [];
    const jsonParser = parser();

    let skipDepth = 0;
    let skipUntilDepth = -1;
    let currentDepth = 0;
    let isInHiddenField = false;
    let pendingKey: string | null = null;
    let needsComma = false;

    const cleanup = () => {
      if ('destroy' in stream && typeof stream.destroy === 'function') {
        stream.destroy();
      }
      jsonParser.destroy();
    };

    if (token) {
      token.onCancellationRequested(() => {
        cleanup();
        reject(new Error('Cancelled'));
      });
    }

    const output = (str: string) => {
      chunks.push(str);
    };

    const outputComma = () => {
      if (needsComma) {
        output(',');
      }
    };

    const getIndent = () => '  '.repeat(currentDepth);

    jsonParser.on('data', (tok: Token) => {
      // Skip tokens while inside a hidden field
      if (isInHiddenField) {
        if (tok.name === 'startObject' || tok.name === 'startArray') {
          skipDepth++;
        } else if (tok.name === 'endObject' || tok.name === 'endArray') {
          skipDepth--;
          if (skipDepth === skipUntilDepth) {
            isInHiddenField = false;
            skipUntilDepth = -1;
          }
        } else if (
          skipDepth === skipUntilDepth &&
          (tok.name === 'stringValue' ||
            tok.name === 'numberValue' ||
            tok.name === 'trueValue' ||
            tok.name === 'falseValue' ||
            tok.name === 'nullValue')
        ) {
          isInHiddenField = false;
          skipUntilDepth = -1;
        }
        return;
      }

      switch (tok.name) {
        case 'startObject':
          if (pendingKey !== null) {
            outputComma();
            output(`\n${getIndent()}"${escapeString(pendingKey)}": {`);
            pendingKey = null;
          } else {
            outputComma();
            output(`\n${getIndent()}{`);
          }
          currentDepth++;
          needsComma = false;
          break;

        case 'endObject':
          currentDepth--;
          output(`\n${getIndent()}}`);
          needsComma = true;
          break;

        case 'startArray':
          if (pendingKey !== null) {
            outputComma();
            output(`\n${getIndent()}"${escapeString(pendingKey)}": [`);
            pendingKey = null;
          } else {
            outputComma();
            output(`\n${getIndent()}[`);
          }
          currentDepth++;
          needsComma = false;
          break;

        case 'endArray':
          currentDepth--;
          output(`\n${getIndent()}]`);
          needsComma = true;
          break;

        case 'keyValue':
          if (typeof tok.value === 'string' && hiddenFields.has(tok.value)) {
            isInHiddenField = true;
            skipUntilDepth = skipDepth;
          } else {
            pendingKey = tok.value as string;
          }
          break;

        case 'stringValue':
          outputComma();
          if (pendingKey !== null) {
            output(
              `\n${getIndent()}"${escapeString(pendingKey)}": "${escapeString(tok.value as string)}"`
            );
            pendingKey = null;
          } else {
            output(`\n${getIndent()}"${escapeString(tok.value as string)}"`);
          }
          needsComma = true;
          break;

        case 'numberValue':
          outputComma();
          if (pendingKey !== null) {
            output(`\n${getIndent()}"${escapeString(pendingKey)}": ${tok.value}`);
            pendingKey = null;
          } else {
            output(`\n${getIndent()}${tok.value}`);
          }
          needsComma = true;
          break;

        case 'trueValue':
        case 'falseValue':
          outputComma();
          const boolVal = tok.name === 'trueValue' ? 'true' : 'false';
          if (pendingKey !== null) {
            output(`\n${getIndent()}"${escapeString(pendingKey)}": ${boolVal}`);
            pendingKey = null;
          } else {
            output(`\n${getIndent()}${boolVal}`);
          }
          needsComma = true;
          break;

        case 'nullValue':
          outputComma();
          if (pendingKey !== null) {
            output(`\n${getIndent()}"${escapeString(pendingKey)}": null`);
            pendingKey = null;
          } else {
            output(`\n${getIndent()}null`);
          }
          needsComma = true;
          break;
      }
    });

    stream.on('error', (err) => {
      cleanup();
      reject(err);
    });

    jsonParser.on('error', (err: Error) => {
      cleanup();
      reject(err);
    });

    jsonParser.on('end', () => {
      let result = chunks.join('');
      // Clean up leading newline
      if (result.startsWith('\n')) {
        result = result.substring(1);
      }
      resolve(result);
    });

    stream.pipe(jsonParser);
  });
}

function escapeString(str: string): string {
  return str
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t');
}
