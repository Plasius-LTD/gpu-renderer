import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
test("room reference exposes original-scene placement, native resolutions and explicit render controls",()=>{
 const html=readFileSync(new URL("./fixtures/native-room-reference.html",import.meta.url),"utf8");
 for(const id of ["resolution","sampler","view","chair-x","chair-z","chair-yaw","fov","models"])assert.match(html,new RegExp(`<label for="${id}">`));
 for(const text of ["1920 × 1080","3840 × 2160","Render room","Reset view","Stop after pending GPU work","No added studio walls","External daylight"])assert(html.includes(text));
 assert.match(html,/<option value="fixed-pattern" selected>/);
 assert.match(html,/img:not\(\[hidden\]\)/);
 assert.match(html,/<img id="preview" hidden/);
 assert.match(html,/<input id="chair-x"[^>]*value="2.3"/);
 assert.match(html,/<input id="chair-z"[^>]*value="-2.5"/);
 assert.match(html,/uniformly scaled to 1\.5 m wide/);
 assert.match(html,/preserving its proportions/);
});
test("room capture reuses real transport, hashes input, validates counts and clears stale results",()=>{
 const js=readFileSync(new URL("./fixtures/native-room-reference.js",import.meta.url),"utf8");
 for(const name of ["createPairedProbeRunner","loadOriginalEames","composeRoomEamesScene","validateRoomFrame","hashBytes","encodeLinearImageChunks","roomAsset.sha256","runner.destroy()","clearCapture","AbortController"])
  assert(js.includes(name),name);
 assert.match(js,/diagnostics:true/);assert.match(js,/sceneSnapshot.triangleCount===composed.evidence.sceneTriangleCount/);
 assert.match(js,/__room-manifest.json/);assert.match(js,/__room-model.glb/);
 for(const text of ['__reference-models.json','asset.sha256','runDualUvProbe','fovYDegrees','referenceModels'])assert(js.includes(text),text);
 assert.match(js,/room-eames-interior-reference/);assert.match(js,/failed/);
 assert.match(js,/addEventListener\("change",clearCapture\)/);
 assert.match(js,/addEventListener\("input",clearCapture\)/);
 assert.match(js,/sampler:settings.sampler/);
 assert.match(js,/ROOM_DEFAULTS.x/);assert.match(js,/ROOM_DEFAULTS.z/);
});
