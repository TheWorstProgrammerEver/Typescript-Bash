import { exec, type ExecException } from 'node:child_process';

import { BashExecutionError, BashParserError, type BashFailureReason } from './errors.js';
import { resolveBashOptions, type BashOptions, type ResolvedBashOptions } from './limits.js';

export { BashExecutionError, BashParserError, type BashFailureReason } from './errors.js';
export { bashLimits, type BashOptions } from './limits.js';

export type BashParser<T> = (stdout: string) => T | Promise<T>;

const trimTrailingLineEndings = (output: string): string => output.replace(/(?:\r?\n)+$/u, '');

const failureReason = (error: ExecException): BashFailureReason => {
  if ((error as unknown as NodeJS.ErrnoException).code === 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER') {
    return 'max-buffer';
  }
  if (error.killed) return 'timeout';
  if (error.signal !== null && error.signal !== undefined) return 'signal';
  return 'exit';
};

const run = (command: string, options: ResolvedBashOptions): Promise<string> =>
  new Promise((resolve, reject) => {
    exec(
      command,
      {
        encoding: 'utf8',
        killSignal: 'SIGTERM',
        maxBuffer: options.maxBufferBytes,
        timeout: options.timeoutMs,
        windowsHide: true,
      },
      (error, stdout, stderr) => {
        const trimmedStdout = trimTrailingLineEndings(stdout);
        const trimmedStderr = trimTrailingLineEndings(stderr);

        if (error === null) {
          resolve(trimmedStdout);
          return;
        }

        reject(new BashExecutionError({
          ...(options.context === undefined ? {} : { context: options.context }),
          exitCode: typeof error.code === 'number' ? error.code : null,
          reason: failureReason(error),
          signal: (error.signal as NodeJS.Signals | null | undefined) ?? null,
          stderr: trimmedStderr,
          stdout: trimmedStdout,
        }));
      },
    );
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
