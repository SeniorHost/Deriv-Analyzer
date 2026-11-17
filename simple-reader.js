'use strict';
// Presentation/diagnostics only: never changes ADAPTIVE v1.0.0 or original confirmation.
const SIMPLE_READER=(()=>{
 function observe(c,now){
  if(!ADAPTIVE.valid(c,now)||now-c.at(-1).epoch-60>120)return null;
  const frames=ADAPTIVE.aggregate(c.slice(-240),5,now),tail=frames.slice(-4);
  if(tail.length<4||tail.some((v,i)=>i&&v.epoch-tail[i-1].epoch!==300))return null;
  const delta=tail.at(-1).close-tail[0].close;
  return {trend:delta>0?'ALCISTA':delta<0?'BAJISTA':'LATERAL',sourceCloseAt:c.at(-1).epoch+60,frame:5,description:delta>0?'Los cierres de cinco minutos muestran una dirección alcista':delta<0?'Los cierres de cinco minutos muestran una dirección bajista':'Los cierres de cinco minutos no muestran una dirección neta'};
 }
 function model(row,view,now,method='adaptive'){
  const source=method==='original'?'Sistema original':'Lector adaptativo',reading=view?.reading;
  const closeAt=row?.lastTime+60,same=reading&&reading.sourceCloseAt===closeAt;
  const originalValid=!!row&&!row.error&&Number.isFinite(now)&&now>=closeAt&&now<closeAt+60;
  const adaptiveValid=!!same&&Number.isFinite(now)&&now>=reading.emittedAt&&now<reading.expiresAt;
  const original=originalValid&&['SUBE','BAJA'].includes(row.direction)?row.direction:'ESPERAR';
  const adaptive=adaptiveValid&&['SUBE','BAJA'].includes(reading.direction)?reading.direction:'ESPERAR';
  const direction=method==='original'?original:adaptive;
  const observed=view?.observed,observationValid=observed&&observed.sourceCloseAt===closeAt&&Number.isFinite(now)&&now>=closeAt&&now-closeAt<=120;
  const disagreement=originalValid&&adaptiveValid&&original!==adaptive;
  const label=d=>d==='ESPERAR'?'SIN CONFIRMACIÓN':d;
  let reason=!row?'Esperando el primer análisis':row.error?'No hay datos fiables para confirmar una señal':!Number.isFinite(now)?'Reconecta para recuperar una hora fiable':direction!=='ESPERAR'?direction==='SUBE'?'Las condiciones del método elegido confirman una hipótesis alcista':'Las condiciones del método elegido confirman una hipótesis bajista':!originalValid?'La señal anterior caducó; espera una nueva confirmación':observationValid?`Tendencia ${observed.trend.toLowerCase()} detectada, pero el método elegido todavía no confirma una señal`:'Faltan datos completos para confirmar la lectura';
  if(direction==='ESPERAR'&&observationValid&&originalValid){
   const start=`Tendencia ${observed.trend.toLowerCase()} detectada`;
   const contradictions=reading?.contradictions||[];
   if(method==='original')reason=start+', pero los indicadores originales no confirman';
   else if(reading?.family==='UNKNOWN')reason=start+', pero esta familia todavía no tiene reglas verificadas';
   else if(contradictions.some(c=>c.includes('horario')))reason=start+', pero estamos fuera del horario de estudio';
   else if(contradictions.some(c=>c.includes('15m')&&c.includes('5m')))reason=start+', pero los plazos de análisis no coinciden';
   else if(contradictions.some(c=>c.includes('indeciso')))reason=start+', pero la última vela no muestra una dirección clara';
   else if(/insuficiente|incompleto|Faltan|inválido/.test(reading?.explanation||''))reason=start+', pero faltan velas completas para confirmar';
   else reason=start+', pero todavía falta un patrón de confirmación';
  }
  if(disagreement)reason=`Métodos en desacuerdo: lector ${label(adaptive)}, original ${label(original)}.`;
  return {trend:observationValid?observed.trend:null,source,direction,label:label(direction),disagreement,reason,emittedAt:direction==='ESPERAR'?null:method==='original'?(row.emittedAt??closeAt):reading.emittedAt,expiresAt:direction==='ESPERAR'?null:method==='original'?closeAt+60:reading.expiresAt};
 }
 function blockers(item,c,now,a){
  if(a.direction!=='ESPERAR')return [];
  const reasons=new Set(a.contradictions);
  if(!a.candidates.length){reasons.add(a.explanation);return [...reasons];}
  if(a.candidates.every(r=>r.rawDirection==='ESPERAR'))reasons.add('Ningún patrón candidato completo');
  const tail=c.slice(-240),frames5=ADAPTIVE.aggregate(tail,5,now),frames15=ADAPTIVE.aggregate(tail,15,now),s=a.shape,last=tail.at(-1),prev=tail.at(-2);
  if(!s||!a.level||frames5.length<4||frames15.length<4)return [...reasons];
  const d5=Math.sign(frames5.at(-1).close-frames5.at(-4).close),d15=Math.sign(frames15.at(-1).close-frames15.at(-4).close);
  if(!d5||d5!==d15)reasons.add('Temporalidades sin alineación direccional');
  const t=TA.calculate(tail),atr=t.a.at(-1),support=a.level.support,resistance=a.level.resistance;
  if(last.low>support+atr*.3&&last.high<resistance-atr*.3)reasons.add('Precio alejado de los niveles previos');
  if(a.family==='VOLATILITY'){
   const seq=tail.slice(-3);if(!seq.every(v=>v.close>v.open)&&!seq.every(v=>v.close<v.open))reasons.add('Impulso: tres cuerpos no alineados');
   if(Math.abs(last.close-seq[0].open)<atr)reasons.add('Impulso inferior a un ATR');
   if(s.body<s.range*.5)reasons.add('Cuerpo final menor al 50% del rango');
   const ratio=atr/t.a.at(-15);if(ratio<.5||ratio>2)reasons.add('Cambio de volatilidad fuera del filtro');
  }
  if(a.family==='FOREX'){
   if(!a.structure.includes('5m HH/HL')&&!a.structure.includes('5m LH/LL'))reasons.add('Estructura: sin pivotes 5m direccionales confirmados');
   if(!s.bullReject&&!s.bearReject&&!s.bullEngulf&&!s.bearEngulf)reasons.add('Estructura: sin rechazo o envolvente confirmado');
   if(!(prev.close>resistance+atr*.1||prev.close<support-atr*.1))reasons.add('Retest: sin ruptura cerrada previa');
  }
  if(a.family==='RANGE_BREAK'){
   const width=(resistance-support)/atr;if(width<1.5||width>8)reasons.add('Rechazo: canal fuera de 1,5–8 ATR');
   if(!((prev.close>resistance+atr*.1&&last.close>resistance+atr*.1)||(prev.close<support-atr*.1&&last.close<support-atr*.1)))reasons.add('Continuación: faltan dos cierres fuera del canal');
  }
  return [...reasons];
 }
 async function audit(item,c,t,yieldControl=async()=>{}){
  const historical={...item};delete historical.exchange_is_open;delete historical.is_trading_suspended;
  const result={symbol:item.symbol,family:ADAPTIVE.family(item),ruleVersion:ADAPTIVE.VERSION,opportunities:0,signals:0,originalSignals:0,blocked:{}};
  for(let i=Math.max(240,Math.ceil(c.length*.7));i+5<c.length;i++){
   if(i%12===0)await yieldControl();const now=c[i].epoch+60,prefix=c.slice(0,i+1),original=TA.signal(c,t,i),a=ADAPTIVE.analyze(historical,prefix,now,original);result.opportunities++;
   if(original.dir!=='ESPERAR')result.originalSignals++;
   if(a.direction!=='ESPERAR')result.signals++;else for(const reason of blockers(historical,prefix,now,a))result.blocked[reason]=(result.blocked[reason]||0)+1;
  }
  return result;
 }
 function families(reports){const out={};for(const r of reports){if(!r)continue;const f=out[r.family]||(out[r.family]={opportunities:0,signals:0,originalSignals:0});for(const k of Object.keys(f))f[k]+=r[k];}return out;}
 return {observe,model,blockers,audit,families};
})();
