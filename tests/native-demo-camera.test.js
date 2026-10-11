import test from 'node:test';
import assert from 'node:assert/strict';
import { createNativeDemoCamera } from '../demo/native-demo-camera.js';

function fixture() {
  const events = new Map(), captures = new Set();
  const canvas = {
    clientHeight: 600, ownerDocument: { activeElement: null },
    style: { touchAction: 'auto' },
    addEventListener(type, fn) { events.set(type, fn); },
    removeEventListener(type) { events.delete(type); },
    focus() { this.ownerDocument.activeElement = this; },
    setPointerCapture(id) { captures.add(id); },
    hasPointerCapture(id) { return captures.has(id); },
    releasePointerCapture(id) { captures.delete(id); },
  };
  let changes = 0;
  const camera = { eye: [0, 1, 2], target: [0, 1, 0], fov: 42 };
  const controls = createNativeDemoCamera({ canvas, camera, onChange: () => changes++ });
  const send = (type, extra = {}) => {
    const e = { target: canvas, pointerId: 1, pointerType: 'mouse', button: 0,
      clientX: 0, clientY: 0, preventDefault() { this.prevented = true; }, ...extra };
    events.get(type)?.(e); return e;
  };
  return { canvas, camera, controls, send, events, captures, changes: () => changes };
}
const distance = c => Math.hypot(...c.eye.map((v,i) => v-c.target[i]));
const near = (a,b) => assert.ok(Math.abs(a-b)<1e-5, `${a} ~= ${b}`);

test('shared camera orbits, pans in place and trucks in its current view plane', () => {
  const { controls, camera } = fixture();
  controls.move(80,20);
  let moved=controls.read(); assert.notDeepEqual(moved.eye,camera.eye);
  assert.deepEqual(moved.target,camera.target); near(distance(moved),2);
  controls.setMode('pan'); const eye=moved.eye;
  controls.move(40,10); moved=controls.read();
  assert.deepEqual(moved.eye,eye); assert.notDeepEqual(moved.target,camera.target);
  controls.setMode('truck'); const before=controls.read(); controls.move(50,25);
  moved=controls.read();
  moved.eye.forEach((v,i)=>near(v-before.eye[i],moved.target[i]-before.target[i]));
  const d=moved.eye.map((v,i)=>v-before.eye[i]);
  near(d.reduce((sum,v,i)=>sum+v*(before.target[i]-before.eye[i]),0),0);
  controls.reset(); assert.deepEqual(controls.read(),camera);
});

test('optical zoom changes only the lens while dolly changes only distance within bounds', () => {
  const { controls,camera }=fixture();
  controls.setMode('zoom'); controls.move(0,-60); const zoom=controls.read();
  assert.deepEqual(zoom.eye,camera.eye); assert.deepEqual(zoom.target,camera.target); assert.ok(zoom.fov<42);
  controls.setMode('dolly'); controls.move(0,-60); let moved=controls.read();
  assert.equal(moved.fov,zoom.fov); assert.ok(distance(moved)<2);
  for(let i=0;i<100;i++)controls.move(0,-1000);
  near(distance(controls.read()),.03);
  for(let i=0;i<100;i++)controls.move(0,1000);
  near(distance(controls.read()),20);
  controls.setMode('zoom'); for(let i=0;i<100;i++)controls.move(0,1000);
  assert.equal(controls.read().fov,90);
  for(let i=0;i<100;i++)controls.move(0,-1000);
  assert.equal(controls.read().fov,12);
  controls.setMode('truck'); for(let i=0;i<100;i++)controls.move(1000,1000);
  assert.ok(controls.read().target.every((v,i)=>Math.abs(v-camera.target[i])<=8));
});

