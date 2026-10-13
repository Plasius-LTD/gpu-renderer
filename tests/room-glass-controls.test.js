import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
test('room glass fixture exposes labelled opt-in controls and retains composition evidence',()=>{
 const html=readFileSync(new URL('./fixtures/native-room-reference.html',import.meta.url),'utf8');
 const js=readFileSync(new URL('./fixtures/native-room-reference.js',import.meta.url),'utf8');
 for(const id of ['glass-mode','glass-fill','glass-x','glass-z','glass-radius','glass-height','glass-ior','water-ior','glass-support-clearance']){
  assert(html.includes(`for="${id}"`));assert(html.includes(`id="${id}"`));
 }
 assert.match(html,/value="glass">Glass and water close-up/);
 assert.match(html,/glass-to-water.*not.*qualified/i);
 assert.match(js,/withRoomGlass\(composed,glass\)/);assert.match(js,/resetGlass\(\)/);
 assert.match(js,/glassWater:receipt\.scene\?\.glassWater/);
 assert.match(js,/glass\.closeup\?'Glass and water close-up'/);
 assert.match(js,/'-glass-'\+glass\.mode/);
 assert.match(js,/'glass-support-clearance':'supportClearance'/);
 assert.match(js,/el\(id\)\.value=GLASS_WATER_DEFAULTS\[key\]/);
 assert.match(js,/glass\.supportClearance>0\?'-support-clearance'\+glass\.supportClearance/);
 assert.match(html,/lowers only the pedestal/i);
 assert(html.indexOf('id="glass-support-clearance"')>html.indexOf('id="advanced"'));
 assert(js.indexOf('composed=withRoomGlass')<js.indexOf('await runGuidedDenoiseProbe'),'geometry admission must precede GPU probes');
 assert.match(js,/receipt.captureFailure=error.captureFailure/);
 const runner=readFileSync(new URL('./fixtures/native-adaptive-runner.js',import.meta.url),'utf8');
 assert.match(runner,/throw await retainNativeFailure/);assert.match(runner,/readWavefrontTerminationMetrics/);
});
