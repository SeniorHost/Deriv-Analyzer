 'use strict';
/* Helpers puros; ninguna operación financiera ni acceso a la cuenta. */
const FORWARD = (() => {
 const num=v=>v===null||v===undefined||v===''?NaN:Number(v);
 function currentTick(message, receivedAtEpoch){
  const t=message?.tick;
  if(!t)return {ok:false,reason:'Respuesta sin tick'};
  const epoch=num(t.epoch), price=num(t.quote);
  if(!Number.isSafeInteger(epoch)||!Number.isFinite(price)||price<=0)return {ok:false,reason:'Tick sin precio o tiempo válido'};
  const lag=receivedAtEpoch-epoch;
  if(lag < -5 || lag>15)return {ok:false,reason:`Cotización fuera de rango temporal o reloj desfasado (${lag}s)`};
  return {ok:true,epoch,price,lag};
 }
 function historyTicks(message){
  const times=message?.history?.times,prices=message?.history?.prices;
  if(!Array.isArray(times)||!Array.isArray(prices))return [];
  return times.map((x,i)=>({epoch:num(x),price:num(prices[i])})).filter(x=>Number.isSafeInteger(x.epoch)&&Number.isFinite(x.price)&&x.price>0).sort((a,b)=>a.epoch-b.epoch);
 }
 function exitTick(message,target,maxLag=15){
  const list=historyTicks(message).filter(t=>t.epoch<=target);
  if(!list.length)return {ok:false,reason:'No existe tick anterior o igual al vencimiento'};
  const tick=list.at(-1),lag=target-tick.epoch;
  if(lag>maxLag)return {ok:false,reason:`Último tick demasiado antiguo (${lag}s)`};
  return {ok:true,epoch:tick.epoch,price:tick.price,lag};
 }
 function outcome(entry,exit,direction){
  if(exit===entry)return 'EMPATE';
  return (exit>entry)===(direction==='SUBE')?'ACIERTO':'FALLO';
 }
 return {currentTick,historyTicks,exitTick,outcome};
})();
