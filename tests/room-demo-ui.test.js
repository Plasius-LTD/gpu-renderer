import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRoomDemoPresets,installRoomDemoUi,revealInvalidControl,setRoomPreviewState,invalidateRoomCaptureUi} from './fixtures/room-demo-ui.js';

const defaults={maximumSpp:32,limit:256,centralReference:'seating',view:'entry'};
const html=readFileSync(new URL('./fixtures/native-room-reference.html',import.meta.url),'utf8');
function fixture(){
 const nodes=new Map();
 for(const [,id] of html.matchAll(/id="([^"]+)"/g))nodes.set(id,{id,value:'',textContent:'',hidden:false,disabled:false,dataset:{},listeners:{},addEventListener(type,fn){this.listeners[type]=fn;},getAttribute(name){return this[name]??null;},removeAttribute(name){delete this[name];}});
 const document={getElementById:id=>nodes.get(id)};
 const presets=createRoomDemoPresets(defaults);
 for(const patch of [presets.scene.room.values,presets.quality.adaptive.values])for(const [id,value] of Object.entries(patch))nodes.get(id).value=String(value);
 return {nodes,document,presets};
}
test('scene recipes reuse configured camera defaults and independently restore the room',()=>{
 const p=createRoomDemoPresets(defaults);
 assert.equal(p.scene.glass.values['nested-media'],'on');
 assert.equal(p.scene.glass.values['bounded-dielectric'],'on');
 assert.equal(p.scene.glass.values['rough-dielectric'],'off');
 assert.equal(p.scene.glass.values['focus-view'],'glass');
 assert.equal(p.scene.cloth.values.sheen,'on');
 assert.equal(p.scene.cloth.values.denoise,'guided');
 assert.equal(p.scene.room.values['glass-mode'],'off');
 assert.equal(p.scene.room.values['nested-media'],'off');
 assert.equal(p.scene.room.values['rough-dielectric'],'off');
 assert.equal(p.quality.detail.values.spp,defaults.limit);
 assert.equal(createRoomDemoPresets({...defaults,maximumSpp:16,limit:128}).quality.detail.values.spp,128);
 assert.equal(p.quality.reference.values['sample-distribution'],'uniform');
});
test('recipe controls apply, mark manual changes Custom, and never start a render',()=>{
 const {nodes,document,presets}=fixture();let changes=0;
 const ui=installRoomDemoUi(document,presets,()=>changes++);
 assert.equal(nodes.get('scene-preset').value,'room');
 nodes.get('scene-preset').value='glass';nodes.get('scene-preset').listeners.change();
 assert.equal(nodes.get('glass-mode').value,'filled');assert.equal(changes,1);
 nodes.get('nested-media').value='off';ui.refresh();
 assert.equal(nodes.get('scene-preset').value,'custom');
 nodes.get('quality-preset').value='reference';nodes.get('quality-preset').listeners.change();
 assert.equal(nodes.get('sample-distribution').value,'uniform');
 nodes.get('spp').value='64';ui.refresh();assert.equal(nodes.get('quality-preset').value,'custom');
 nodes.get('scene-preset').value='room';nodes.get('scene-preset').listeners.change();
 assert.equal(nodes.get('focus-view').value,defaults.view);assert.equal(nodes.get('nested-media').value,'off');
 assert.equal(nodes.get('spp').value,'64','scene recipe must not silently change quality');
 const count=changes;nodes.get('scene-preset').disabled=true;nodes.get('scene-preset').value='glass';nodes.get('scene-preset').listeners.change();assert.equal(changes,count);
 nodes.get('scene-preset').disabled=false;nodes.get('scene-preset').value='missing';assert.throws(()=>nodes.get('scene-preset').listeners.change(),/Unknown/);
});
test('invalid fields reveal all closed parents before native focus validation',()=>{
 const outer={tagName:'DETAILS',open:false,parentElement:null};const inner={tagName:'DETAILS',open:false,parentElement:outer};
 const field={parentElement:inner,reportValidity(){assert(outer.open&&inner.open);return false;}};
 assert.equal(revealInvalidControl(field),false);
});
test('editing keeps the old image explicitly stale but removes old exports and evidence',()=>{
 const {nodes,document}=fixture();nodes.get('preview').src='previous.png';nodes.get('download').href='previous.png';nodes.get('result').textContent='old receipt';
 invalidateRoomCaptureUi(document);
 assert.equal(nodes.get('preview').src,'previous.png');assert.equal(nodes.get('preview').hidden,false);
 assert.equal(nodes.get('scene-panel').dataset.state,'stale');assert.match(nodes.get('preview-state').textContent,/Previous render/);
 assert.equal(nodes.get('download').hidden,true);assert.equal(nodes.get('download').href,undefined);
 assert.equal(nodes.get('comparison').hidden,true);assert.equal(nodes.get('response-view').onchange,null);assert.equal(nodes.get('result').textContent,'');
 nodes.get('preview').hidden=true;invalidateRoomCaptureUi(document);assert.equal(nodes.get('scene-panel').dataset.state,'ready');
 for(const state of ['rendering','complete','failed']){setRoomPreviewState(document,state);assert.equal(nodes.get('scene-panel').dataset.state,state);assert(nodes.get('preview-state').textContent);}
});
test('scene-first markup retains non-camera controls with labels and closed advanced sections',()=>{
 const ids=[...html.matchAll(/id="([^"]+)"/g)].map(m=>m[1]);assert.equal(new Set(ids).size,ids.length);
 for(const [,id] of html.matchAll(/<(?:input|select) id="([^"]+)"/g))assert(html.includes(`for="${id}"`),id);
 for(const id of ['advanced','laboratory'])assert.match(html,new RegExp(`<details id="${id}">`));
 assert(html.indexOf('id="preview"')<html.indexOf('id="advanced"'));
 const scene=html.slice(html.indexOf('id="scene-panel"'),html.indexOf('id="advanced"'));
 assert(scene.includes('id="focus-view"'));
 assert.match(html,/id="preview-state"[^>]*role="status"/);
 assert.match(html,/Changes apply on Render/);
 assert.match(html,/@media/);
 const original=['lighting-style','lighting-intensity','models','central-reference','resolution','spp','max-depth','sampler','splitting','denoise','sheen','clearcoat','wood-coat','coat-weight','coat-roughness','glass-mode','bounded-dielectric','nested-media','rough-dielectric','glass-fill','glass-x','glass-z','glass-radius','glass-height','glass-ior','water-ior','sample-distribution','material-inspection','response-elevation','response-intensity','chair-x','chair-z','chair-yaw'];
 for(const id of original)assert(ids.includes(id),`lost existing control ${id}`);
});
test('all capture entry points reveal invalid collapsed fields and diagnostics report their actual outcome',()=>{
 const read=name=>readFileSync(new URL(`./fixtures/${name}.js`,import.meta.url),'utf8');
 const page=read('native-room-reference');
 assert.match(page,/input,select:not\(#response-view\)/,'output-view selection must not invalidate its own capture');
 assert.match(page,/if\(report\)setRoomPreviewState\(document,report.status==='failed'\?'failed':'complete'\)/);
 for(const name of ['native-room-reference','native-room-cloth-response','native-room-splitting'])assert.match(read(name),/revealInvalidControl\(control\)/,name);
 for(const name of ['native-room-cloth-response','native-room-splitting']){
  assert.match(read(name),/return report;/);assert.match(read(name),/#controls input,#controls select/,'presets and camera settings lock with diagnostics');
 }
});
