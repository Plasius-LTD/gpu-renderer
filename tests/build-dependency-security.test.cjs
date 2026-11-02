'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');
const { glob, globSync } = require('glob');

function fixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'plasius-glob-security-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return directory;
}

test('cancelled glob traversal stops requesting directories', async t => {
  const directory = fixture(t);
  for (let a = 0; a < 4; a++) for (let b = 0; b < 4; b++) for (let c = 0; c < 4; c++) {
    fs.mkdirSync(path.join(directory, `${a}`, `${b}`, `${c}`), { recursive: true });
  }
  const controller = new AbortController();
  let reads = 0;
  const observedFs = { ...fs, readdir(...args) {
    reads++;
    const callback = args.pop();
    fs.readdir(...args, (error, entries) => {
      if (reads === 1) controller.abort(new Error('fixture cancellation'));
      callback(error, entries);
    });
  } };
  await assert.rejects(glob('**/*', { cwd: directory, fs: observedFs, signal: controller.signal }), /fixture cancellation/);
  await new Promise(resolve => setTimeout(resolve, 50));
  assert.equal(reads, 1, 'an aborted traversal must not descend further');
});

test('ordinary glob selection still supports braces, ignore and async consumers', async t => {
  const directory = fixture(t);
  fs.mkdirSync(path.join(directory, 'src'));
  for (const name of ['index.ts', 'view.tsx', 'view.tests.ts', 'notes.md']) fs.writeFileSync(path.join(directory, 'src', name), '');
  const options = { cwd: directory, ignore: ['**/*.tests.ts'] };
  const expected = ['src/index.ts', 'src/view.tsx'];
  assert.deepEqual(globSync('src/**/*.{ts,tsx}', options).sort(), expected);
  assert.deepEqual((await glob('src/**/*.{ts,tsx}', options)).sort(), expected);
});

test('pattern preprocessing stays within a bounded worker budget', () => {
  const probe = spawnSync(process.execPath, ['--max-old-space-size=96', '-e', `
    const {Minimatch}=require('minimatch');
    const pattern=Array.from({length:18},(_,i)=>'p'+i+'/**/..').join('/')+'/file';
    // The configured expansion budget must also bound globstar preprocessing.
    const matcher=new Minimatch(pattern,{optimizationLevel:2,braceExpandMax:64});
    if(matcher.globParts.length>64) process.exit(3);
    if(!new Minimatch('**/*.{ts,tsx}',{optimizationLevel:2}).match('src/view.tsx')) process.exit(2);
  `], { cwd: path.resolve(__dirname, '..'), timeout: 2000, maxBuffer: 4096 });
  assert.equal(probe.status, 0, `pattern must finish without amplification: ${probe.error?.code ?? probe.signal ?? probe.status}`);
});
