export async function applicationJson(request:Request,limit:number){
  if(Number(request.headers.get('content-length'))>limit)throw new RangeError('Request too large');
  const reader=request.body?.getReader();if(!reader)throw new SyntaxError('Missing body');
  let size=0;const chunks:Uint8Array[]=[];
  try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>limit){await reader.cancel();throw new RangeError('Request too large');}chunks.push(value);}}finally{reader.releaseLock();}
  return JSON.parse(Buffer.concat(chunks,size).toString('utf8'));
}
