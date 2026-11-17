'use strict';
const ADAPTIVE=(()=>{
 const VERSION='1.0.0',KEY='deriv_analyzer_adaptive_v1';
 const REGISTRY=Object.freeze([
  {id:'forex-structure',family:'FOREX',version:VERSION,label:'Estructura y rechazo de zona'},
  {id:'forex-retest',family:'FOREX',version:VERSION,label:'Ruptura y retest confirmado'},
  {id:'range-rejection',family:'RANGE_BREAK',version:VERSION,label:'Canal y falsa ruptura'},
  {id:'range-breakout',family:'RANGE_BREAK',version:VERSION,label:'Continuación fuera del canal'},
  {id:'volatility-impulse',family:'VOLATILITY',version:VERSION,label:'Impulso multitemporal sin agotamiento'}
 ]);
 function family(item){
  if(item?.market==='forex'&&item.underlying_symbol_type==='forex')return 'FOREX';
  if(item?.market!=='synthetic_index')return 'UNKNOWN';
  if(item.submarket==='range_index')return 'RANGE_BREAK';
  const code=item.underlying_symbol??item.symbol;
  if(item.submarket==='random_index'&&item.underlying_symbol_type==='stockindex'&&/^(R_(10|25|50|75|100)|1HZ(10|15|25|30|50|75|90|100)V)$/.test(code||''))return 'VOLATILITY';
  return 'UNKNOWN';
 }
 function valid(c,now){return Array.isArray(c)&&c.length>0&&Number.isFinite(now)&&c.every((v,i)=>v&&Number.isSafeInteger(v.epoch)&&v.epoch%60===0&&v.epoch>0&&v.epoch+60<=now&&['open','high','low','close'].every(k=>Number.isFinite(v[k])&&v[k]>0)&&v.high>=Math.max(v.open,v.close,v.low)&&v.low<=Math.min(v.open,v.close,v.high)&&(i===0||v.epoch>c[i-1].epoch));}
 function aggregate(c,minutes,now){
  if(![1,5,15].includes(minutes)||!valid(c,now))return [];
  const buckets=new Map(),width=minutes*60;
  for(const v of c){const start=Math.floor(v.epoch/width)*width;if(!buckets.has(start))buckets.set(start,[]);buckets.get(start).push(v);}
  return [...buckets].filter(([start,rows])=>start+width<=now&&rows.length===minutes&&rows.every((v,i)=>v.epoch===start+i*60)).map(([epoch,rows])=>({epoch,open:rows[0].open,close:rows.at(-1).close,high:Math.max(...rows.map(v=>v.high)),low:Math.min(...rows.map(v=>v.low))}));
 }
 function shape(v,p){const range=v.high-v.low,body=Math.abs(v.close-v.open),upper=v.high-Math.max(v.open,v.close),lower=Math.min(v.open,v.close)-v.low;return {body,upper,lower,range,bull:v.close>v.open,bear:v.close<v.open,doji:range===0||body<=range*.1,bullReject:body>0&&lower>=2*body&&v.close>v.open,bearReject:body>0&&upper>=2*body&&v.close<v.open,bullEngulf:!!p&&p.close<p.open&&v.close>v.open&&v.open<=p.close&&v.close>=p.open,bearEngulf:!!p&&p.close>p.open&&v.close<v.open&&v.open>=p.close&&v.close<=p.open};}
 function pivots(c,interval=60){const highs=[],lows=[];for(let i=2;i+2<c.length;i++){const window=c.slice(i-2,i+3);if(window.some((v,j)=>j&&v.epoch-window[j-1].epoch!==interval))continue;if(window.every((v,j)=>j===2||v.high<c[i].high))highs.push({price:c[i].high,epoch:c[i].epoch,confirmedAt:c[i+2].epoch+interval});if(window.every((v,j)=>j===2||v.low>c[i].low))lows.push({price:c[i].low,epoch:c[i].epoch,confirmedAt:c[i+2].epoch+interval});}return {highs,lows};}
 function structure(c,interval=60){const p=pivots(c,interval),h=p.highs.slice(-2),l=p.lows.slice(-2);return {pivots:p,label:h.length<2||l.length<2?'Sin pivotes confirmados suficientes':h[1].price>h[0].price&&l[1].price>l[0].price?'HH/HL':h[1].price<h[0].price&&l[1].price<l[0].price?'LH/LL':'Mixta'};}
 function trend(rows){const d=rows.at(-1).close-rows.at(-4).close;return d>0?1:d<0?-1:0;}
 function analyze(item,input,now,baseline=null){
  const f=family(item),eligible=REGISTRY.filter(r=>r.family===f),at=input?.at(-1)?.epoch+60;
  const result={symbol:item.symbol||item.underlying_symbol,family:f,version:VERSION,strategy:'research-wait',direction:'ESPERAR',sourceCloseAt:at,emittedAt:now,expiresAt:at+60,horizon:5,context:'No disponible',structure:'No disponible',level:null,candidates:[],contradictions:[],explanation:'Datos insuficientes',evidence:'insuficiente'};
  if(f==='UNKNOWN'){result.explanation='Familia no verificada por metadatos: perfil conservador de investigación';return result;}
  if(!valid(input,now)){result.explanation='OHLC inválido, desordenado o vela sin cerrar';return result;}
  const c=input.slice(-240),tail=c.slice(-61);if(tail.length<61||tail.some((v,i)=>i&&v.epoch-tail[i-1].epoch!==60)||now-at>120){result.explanation='Historial reciente incompleto o antiguo';return result;}
  const m5=aggregate(c,5,now),m15=aggregate(c,15,now);
  if(m5.length<6||m15.length<4||m5.slice(-6).some((v,i,a)=>i&&v.epoch-a[i-1].epoch!==300)||m15.slice(-4).some((v,i,a)=>i&&v.epoch-a[i-1].epoch!==900)){result.explanation='Faltan cierres completos y contiguos de 5m/15m';return result;}
  const t=TA.calculate(c),atr=t.a.at(-1),oldAtr=t.a.at(-15),last=c.at(-1),prev=c.at(-2),s=shape(last,prev),context=trend(m15),frame=trend(m5),st=structure(c),st5=structure(m5,300),prior=c.slice(-22,-2),support=Math.min(...prior.map(v=>v.low)),resistance=Math.max(...prior.map(v=>v.high));
  const original=baseline||TA.signal(input,TA.calculate(input),input.length-1);
  result.context=`15m ${context>0?'alcista':context<0?'bajista':'neutro'} · 5m ${frame>0?'alcista':frame<0?'bajista':'neutro'}`;result.structure=`5m ${st5.label} · 1m ${st.label}`;result.level={support,resistance,distanceSupport:last.close-support,distanceResistance:resistance-last.close};result.shape=s;result.pivots=st.pivots;result.pivots5m=st5.pivots;
  if(!Number.isFinite(atr)||atr<=0){result.explanation='ATR insuficiente';return result;}
  if(item.is_trading_suspended||item.exchange_is_open===0)result.contradictions.push('Mercado suspendido o cerrado según catálogo');
  if(context&&frame&&context!==frame)result.contradictions.push('Contexto 15m y estructura 5m contradictorios');
  if(s.doji)result.contradictions.push('Cuerpo indeciso o nulo');
  if(f==='FOREX'){const date=new Date(at*1000),hour=date.getUTCHours();result.session=`${hour}:00 UTC · filtro fijo 07–20 UTC`;if([0,6].includes(date.getUTCDay())||hour<7||hour>=20)result.contradictions.push('Fuera del contexto horario FOREX fijado');if(atr/last.close<.000015||atr/last.close>.01)result.contradictions.push('Volatilidad fuera del filtro FOREX fijado');}
  const aligned=context!==0&&context===frame,nearSupport=last.low<=support+atr*.3&&last.close>support,nearResistance=last.high>=resistance-atr*.3&&last.close<resistance;
  const fakeUp=prev.high>resistance&&last.close<resistance,fakeDown=prev.low<support&&last.close>support;
  for(const rule of eligible){let dir='ESPERAR',why='Sin confirmación de la regla';
   if(rule.id==='forex-structure'){
    if(aligned&&context>0&&st5.label==='HH/HL'&&nearSupport&&(s.bullReject||s.bullEngulf)){dir='SUBE';why='HH/HL confirmados y rechazo alcista de soporte';}
    if(aligned&&context<0&&st5.label==='LH/LL'&&nearResistance&&(s.bearReject||s.bearEngulf)){dir='BAJA';why='LH/LL confirmados y rechazo bajista de resistencia';}
   }
   if(rule.id==='forex-retest'){
    if(aligned&&context>0&&prev.close>resistance+atr*.1&&last.low<=resistance+atr*.3&&last.close>resistance&&s.bull){dir='SUBE';why='Ruptura previa cerrada y retest alcista confirmado';}
    if(aligned&&context<0&&prev.close<support-atr*.1&&last.high>=support-atr*.3&&last.close<support&&s.bear){dir='BAJA';why='Ruptura previa cerrada y retest bajista confirmado';}
   }
   if(rule.id==='range-rejection'&&(resistance-support)/atr>=1.5&&(resistance-support)/atr<=8){
    if(nearSupport&&(s.bullReject||fakeDown&&s.bull)){dir='SUBE';why=fakeDown?'Falsa ruptura inferior y recuperación cerrada':'Rechazo confirmado del soporte del canal';}
    if(nearResistance&&(s.bearReject||fakeUp&&s.bear)){dir='BAJA';why=fakeUp?'Falsa ruptura superior y recuperación cerrada':'Rechazo confirmado de resistencia del canal';}
   }
   if(rule.id==='range-breakout'){
    if(prev.close>resistance+atr*.1&&last.close>resistance+atr*.1&&s.bull&&s.body>=s.range*.5){dir='SUBE';why='Dos cierres confirman continuación fuera del canal superior';}
    if(prev.close<support-atr*.1&&last.close<support-atr*.1&&s.bear&&s.body>=s.range*.5){dir='BAJA';why='Dos cierres confirman continuación fuera del canal inferior';}
   }
   if(rule.id==='volatility-impulse'){
    const seq=c.slice(-3),up=seq.every(v=>v.close>v.open),down=seq.every(v=>v.close<v.open),impulse=Math.abs(last.close-seq[0].open),ratio=atr/oldAtr;
    if(aligned&&impulse>=atr&&ratio>=.5&&ratio<=2&&s.body>=s.range*.5){if(context>0&&up&&s.upper<2*s.body){dir='SUBE';why='Tres cuerpos alcistas, impulso ATR y alineación 1m/5m/15m';}if(context<0&&down&&s.lower<2*s.body){dir='BAJA';why='Tres cuerpos bajistas, impulso ATR y alineación 1m/5m/15m';}}
    if(s.upper>=2*s.body||s.lower>=2*s.body)why='Mecha de agotamiento: no se confirma el impulso';
   }
   const contradictions=[...result.contradictions];if(dir!=='ESPERAR'&&context&&((dir==='SUBE'?1:-1)!==context))contradictions.push('Hipótesis opuesta al contexto 15m');if(dir!=='ESPERAR'&&original.dir!=='ESPERAR'&&dir!==original.dir)contradictions.push('Indicadores originales contradicen la hipótesis');
   result.candidates.push({...rule,rawDirection:dir,direction:contradictions.length?'ESPERAR':dir,explanation:why,contradictions});
  }
  const active=result.candidates.filter(r=>r.direction!=='ESPERAR'),directions=new Set(active.map(r=>r.direction));
  if(directions.size===1){result.direction=active[0].direction;result.strategy=active.map(r=>r.id).join('+');result.explanation=active.map(r=>r.explanation).join('; ');}else result.explanation=directions.size>1?'Reglas candidatas contradictorias':result.contradictions.join('; ')||result.candidates.map(r=>r.explanation).join('; ');
  result.contradictions=[...new Set([...result.contradictions,...result.candidates.flatMap(r=>r.contradictions)])];return result;
 }
 async function benchmark(item,c,t,yieldControl=async()=>{}){
  const historicalItem={...item};delete historicalItem.exchange_is_open;delete historicalItem.is_trading_suspended;
  const rules=['original@1.9','adaptive-consensus@'+VERSION,...REGISTRY.filter(r=>r.family===family(item)).map(r=>r.id+'@'+r.version)],out=Object.fromEntries(rules.map(id=>[id,{records:[],signals:0,opportunities:0,lastExit:-1}]));
  const start=Math.max(240,Math.ceil(c.length*.7));
  for(let i=start;i+5<c.length;i++){
   if((i-start)%24===0)await yieldControl();
   const original=TA.signal(c,t,i),a=analyze(historicalItem,c.slice(0,i+1),c[i].epoch+60,original);
   for(const id of rules){const r=out[id];r.opportunities++;const dir=id==='original@1.9'?original.dir:id.startsWith('adaptive-consensus')?a.direction:a.candidates.find(x=>id===x.id+'@'+x.version)?.direction||'ESPERAR';if(dir==='ESPERAR')continue;r.signals++;if(i<=r.lastExit||c.slice(i,i+6).some((v,j,arr)=>j&&v.epoch-arr[j-1].epoch!==60))continue;
    r.records.push({symbol:item.symbol,strategy:id,horizon:5,direction:dir,entryTime:c[i].epoch+60,entry:c[i].close,exitTime:c[i+5].epoch+60,exit:c[i+5].close,result:FORWARD.outcome(c[i].close,c[i+5].close,dir),source:'RETROSPECTIVO_OOS_FIJO'});r.lastExit=i+5;
   }
  }
  return out;
 }
 return {VERSION,KEY,REGISTRY,family,valid,aggregate,shape,pivots,structure,analyze,benchmark};
})();
