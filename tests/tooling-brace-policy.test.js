import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {expand} from 'brace-expansion';
import {minimatch} from 'minimatch';

test('the tooling graph cannot resolve the previously forced vulnerable brace release',()=>{
 const manifest=JSON.parse(readFileSync(new URL('../package.json',import.meta.url)));
 const lock=JSON.parse(readFileSync(new URL('../package-lock.json',import.meta.url)));
 assert.equal(manifest.overrides['brace-expansion'],'^5.0.12');
 const entries=Object.entries(lock.packages).filter(([name])=>name.endsWith('/brace-expansion'));
 assert(entries.length>0);
 for(const [,entry]of entries){
  const [major,minor,patch]=entry.version.split('.').map(Number);
  assert(major===5&&(minor>0||minor===0&&patch>=12),'brace-expansion must remain outside the published affected5.x ranges');
  assert.equal(entry.dev,true,'must not add a production dependency');
 }
});
test('patched brace expansion preserves benign nested, escaped and ranged tooling patterns',()=>{
 assert.deepEqual(expand('src/{core,{sampling,transport}}.{js,ts}'),['src/core.js','src/core.ts','src/sampling.js','src/sampling.ts','src/transport.js','src/transport.ts']);
 assert.deepEqual(expand('capture-{01..03}.json'),['capture-01.json','capture-02.json','capture-03.json']);
 assert.deepEqual(expand('literal\\{a,b\\}'),['literal{a,b}']);
 assert.equal(minimatch('tests/room-convergence.test.js','{src,tests}/**/*.{js,cjs}'),true);
 assert.equal(minimatch('coverage/lcov.info','{src,tests}/**/*.{js,cjs}'),false);
});
