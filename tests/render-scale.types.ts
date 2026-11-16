import type {WavefrontPathTracingComputeRenderer} from '../src/index.js';
declare const renderer: WavefrontPathTracingComputeRenderer;
const preview=renderer.renderOnce({renderScale:.64,samplesPerPixel:1});
const dimensions: readonly number[]=[preview.width,preview.height,preview.allocationWidth,preview.allocationHeight,preview.renderScale];
void dimensions;
void renderer.renderFrame({renderScale:1,samplesPerPixel:4,awaitGPUCompletion:true}).then(frame=>frame.renderScale);
const scale: number=renderer.getSnapshot().renderScale;void scale;
// @ts-expect-error Numeric scale is required.
renderer.renderOnce({renderScale:'half'});
void renderer.renderFrame({maxTileSize:128,signal:new AbortController().signal}).then(frame=>{
 const tileSize:number=frame.frameTileSize;void tileSize;
});
const cancellation:boolean=renderer.getSnapshot().cooperativeFrameCancellation;void cancellation;
// @ts-expect-error Tile limits are numeric.
renderer.renderFrame({maxTileSize:'128'});
// @ts-expect-error A real abort signal is required.
renderer.renderFrame({signal:{aborted:false}});
