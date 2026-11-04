// Capture construction costs separately from submitted GPU execution. This
// observer never changes compilation, request descriptors, deadlines or results.
export function observePipelineSetup(device,now=()=>performance.now()){
 const records=[];
 for(const method of ['createComputePipelineAsync','createRenderPipelineAsync']){
  if(typeof device[method]!=='function')continue;
  const original=device[method].bind(device);
  device[method]=async descriptor=>{
   const record={method,label:descriptor.label??null,entryPoint:descriptor.compute?.entryPoint??null,status:'pending',startMs:now()};
   records.push(record);
   try{const result=await original(descriptor);record.status='complete';return result;}
   catch(error){record.status='failed';record.error=error.message;throw error;}
   finally{record.elapsedMs=Math.max(0,now()-record.startMs);}
  };
 }
 return ()=>records.map(record=>({...record,...(record.status==='pending'?{elapsedMs:Math.max(0,now()-record.startMs)}:{})}));
}
