import assert from 'node:assert/strict';
import { enqueueNativeKvOperation, flushNativeKvOperations } from '../src/lib/nativeKvQueue.js';

;(async () => {
const order = [];
let releaseFirst;
const firstGate = new Promise(resolve => { releaseFirst = resolve; });

const first = enqueueNativeKvOperation(async () => {
  order.push('first:start');
  await firstGate;
  order.push('first:end');
});
const second = enqueueNativeKvOperation(async () => {
  order.push('second');
});

await Promise.resolve();
assert.deepEqual(order, ['first:start']);
releaseFirst();
await Promise.all([first, second]);
await flushNativeKvOperations();
assert.deepEqual(order, ['first:start', 'first:end', 'second']);

console.log('native kv queue: all assertions passed');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
