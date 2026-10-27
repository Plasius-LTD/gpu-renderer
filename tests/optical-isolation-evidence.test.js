import test from 'node:test';
import assert from 'node:assert/strict';
import {compareOpticalRows,opticalEvidenceExitCode,readOpticalLane} from '../scripts/verify-optical-isolation.mjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {gzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {OPTICAL_ISOLATION as c,opticalIsolationPlan} from './fixtures/optical-lighting-isolation.js';
test('read-only verifier reconstructs retained HDR and rejects count, chunk and source corruption',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'optical-evidence-')),rel='output/playwright/eames-environments/control/',dir=path.join(root,rel);
 try{
  fs.mkdirSync(dir,{recursive:true});const image=new Float32Array(c.width*c.height*4);
  for(let i=0;i<image.length;i+=4)image.set([.75,.75,.75,1],i);
  const raw=Buffer.from(image.buffer),shuffled=Buffer.alloc(raw.length),n=raw.length/4,hash=b=>createHash('sha256').update(b).digest('hex');
  for(let p=0;p<4;p++)for(let i=0;i<n;i++)shuffled[p*n+i]=raw[i*4+p];
  const provenance={sources:Object.fromEntries(['renderer','lighting','shared','site'].map(k=>[k,'a'.repeat(40)]))};
  const r={lane:opticalIsolationPlan()[0],provenance,cleanupPassed:true,adapter:{isFallbackAdapter:false},
   frame:{width:c.width,height:c.height,maximumSpp:c.spp,sampler:'fixed-pattern',mode:'uniform',diagnostics:true,fused:false,actualSamples:c.width*c.height*c.spp,actualHistogram:{[c.spp]:c.width*c.height},validationErrors:0},
   chunks:[{path:rel+'hdr.png'}],hdrSha256:hash(raw)};
  const chunk={format:'float32-byteplanes-gzip-base64',byteOffset:0,byteLength:raw.length,totalBytes:raw.length,sha256:hash(raw),data:gzipSync(shuffled).toString('base64')};
  const png=Buffer.alloc(24);Buffer.from('89504e470d0a1a0a','hex').copy(png);png.writeUInt32BE(c.width,16);png.writeUInt32BE(c.height,20);
  fs.writeFileSync(path.join(dir,'control.png'),png);
  const save=()=>{fs.writeFileSync(path.join(dir,'control.json'),JSON.stringify(r));fs.writeFileSync(path.join(dir,'hdr.json'),JSON.stringify({chunk,provenance}));};save();
  const lane={artifact:{path:rel+'control.png'}},summary={provenance};
  assert.equal(readOpticalLane(root,summary,lane).furnace.passed,true);
  r.frame.actualSamples--;save();assert.throws(()=>readOpticalLane(root,summary,lane),/count/);r.frame.actualSamples++;
  chunk.sha256='b'.repeat(64);save();assert.throws(()=>readOpticalLane(root,summary,lane),/hash/);chunk.sha256=hash(raw);
  chunk.format='unknown';save();assert.throws(()=>readOpticalLane(root,summary,lane),/chunk/);chunk.format='float32-byteplanes-gzip-base64';
  r.cleanupPassed=false;save();assert.throws(()=>readOpticalLane(root,summary,lane),/cleanup/);
  assert.throws(()=>readOpticalLane(root,summary,{artifact:{path:'outside.png'}}),/outside/);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
test('failed or missing image evidence cannot become a green verifier command',()=>{
 const report={status:'controls-complete-image-review-pending',lanes:Array.from({length:4},()=>({})),failures:[]};
 assert.equal(opticalEvidenceExitCode(report),0);assert.equal(opticalEvidenceExitCode(),1);
 assert.equal(opticalEvidenceExitCode({...report,status:'failed'}),1);
 assert.equal(opticalEvidenceExitCode({...report,lanes:report.lanes.slice(1)}),1);
 assert.equal(opticalEvidenceExitCode({...report,lanes:[{error:'row failure'},...report.lanes.slice(1)]}),1);
 assert.equal(opticalEvidenceExitCode({...report,failures:['missing HDR']}),1);
});
test('independent row metrics retain a band mismatch, not PNG/display equality',()=>{
 const a=new Float32Array(64*36*4).fill(.75),b=a.slice();
 assert.equal(compareOpticalRows(a,b,64,36).rowRmse,0);
 for(let y=18;y<23;y++)for(let x=29;x<35;x++)b.set([.25,.25,.25,1],(y*64+x)*4);
 assert(compareOpticalRows(a,b,64,36).rowRmse>.25);
 assert.throws(()=>compareOpticalRows(a,b.slice(4),64,36));b[18*64*4+31*4]=NaN;
 assert.throws(()=>compareOpticalRows(a,b,64,36));
});
