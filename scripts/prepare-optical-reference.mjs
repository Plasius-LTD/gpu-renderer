// Export only package-owned procedural optics. No private model triangles.
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const [lightingRoot,file]=process.argv.slice(2);
if(!lightingRoot||!file)throw Error('Usage: node prepare-optical-reference.mjs LIGHTING_ROOT COMPLETED_FILLED_CLOSEUP.json');
const bytes=fs.readFileSync(file),receipt=JSON.parse(bytes),s=receipt.scene?.glassWater?.settings;
if(receipt.status!=='captured-reference-not-qualified'||!receipt.cleanupPassed||s?.mode!=='filled'||!s.closeup)throw Error('Completed filled close-up required');
const commit=execFileSync('git',['rev-parse','HEAD'],{cwd:lightingRoot,encoding:'utf8'}).trim();
if(commit!==receipt.provenance.sources.lighting||execFileSync('git',['status','--porcelain'],{cwd:lightingRoot}).length)throw Error('Lighting geometry source is not the clean receipt pin');
const {withRoomGlass}=await import(pathToFileURL(path.resolve(lightingRoot,'demo/eames-environments/glass-water-reference.js')));
const composed=withRoomGlass({scene:{meshes:[],camera:receipt.scene.camera},evidence:{floorY:receipt.scene.floorY,roomBounds:{min:[-10,-10,-10],max:[10,10,10]},sceneTriangleCount:0}},s);
const [stand,glass]=composed.scene.meshes,waterY=Math.fround(composed.evidence.glassWater.waterSurfaceY),baseY=Math.fround(composed.evidence.glassWater.glassBottomY+s.base),pieces=[];
const norm=n=>{const l=Math.hypot(...n);return n.map(v=>v/l);};
const triangle=(mesh,o)=>mesh.indices.slice(o,o+3).map(i=>({p:Array.from(new Float32Array(mesh.positions.slice(i*3,i*3+3))),n:Array.from(new Float32Array(mesh.normals.slice(i*3,i*3+3)))}));
function emit(poly,kind){for(let i=1;i+1<poly.length;i++){
 const vertices=[poly[0],poly[i],poly[i+1]],a=vertices[1].p.map((v,k)=>v-vertices[0].p[k]),b=vertices[2].p.map((v,k)=>v-vertices[0].p[k]);
 if(Math.hypot(a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0])>0)pieces.push({kind,vertices});
}}
function clip(poly,above){const out=[];for(let i=0;i<poly.length;i++){
 const a=poly[i],b=poly[(i+1)%poly.length],inside=v=>above?v.p[1]>=waterY:v.p[1]<=waterY,ai=inside(a),bi=inside(b);
 if(ai)out.push(a);if(ai!==bi){const t=(waterY-a.p[1])/(b.p[1]-a.p[1]);out.push({p:a.p.map((v,k)=>k===1?waterY:v+t*(b.p[k]-v)),n:norm(a.n.map((v,k)=>v+t*(b.n[k]-v)))});}
 }return out;}
for(let i=0;i<stand.indices.length;i+=3)emit(triangle(stand,i),'stand');
for(let i=0;i<glass.indices.length;i+=3){const t=triangle(glass,i),v=t[0],radial=(v.p[0]-s.x)*v.n[0]+(v.p[2]-s.z)*v.n[2];
 if(radial<0){emit(clip(t,true),'glass-air');emit(clip(t,false),'glass-water');}
 else emit(t,t.every(v=>v.p[1]===baseY)?'glass-water':'glass-air');
}
const inner=s.radius-s.wall;
for(let i=0;i<s.segments;i++){
 const point=j=>[s.x+inner*Math.cos(j*2*Math.PI/s.segments),waterY,s.z+inner*Math.sin(j*2*Math.PI/s.segments)];
 emit([{p:point(i),n:[0,1,0]},{p:[s.x,waterY,s.z],n:[0,1,0]},{p:point((i+1)%s.segments),n:[0,1,0]}],'water-air');
}
for(const kind of ['stand','glass-air','glass-water','water-air'])if(!pieces.some(p=>p.kind===kind))throw Error('Missing reference interface '+kind);
console.log(JSON.stringify({scope:'explicit shared-interface optical attribution, not matched full room',referenceReceiptSha256:createHash('sha256').update(bytes).digest('hex'),nativeSources:receipt.provenance.sources,camera:receipt.scene.camera,settings:s,floorY:receipt.scene.floorY,pieces}));
