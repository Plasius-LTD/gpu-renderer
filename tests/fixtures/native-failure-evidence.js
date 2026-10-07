// Failure-only readback: preserve the original rejection, even if the GPU is lost.
export function failedPathNodes(bytes){
 const words=new Uint32Array(bytes),failures=[];
 for(let i=0;i<words.length;i+=16)if((words[i+3]&2)!==0){
  failures.push({node:i/16,pixel:words[i+12],sample:words[i+13],bounce:words[i+14],reason:words[i+15]&15,primitive:words[i+15]>>>4});
  if(failures.length===32)break;
 }
 return failures;
}
export async function retainNativeFailure(error,trace,readDetails){
 const evidence={...trace,counterScope:'last-encoded-camera-sample-only'};
 try{evidence.finalSample=await readDetails();}
 catch(readbackError){evidence.readbackError=readbackError.message;}
 error.captureFailure=evidence;
 return error;
}
