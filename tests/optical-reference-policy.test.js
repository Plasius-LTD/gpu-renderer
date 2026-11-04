import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
test('independent optical reference validates actual supported depth and records every applied budget',()=>{
 const s=readFileSync(new URL('../scripts/optical-reference.py',import.meta.url),'utf8');
 assert.match(s,/depth_limit = min\(bpy.context.scene.cycles.bl_rna.properties\[field\].hard_max for field in depth_fields\)/);
 assert.match(s,/1 <= args.depth <= depth_limit/);assert.doesNotMatch(s,/args.depth <= 128/);
 assert.match(s,/if any\(value != args.depth for value in actual_depth_policy.values\(\)\):/);
 assert(s.indexOf('Independent reference depth policy was clamped')<s.indexOf('bpy.ops.render.render'));
 assert.match(s,/'actualDepthPolicy'|"actualDepthPolicy"/);
 assert.match(s,/os.listdir\(args.output_dir\)/);assert.match(s,/"xb"/,'never overwrite retained reference radiance');
});
