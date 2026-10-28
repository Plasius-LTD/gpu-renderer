import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';

test('actual physical runner rejects unsafe experiment combinations before any adapter or allocation',async()=>{
 const filename=fileURLToPath(new URL('./fixtures/adaptive-paired-runner.js',import.meta.url));
 const source=readFileSync(filename,'utf8').replace(/^import .*;$/gm,'').replace(/^export /gm,'');
 const context=vm.createContext({});new vm.Script(source,{filename}).runInContext(context);
 for(const options of [
  {opticalInterfaceBudget:{enabled:true}},
  {opticalInterfaceBudget:{enabled:true},boundedDielectricBranching:true},
  {guidedDenoise:true},
  {splitDepth:3},
  {splitDepth:1,sampler:'fixed-pattern'},
  {splitDepth:1,sampler:'stable-pattern',pruningVariants:true},
  {sampler:'unknown'},
 ])await assert.rejects(context.createPairedProbeRunner({},undefined,options),/requires|invalid|not admitted/i);
});
