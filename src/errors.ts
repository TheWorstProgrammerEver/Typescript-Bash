export type BashFailureReason = 'exit' | 'max-buffer' | 'signal' | 'timeout';

interface BashExecutionErrorDetails {
  context?: string;
  exitCode: number | null;
  reason: BashFailureReason;
  signal: NodeJS.Signals | null;
  stderr: string;
  stdout: string;
}

const operation = (context: string | undefined): string =>
  context === undefined ? 'Shell command' : `Shell command (${context})`;

const outcome = ({ exitCode, reason, signal }: BashExecutionErrorDetails): string => {
  if (reason === 'timeout') return 'timed out';
  if (reason === 'max-buffer') return 'exceeded the output buffer limit';
  if (reason === 'signal') return `was terminated by ${signal ?? 'a signal'}`;
  return `exited with code ${exitCode ?? 'unknown'}`;
};

const diagnostic = (details: BashExecutionErrorDetails): string => {
  const summary = `${operation(details.context)} ${outcome(details)}`;
  return details.stderr.length === 0 ? summary : `${summary}: ${details.stderr}`;
};

export class BashExecutionError extends Error {
  readonly context: string | undefined;
  readonly exitCode: number | null;
  readonly reason: BashFailureReason;
  readonly signal: NodeJS.Signals | null;
  readonly stderr: string;
  readonly stdout: string;

  constructor(details: BashExecutionErrorDetails) {
    super(diagnostic(details));
    this.name = 'BashExecutionError';
    this.context = details.context;
    this.exitCode = details.exitCode;
    this.reason = details.reason;
    this.signal = details.signal;
    this.stderr = details.stderr;
    this.stdout = details.stdout;
  }
}

export class BashParserError extends Error {
  readonly context: string | undefined;

  constructor(context: string | undefined, cause: unknown) {
    super(`${operation(context)} output parser failed`, { cause });
    this.name = 'BashParserError';
    this.context = context;
  }
}
