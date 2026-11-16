import test from 'node:test';
import assert from 'node:assert/strict';
import {waitForSubmittedGpuWork} from '../src/wavefront-gpu-synchronization.js';

function lossSignal() {
  let lose, subscriptions = 0;
  const promise = new Promise(resolve => { lose = resolve; });
  return {lost: {then(...args) { subscriptions++; return promise.then(...args); }},
    lose, subscriptions: () => subscriptions};
}

test('completed camera waits keep one device-loss subscription for the device lifetime', async () => {
  const signal = lossSignal();
  const device = {lost: signal.lost, queue: {onSubmittedWorkDone: () => Promise.resolve()}};
  try {
    for (let frame = 0; frame < 1000; frame++) {
      assert.equal(await waitForSubmittedGpuWork(device, {allowTimeout: false}), true);
    }
    assert.equal(signal.subscriptions(), 1, 'completed frames must not retain a new pending loss reaction');
  } finally { signal.lose({reason: 'destroyed'}); }
});

test('one loss interrupts every outstanding wait and future waits on that device', async () => {
  const signal = lossSignal();
  const device = {lost: signal.lost, queue: {onSubmittedWorkDone: () => new Promise(() => {})}};
  const pending = Array.from({length: 4}, () => assert.rejects(
    waitForSubmittedGpuWork(device, {allowTimeout: false, timeoutMs: 100}), /device lost.*destroyed/));
  signal.lose({reason: 'destroyed'});
  await Promise.all(pending);
  await assert.rejects(waitForSubmittedGpuWork(device, {allowTimeout: false}), /device lost.*destroyed/);
  assert.equal(signal.subscriptions(), 1);
});

test('completion and timeout detach waiters without hiding a later device loss', async () => {
  const signal = lossSignal();
  let complete = true;
  const device = {lost: signal.lost, queue: {onSubmittedWorkDone: () => complete ? Promise.resolve() : new Promise(() => {})}};
  assert.equal(await waitForSubmittedGpuWork(device), true);
  complete = false;
  await assert.rejects(waitForSubmittedGpuWork(device, {allowTimeout: false, timeoutMs: 2}), /Timed out/);
  const pending = assert.rejects(waitForSubmittedGpuWork(device, {allowTimeout: false}), /device lost/);
  signal.lose({reason: 'unknown'});
  await pending;
  assert.equal(signal.subscriptions(), 1);
});

test('device-loss observation remains isolated between devices', async () => {
  const a = lossSignal(), b = lossSignal();
  const deviceA = {lost: a.lost, queue: {onSubmittedWorkDone: () => new Promise(() => {})}};
  const deviceB = {lost: b.lost, queue: {onSubmittedWorkDone: () => Promise.resolve()}};
  const pending = assert.rejects(waitForSubmittedGpuWork(deviceA, {allowTimeout: false}), /device lost/);
  a.lose({reason: 'destroyed'});
  await pending;
  assert.equal(await waitForSubmittedGpuWork(deviceB), true);
  b.lose({reason: 'destroyed'});
});
