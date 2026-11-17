'use strict';
const ADAPTIVE_FOLLOW=(()=>{
 const settled=r=>['ACIERTO','FALLO','EMPATE','INCOMPLETA','SIN_SENAL'].includes(r.status);
 function create(reading,original,tick,signalAt){
  if(!Number.isFinite(signalAt)||!Number.isSafeInteger(tick.epoch)||tick.epoch<signalAt||tick.epoch>=reading.expiresAt||!Number.isFinite(tick.price)||tick.price<=0)throw new Error('Entrada observada inválida');
  const entries=[{source:'ORIGINAL_PAREADO',delay:0,direction:original.dir,strategy:'original@1.9',ruleVersion:'1.9'},...[0,2,5].map(delay=>({source:'LECTOR_PROSPECTIVO',delay,direction:reading.direction,strategy:reading.strategy+'@'+reading.version,ruleVersion:reading.version}))].map(r=>({...r,status:['SUBE','BAJA'].includes(r.direction)?r.delay?'ESPERANDO_ENTRADA':'PENDIENTE':'SIN_SENAL',...(r.delay?{}:{entryTime:tick.epoch,entry:tick.price,target:tick.epoch+300})}));
  return {id:`${reading.symbol}|${reading.sourceCloseAt??reading.emittedAt}|${reading.version}`,symbol:reading.symbol,family:reading.family,version:reading.version,strategy:reading.strategy,signalAt,sourceCloseAt:reading.sourceCloseAt??reading.emittedAt,emittedAt:reading.emittedAt,expiresAt:reading.expiresAt,baseTime:tick.epoch,lastEpoch:tick.epoch,updatedAt:tick.epoch,entries};
 }
 function interrupt(group,reason){for(const r of group.entries)if(!settled(r)){r.status='INCOMPLETA';r.reason=reason;}return group;}
 function feed(group,tick,now){
  if(!Number.isFinite(now)||!Number.isSafeInteger(tick.epoch)||tick.epoch<group.lastEpoch||!Number.isFinite(tick.price)||tick.price<=0||tick.epoch>now+2||now-tick.epoch>15)return interrupt(group,'Secuencia inválida o reloj no fiable');
  for(const r of group.entries){if(settled(r))continue;
   if(r.status==='ESPERANDO_ENTRADA'){
    if(tick.epoch<group.baseTime+r.delay)continue;
    if(tick.epoch-group.baseTime-r.delay>15){r.status='INCOMPLETA';r.reason='No hubo tick cercano al retraso de entrada';continue;}
    Object.assign(r,{entry:tick.price,entryTime:tick.epoch,target:tick.epoch+300,status:'PENDIENTE'});
   }
   if(tick.epoch<=r.target)r.candidate={epoch:tick.epoch,price:tick.price};
   if(now>=r.target+4&&tick.epoch>r.target){if(r.candidate&&r.target-r.candidate.epoch<=15){r.exit=r.candidate.price;r.exitTime=r.candidate.epoch;r.status=FORWARD.outcome(r.entry,r.exit,r.direction);}else {r.status='INCOMPLETA';r.reason='Sin precio observado ≤ vencimiento a 15 s';}}
  }
  group.lastEpoch=tick.epoch;group.updatedAt=now;return group;
 }
 function restore(value,liveSymbols=[]){if(value===undefined)return {version:1,ruleVersion:ADAPTIVE.VERSION,enabled:false,groups:[]};if(value?.version!==1||!Array.isArray(value.groups))throw new Error('Formato desconocido; no se sobrescribirá');const state=structuredClone(value);for(const g of state.groups){if(!g||typeof g.id!=='string'||!Array.isArray(g.entries))throw new Error('Registro corrupto');if(!liveSymbols.includes(g.symbol))interrupt(g,'Panel reiniciado sin flujo continuo');}return state;}
 function allowed(groups,reading){return !groups.some(g=>g.id===`${reading.symbol}|${reading.sourceCloseAt??reading.emittedAt}|${reading.version}`||g.symbol===reading.symbol&&reading.emittedAt<=g.baseTime+310);}
 function done(g){return g.entries.every(settled);}
 return {create,interrupt,feed,restore,allowed,done};
})();
