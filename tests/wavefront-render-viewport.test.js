import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveWavefrontRenderViewport} from '../src/wavefront-render-viewport.js';
test('frame viewport is bounded, restores defaults and never rounds to zero',()=>{
 assert.deepEqual(resolveWavefrontRenderViewport(800,500,.64),{width:512,height:320,renderScale:.64});
 assert.deepEqual(resolveWavefrontRenderViewport(801,501),{width:801,height:501,renderScale:1});
 assert.deepEqual(resolveWavefrontRenderViewport(1,1,.01),{width:1,height:1,renderScale:.01});
 for(const value of [0,-.1,1.1,NaN,Infinity,null,'1'])assert.throws(()=>resolveWavefrontRenderViewport(32,20,value),/renderScale/);
});
