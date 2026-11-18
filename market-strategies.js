'use strict';
const MARKET_STRATEGIES=(()=>{
 const VERSION='2.0.0-exp1';
 const family=item=>{const old=ADAPTIVE.family(item);if(old!=='UNKNOWN')return old;if(item?.market!=='synthetic_index')return 'UNKNOWN';if(item.submarket==='crash_index'&&/^(BOOM|CRASH)\d+N?$/.test(item.underlying_symbol??item.symbol??''))return 'BOOM_CRASH';if(item.submarket==='step_index')return 'STEP';if(item.submarket==='jump_index'&&item.underlying_symbol_type==='stockindex')return 'JUMP';return 'UNKNOWN';};
 const rule=(id,f,minHistory,indicators,conditions,abstention)=>Object.freeze({id,version:VERSION,family:f,minHistory,indicators,conditions,abstention,validation:'experimental; sin ventaja demostrada'});
 const REGISTRY=Object.freeze([
  rule('forex-ema-pullback','FOREX',900,['EMA20/50 15m','pivotes 5m','ATR14 1m'],'Contexto EMA y estructura coincidentes, retroceso a EMA20 de 1m y rechazo cerrado','Horario fuera de 07–20 UTC, volatilidad extrema, marcos opuestos o patrón ausente'),
  rule('forex-break-confirm','FOREX',120,['niveles previos20','ATR14'],'Dos cierres fuera de nivel, desplazamiento ≥0,5 ATR y cuerpos confirmados','Sin dos cierres o cuerpo indeciso'),
  rule('range-break-confirm','RANGE_BREAK',120,['canal20','ATR14'],'Dos cierres y desplazamiento ≥0,5 ATR fuera del canal','Canal o confirmación insuficiente'),
  rule('range-limit-rejection','RANGE_BREAK',120,['canal20','mechas','ATR14'],'Canal de 2–8 ATR, rechazo cerrado en límite y regreso dentro','Rango no claro, ruptura en curso o doji'),
  Object.freeze({...rule('volatility-impulse','VOLATILITY',240,['EMA9/21','RSI','MACD','ATR'],'Reglas originales intactas','Filtros originales'),version:'1.0.0'}),
  rule('volatility-mtf','VOLATILITY',240,['cierres5m/15m','EMA20 1m'],'Alineación 5m/15m, tres cierres crecientes/decrecientes y cuerpo ≥50%','Sin alineación o impulso'),
  rule('volatility-ema-atr','VOLATILITY',240,['EMA9/21','ATR14'],'Alineación EMA y tres cuerpos, desplazamiento ≥1,5 ATR','Cambio ATR extremo, mechas de agotamiento'),
  rule('volatility-bos','VOLATILITY',240,['pivotes5m','niveles20','ATR'],'Dos cierres de ruptura tras estructura 5m confirmada','Estructura o desplazamiento ausente'),
  rule('boom-crash-spike-observer','BOOM_CRASH',60,['TR','ATR14 previo'],'Detectar TR ≥4 ATR previo y cooldown de diez velas','Siempre sin confirmación: no se presupone capacidad de predecir picos'),
  rule('step-distribution-observer','STEP',60,['ticks reales','distribución de diferencias'],'Describir frecuencia y tamaño de pasos realmente observados','Siempre sin confirmación sin hipótesis predictiva validada'),
  rule('jump-shock-observer','JUMP',60,['TR','ATR14 previo'],'Detectar saltos ≥4 ATR y cooldown de diez velas','Siempre sin confirmación: incertidumbre tras saltos')
 ]);
 function ema(xs,n){if(xs.length<n)return null;let v=xs.slice(0,n).reduce((a,b)=>a+b,0)/n;const k=2/(n+1);for(const x of xs.slice(n))v=x*k+v*(1-k);return v;}
 function spike(c){const tr=c.map((v,i)=>i?Math.max(v.high-v.low,Math.abs(v.high-c[i-1].close),Math.abs(v.low-c[i-1].close)):v.high-v.low);let last=-1,maxRatio=0;for(let i=14;i<tr.length;i++){const prior=tr.slice(i-14,i).reduce((a,b)=>a+b,0)/14,ratio=prior>0?tr[i]/prior:0;if(ratio>=4)last=i;maxRatio=Math.max(maxRatio,ratio);}return {lastAgo:last<0?null:c.length-1-last,cooldown:last>=c.length-11&&last>=0,maxRatio};}
 function steps(sequence){if(!Array.isArray(sequence)||sequence.length<30)return {sufficient:false,reason:'Faltan al menos 30 ticks reales'};if(sequence.some(t=>!t||!Number.isSafeInteger(t.epoch)||t.epoch<=0||!Number.isFinite(t.price)||t.price<=0))return {sufficient:false,reason:'Observaciones de ticks inválidas'};const bins=new Map();let zero=0;for(let i=1;i<sequence.length;i++){if(sequence[i].epoch<sequence[i-1].epoch||!Number.isFinite(sequence[i].price)||!Number.isFinite(sequence[i-1].price))return {sufficient:false,reason:'Secuencia no válida'};const d=Math.abs(sequence[i].price-sequence[i-1].price);if(d===0)zero++;else {const key=Number(d.toPrecision(6));bins.set(key,(bins.get(key)||0)+1);}}return {sufficient:true,events:sequence.length,unchanged:zero,distribution:[...bins].sort((a,b)=>b[1]-a[1]).slice(0,10),reason:'Distribución observada, no predicción de siguiente paso'};}
 function analyze(item,c,now,sequence=[]){
  const f=family(item),code=item.symbol??item.underlying_symbol,at=c?.at(-1)?.epoch+60;
  const out={symbol:code,name:item.display_name??item.underlying_symbol_name??code,family:f,version:VERSION,direction:'ESPERAR',method:'research-wait',sourceCloseAt:at,emittedAt:now,expiresAt:at+60,horizon:5,trend:null,reason:'Sin estrategia compatible o evidencia insuficiente',candidates:[],evidence:'insuficiente',unsupported:f==='UNKNOWN'};
  if(f==='UNKNOWN')return out;
  if(!ADAPTIVE.valid(c,now)||c.length<60||now-at>120){out.reason='Datos incompletos, desordenados o antiguos';return out;}
  if(item.exchange_is_open===0||item.is_trading_suspended){out.reason='Mercado cerrado o suspendido según catálogo';return out;}
  const tail=c.slice(-61);if(tail.some((v,i)=>i&&v.epoch-tail[i-1].epoch!==60)){out.reason='Faltan velas consecutivas';return out;}
  const t=TA.calculate(c),last=c.at(-1),prev=c.at(-2),s=ADAPTIVE.shape(last,prev),atr=t.a.at(-1),frames5=ADAPTIVE.aggregate(c,5,now),frames15=ADAPTIVE.aggregate(c,15,now),p=ADAPTIVE.structure(frames5,300),baseline=TA.signal(c,t,c.length-1);
  out.trend=SIMPLE_READER.observe(c,now)?.trend??null;
  if(f==='BOOM_CRASH'||f==='JUMP'){out.shock=spike(c);out.method=f==='JUMP'?'jump-shock-observer':'boom-crash-spike-observer';out.reason=out.shock.cooldown?'Pico reciente: indicadores distorsionados, periodo de abstención':'Sin hipótesis predictiva validada; la deriva no anticipa el próximo pico';return out;}
  if(f==='STEP'){out.method='step-distribution-observer';out.step=steps(sequence);out.reason=out.step.sufficient?'Pasos observados, sin hipótesis predictiva validada':out.step.reason+'; las velas no sustituyen ticks';return out;}
  if(!(atr>0)||frames5.length<4||frames15.length<4||frames5.slice(-4).some((v,i,a)=>i&&v.epoch-a[i-1].epoch!==300)||frames15.slice(-4).some((v,i,a)=>i&&v.epoch-a[i-1].epoch!==900)){out.reason='Faltan cierres completos 5m/15m';return out;}
  const trend5=Math.sign(frames5.at(-1).close-frames5.at(-4).close),trend15=Math.sign(frames15.at(-1).close-frames15.at(-4).close),aligned=trend5!==0&&trend5===trend15;
  const recent=c.slice(-22,-2),sup=Math.min(...recent.map(v=>v.low)),res=Math.max(...recent.map(v=>v.high)),width=(res-sup)/atr,seq=c.slice(-3),up=seq.every(v=>v.close>v.open),down=seq.every(v=>v.close<v.open),impulse=last.close-seq[0].open;
  const breakUp=prev.close>res+atr*.1&&last.close>res+atr*.5&&s.bull&&s.body>=s.range*.5,breakDown=prev.close<sup-atr*.1&&last.close<sup-atr*.5&&s.bear&&s.body>=s.range*.5;
  for(const r of REGISTRY.filter(r=>r.family===f)){
   let direction='ESPERAR',reason='No se cumplen las confirmaciones fijadas';
   if(c.length<r.minHistory){out.candidates.push({...r,direction,reason:'Historial insuficiente: requiere '+r.minHistory+' velas'});continue;}
   if(r.id==='volatility-impulse'){const old=ADAPTIVE.analyze(item,c,now,baseline);direction=old.direction;reason=old.explanation;}
   if(['forex-break-confirm','range-break-confirm','volatility-bos'].includes(r.id)){const structural=r.id!=='volatility-bos'||['HH/HL','LH/LL'].includes(p.label);if(structural&&breakUp){direction='SUBE';reason='Dos cierres y desplazamiento confirman ruptura superior';}if(structural&&breakDown){direction='BAJA';reason='Dos cierres y desplazamiento confirman ruptura inferior';}}
   if(r.id==='forex-ema-pullback'){
    if(frames15.length<50||frames15.slice(-50).some((v,i,a)=>i&&v.epoch-a[i-1].epoch!==900)){out.candidates.push({...r,direction:'ESPERAR',reason:'Faltan 50 velas 15m completas y contiguas para EMA50'});continue;}
    const xs=frames15.map(v=>v.close),e20=ema(xs,20),e50=ema(xs,50),local=ema(c.map(v=>v.close),20);
    if(e20!==null&&e50!==null&&e20>e50&&p.label==='HH/HL'&&last.low<=local+atr*.3&&last.close>local&&(s.bullReject||s.bullEngulf)){direction='SUBE';reason='Contexto EMA20/50 alcista, HH/HL y retroceso confirmado';}
    if(e20!==null&&e50!==null&&e20<e50&&p.label==='LH/LL'&&last.high>=local-atr*.3&&last.close<local&&(s.bearReject||s.bearEngulf)){direction='BAJA';reason='Contexto EMA20/50 bajista, LH/LL y retroceso confirmado';}
   }
   if(r.id==='range-limit-rejection'&&width>=2&&width<=8&&last.close>sup&&last.close<res){if(last.low<=sup+atr*.3&&s.bullReject){direction='SUBE';reason='Rechazo cerrado del soporte de un canal definido';}if(last.high>=res-atr*.3&&s.bearReject){direction='BAJA';reason='Rechazo cerrado de resistencia del canal';}}
   if(r.id==='volatility-mtf'&&aligned&&s.body>=s.range*.5){if(trend5>0&&up&&last.close>ema(c.map(v=>v.close),20)){direction='SUBE';reason='Cierres y cuerpos alineados en 1m/5m/15m';}if(trend5<0&&down&&last.close<ema(c.map(v=>v.close),20)){direction='BAJA';reason='Cierres y cuerpos bajistas alineados en 1m/5m/15m';}}
   if(r.id==='volatility-ema-atr'&&atr/t.a.at(-15)>=.5&&atr/t.a.at(-15)<=2&&s.body>=s.range*.5){if(up&&impulse>=1.5*atr&&t.e9.at(-1)>t.e21.at(-1)){direction='SUBE';reason='Impulso ≥1,5 ATR y EMA9/21 alcistas';}if(down&&impulse<=-1.5*atr&&t.e9.at(-1)<t.e21.at(-1)){direction='BAJA';reason='Impulso ≥1,5 ATR y EMA9/21 bajistas';}}
   if(f==='FOREX'){const dt=new Date(at*1000);if([0,6].includes(dt.getUTCDay())||dt.getUTCHours()<7||dt.getUTCHours()>=20||atr/last.close<.000015||atr/last.close>.01){direction='ESPERAR';reason='Fuera del horario o filtro de volatilidad FOREX; noticias no verificadas';}}
   if(s.doji){direction='ESPERAR';reason='Vela indecisa: falta confirmación';}
   out.candidates.push({...r,direction,reason});
  }
  const active=out.candidates.filter(r=>r.direction!=='ESPERAR'),dirs=new Set(active.map(r=>r.direction));if(dirs.size===1){out.direction=active[0].direction;out.method=active[0].id;out.version=active[0].version;out.reason=active[0].reason;}else out.reason=dirs.size>1?'Métodos candidatos contradictorios: abstención':out.candidates.map(r=>r.reason).filter((v,i,a)=>a.indexOf(v)===i).join('; ');
  return out;
 }
 async function evaluate(item,c,yieldControl=async()=>{}){
  const historical={...item};delete historical.exchange_is_open;delete historical.is_trading_suspended;
  const ranges={development:[60,Math.floor(c.length*.5)-5],validation:[Math.floor(c.length*.5)+5,Math.floor(c.length*.7)-5],holdout:[Math.ceil(c.length*.7)+5,c.length-5]},result={};
  for(const [stage,[start,end]] of Object.entries(ranges)){const methods={};for(let i=start;i<end;i++){if(i%12===0)await yieldControl();const now=c[i].epoch+60,prefix=c.slice(0,i+1),r=analyze(historical,prefix,now),t=TA.calculate(prefix),original=TA.signal(prefix,t,i);for(const candidate of [{id:'original',version:'1.9',direction:original.dir},...r.candidates]){const key=candidate.id+'@'+candidate.version,m=methods[key]||(methods[key]={signals:0,opportunities:0,records:[],lastExit:-1});m.opportunities++;if(candidate.direction==='ESPERAR')continue;m.signals++;if(i<=m.lastExit||c.slice(i,i+6).some((v,j,a)=>j&&v.epoch-a[j-1].epoch!==60))continue;m.records.push({symbol:r.symbol,method:key,stage,direction:candidate.direction,horizon:5,entryTime:now,entry:c[i].close,exitTime:c[i+5].epoch+60,exit:c[i+5].close,result:FORWARD.outcome(c[i].close,c[i+5].close,candidate.direction)});m.lastExit=i+5;}}
   for(const m of Object.values(methods)){m.frequency=m.opportunities?m.signals/m.opportunities:null;m.frequencyBasis="señales / cierres elegibles; retrospectivo OHLC";}result[stage]=methods;
  }
  return result;
 }
 return {VERSION,REGISTRY,family,ema,spike,steps,analyze,evaluate};
})();
