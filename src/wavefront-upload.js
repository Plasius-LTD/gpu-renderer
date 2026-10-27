import { waitForSubmittedGpuWork } from './wavefront-gpu-synchronization.js';

// Large writeBuffer calls need temporary driver staging storage in addition to
// the destination. Complete each bounded chunk before requesting the next one.
export async function uploadWavefrontBuffer(device, buffer, data, {chunkBytes=8*1024*1024}={}) {
  if(!Number.isSafeInteger(chunkBytes)||chunkBytes<4||chunkBytes%4!==0) throw new Error('GPU upload chunk size must be a positive multiple of four.');
  if(data.byteLength<=chunkBytes){device.queue.writeBuffer(buffer,0,data);return;}
  for(let offset=0;offset<data.byteLength;offset+=chunkBytes){
    device.queue.writeBuffer(buffer,offset,data,offset,Math.min(chunkBytes,data.byteLength-offset));
    await waitForSubmittedGpuWork(device,{timeoutMs:10000,maxWaitMs:10000,allowTimeout:false});
  }
}
