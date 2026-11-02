import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {expand} from 'brace-expansion';
import {minimatch} from 'minimatch';
import * as fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {glob,globSync} from 'glob';

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
test('tooling graph excludes affected minimatch and glob versions without runtime dependency churn',()=>{
 const manifest=JSON.parse(readFileSync(new URL('../package.json',import.meta.url))),lock=JSON.parse(readFileSync(new URL('../package-lock.json',import.meta.url)));
 for(const [name,minimum]of [['minimatch',[11,0,1]],['glob',[14,0,2]]]){
  assert.equal(manifest.overrides[name],'^'+minimum.join('.'));
  const entries=Object.entries(lock.packages).filter(([key])=>key.endsWith('/'+name));assert(entries.length);
  for(const [,entry]of entries){const parts=entry.version.split('.').map(Number);assert(parts[0]>minimum[0]||parts[0]===minimum[0]&&(parts[1]>minimum[1]||parts[1]===minimum[1]&&parts[2]>=minimum[2]));assert.equal(entry.dev,true);}
 }
});
test('patched glob retains coverage patterns and stops pre-aborted directory traversal portably',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'renderer-tooling-'));
 try{
  fs.mkdirSync(path.join(root,'src'));fs.writeFileSync(path.join(root,'src','sample.js'),'');fs.writeFileSync(path.join(root,'src','sample.txt'),'');
  assert.deepEqual(globSync('{src,tests}/**/*.{js,cjs}',{cwd:root}),['src/sample.js']);
  const controller=new AbortController(),reason=Error('portable pre-abort');controller.abort(reason);let reads=0;
  const observed={...fs,readdir(...args){reads++;return fs.readdir(...args);},readdirSync(...args){reads++;return fs.readdirSync(...args);}};
  await assert.rejects(glob('**/*',{cwd:root,signal:controller.signal,fs:observed}),error=>error===reason);
  assert.equal(reads,0,'aborted tooling must not traverse directories');
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