test('pointer capture, right-drag truck, keyboard and wheel stay scoped to focused canvas', () => {
  const f=fixture();
  assert.ok(!f.send('wheel',{deltaY:60,deltaMode:0}).prevented);
  assert.ok(!f.send('keydown',{key:'ArrowLeft'}).prevented);
  f.send('pointerdown',{button:2,clientX:10}); assert.ok(f.captures.has(1));
  f.send('pointermove',{clientX:40});
  assert.notDeepEqual(f.controls.read().target,f.camera.target);
  f.send('pointerup'); assert.equal(f.captures.size,0);
  assert.ok(f.send('keydown',{key:'Home'}).prevented); assert.deepEqual(f.controls.read(),f.camera);
  for(const key of ['1','2','3','4','5','ArrowLeft','ArrowRight','ArrowUp','ArrowDown','+','-','=', '_'])
    assert.ok(f.send('keydown',{key}).prevented,key);
  assert.ok(f.send('keydown',{key:'ArrowLeft',shiftKey:true}).prevented);
  for(const extra of [{key:'a'},{key:'ArrowLeft',ctrlKey:true},{key:'ArrowRight',metaKey:true},{key:'ArrowUp',altKey:true},{key:'Tab'},{key:'ArrowLeft',target:{}}])
    assert.ok(!f.send('keydown',extra).prevented);
  for(const deltaMode of [0,1,2])assert.ok(f.send('wheel',{deltaY:1,deltaMode}).prevented);
  assert.ok(!f.send('wheel',{deltaY:20,ctrlKey:true}).prevented,'browser zoom belongs to browser');
  assert.ok(f.send('contextmenu').prevented);
});

test('two-touch truck and pinch transition to one-touch without stale jumps', () => {
  const f=fixture();
  f.send('pointerdown',{pointerType:'touch',clientX:100});
  f.send('pointerdown',{pointerId:2,pointerType:'touch',clientX:200});
  f.send('pointermove',{pointerId:2,pointerType:'touch',clientX:250,clientY:10});
  const moved=f.controls.read();
  assert.notDeepEqual(moved.target,f.camera.target); assert.ok(distance(moved)<2);
  f.send('pointercancel',{pointerId:2,pointerType:'touch'});
  f.send('pointermove',{pointerType:'touch',clientX:100}); assert.deepEqual(f.controls.read(),moved);
  f.send('lostpointercapture'); const n=f.changes();
  f.send('pointermove',{clientX:200}); assert.equal(f.changes(),n);
});

test('disposal clears active gestures and listeners without stale callbacks or style changes', () => {
  const f=fixture(); f.send('pointerdown'); f.send('pointerdown',{pointerId:2});
  f.send('pointerdown',{pointerId:3}); assert.equal(f.captures.size,2);
  f.send('blur'); assert.equal(f.captures.size,0);
  f.send('pointerdown'); const n=f.changes(); f.controls.destroy(); f.controls.destroy();
  assert.equal(f.captures.size,0); assert.equal(f.events.size,0); assert.equal(f.canvas.style.touchAction,'auto');
  f.controls.move(30,30); f.controls.reset(); assert.equal(f.changes(),n);
});

test('invalid camera/input values cannot poison the shared camera state', () => {
  const f=fixture();
  for(const camera of [null,{...f.camera,fov:NaN},{...f.camera,eye:[0,0,Infinity]},{...f.camera,target:f.camera.eye},{...f.camera,eye:[1e308,1e308,1e308],target:[-1e308,-1e308,-1e308]}])
    assert.throws(()=>createNativeDemoCamera({canvas:f.canvas,camera,onChange:()=>{}}),/camera/i);
  assert.throws(()=>createNativeDemoCamera({canvas:null,camera:f.camera,onChange:()=>{}}),/camera/i);
  assert.throws(()=>f.controls.setMode('other'),/mode/);
  f.controls.move(Infinity,0); f.controls.move(0,NaN); assert.equal(f.changes(),0);
  f.send('pointerdown',{button:3}); f.send('pointermove',{clientX:20}); assert.equal(f.changes(),0);
  f.canvas.focus(); f.send('wheel',{deltaY:NaN}); assert.equal(f.changes(),0);
  f.send('pointerdown'); f.send('pointermove',{clientX:Infinity}); assert.equal(f.changes(),0);
  const read=f.controls.read(); read.eye[0]=100; assert.equal(f.controls.read().eye[0],0);
});


test('pointer orbit and keyboard/button orbit use the same shared camera convention', () => {
  const drag=fixture(), button=fixture();
  drag.send('pointerdown',{clientX:100,clientY:100});
  drag.send('pointermove',{clientX:124,clientY:76});
  button.controls.move(24,-24);
  const a=drag.controls.read(),b=button.controls.read();
  a.eye.forEach((v,i)=>near(v,b.eye[i]));
  assert.deepEqual(a.target,b.target); near(distance(a),distance(b));
  drag.send('pointerup');
  assert.ok(drag.changes()>0);
});
