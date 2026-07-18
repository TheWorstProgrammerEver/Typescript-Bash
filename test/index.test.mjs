import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { test } from 'node:test';

import {
  BashExecutionError,
  BashParserError,
  bash,
  bashLimits,
  json,
} from '../dist/index.js';

const shellQuote = value => `'${value.replaceAll("'", "'\\''")}'`;
const nodeCommand = source => `exec ${shellQuote(process.execPath)} -e ${shellQuote(source)}`;

const processExists = pid => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (error?.code === 'ESRCH') return false;
    throw error;
  }
};

const waitForExit = async pid => {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (!processExists(pid)) return;
    await new Promise(resolve => setTimeout(resolve, 25));
  }

  assert.fail(`process ${pid} survived command cleanup`);
};

test('returns stdout with only trailing line endings removed', async () => {
  assert.equal(await bash("printf 'hello  \\n\\n'"), 'hello  ');
});

test('supports sync, async, JSON, and void parsers', async () => {
  assert.deepEqual(await bash("printf 'one\\ntwo'", output => output.split('\n')), ['one', 'two']);
  assert.equal(await bash('printf 21', async output => Number(output) * 2), 42);
  assert.deepEqual(await bash("printf '{\"ok\":true}'", json()), { ok: true });
  assert.equal(await bash('true', () => undefined), undefined);
});

test('wraps parser failures with safe command context', async () => {
  const cause = new Error('invalid record');

  await assert.rejects(
    bash('printf malformed', () => { throw cause; }, { context: 'decode record' }),
    error => {
      assert(error instanceof BashParserError);
      assert.equal(error.message, 'Shell command (decode record) output parser failed');
      assert.equal(error.cause, cause);
      return true;
    },
  );
});

test('preserves stderr and exit status without retaining the raw command', async () => {
  const secret = 'caller-secret-7f50dc';
  const command = `printf 'bad input\\n' >&2; exit 7 # ${secret}`;

  await assert.rejects(
    bash(command, { context: 'validate fixture' }),
    error => {
      assert(error instanceof BashExecutionError);
      assert.equal(error.reason, 'exit');
      assert.equal(error.exitCode, 7);
      assert.equal(error.stderr, 'bad input');
      assert.match(error.message, /validate fixture.*code 7.*bad input/u);
      assert.equal(JSON.stringify(error).includes(secret), false);
      assert.equal(error.stack.includes(secret), false);
      assert.equal('command' in error, false);
      return true;
    },
  );
});

test('enforces timeout bounds and waits for process termination', { skip: process.platform === 'win32' }, async () => {
  let pid;

  try {
    await assert.rejects(
      bash(
        nodeCommand("process.stdout.write(String(process.pid) + '\\n'); setInterval(() => {}, 1_000)"),
        { context: 'bounded wait', timeoutMs: 50 },
      ),
      error => {
        assert(error instanceof BashExecutionError);
        assert.equal(error.reason, 'timeout');
        assert.equal(error.signal, 'SIGTERM');
        pid = Number(error.stdout);
        assert(Number.isSafeInteger(pid));
        return true;
      },
    );

    await waitForExit(pid);
  } finally {
    if (pid !== undefined && processExists(pid)) process.kill(pid, 'SIGKILL');
  }
});

test('enforces the captured-output buffer bound', async () => {
  await assert.rejects(
    bash(nodeCommand("process.stdout.write('x'.repeat(8_192))"), { maxBufferBytes: 1_024 }),
    error => {
      assert(error instanceof BashExecutionError);
      assert.equal(error.reason, 'max-buffer');
      assert.equal(error.exitCode, null);
      assert(error.stdout.length <= 1_024);
      return true;
    },
  );
});

test('reports signal termination', { skip: process.platform === 'win32' }, async () => {
  await assert.rejects(
    bash('kill -TERM $$'),
    error => {
      assert(error instanceof BashExecutionError);
      assert.equal(error.reason, 'signal');
      assert.equal(error.signal, 'SIGTERM');
      return true;
    },
  );
});

test('rejects attempts to remove execution bounds', async () => {
  await assert.rejects(bash('true', { timeoutMs: 0 }), RangeError);
  await assert.rejects(
    bash('true', { maxBufferBytes: bashLimits.maximumMaxBufferBytes + 1 }),
    RangeError,
  );
});

test('does not leave a child process after buffer termination', { skip: process.platform === 'win32' }, async () => {
  let pid;
  const source = [
    "process.stdout.write(String(process.pid) + '\\n')",
    "process.stdout.write('x'.repeat(8_192))",
    'setInterval(() => {}, 1_000)',
  ].join(';');

  try {
    await assert.rejects(
      bash(nodeCommand(source), { maxBufferBytes: 1_024 }),
      error => {
        assert(error instanceof BashExecutionError);
        pid = Number(error.stdout.split('\n', 1)[0]);
        assert(Number.isSafeInteger(pid));
        return true;
      },
    );

    await waitForExit(pid);
  } finally {
    if (pid !== undefined && processExists(pid)) process.kill(pid, 'SIGKILL');
  }
});

test('exports only the documented package surface', () => {
  const packageJson = JSON.parse(execFileSync(process.execPath, [
    '--input-type=module',
    '--eval',
    "import('ts-bash').then(module => console.log(JSON.stringify(Object.keys(module).sort())))",
  ], {
    cwd: process.cwd(),
    encoding: 'utf8',
  }));

  assert.deepEqual(packageJson, [
    'BashExecutionError',
    'BashParserError',
    'bash',
    'bashLimits',
    'json',
  ]);
});
