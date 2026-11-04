import test from 'node:test';
import assert from 'node:assert/strict';
import {OpticalWgslExec as Exec,OpticalWgslParser as Parser} from './fixtures/optical-wgsl-executor.js';
import {bsdfProposalProbeShader,bsdfProposalConfig,summarizeBsdfProposal,BSDF_PROPOSAL_CASES,BSDF_PROPOSAL_PROBE} from './fixtures/bsdf-proposal-probe.js';
import {WAVEFRONT_COMPUTE_WGSL} from '../src/wavefront-shaders.js';
import {functionSource} from './fixtures/rough-dielectric-numerical-harness.js';
import {createPrunedContinuationShader} from '../src/wavefront-pruned-continuations.js';
import {WAVEFRONT_SURFACE_BODY_WGSL} from '../src/wavefront-shader-kernels.js';
import {restoreRejectedBsdfProposal} from './fixtures/rejected-bsdf-proposal.js';
import {createHash} from 'node:crypto';
// The CPU executor uses one invocation per workgroup; the physical probe keeps64.
const source=bsdfProposalProbeShader(),parsed=new Parser().parse(source.replaceAll('@workgroup_size(64)','@workgroup_size(1)'));
for(const c of BSDF_PROPOSAL_CASES)test('actual production proposal law: '+c.name,()=>{
 const values=new Float32Array(BSDF_PROPOSAL_PROBE.samples*4);
 new Exec(parsed).dispatchWorkgroups(c.diffuse?'diffuse_proposal_probe':'ggx_proposal_probe',BSDF_PROPOSAL_PROBE.samples,{0:{3:values,5:bsdfProposalConfig(c)}});
 assert.equal(summarizeBsdfProposal(values,c).passed,true);
});
test('proposal probe preserves production sampler/PDF and existing explicit NEE',()=>{
 for(const name of ['scatter_direction','evaluate_surface_bsdf_pdf','importance_sample_ggx'])assert(source.includes(functionSource(name)));
 for(const fusedHits of [false,true])assert(createPrunedContinuationShader({fusedHits}).includes(WAVEFRONT_SURFACE_BODY_WGSL));
 assert(WAVEFRONT_COMPUTE_WGSL.includes('sample_direct_light(hit, ray, normal)'));
});
test('rejected fallback counterexample adds unreported cosine probability',()=>{
 // Normal-incidence GGX alpha1 yields uniform-sphere reflected directions.
 // Resampling its lower half with cosine, while reporting1/(4pi), gives7/3.
 let rejected=0;const n=10000;
 for(let i=0;i<n;i++){const y=(i+.5)/n,cosine=y<.5?1-2*y:Math.sqrt(2*(1-y));rejected+=4*cosine/n;}
 assert(Math.abs(rejected-7/3)<1e-5);assert(Math.abs(rejected-1)>1);
 assert.throws(()=>summarizeBsdfProposal(new Float32Array(),BSDF_PROPOSAL_CASES[0]));
});
test('exact historical shader is preserved while the corrected sampler has a new explicit pin',()=>{
 assert.equal(createHash('sha256').update(restoreRejectedBsdfProposal(WAVEFRONT_COMPUTE_WGSL)).digest('hex'),'1679475a3e08f26ea681c7bb0ea056c640a315936b91e9dbb8e23c86de23b733');
 assert.equal(createHash('sha256').update(WAVEFRONT_COMPUTE_WGSL).digest('hex'),'b50d988d92d0af5867fc3355cadad89ad8b1affe9c88bf051298df2c8acaf7b4');
 assert.throws(()=>restoreRejectedBsdfProposal('missing shader'));
});
test('grazing GGX proposals never accept the unsupported hemisphere',()=>{
 const grazing=source.replace('ray.direction=vec4<f32>(-n,0)','ray.direction=vec4<f32>(-normalize(vec3<f32>(0.99,0,0.01)),0)');
 const values=new Float32Array(BSDF_PROPOSAL_PROBE.samples*4);
 new Exec(new Parser().parse(grazing.replaceAll('@workgroup_size(64)','@workgroup_size(1)'))).dispatchWorkgroups('ggx_proposal_probe',BSDF_PROPOSAL_PROBE.samples,{0:{3:values,5:bsdfProposalConfig(BSDF_PROPOSAL_CASES[0])}});
 let nulls=0;for(let i=0;i<values.length;i+=4){if(values[i]===0)nulls++;else assert(values[i]>0&&values[i+1]>0);}
 assert(nulls>0);
});
