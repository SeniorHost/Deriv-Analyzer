'use strict';
// Packaged, read-only computation. No sockets, storage, credentials or trading transport.
importScripts('indicators.js','forward.js','room.js','comparator.js','adaptive.js','adaptive-follow.js','simple-reader.js','market-strategies.js','market-core.js','auto-demo-core.js','auto-demo-report.js');
self.onmessage=async({data:{id,task,payload}})=>{
 try{let value;
  if(task==='scan'){const {item,c,now,sequence}=payload,t=TA.calculate(c);value={t,original:TA.signal(c,t,c.length-1),back:VALIDATION.run(c,t,5,item.symbol),reading:MARKET_STRATEGIES.analyze(item,c,now,sequence)};}
  else if(task==='reader'){const {item,c,t}=payload;value={benchmark:await ADAPTIVE.benchmark(item,c,t),diagnostics:await SIMPLE_READER.audit(item,c,t)};}
  else if(task==='evaluate')value=await MARKET_STRATEGIES.evaluate(payload.item,payload.c);
  else if(task==='validate')value=AUTO_DEMO.restore(payload);
  else if(task==='report')value={archive:AUTO_DEMO_REPORT.zip(AUTO_DEMO_REPORT.files(payload))};
  else throw new Error('Unknown computation');
  self.postMessage({id,value});
 }catch{self.postMessage({id,error:'No se pudo validar o completar el cálculo solicitado'});}
};
