// Diagnostic-only facade. Queries live on actual work, never empty marker passes.
export function createTimestampSpanEncoder(encoder, telemetry) {
  let finalNext = false, closed = false;
  return {
    closeNextPass() { if(finalNext || closed) throw new Error("Timestamp span already closed"); finalNext=true; },
    beginComputePass(descriptor={}) {
      if(closed) throw new Error("Timestamp span already closed");
      const first=telemetry.decorateFirstPass(descriptor);
      if(finalNext){closed=true;return encoder.beginComputePass(telemetry.decorateFinalPass(first));}
      return encoder.beginComputePass(first);
    },
    copyBufferToBuffer(...args){return encoder.copyBufferToBuffer(...args);},
    clearBuffer(...args){return encoder.clearBuffer(...args);},
    finish(){if(!closed)throw new Error("Timestamp span incomplete");return encoder.finish();},
  };
}
