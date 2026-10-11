import { createCameraManager, buildViewMatrix } from '@plasius/gpu-camera';
import { createCameraControls } from '@plasius/gpu-camera-controls';
import { normalizePointerEvent } from '@plasius/gpu-camera-controls/browser';

const modes = ['orbit', 'truck', 'pan', 'dolly', 'zoom'];
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const vector = v => Array.isArray(v) && v.length === 3 && v.every(Number.isFinite);

/** DOM input adapter only. Camera state, transforms and lens belong to gpu-camera. */
export function createNativeDemoCamera({ canvas, camera, onChange, onHintChange = () => {} } = {}) {
  if (!canvas?.addEventListener || typeof onChange !== 'function' || typeof onHintChange !== 'function' || !camera ||
      !vector(camera.eye) || !vector(camera.target) || !Number.isFinite(camera.fov) ||
      camera.fov < 12 || camera.fov > 90 ||
      !Number.isFinite(Math.hypot(...camera.eye.map((v,i) => v-camera.target[i]))) ||
      Math.hypot(...camera.eye.map((v,i) => v-camera.target[i])) < .03) {
    throw new Error('Invalid native demo camera.');
  }
  const manager = createCameraManager();
  const initial = { id: 'inspection', transform: { position: [...camera.eye], target: [...camera.target], up: [0,1,0] },
    projection: { kind: 'perspective', fovY: camera.fov, near: .01, far: 100 } };
  manager.registerCamera(initial);
  const radius = Math.hypot(...camera.eye.map((v,i) => v-camera.target[i]));
  const bounds = { minDistance: .03, maxDistance: Math.max(2,radius*10), minPolarAngle: .02, maxPolarAngle: Math.PI-.02 };
  const gestures = createCameraControls({ camera: initial, viewMode: 'editor', ...bounds,
    smoothTime: 0, draggingSmoothTime: 0, rotateSensitivity: .008, dollySensitivity: .004 });
  let mode = 'orbit', disposed = false, hintVisible = false, hintTimer;
  const points = new Map(), listeners = [];
  const originalTouchAction = canvas.style.touchAction;
  canvas.style.touchAction = 'none';
  const state = () => manager.getCamera(initial.id);
  const read = () => {
    const c = state(); return { eye: c.transform.position, target: c.transform.target, fov: c.projection.fovY };
  };
  function move(dx, dy, operation = mode) {
    if (disposed || !Number.isFinite(dx) || !Number.isFinite(dy) || (!dx && !dy)) return;
    dx=clamp(dx,-300,300); dy=clamp(dy,-300,300);
    const c=state(), height=Math.max(1,canvas.clientHeight);
    const distance=Math.hypot(...c.transform.position.map((v,i)=>v-c.transform.target[i]));
    const apply = control => manager.applyControl(initial.id,control,bounds);
    if (operation === 'orbit') apply({type:'orbit',deltaAzimuth:-dx*.008,deltaPolar:-dy*.008});
    if (operation === 'pan') apply({type:'look',deltaYaw:-dx*.004,deltaPitch:-dy*.004});
    if (operation === 'truck') {
      const view=buildViewMatrix(c), scale=2*distance*Math.tan(c.projection.fovY*Math.PI/360)/height;
      const delta=[0,1,2].map(i => (-dx*view[i*4]+dy*view[i*4+1])*scale);
      apply({type:'truck',delta:delta.map((v,i)=>clamp(c.transform.target[i]+v,
        initial.transform.target[i]-radius*4, initial.transform.target[i]+radius*4)-c.transform.target[i])});
    }
    if (operation === 'dolly') apply({type:'dolly',distance:distance*(1-Math.exp(dy*.008))});
    if (operation === 'zoom') manager.updateCamera(initial.id,{projection:{fovY:clamp(c.projection.fovY*Math.exp(dy*.008),12,90)}});
    onChange(read());
  }
  const reset = () => { if (!disposed) { manager.updateCamera(initial.id,initial); onChange(read()); } };
  const setMode = value => { if (!modes.includes(value)) throw new Error('Invalid camera mode.'); mode=value; };
  const focused = e => canvas.ownerDocument.activeElement === canvas && e.target === canvas;
  const listen = (type,fn,options) => { canvas.addEventListener(type,fn,options); listeners.push([type,fn,options]); };
  const release = id => { gestures.handlePointerCancel({pointerId:id}); points.delete(id); if(canvas.hasPointerCapture(id))canvas.releasePointerCapture(id); };
  const cancel = () => { for (const id of [...points.keys()]) release(id); };
  const hideHint = () => {
    clearTimeout(hintTimer);
    if (hintVisible) { hintVisible=false; onHintChange(false); }
  };
  const showHint = () => {
    clearTimeout(hintTimer);
    hintVisible=true; onHintChange(true);
    hintTimer=setTimeout(hideHint,5000);
  };
  listen('focus',showHint);
  listen('pointerdown', e => {
    if (e.button>2 || points.size>=2 || !Number.isFinite(e.clientX) || !Number.isFinite(e.clientY)) return;
    canvas.focus({preventScroll:true});
    points.set(e.pointerId,{x:e.clientX,y:e.clientY,operation:e.pointerType==='touch'?'orbit':e.button===1||e.button===2||e.shiftKey?'truck':e.altKey?'pan':'orbit'});
    gestures.setCamera(state()); gestures.handlePointerDown(normalizePointerEvent(e));
    canvas.setPointerCapture(e.pointerId); e.preventDefault();
  });
  listen('pointermove', e => {
    const previous=points.get(e.pointerId);
    if (!previous || !Number.isFinite(e.clientX) || !Number.isFinite(e.clientY) ||
        (e.clientX===previous.x && e.clientY===previous.y)) return;
    points.set(e.pointerId,{...previous,x:e.clientX,y:e.clientY});
    // Keep original coordinates in the shared multi-pointer recognizer.
    // Single-pointer orbit uses move() for the inspector's vertical grab direction.
    gestures.setCamera(state());
    gestures.handlePointerMove(normalizePointerEvent(e));
    if(points.size===2) {
      const next=gestures.update(0).camera;
      const shift=next.transform.target.map((v,i)=>clamp(v,
        initial.transform.target[i]-radius*4,initial.transform.target[i]+radius*4)-v);
      manager.updateCamera(initial.id,{transform:{
        position:next.transform.position.map((v,i)=>v+shift[i]),
        target:next.transform.target.map((v,i)=>v+shift[i]),
      }});
      onChange(read());
    } else move(e.clientX-previous.x,e.clientY-previous.y,previous.operation);
    e.preventDefault();
  });
  for(const event of ['pointerup','pointercancel','lostpointercapture'])listen(event,e=>release(e.pointerId));
  listen('blur',()=>{cancel();hideHint();});
  listen('contextmenu',e=>e.preventDefault());
  listen('wheel',e=>{
    if(!focused(e) || e.ctrlKey || e.metaKey || !Number.isFinite(e.deltaY))return;
    const pixels=e.deltaY*(e.deltaMode===1?16:e.deltaMode===2?canvas.clientHeight:1);
    move(0,pixels*.25,e.shiftKey?'zoom':'dolly'); e.preventDefault();
  },{passive:false});
  listen('keydown',e=>{
    if(!focused(e) || e.ctrlKey || e.metaKey || e.altKey)return;
    const arrows={ArrowLeft:[-24,0],ArrowRight:[24,0],ArrowUp:[0,-24],ArrowDown:[0,24]};
    if(arrows[e.key])move(...arrows[e.key],e.shiftKey?'truck':mode);
    else if(['+','=','-','_'].includes(e.key))move(0,e.key==='+'||e.key==='='?-24:24,mode==='zoom'?'zoom':'dolly');
    else if(e.key==='Home')reset();
    else if(e.key==='?')showHint();
    else if(e.key==='Escape')hideHint();
    else if(/^[1-5]$/.test(e.key)) { setMode(modes[Number(e.key)-1]); onChange(read()); }
    else return;
    e.preventDefault();
  });
  return {read,move,reset,setMode,getMode:()=>mode,destroy(){
    if(disposed)return;
    disposed=true; cancel(); hideHint();
    for(const args of listeners)canvas.removeEventListener(...args);
    canvas.style.touchAction=originalTouchAction;
  }};
}
