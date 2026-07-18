import { bash, json, type BashParser } from '../src/index.js';

const stringResult: Promise<string> = bash('printf hello');
const numberResult: Promise<number> = bash('printf 42', Number);
const objectResult: Promise<{ ok: boolean }> = bash('printf \'{"ok":true}\'', json<{ ok: boolean }>());
const voidParser: BashParser<void> = () => undefined;
const voidResult: Promise<void> = bash('true', voidParser);

void stringResult;
void numberResult;
void objectResult;
void voidResult;

// @ts-expect-error parser results are preserved rather than widened to string
const wrongResult: Promise<string> = bash('printf 42', Number);
void wrongResult;
