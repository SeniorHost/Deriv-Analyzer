'use strict';
// Pure indicators. All inputs chronological, only closed candles.
const TA=(()=>{
 const avg=a=>a.reduce((s,v)=>s+v,0)/a.length;
 function ema(xs,p){let out=Array(xs.length).fill(null),k=2/(p+1);if(xs.length<p)return out;out[p-1]=avg(xs.slice(0,p));for(let i=p;i<xs.length;i++)out[i]=xs[i]*k+out[i-1]*(1-k);return out;}
 function rsi(xs,p=14){const out=Array(xs.length).fill(null);if(xs.length<=p)return out;let gain=0,loss=0;for(let i=1;i<=p;i++){let d=xs[i]-xs[i-1];gain+=Math.max(d,0);loss+=Math.max(-d,0);}gain/=p;loss/=p;const calc=()=>loss===0?(gain===0?50:100):100-100/(1+gain/loss);out[p]=calc();for(let i=p+1;i<xs.length;i++){let d=xs[i]-xs[i-1];gain=(gain*(p-1)+Math.max(d,0))/p;loss=(loss*(p-1)+Math.max(-d,0))/p;out[i]=calc();}return out;}
 function macd(xs){const a=ema(xs,12),b=ema(xs,26),diff=xs.map((_,i)=>a[i]!=null&&b[i]!=null?a[i]-b[i]:null);const valid=diff.filter(x=>x!=null);const sig=ema(valid,9);const signal=Array(xs.length).fill(null),hist=Array(xs.length).fill(null);for(let i=25;i<xs.length;i++){const v=sig[i-25];if(v!=null){signal[i]=v;hist[i]=diff[i]-v;}}return {diff,signal,hist};}
 function atr(c,p=14){const tr=c.map((v,i)=>i===0?v.high-v.low:Math.max(v.high-v.low,Math.abs(v.high-c[i-1].close),Math.abs(v.low-c[i-1].close)));const out=Array(c.length).fill(null);if(c.length<p)return out;out[p-1]=avg(tr.slice(0,p));for(let i=p;i<c.length;i++)out[i]=(out[i-1]*(p-1)+tr[i])/p;return out;}
 function calculate(c){const closes=c.map(x=>x.close);return {e9:ema(closes,9),e21:ema(closes,21),e50:ema(closes,50),r:rsi(closes),m:macd(closes),a:atr(c)};}
 function signal(c,t,i){if(i<60||!Number.isFinite(t.a[i])||!Number.isFinite(t.m.hist[i]))return {dir:'ESPERAR',score:0,why:'Historial insuficiente'};const x=c[i].close;const up=x>t.e21[i]&&t.e9[i]>t.e21[i]&&t.e21[i]>t.e21[i-3]&&t.r[i]>52&&t.r[i]<70&&t.m.hist[i]>0;const down=x<t.e21[i]&&t.e9[i]<t.e21[i]&&t.e21[i]<t.e21[i-3]&&t.r[i]<48&&t.r[i]>30&&t.m.hist[i]<0;let dir=up?'SUBE':down?'BAJA':'ESPERAR';const range=t.a[i]/Math.max(Math.abs(x),1e-9);if(!Number.isFinite(range)||range<0.000015||range>0.1)dir='ESPERAR';let score=dir==='ESPERAR'?0:Math.round(Math.min(100,55+Math.min(20,Math.abs(t.r[i]-50)*1.5)+Math.min(15,Math.abs(x-t.e21[i])/Math.max(t.a[i],1e-9)*7)));return {dir,score,why:`EMA9/21 ${t.e9[i]>t.e21[i]?'alcista':'bajista'}, RSI ${t.r[i].toFixed(1)}, MACD hist ${t.m.hist[i].toPrecision(3)}, ATR ${t.a[i].toPrecision(3)}`};}
 function backtest(c,t,h){let win=0,lose=0,tie=0;const start=Math.max(65,Math.floor(c.length*.65));for(let i=start;i+h<c.length;i+=h){let s=signal(c,t,i);if(s.dir==='ESPERAR')continue;let d=c[i+h].close-c[i].close;if(d===0)tie++;else if((d>0)===(s.dir==='SUBE'))win++;else lose++;}return {win,lose,tie,n:win+lose+tie,rate:win+lose?100*win/(win+lose):null};}
 return {calculate,signal,backtest};
})();

// Análisis cronológico con horizonte fijo y sin mirar información posterior al momento de la señal.
const VALIDATION = (() => {
 function wilson(win,n,z=1.96){
  if(!n)return {low:0,high:1};
  const p=win/n, zz=z*z, den=1+zz/n, cent=(p+zz/(2*n))/den;
  const margin=z*Math.sqrt(p*(1-p)/n+zz/(4*n*n))/den;
  return {low:Math.max(0,cent-margin),high:Math.min(1,cent+margin)};
 }
 function run(c,t,h,symbol){
  const split=Math.floor(c.length*.7);
  const records=[];let lastExit=-1;
  // Se permiten señales solo desde el 70 % final. Indicadores precalculados
  // causalmente desde las velas anteriores (sin datos futuros).
  for(let i=Math.max(split,60);i+h<c.length;i++){
   if(i<=lastExit)continue;
   const sig=TA.signal(c,t,i);if(sig.dir==='ESPERAR')continue;
   const end=i+h;
   // No aceptar huecos: h velas futuras tienen que ser exactamente h minutos.
   if(c[end].epoch-c[i].epoch!==60*h)continue;
   const entry=c[i].close,exit=c[end].close,d=exit-entry;
   const result=d===0?'EMPATE':((d>0)===(sig.dir==='SUBE')?'ACIERTO':'FALLO');
   records.push({symbol,entryTime:c[i].epoch,exitTime:c[end].epoch,direction:sig.dir,entry,exit,result,horizon:h,score:sig.score});
   lastExit=end;
  }
  const win=records.filter(x=>x.result==='ACIERTO').length;
  const lose=records.filter(x=>x.result==='FALLO').length;
  const tie=records.filter(x=>x.result==='EMPATE').length;
  const decisive=win+lose,ci=wilson(win,decisive);
  return {records,win,lose,tie,n:records.length,rate:decisive?100*win/decisive:null,ciLow:100*ci.low,ciHigh:100*ci.high,splitTime:c[split]?.epoch??null,
    // Estadística exploratoria, no confianza calibrada ni rentabilidad garantizada.
    enough:decisive>=30&&ci.low>0.5};
 }
 return {run,wilson};
})();
