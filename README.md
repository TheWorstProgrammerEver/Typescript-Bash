# ts-bash

Type-safe, zero-runtime-dependency shell execution for short commands whose
output can be captured in memory.

```ts
import { bash, json } from 'ts-bash';

// Void usage — ignore the returned string.
await bash('mkdir -p experiments');

// String — stdout with trailing line endings removed.
const content = await bash('cat file.txt');

// JSON — explicit parse.
const data = await bash('cat data.json', json<MyType>());

// Custom sync or async parser.
const lines = await bash('cat file.txt', output => output.split('\n'));
```

## Install

```bash
npm install ts-bash
```

Requires Node 22 or newer. The package is ESM-only.

## API

### `bash(command, parser?, options?)`

Runs `command` with Node's shell-string execution semantics and captures its
output in memory. Without a parser it returns `Promise<string>`; callers that
only need completion can ignore that value. With a parser it returns
`Promise<T>`. Parsers may be synchronous or async.

Captured stdout has only trailing `\n` and `\r\n` line endings removed. Other
whitespace is preserved.

```ts
type BashParser<T> = (stdout: string) => T | Promise<T>;

interface BashOptions {
  timeoutMs?: number;
  maxBufferBytes?: number;
  context?: string;
}
```

Options can be passed as the second argument when no parser is needed, or as
the third argument after a parser. Execution is always bounded. Defaults are a
10-second timeout and a 1 MiB buffer per output stream; accepted overrides are
at most 60 seconds and 16 MiB. On POSIX systems, timed-out commands run in an
isolated process group: cleanup sends `SIGTERM`, escalates to `SIGKILL` after a
short grace period, and completes before `bash()` rejects. `context` is an
optional, non-secret operation label such as `read package manifest`.

### `json<T>()`

Returns a `BashParser<T>` backed by `JSON.parse`.

### Failures

Execution failures throw `BashExecutionError`; parser failures throw
`BashParserError`. Both include the optional safe context but never retain or
repeat the raw command. Execution errors expose bounded `stdout`, `stderr`,
`exitCode`, `signal`, and a machine-readable `reason`.

Do not put secret values directly in a shell command. Prefer a purpose-built
spawn adapter that accepts an argument array and a scoped environment when a
command needs credentials or other structured input.

## Scope

`ts-bash` deliberately uses `exec` and captures the complete output. It is only
for short, bounded commands expressed as a shell string. Use a spawn-based
adapter instead for structured argument arrays, streaming output, inherited
TTYs, cancellation, custom signal handling, or long-lived processes.

## License

[The Unlicense](LICENSE)
