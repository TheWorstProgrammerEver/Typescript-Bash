export const bashLimits = Object.freeze({
  defaultTimeoutMs: 10_000,
  maximumTimeoutMs: 60_000,
  defaultMaxBufferBytes: 1024 * 1024,
  maximumMaxBufferBytes: 16 * 1024 * 1024,
});

export interface BashOptions {
  /** A non-secret operation label included in errors. */
  context?: string;
  maxBufferBytes?: number;
  timeoutMs?: number;
}

export interface ResolvedBashOptions {
  context?: string;
  maxBufferBytes: number;
  timeoutMs: number;
}

const boundedInteger = (name: string, value: number, maximum: number): number => {
  if (!Number.isSafeInteger(value) || value <= 0 || value > maximum) {
    throw new RangeError(`${name} must be a positive integer no greater than ${maximum}`);
  }

  return value;
};

const safeContext = (context: string | undefined): string | undefined => {
  if (context === undefined) return undefined;

  const normalized = context.replace(/[\r\n\t]+/g, ' ').trim();
  if (normalized.length === 0) throw new TypeError('context must not be empty');
  if (normalized.length > 120) throw new RangeError('context must not exceed 120 characters');

  return normalized;
};

export const resolveBashOptions = (options: BashOptions = {}): ResolvedBashOptions => {
  const context = safeContext(options.context);

  return {
    ...(context === undefined ? {} : { context }),
    maxBufferBytes: boundedInteger(
      'maxBufferBytes',
      options.maxBufferBytes ?? bashLimits.defaultMaxBufferBytes,
      bashLimits.maximumMaxBufferBytes,
    ),
    timeoutMs: boundedInteger(
      'timeoutMs',
      options.timeoutMs ?? bashLimits.defaultTimeoutMs,
      bashLimits.maximumTimeoutMs,
    ),
  };
};
