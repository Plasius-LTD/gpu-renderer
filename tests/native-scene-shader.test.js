import test from 'node:test';
import assert from 'node:assert/strict';
import { nativeSceneShader } from '../src/native-scene-shader.js';

// This is a shader-contract regression, supplemented by actual WebGPU close-up
// image checks. JS mocks cannot execute fragment derivatives or texture sampling.
test('normal-map degeneracy is relative to derivative scale, including macro views', () => {
  const pixelMetres = 1e-4, pixelUv = 1e-3;
  assert.ok((pixelMetres*pixelUv)**2 < 1e-8, 'valid macro tangent was rejected by the old absolute cutoff');
  assert.match(nativeSceneShader,/let dpScale = max\(length\(dpdx\(s.world\)\), length\(dpdy\(s.world\)\)\)/);
  assert.match(nativeSceneShader,/let uvScale = max\(length\(dpdx\(s.uv\)\), length\(dpdy\(s.uv\)\)\)/);
  assert.match(nativeSceneShader,/let dx = dpdx\(s.world\) \/ max\(dpScale, 1e-20\)/);
  assert.match(nativeSceneShader,/let dy = dpdy\(s.world\) \/ max\(dpScale, 1e-20\)/);
  assert.match(nativeSceneShader,/let ux = dpdx\(s.uv\) \/ max\(uvScale, 1e-20\)/);
  assert.match(nativeSceneShader,/let uy = dpdy\(s.uv\) \/ max\(uvScale, 1e-20\)/);
});

test('normal-map fallback and UV handedness remain common to direct and reflected surfaces', () => {
  assert.match(nativeSceneShader,/if \(dpScale > 1e-20 && uvScale > 1e-20 && abs\(determinant\) > 1e-6/);
  assert.match(nativeSceneShader,/normalize\(orthogonalTangent\) \* sign\(determinant\)/);
  assert.match(nativeSceneShader,/normalize\(orthogonalBitangent\) \* sign\(determinant\)/);
  assert.match(nativeSceneShader,/var n = coatNormal/);
  assert.match(nativeSceneShader,/surfaceRadiance\(s,front\)/);
});
