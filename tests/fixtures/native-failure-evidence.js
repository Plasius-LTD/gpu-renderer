// Failure-only readback: preserve the original rejection, even if the GPU is lost.
export async function retainNativeFailure(error,trace,readDetails){
 const evidence={...trace,counterScope:'last-encoded-camera-sample-only'};
 try{evidence.finalSample=await readDetails();}
 catch(readbackError){evidence.readbackError=readbackError.message;}
 error.captureFailure=evidence;
 return error;
}
