import test from 'node:test';
import assert from 'node:assert/strict';
import {compareOpticalRows,opticalEvidenceExitCode} from '../scripts/verify-optical-isolation.mjs';
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
