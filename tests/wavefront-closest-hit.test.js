import test from 'node:test';
import assert from 'node:assert/strict';
import {createWavefrontPathTracingComputeConfig as configuration} from '../src/wavefront-config.js';
import {traversalFixture} from './fixtures/closest-hit-harness.js';

function planes(count,{sameDepth=false}={}){
  return Array.from({length:count},(_,i)=>({id:100+i,positions:[-2,-2,sameDepth?3:i+1,2,-2,sameDepth?3:i+1,0,2,sameDepth?3:i+1],indices:[0,1,2],
    normals:[0,0,-1,0,0,-1,0,0,-1],uvs:[0,0,1,0,.5,1],color:[i/count,.3,.5,1],materialRefId:100+i}));
}
const ray={origin:[0,0,0],direction:[0,0,1]};
function compare(config,rays){
  const baseline=traversalFixture(config,rays,{canonical:true}).run();
  const candidate=traversalFixture(config,rays).run();
  assert.deepEqual(candidate.output,baseline.output,'every candidate field must match canonical closest-hit');
  return {baseline,candidate};
}

test('geometry traversal reuses ray reciprocals while retaining canonical triangle order',()=>{
  const {baseline,candidate}=compare(configuration({meshes:planes(64)}),[ray]);
  const tests=calls=>(calls.get('intersect_triangle')??0)+(calls.get('intersect_triangle_coordinates')??0);
  assert.ok(tests(baseline.calls)>=64);
  assert.equal(tests(candidate.calls),tests(baseline.calls),'retain canonical triangle-tree order');
  assert.equal(candidate.calls.get('safe_inverse'),3,'cache one inverse per ray axis');
});

test('strict limits, misses, parallel rays, edge hits and degenerate geometry preserve all fields',()=>{
  const config=configuration({meshes:[...planes(12),{id:999,positions:[0,0,0,0,0,0,0,0,0],indices:[0,1,2]}]});
  const rays=[ray,{...ray,limit:1},{...ray,limit:1.00001},{...ray,limit:.0009},
    {origin:[0,0,4.5],direction:[0,0,1]},{origin:[0,0,20],direction:[0,0,-1]},
    {origin:[2,2,0],direction:[0,0,1]},{origin:[-2,-2,0],direction:[0,-0,1]},
    {origin:[0,0,0],direction:[1,0,0]},{origin:[0,0,0],direction:[0,1,0]},
    {origin:[-.2,.1,0],direction:[1e-7,-1e-7,1]}];
  compare(config,rays);
});

test('equal-distance leaves and within-leaf triangles retain canonical winner',()=>{
  compare(configuration({meshes:planes(12,{sameDepth:true})}),[ray,{...ray,limit:3},{...ray,limit:4}]);
});

test('non-power-of-two GPU heap layout retains its canonical right-first ties',()=>{
  for(const count of [3,5,11]){
    const config=configuration({meshes:planes(count,{sameDepth:true})});
    // GPU buildBvhInternalLevel uses heap children 2*i+1/2*i+2 and leaves
    // starting at count-1. Leaf index alone does not encode visit priority.
    const nodes=Array.from({length:2*count-1},(_,i)=>({
      bounds:{min:[-2,-2,3],max:[2,2,3]},
      firstTriangle:i<count-1?2*i+1:i-count+1,
      triangleCount:i<count-1?0:1,leftChild:2*i+1,rightChild:2*i+2
    }));
    nodes[0].bounds.min[2]=1;nodes[1].bounds.min[2]=1;nodes[2].bounds.min[2]=2;
    compare({...config,bvhNodeCount:nodes.length,
      meshAcceleration:{...config.meshAcceleration,nodes}},[ray]);
  }
});

test('instanced traversal preserves mirrored/nonuniform transforms, equal-distance instances and strict limits',()=>{
  const meshes=planes(1),instances=Array.from({length:8},(_,i)=>({id:1000+i,meshId:100,
    transform:[i%2?-2:2,0,0,0,0,3,0,0,0,0,.5,0,0,0,i<4?2:i,1]}));
  compare(configuration({meshes,instances}),[ray,{...ray,limit:2.5},{...ray,limit:2.5001},
    {origin:[0,0,20],direction:[0,0,-1]},{origin:[8,0,0],direction:[0,0,1]}]);
});

test('TLAS visits the near instance before traversing obscured BLAS trees',()=>{
  const instances=Array.from({length:64},(_,i)=>({id:1000+i,meshId:100,
    transform:[1,0,0,0,0,1,0,0,0,0,1,0,0,0,i,1]}));
  const {baseline,candidate}=compare(configuration({meshes:planes(1),instances}),[ray]);
  assert.equal(baseline.calls.get('intersect_geometry_bvh'),64);
  assert.equal(candidate.calls.get('intersect_geometry_bvh'),1);
});

test('near-first instance visits retain the canonical winner at an equal hit distance',()=>{
  // The off-ray triangle changes each instance's bounds entry, while both
  // transformed on-ray triangles still intersect at distance three.
  const meshes=[{id:100,positions:[-2,-2,1,2,-2,1,0,2,1,20,0,0,21,0,0,20,1,0],indices:[0,1,2,3,4,5]}];
  const instances=[1,2].map((scale,i)=>({id:1000+i,meshId:100,
    transform:[1,0,0,0,0,1,0,0,0,0,scale,0,0,0,3-scale,1]}));
  const config=configuration({meshes,instances});
  assert.deepEqual(config.instancing.records.map(record=>record.id),[1001,1000]);
  const {candidate}=compare(config,[ray,{...ray,limit:3},{...ray,limit:3.0001}]);
  assert.equal(candidate.calls.get('intersect_geometry_bvh'),6,'both equal-distance instances must be considered');
});

test('seeded scattered geometry preserves complete hit records across camera directions',()=>{
  let seed=0x17a2201;
  const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/0x100000000;};
  const meshes=Array.from({length:48},(_,i)=>{
    const x=(random()-.5)*12,y=(random()-.5)*12,z=random()*12-6;
    return {id:100+i,positions:[x-1,y-1,z,x+1,y-1,z,x,y+1,z+.1],indices:[0,1,2],
      normals:[.1,0,-1,0,.1,-1,0,0,-1],uvs:[.1,.2,.7,.3,.4,.8],materialRefId:i+100};
  });
  const rays=Array.from({length:240},()=>({origin:[(random()-.5)*10,(random()-.5)*10,(random()-.5)*20],
    direction:[random()-.5,random()-.5,random()-.5],limit:random()<.2?random()*8:1e10}));
  compare(configuration({meshes}),rays);
});
