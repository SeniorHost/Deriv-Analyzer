'use strict';
const COMPARATOR=(()=>{
 const KEY='deriv_analyzer_comparator_v1',TIME=[1,3,5,10],TICKS=[5,10];
 const terminal=r=>['ACIERTO','FALLO','EMPATE','INCOMPLETA'].includes(r.status);
 function stats(records){const scored=records.filter(r=>['ACIERTO','FALLO','EMPATE'].includes(r.status||r.result));const win=scored.filter(r=>(r.status||r.result)==='ACIERTO').length,lose=scored.filter(r=>(r.status||r.result)==='FALLO').length,tie=scored.length-win-lose;const n=win+lose,ci=VALIDATION.wilson(win,n);return {win,lose,tie,n:scored.length,decisive:n,rate:n?100*win/n:null,low:n?100*ci.low:null,high:n?100*ci.high:null,evidence:n<30?'insuficiente':'experimental'};}
 function ticks(message){const h=message?.history;if(!Array.isArray(h?.times)||!Array.isArray(h?.prices)||h.times.length!==h.prices.length)throw new Error('Historial de ticks incompleto');const out=h.times.map((epoch,i)=>({epoch:Number(epoch),price:Number(h.prices[i])}));if(out.some((t,i)=>!Number.isSafeInteger(t.epoch)||t.epoch<=0||!Number.isFinite(t.price)||t.price<=0||h.times[i]===null||h.prices[i]===null||h.times[i]===''||h.prices[i]===''||(i>0&&t.epoch<out[i-1].epoch)))throw new Error('Secuencia de ticks inválida; no se filtran ni reordenan observaciones');return out;}
 function tickBacktest(c,t,duration,sequence,symbol){
  if(!TICKS.includes(duration))throw new Error('Duración no soportada');
  const records=[];let cursor=0,lastExit=-1;
  for(let i=Math.max(60,Math.floor(c.length*.7));i<c.length;i++){
   const at=c[i].epoch+60;while(cursor<sequence.length&&sequence[cursor].epoch<=at)cursor++;
   const end=cursor+duration;if(cursor<=lastExit||end>=sequence.length||sequence[cursor].epoch-at>15)continue;
   const sig=TA.signal(c,t,i);if(!['SUBE','BAJA'].includes(sig.dir))continue;
   const entry=sequence[cursor],exit=sequence[end];
   records.push({symbol,mode:'ticks',duration,entryTime:entry.epoch,entry:entry.price,exitTime:exit.epoch,exit:exit.price,result:FORWARD.outcome(entry.price,exit.price,sig.dir),direction:sig.dir,source:'RETROSPECTIVO_TICKS',signalTime:at,entryIndex:cursor,exitIndex:end});lastExit=end;
  }
  return records;
 }
 function create(row,tick,signalAt){
  if(!Number.isFinite(signalAt)||!['SUBE','BAJA'].includes(row.direction)||!Number.isFinite(tick.price)||tick.price<=0||!Number.isSafeInteger(tick.epoch)||tick.epoch<signalAt)throw new Error('Entrada prospectiva inválida');
  return {id:`${row.symbol}|${row.lastTime}`,symbol:row.symbol,direction:row.direction,source:'PROSPECTIVO_FLUJO',entryTime:tick.epoch,entry:tick.price,signalAt,lastEpoch:tick.epoch,lastPrice:tick.price,count:0,updatedAt:tick.epoch,evaluations:[...TIME.map(duration=>({mode:'time',duration,target:tick.epoch+duration*60,status:'PENDIENTE'})),...TICKS.map(duration=>({mode:'ticks',duration,status:'PENDIENTE'}))]};
 }
 function interrupt(group,reason){for(const r of group.evaluations)if(!terminal(r)){r.status='INCOMPLETA';r.reason=reason;}return group;}
 function feed(group,tick,now){
  if(!Number.isFinite(now)||!Number.isSafeInteger(tick.epoch)||!Number.isFinite(tick.price)||tick.price<=0||tick.epoch<group.lastEpoch||tick.epoch>now+2||now-tick.epoch>15)return interrupt(group,'Flujo inválido, atrasado o desordenado; no se inventan ticks');
  group.count++;group.updatedAt=now;
  // El tick recibido después de la entrada cuenta aunque repita precio y segundo.
  for(const r of group.evaluations){
   if(terminal(r))continue;
   let exit=null;
   if(r.mode==='ticks'&&group.count===r.duration)exit=tick;
   if(r.mode==='time'){
    if(tick.epoch<=r.target)r.candidate={epoch:tick.epoch,price:tick.price};
    if(now>=r.target+4&&tick.epoch>r.target){const candidate=r.candidate;if(candidate&&r.target-candidate.epoch<=15)exit=candidate;else {r.status='INCOMPLETA';r.reason='Sin tick observado en o antes del vencimiento a ≤15 s';}}
   }
   if(exit){r.exit=exit.price;r.exitTime=exit.epoch;r.status=FORWARD.outcome(group.entry,exit.price,group.direction);}
  }
  group.lastEpoch=tick.epoch;group.lastPrice=tick.price;return group;
 }
 function restore(value,liveSymbols=[]){if(value===undefined)return {version:1,enabled:false,groups:[]};if(value?.version!==1||!Array.isArray(value.groups))throw new Error('Formato desconocido; no se sobrescribirá');const copy=structuredClone(value);for(const g of copy.groups){if(!g||typeof g.id!=='string'||!Array.isArray(g.evaluations))throw new Error('Registro corrupto; no se sobrescribirá');if(!liveSymbols.includes(g.symbol))interrupt(g,'Panel reiniciado: secuencia no recuperable sin inventar ticks');}return copy;}
 function done(g){return g.evaluations.every(terminal);}
 function allowed(groups,row){return !groups.some(g=>g.id===`${row.symbol}|${row.lastTime}`||(g.symbol===row.symbol&&row.lastTime+60<=g.entryTime+600));}
 return {KEY,TIME,TICKS,stats,ticks,tickBacktest,create,feed,interrupt,restore,done,allowed};
})();
