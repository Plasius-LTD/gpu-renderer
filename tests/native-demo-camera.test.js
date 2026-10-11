import test from 'node:test';
import assert from 'node:assert/strict';
import { buildViewMatrix } from '@plasius/gpu-camera';
import { createNativeDemoCamera } from '../demo/native-demo-camera.js';

function fixture(options = {}) {
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
  const controls = createNativeDemoCamera({ canvas, camera, onChange: () => changes++, ...options });
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


test('focus guide expires after five seconds and replays without moving the camera', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const visibility=[];
  const f=fixture({onHintChange: visible=>visibility.push(visible)});
  assert.deepEqual(visibility,[]);
  f.canvas.focus(); f.send('focus');
  assert.deepEqual(visibility,[true]);
  t.mock.timers.tick(4999); assert.deepEqual(visibility,[true]);
  t.mock.timers.tick(1); assert.deepEqual(visibility,[true,false]);
  assert.deepEqual(f.controls.read(),f.camera); assert.equal(f.changes(),0);
  f.send('blur'); f.send('focus');
  t.mock.timers.tick(4000);
  assert.ok(f.send('keydown',{key:'?'}).prevented);
  t.mock.timers.tick(1000); assert.equal(visibility.at(-1),true,'replay resets expiry');
  t.mock.timers.tick(4000); assert.equal(visibility.at(-1),false);
  f.controls.destroy();
});

test('guide cancellation on Escape, blur and disposal clears pending expiry', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const visibility=[];
  const f=fixture({onHintChange: visible=>visibility.push(visible)});
  f.canvas.focus(); f.send('focus');
  assert.ok(f.send('keydown',{key:'Escape'}).prevented);
  assert.equal(visibility.at(-1),false);
  let n=visibility.length; t.mock.timers.tick(5000); assert.equal(visibility.length,n);
  f.send('focus'); f.send('blur'); assert.equal(visibility.at(-1),false);
  n=visibility.length; t.mock.timers.tick(5000); assert.equal(visibility.length,n);
  f.send('focus'); f.controls.destroy(); f.controls.destroy();
  assert.equal(visibility.at(-1),false);
  n=visibility.length; t.mock.timers.tick(5000); assert.equal(visibility.length,n);
  assert.equal(f.events.size,0);
  assert.throws(()=>fixture({onHintChange:null}),/camera/i);
});

test('mouse and one-touch orbit need no tool selection; Alt mouse drag pans in place', () => {
  for(const pointerType of ['mouse','touch']) {
    const f=fixture(); f.controls.setMode('zoom');
    f.send('pointerdown',{pointerType,clientX:100,clientY:100});
    f.send('pointermove',{pointerType,clientX:130,clientY:120});
    const c=f.controls.read();
    assert.notDeepEqual(c.eye,f.camera.eye); assert.deepEqual(c.target,f.camera.target);
    assert.equal(c.fov,f.camera.fov); near(distance(c),2);
    f.controls.destroy();
  }
  const f=fixture();
  f.send('pointerdown',{altKey:true});
  f.send('pointermove',{clientX:30,clientY:20});
  assert.deepEqual(f.controls.read().eye,f.camera.eye);
  assert.notDeepEqual(f.controls.read().target,f.camera.target);
  f.send('pointerup'); f.controls.reset();
  f.send('pointerdown',{shiftKey:true}); f.send('pointermove',{clientX:30});
  assert.notDeepEqual(f.controls.read().eye,f.camera.eye);
  assert.notDeepEqual(f.controls.read().target,f.camera.target);
  f.controls.destroy();
});

test('wheel dolly and Shift-wheel lens zoom are independent of keyboard mode', () => {
  const f=fixture(); f.canvas.focus(); f.controls.setMode('zoom');
  f.send('wheel',{deltaY:-100,deltaMode:0});
  const closer=f.controls.read();
  assert.equal(closer.fov,f.camera.fov); assert.ok(distance(closer)<distance(f.camera));
  f.send('wheel',{deltaY:-100,deltaMode:0,shiftKey:true});
  const zoomed=f.controls.read();
  assert.deepEqual(zoomed.eye,closer.eye); assert.deepEqual(zoomed.target,closer.target);
  assert.ok(zoomed.fov<closer.fov); f.controls.destroy();
});


// Screen Y grows downward, as pointer clientY does. Project a point on the
// front of the object, not its stationary orbit pivot.
function frontPointOnScreen(camera) {
  const view=buildViewMatrix({transform:{position:camera.eye,target:camera.target,up:[0,1,0]}});
  const point=[0,1,1,1];
  const xyz=[0,1,2].map(row=>point.reduce((sum,v,column)=>sum+v*view[column*4+row],0));
  return [xyz[0]/-xyz[2],xyz[1]/xyz[2]];
}

test('mouse and touch grabs move the visible front surface with both drag axes', () => {
  for(const pointerType of ['mouse','touch']) for(const [dx,dy] of [[0,24],[0,-24],[24,0],[-24,0]]) {
    const f=fixture(), before=frontPointOnScreen(f.camera);
    f.send('pointerdown',{pointerType,clientX:100,clientY:100});
    f.send('pointermove',{pointerType,clientX:100+dx,clientY:100+dy});
    const after=frontPointOnScreen(f.controls.read());
    if(dy) assert.equal(Math.sign(after[1]-before[1]),Math.sign(dy),`${pointerType} vertical grab ${dy}`);
    if(dx) assert.equal(Math.sign(after[0]-before[0]),Math.sign(dx),`${pointerType} horizontal grab ${dx}`);
    assert.deepEqual(f.controls.read().target,f.camera.target); near(distance(f.controls.read()),2);
    f.controls.destroy();
  }
});

test('orbit grab direction survives one/two/one touch transitions and preserves truck and pinch', () => {
  const f=fixture(), touch={pointerType:'touch'};
  f.send('pointerdown',{...touch,clientX:100,clientY:100});
  f.send('pointermove',{...touch,clientX:100,clientY:124});
  f.send('pointerdown',{...touch,pointerId:2,clientX:200,clientY:124});
  const before=f.controls.read(), pointBefore=frontPointOnScreen(before);
  f.send('pointermove',{...touch,clientX:100,clientY:148});
  f.send('pointermove',{...touch,pointerId:2,clientX:200,clientY:148});
  const truck=f.controls.read();
  assert.ok(frontPointOnScreen(truck)[1]>pointBefore[1],'two-finger downward drag still moves the object down');
  near(distance(truck),distance(before));
  f.send('pointermove',{...touch,pointerId:2,clientX:230,clientY:148});
  assert.ok(distance(f.controls.read())<distance(truck),'spread still moves closer');
  f.send('pointerup',{...touch,pointerId:2});
  const afterPinch=f.controls.read(), pointAfterPinch=frontPointOnScreen(afterPinch);
  f.send('pointermove',{...touch,clientX:100,clientY:148});
  assert.deepEqual(f.controls.read(),afterPinch,'stationary remaining finger cannot jump');
  f.send('pointermove',{...touch,clientX:100,clientY:172});
  assert.ok(frontPointOnScreen(f.controls.read())[1]>pointAfterPinch[1],'remaining finger resumes downward orbit grab');
  assert.deepEqual(f.controls.read().target,afterPinch.target);
  f.controls.destroy();
});
