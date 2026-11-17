 'use strict';
/* Helpers puros; ninguna operación financiera ni acceso a la cuenta. */
const FORWARD = (() => {
 const num=v=>v===null||v===undefined||v===''?NaN:Number(v);
 function currentTick(message, receivedAtEpoch, maxFutureSeconds=5){
  const t=message?.tick;
  if(!t)return {ok:false,reason:'Respuesta sin tick'};
  const epoch=num(t.epoch), price=num(t.quote);
  if(!Number.isSafeInteger(epoch)||epoch<=0||!Number.isFinite(price)||price<=0)return {ok:false,reason:'Tick sin precio o tiempo válido'};
  if(!Number.isFinite(receivedAtEpoch))return {ok:false,reason:'Hora de recepción inválida'};
  const lag=receivedAtEpoch-epoch;
  if(lag < -maxFutureSeconds || lag>15)return {ok:false,reason:`Cotización fuera de rango temporal o reloj desfasado (${lag}s)`};
  return {ok:true,epoch,price,lag};
 }
 function historyTicks(message){
  const times=message?.history?.times,prices=message?.history?.prices;
  if(!Array.isArray(times)||!Array.isArray(prices)||times.length!==prices.length)return [];
  return times.map((x,i)=>({epoch:num(x),price:num(prices[i])})).filter(x=>Number.isSafeInteger(x.epoch)&&x.epoch>0&&Number.isFinite(x.price)&&x.price>0).sort((a,b)=>a.epoch-b.epoch);
 }
 function exitTick(message,target,maxLag=15){
  if(!Number.isSafeInteger(target)||target<=0||!Number.isFinite(maxLag)||maxLag<0)return {ok:false,reason:'Vencimiento inválido'};
  const list=historyTicks(message).filter(t=>t.epoch<=target);
  if(!list.length)return {ok:false,reason:'No existe tick anterior o igual al vencimiento'};
  const tick=list.at(-1),lag=target-tick.epoch;
  if(lag>maxLag)return {ok:false,reason:`Último tick demasiado antiguo (${lag}s)`};
  return {ok:true,epoch:tick.epoch,price:tick.price,lag};
 }
 function outcome(entry,exit,direction){
  if(!Number.isFinite(entry)||!Number.isFinite(exit)||entry<=0||exit<=0||!['SUBE','BAJA'].includes(direction))throw new Error('Resultado con datos inválidos');
  if(exit===entry)return 'EMPATE';
  return (exit>entry)===(direction==='SUBE')?'ACIERTO':'FALLO';
 }
 // Fusionar solo cambios locales bajo un Web Lock compartido entre paneles.
 // Un panel atrasado nunca puede rebajar una señal resuelta a PENDIENTE.
 const recordKey=r=>r&&typeof r.id==='string'&&r.id?'id:'+r.id:'raw:'+JSON.stringify(r);
 function mergeRecords(current,snapshot,base,max=1500){
  const old=new Map(base.map(r=>[recordKey(r),JSON.stringify(r)]));
  const merged=new Map(current.map(r=>[recordKey(r),r]));
  for(const r of snapshot){
   const key=recordKey(r);
   if(old.get(key)===JSON.stringify(r))continue;
   const existing=merged.get(key);
   if(existing&&(!old.has(key)||['ACIERTO','FALLO','EMPATE'].includes(existing.status)))continue;
   merged.set(key,r);
  }
  const records=[...merged.values()];
  while(records.length>max){
   const i=records.findIndex(r=>r&&['ACIERTO','FALLO','EMPATE'].includes(r.status));
   if(i<0)break;records.splice(i,1);
  }
  return records;
 }
 return {currentTick,historyTicks,exitTick,outcome,recordKey,mergeRecords};
})();
