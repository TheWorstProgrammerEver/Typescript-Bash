import { spawn } from 'node:child_process';

import { BashExecutionError, BashParserError, type BashFailureReason } from './errors.js';
import { resolveBashOptions, type BashOptions, type ResolvedBashOptions } from './limits.js';
import { hasRunningProcessGroup, terminateProcessGroup } from './process-lifecycle.js';

export { BashExecutionError, BashParserError, type BashFailureReason } from './errors.js';
export { bashLimits, type BashOptions } from './limits.js';

export type BashParser<T> = (stdout: string) => T | Promise<T>;

const trimTrailingLineEndings = (output: string): string => output.replace(/(?:\r?\n)+$/u, '');

const run = (command: string, options: ResolvedBashOptions): Promise<string> =>
  new Promise((resolve, reject) => {
    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let failure: BashFailureReason | undefined;
    let termination: Promise<void> | undefined;
    const child = spawn(command, {
      detached: process.platform !== 'win32',
      shell: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });

    const append = (chunks: Buffer[], bytes: number, chunk: Buffer): number => {
      const remaining = options.maxBufferBytes - bytes;
      if (remaining > 0) chunks.push(chunk.subarray(0, remaining));

      const nextBytes = bytes + chunk.length;
      if (nextBytes > options.maxBufferBytes && failure === undefined) {
        failure = 'max-buffer';
        clearTimeout(timeout);
        termination = terminateProcessGroup(child);
      }

      return nextBytes;
    };

    child.stdout.on('data', (chunk: Buffer) => {
      stdoutBytes = append(stdoutChunks, stdoutBytes, chunk);
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderrBytes = append(stderrChunks, stderrBytes, chunk);
    });
    child.once('error', () => {
      failure ??= 'exit';
    });

    const timeout = setTimeout(() => {
      if (failure !== undefined) return;
      failure = 'timeout';
      termination = terminateProcessGroup(child);
    }, options.timeoutMs);

    child.once('close', (exitCode, signal) => {
      clearTimeout(timeout);

      void (async () => {
        if (termination !== undefined) await termination;
        else if (hasRunningProcessGroup(child)) await terminateProcessGroup(child);

        const stdout = trimTrailingLineEndings(Buffer.concat(stdoutChunks).toString('utf8'));
        const stderr = trimTrailingLineEndings(Buffer.concat(stderrChunks).toString('utf8'));

        if (failure === undefined && exitCode === 0 && signal === null) {
          resolve(stdout);
          return;
        }

        reject(new BashExecutionError({
          ...(options.context === undefined ? {} : { context: options.context }),
          exitCode,
          reason: failure ?? (signal === null ? 'exit' : 'signal'),
          signal,
          stderr,
          stdout,
        }));
      })().catch(reject);
    });
  });

const isParser = <T>(value: BashParser<T> | BashOptions | undefined): value is BashParser<T> =>
  typeof value === 'function';

export function bash(command: string, options?: BashOptions): Promise<string>;
export function bash<T>(command: string, parser: BashParser<T>, options?: BashOptions): Promise<T>;
export async function bash<T>(
  command: string,
  parserOrOptions?: BashParser<T> | BashOptions,
  parserOptions?: BashOptions,
): Promise<string | T> {
  if (typeof command !== 'string' || command.trim().length === 0) {
    throw new TypeError('command must be a non-empty string');
  }

  const parser = isParser(parserOrOptions) ? parserOrOptions : undefined;
  const optionsInput = parser === undefined
    ? parserOrOptions as BashOptions | undefined
    : parserOptions;
  const options = resolveBashOptions(optionsInput);
  const stdout = await run(command, options);

  if (parser === undefined) return stdout;

  try {
    return await parser(stdout);
  } catch (cause) {
    throw new BashParserError(options.context, cause);
  }
}

export const json = <T>(): BashParser<T> => (stdout) => JSON.parse(stdout) as T;
