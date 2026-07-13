# ts-bash

Type-safe bash wrapper for TypeScript. Zero dependencies.

```ts
import { bash, json } from 'ts-bash';

// Void — ignore output
await bash(`mkdir -p experiments`);

// String — raw stdout (trailing newlines stripped)
const content = await bash(`cat file.txt`);

// JSON — explicit parse
const data = await bash(`cat data.json`, json<MyType>());

// Custom parser
const lines = await bash(`cat file.txt`, r => r.split('\n'));
```

## Install

```bash
npm install ts-bash
```

Requires **Node 22+** (native TypeScript support).

## API

### `bash(command)` → `Promise<string | void>`

Runs the command via `child_process.exec`. Strips trailing newlines from stdout. Throws on non-zero exit codes with full stderr context.

### `bash<T>(command, parser)` → `Promise<T>`

Pass a custom `(stdout: string) => T` parser.

### `json<T>()` → `BashParser<T>`

Convenience parser that calls `JSON.parse` on stdout and returns type `T`.

## License

MIT
# Typescript-Bash
