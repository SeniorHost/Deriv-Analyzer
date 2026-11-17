'use strict';
const $=id=>document.getElementById(id);
const API='wss://api.derivws.com/trading/v1/options/ws/public';
let ws=null,requestId=0,pending=new Map(),symbols=[],results=[],scanning=false;
let allTrades=[];
let forwardRecords=[];
const FORWARD_KEY='deriv_analyzer_forward_v16'; // Reutilizar registros previos sin perder datos.
const FORWARD_MAX=1500;
const historyCache=new Map();
let saving=Promise.resolve(),settling=false,watchOn=false,watchTimer=null;
let heartbeatTimer=null,reconnectTimer=null,reconnectAttempts=0,clockOffsetMs=null;
let clockSyncAt=0,missedPings=0;
const MAX_RECONNECT_ATTEMPTS=6;
function serverNowMs(){return Date.now()+(Number.isFinite(clockOffsetMs)?clockOffsetMs:0);}
function serverNow(){return Math.floor(serverNowMs()/1000);}
async function syncServerClock(){
 const begin=Date.now();
 const response=await request({time:1},9000);
 const end=Date.now(),epoch=Number(response.time);
 if(!Number.isSafeInteger(epoch)||epoch<1_500_000_000)throw new Error('La API no devolvió hora Unix válida');
 clockOffsetMs=epoch*1000-(begin+end)/2;
 clockSyncAt=end;
 log(`Hora Deriv sincronizada: diferencia servidor/local ${Math.round(clockOffsetMs/100)/10}s; RTT ${end-begin}ms.`);
}
function stopHeartbeat(){if(heartbeatTimer!==null)clearTimeout(heartbeatTimer);heartbeatTimer=null;}
function startHeartbeat(socket){
 stopHeartbeat();
 heartbeatTimer=setTimeout(async()=>{
  heartbeatTimer=null;
  if(ws!==socket||socket.readyState!==WebSocket.OPEN)return;
  try{
   await request({ping:1},9000);
   missedPings=0;reconnectAttempts=0; // Reiniciar retroceso solo tras 30 s de conexión realmente funcional.
   if(Date.now()-clockSyncAt>5*60*1000){
    try{await syncServerClock();}catch(e){log('No se pudo renovar la hora del servidor: '+e.message);}
   }
  }catch(e){
   missedPings++;
   log(`Pulso de conexión fallido (${missedPings}/2): ${e.message}`);
   if(missedPings>=2){try{socket.close();}catch{}return;}
  }
  if(ws===socket&&socket.readyState===WebSocket.OPEN)startHeartbeat(socket);
 },30000);
}
function stopReconnect(){if(reconnectTimer!==null)clearTimeout(reconnectTimer);reconnectTimer=null;}
function scheduleReconnect(){
 if(!watchOn||reconnectTimer!==null)return;
 if(reconnectAttempts>=MAX_RECONNECT_ATTEMPTS){
  log('Reconexión automática detenida tras 6 intentos. Pulsa Conectar API para continuar.');
  stopWatch();return;
 }
 const delay=Math.min(30000,2000*2**reconnectAttempts);
 reconnectAttempts++;
 log(`Monitoreo: reconexión automática ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS} en ${Math.round(delay/1000)}s.`);
 reconnectTimer=setTimeout(()=>{reconnectTimer=null;if(watchOn)connect(true);},delay);
 updateWatchUI();
}
function persistForward(){
 const snapshot=forwardRecords.slice(-FORWARD_MAX);
 saving=saving.then(()=>chrome.storage.local.set({[FORWARD_KEY]:snapshot})).catch(e=>log('Almacenamiento: '+e.message));
 return saving;
}
async function restoreForward(){try{
 const r=await chrome.storage.local.get(FORWARD_KEY);
 forwardRecords=Array.isArray(r[FORWARD_KEY])?r[FORWARD_KEY]:[];
 renderForward();log(`Seguimiento restaurado: ${forwardRecords.length} registros.`);
 }catch(e){log('Error al restaurar señales: '+e.message);}}
function renderForward(){
 const waiting=forwardRecords.filter(r=>r.status==='PENDIENTE').length;
 const complete=forwardRecords.filter(r=>['ACIERTO','FALLO','EMPATE'].includes(r.status));
 const wins=complete.filter(r=>r.status==='ACIERTO').length;
 const decisive=complete.filter(r=>r.status!=='EMPATE').length;
 $('forwardCount').textContent=`${waiting} pendientes · ${complete.length} resueltas · ${decisive?(wins/decisive*100).toFixed(1)+'% aciertos':'sin tasa todavía'}`;
 $('forwardRecent').textContent=forwardRecords.slice(-7).reverse().map(r=>{
  const time=r.recordedAt||new Date(r.entryTime*1000).toISOString();
  const basis=r.priceBasis==='OBSERVED_TICK'?'tick observado':'cierre heredado';
  const due=r.status==='PENDIENTE'?` · vence ${new Date(r.exitTime*1000).toLocaleTimeString()}`:'';
  return `${r.name} ${r.direction==='SUBE'?'RISE':'FALL'} · ${new Date(time).toLocaleString()} · ${r.status}${due} · ${basis}`;
 }).join('\n')||'Todavía no hay señales prospectivas.';
}
const forwardStats={saved:0,wait:0,stale:0,duplicate:0,invalid:0,quote:0};
function explainForward(){
 $('forwardInfo').textContent=`Último escaneo: ${forwardStats.saved} guardadas · ${forwardStats.wait} ESPERAR · ${forwardStats.stale} datos de vela antiguos · ${forwardStats.duplicate} repetidas · ${forwardStats.quote} cotizaciones no disponibles · ${forwardStats.invalid} datos inválidos. Entrada = tick observado al escanear, nunca cierre antiguo.`;
}
function resetForwardStats(){for(const k of Object.keys(forwardStats))forwardStats[k]=0;explainForward();}
async function registerForwardItem(r){
 const h=Number($('horizon').value);
 if(r.error||!Number.isFinite(r.close)||!Number.isFinite(r.lastTime)){
  forwardStats.invalid++;explainForward();return;
 }
 if(!['SUBE','BAJA'].includes(r.direction)){
  forwardStats.wait++;explainForward();return;
 }
 // Exige una vela cerrada reciente; NO exige que el análisis termine en <25 s.
 const closedAt=r.lastTime+60, now=serverNow(), age=now-closedAt;
 if(age<0||age>90){
  forwardStats.stale++;explainForward();log(`Seguimiento ${r.symbol}: cierre no reciente (${age}s).`);return;
 }
 // Una sola señal por símbolo, vela, duración y dirección: evita contar repetidamente la misma observación.
 const id=`${r.symbol}|${r.lastTime}|${h}|${r.direction}|TICK`;
 if(forwardRecords.some(x=>x.id===id)){
  forwardStats.duplicate++;explainForward();return;
 }
 try{
  const receivedRequestAt=new Date().toISOString();
  const m=await request({ticks:r.symbol},9000);
  const t=FORWARD.currentTick(m,serverNow());
  if(!t.ok || t.epoch<closedAt){
   forwardStats.quote++;explainForward();log(`Seguimiento ${r.symbol}: tick rechazado (${t.reason||'anterior al cierre usado'}).`);return;
  }
  // Tiempo y precio observados después de evaluar el indicador. Nunca se inventa una entrada pasada.
  const record={id,symbol:r.symbol,name:r.name,entryTime:t.epoch,sourceCloseTime:r.lastTime,
   exitTime:t.epoch+h*60,direction:r.direction,entry:t.price,exit:null,score:r.score,
   horizon:h,status:'PENDIENTE',priceBasis:'OBSERVED_TICK',quoteLagSeconds:t.lag,
   recordedAt:new Date().toISOString(),requestAt:receivedRequestAt,exitQuoteTime:null,
   note:'Cotización pública observada tras emitir señal; no precio ejecutable, no contrato comprado'};
  // Revisar de nuevo duplicados tras la espera de red.
  if(forwardRecords.some(x=>x.id===id)){
   forwardStats.duplicate++;explainForward();return;
  }
  forwardRecords.push(record);forwardRecords=forwardRecords.slice(-FORWARD_MAX);
  await persistForward();forwardStats.saved++;renderForward();explainForward();
  log(`Seguimiento GUARDADO: ${r.symbol} ${r.direction==='SUBE'?'Rise':'Fall'}, entrada tick ${t.price} a ${new Date(t.epoch*1000).toLocaleTimeString()}, cierre usado ${age}s atrás.`);
 }catch(e){
  forwardStats.quote++;explainForward();log(`Seguimiento ${r.symbol}: no se obtuvo cotización (${e.message}).`);
 }
}
async function checkForward(){
 if(settling){log('Ya se están evaluando señales.');return;}
 if(!ws||ws.readyState!==WebSocket.OPEN){log('Conecta la API para evaluar pendientes.');return;}
 const now=serverNow();
 const due=forwardRecords.filter(r=>r.status==='PENDIENTE' && now>=r.exitTime+(r.priceBasis==='OBSERVED_TICK'?4:60));
 if(!due.length){
  const pendingCount=forwardRecords.filter(r=>r.status==='PENDIENTE').length;
  log(pendingCount?`Hay ${pendingCount} pendiente(s), pero aún no vence ninguna. Consulta tras su duración simulada.`:'No hay señales pendientes: ejecuta un escaneo con SUBE/BAJA o activa el monitoreo.');return;
 }
 settling=true;$('settleForward').disabled=true;
 let resolved=0,missed=0,cursor=0;
 try{
  async function worker(){
   while(cursor<due.length){
    const item=due[cursor++];
    try{
     if(item.priceBasis==='OBSERVED_TICK'){
      const response=await request({ticks_history:item.symbol,end:String(item.exitTime),count:10,style:'ticks'},12000);
      const tick=FORWARD.exitTick(response,item.exitTime,15);
      if(!tick.ok){missed++;log(`Sin tick de salida usable para ${item.symbol}: ${tick.reason}`);continue;}
      item.exit=tick.price;item.exitQuoteTime=tick.epoch;
     }else{
      // Compatibilidad con registros de v1.6/v1.7: nunca mezclar cierre de vela con tick observado.
      const response=await request({ticks_history:item.symbol,end:String(item.exitTime),count:8,style:'candles',granularity:60},12000);
      const candle=rawCandles(response).find(c=>c.epoch===item.exitTime-60);
      if(!candle){missed++;log(`Sin vela de salida exacta para registro antiguo ${item.symbol}.`);continue;}
      item.exit=candle.close;item.exitQuoteTime=candle.epoch+60;
      item.priceBasis='CANDLE_CLOSE_LEGACY';
     }
     item.status=FORWARD.outcome(item.entry,item.exit,item.direction);
     item.checkedAt=new Date().toISOString();resolved++;await persistForward();renderForward();
    }catch(e){missed++;log(`Error al evaluar ${item.symbol}: ${e.message}`);}
   }
  }
  await Promise.all(Array.from({length:Math.min(3,due.length)},()=>worker()));
  renderForward();log(`Evaluación: ${resolved} señales resueltas, ${missed} sin tick/vela fiable (siguen pendientes).`);
 }finally{settling=false;$('settleForward').disabled=false;}
}
function exportForward(){
 if(!forwardRecords.length)log('Seguimiento vacío: CSV con cabeceras. Escanea o activa monitoreo; se mostrará el motivo de los descartes.');
 const cols=['symbol','name','recordedAt','entryTimeUTC','exitTimeUTC','direction','riseFall','entry','exit','status','score','horizonMinutes','priceBasis','sourceCloseTimeUTC','exitQuoteTimeUTC','quoteLagSeconds','checkedAt','note'];
 const esc=v=>'"'+String(v??'').replaceAll('"','""')+'"';
 const iso=v=>Number.isSafeInteger(v)?new Date(v*1000).toISOString():'';
 const rows=forwardRecords.map(r=>[r.symbol,r.name,r.recordedAt,iso(r.entryTime),iso(r.exitTime),r.direction,r.direction==='SUBE'?'Rise':'Fall',r.entry,r.exit,r.status,r.score,r.horizon,r.priceBasis||'CANDLE_CLOSE_LEGACY',iso(r.sourceCloseTime),iso(r.exitQuoteTime),r.quoteLagSeconds,r.checkedAt,r.note].map(esc).join(','));
 const url=URL.createObjectURL(new Blob([cols.join(',')+'\n'+rows.join('\n')],{type:'text/csv;charset=utf-8'}));
 const a=document.createElement('a');a.href=url;a.download='deriv-seguimiento-prospectivo-v18-'+Date.now()+'.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),3000);
}
// Solo dentro del panel abierto. No hay vigilancia remota ni escaneos con el navegador cerrado.
function updateWatchUI(){
 const connected=Boolean(ws&&ws.readyState===WebSocket.OPEN);
 $('watch').textContent=watchOn?'Pausar monitoreo':'Activar monitoreo cada minuto';
 $('watchStatus').textContent=watchOn?(connected?'Activo · mientras el panel esté abierto':'En pausa · intentando reconectar API'):'Apagado · requiere panel abierto';
 $('watch').disabled=!connected&&!watchOn;
}
function clearWatchTimer(){if(watchTimer!==null)clearTimeout(watchTimer);watchTimer=null;}
function stopWatch(){
 watchOn=false;clearWatchTimer();stopReconnect();reconnectAttempts=0;updateWatchUI();
}
function scheduleWatch(){
 clearWatchTimer();
 if(!watchOn||!ws||ws.readyState!==WebSocket.OPEN)return;
 const ms=60000-(serverNowMs()%60000)+8000; // 8 s después del siguiente cierre en hora del servidor.
 watchTimer=setTimeout(async()=>{
  watchTimer=null;
  if(!watchOn)return;
  if(scanning)log('Monitoreo: se omite un ciclo porque aún sigue el escaneo anterior.');
  else if(!ws||ws.readyState!==WebSocket.OPEN){log('Monitoreo en pausa: esperando reconexión API.');return;}
  else {
   try{await scan(false);}catch(e){log('Monitoreo: error de escaneo: '+e.message);}
   if(watchOn&&!scanning&&ws&&ws.readyState===WebSocket.OPEN){
    try{await checkForward();}catch(e){log('Monitoreo: evaluación pendiente falló: '+e.message);}
   }
  }
  if(watchOn&&ws&&ws.readyState===WebSocket.OPEN)scheduleWatch();
 },Math.max(1000,ms));
 log(`Próximo monitoreo: aproximadamente en ${Math.round(ms/1000)}s, con hora del servidor (panel abierto).`);
}
function toggleWatch(){
 if(watchOn){stopWatch();log('Monitoreo detenido por el usuario.');return;}
 if(!ws||ws.readyState!==WebSocket.OPEN){log('Conecta primero la API.');return;}
 watchOn=true;updateWatchUI();scheduleWatch();log('Monitoreo activo: un escaneo por minuto y evaluación de señales vencidas. Sin compras.');
}

function log(t){$('log').textContent=new Date().toLocaleTimeString()+' · '+t+'\n'+$('log').textContent.slice(0,2200);}
function state(s,ok=false){$('status').textContent=s;$('status').className='pill'+(ok?' ok':'');}
function request(data,timeout=16000){return new Promise((resolve,reject)=>{
 if(!ws||ws.readyState!==WebSocket.OPEN)return reject(new Error('API desconectada'));
 const req_id=++requestId;
 const timer=setTimeout(()=>{pending.delete(req_id);reject(new Error('No llegó respuesta de API (timeout)'));},timeout);
 pending.set(req_id,{resolve,reject,timer});
 ws.send(JSON.stringify({...data,req_id}));
 });}
function cleanPending(error){for(const p of pending.values()){clearTimeout(p.timer);p.reject(error)}pending.clear();}
function connect(isRetry=false){
 stopReconnect();stopHeartbeat();clearWatchTimer();
 if(ws){
  const old=ws;ws=null;
  // Deshabilitar sus callbacks para evitar que el cierre del socket viejo apague el nuevo.
  old.onclose=null;old.onerror=null;old.onmessage=null;old.onopen=null;
  try{old.close();}catch{}
 }
 cleanPending(new Error('Reconectando'));
 if(!isRetry)reconnectAttempts=0;
 state(isRetry?'Reconectando...':'Conectando...');
 $('scan').disabled=true;$('test').disabled=true;updateWatchUI();
 let socket;
 try{socket=new WebSocket(API);ws=socket;}
 catch(e){state('Error');log(e.message);if(watchOn)scheduleReconnect();return;}
 socket.onopen=async()=>{
  if(ws!==socket)return;
  state('Conectada',true);log(isRetry?'API reconectada; señales guardadas intactas.':'API pública oficial conectada, solo lectura.');
  missedPings=0;
  $('scan').disabled=false;$('test').disabled=false;updateWatchUI();
  startHeartbeat(socket);
  try{
   await syncServerClock();
  }catch(e){log('Sin sincronización de hora: '+e.message+'; se usará hora local con tolerancia limitada.');}
  if(ws!==socket)return;
  try{
   const m=await request({active_symbols:'brief'});
   if(ws!==socket)return;
   const rawSymbols=Array.isArray(m.active_symbols)?m.active_symbols:[];
   symbols=rawSymbols.map(normalizeSymbol).filter(Boolean);
   log(`API catálogo: ${rawSymbols.length} recibidos, ${symbols.length} normalizados. Primer código: ${symbols[0]?.symbol||'ninguno'}`);
   $('detail').textContent=`${symbols.length} símbolos obtenidos por API pública. No requiere contraseña.`;
   log(`Símbolos recibidos: ${symbols.length}`);
  }catch(e){log('No se pudo obtener catálogo: '+e.message);}
  if(ws!==socket)return;
  if(watchOn){scheduleWatch();log('Monitoreo reanudado después de la conexión.');}
 };
 socket.onmessage=e=>{
  if(ws!==socket)return;
  let msg;try{msg=JSON.parse(e.data)}catch{return;}
  const id=msg.req_id??msg.echo_req?.req_id;
  const p=pending.get(id);if(!p)return;
  clearTimeout(p.timer);pending.delete(id);
  if(msg.error)p.reject(new Error(msg.error.message||msg.error.code||'Error API'));
  else p.resolve(msg);
 };
 socket.onerror=()=>{if(ws===socket)log('Error en conexión WebSocket');};
 socket.onclose=event=>{
  if(ws!==socket)return;
  ws=null;stopHeartbeat();clearWatchTimer();
  state('Desconectada');$('scan').disabled=true;$('test').disabled=true;
  cancelScan=true;
  cleanPending(new Error('WebSocket cerrado'));
  log(`Conexión cerrada (código ${event?.code??'desconocido'}, motivo ${event?.reason||'no informado'}).`);
  updateWatchUI();
  if(watchOn)scheduleReconnect();
 };
}

// API Nueva (2026): underlying_symbol / underlying_symbol_name replaces symbol / display_name.
// Normalize once on receipt so the rest of the extension can use stable fields.
function normalizeSymbol(item){
 if(!item || typeof item!=='object') return null;
 const code=item.underlying_symbol ?? item.symbol;
 const name=item.underlying_symbol_name ?? item.display_name ?? code;
 if(typeof code!=='string' || !/^\w{2,30}$/.test(code))return null;
 return {...item,symbol:code,display_name:typeof name==='string'?name:code};
}
function symbolType(s){const x=[s.market,s.market_display_name,s.submarket,s.submarket_display_name,s.subgroup,s.underlying_symbol_type,s.display_name,s.symbol].join(' ').toLowerCase();
 if(/synthetic|derived|volatility|índice de volatilidad|indices de volatilidad/.test(x))return 'synthetic';
 if(/forex|major pairs|minor pairs|currency|fx/.test(x))return 'forex';return 'other';}
function chooseSymbols(){const market=$('market').value;
 const filtered=symbols.filter(s=>s && typeof s.symbol==='string' && /^[A-Za-z0-9_]{2,30}$/.test(s.symbol) && (market==='all'||symbolType(s)===market));
 const candidates=filtered.sort((a,b)=>{
  const n=s=>/volatility (10|25|50|75|100)( index)?\b|índice de volatilidad|EUR\/USD|USD\/JPY/i.test(s.display_name||'')?0:1;
  return n(a)-n(b);
 });
 return candidates.slice(0,12);
}
function rawCandles(m){
 const raw=Array.isArray(m.candles)?m.candles:(Array.isArray(m.history?.candles)?m.history.candles:[]);
 const byTime=new Map();
 for(const v of raw){const c={epoch:Number(v.epoch??v.time),open:Number(v.open),high:Number(v.high),low:Number(v.low),close:Number(v.close)};
  if(Object.values(c).every(Number.isFinite)&&c.epoch>0&&c.high>=Math.max(c.open,c.close,c.low)&&c.low<=Math.min(c.open,c.close,c.high))byTime.set(c.epoch,c);
 }
 return [...byTime.values()].sort((a,b)=>a.epoch-b.epoch);
}
function validateCandles(arr){
 const now=serverNow();
 const closed=arr.filter(c=>c.epoch+60<=now);
 if(closed.length<90)throw new Error(`Solo ${closed.length} velas cerradas`);
 const latest=closed.at(-1).epoch;
 if(now-latest>600)throw new Error('Última vela demasiado antigua');
 let gaps=0;for(let i=1;i<closed.length;i++)if(closed[i].epoch-closed[i-1].epoch!==60)gaps++;
 if(gaps>closed.length*.05)throw new Error(`Historial con ${gaps} huecos de minuto`);
 return closed;
}
async function loadHistory(symbol){
 const previous=historyCache.get(symbol);
 if(previous?.candles?.length>=90){
  try{
   const m=await request({ticks_history:symbol,end:'latest',count:180,style:'candles',granularity:60},12000);
   const fresh=rawCandles(m);
   if(!fresh.length)throw new Error('Sin velas en actualización rápida');
   const lastCached=previous.candles.at(-1).epoch;
   if(fresh[0].epoch>lastCached+60)throw new Error('Historial discontinuo: se recargará');
   const merged=new Map(previous.candles.map(c=>[c.epoch,c]));
   for(const candle of fresh)merged.set(candle.epoch,candle);
   const candles=validateCandles([...merged.values()].sort((a,b)=>a.epoch-b.epoch).slice(-2400));
   historyCache.set(symbol,{candles});
   log(`${symbol}: actualización rápida, ${fresh.length} velas solicitadas`);
   return {candles,pages:1,mode:'rápida'};
  }catch(e){log(`${symbol}: caché no usable (${e.message}); reconstruyendo historial.`);}
 }
 const all=new Map();let end='latest',pages=0;
 for(let page=0;page<3;page++){
  if(cancelScan)throw new Error('Cancelado');
  const response=await request({ticks_history:symbol,end:String(end),count:800,style:'candles',granularity:60},12000);
  const chunk=rawCandles(response);
  log(`${symbol}: bloque ${page+1}: ${chunk.length} velas recibidas`);
  if(!chunk.length)break;
  for(const c of chunk)all.set(c.epoch,c);
  pages++;
  if(chunk.length<200)break;
  const earliest=chunk[0].epoch;
  if(end!=='latest' && earliest>=Number(end))break;
  end=earliest-1;
 }
 const candles=validateCandles([...all.values()].sort((a,b)=>a.epoch-b.epoch));
 historyCache.set(symbol,{candles});
 return {candles,pages,mode:'completa'};
}

let cancelScan=false;
async function scan(single=false){
 if(scanning){log('Ya hay un escaneo en curso.');return;}
 if(!ws||ws.readyState!==WebSocket.OPEN){log('API desconectada; pulsa Conectar API.');return;}
 scanning=true;cancelScan=false;$('scan').disabled=true;$('test').disabled=true;$('cancel').disabled=false;
 results=[];allTrades=[];resetForwardStats();$('results').replaceChildren();
 let selected=[],done=0,failed=0,cursor=0;
 const setProgress=t=>{$('count').textContent=t;};
 try{
  setProgress('Preparando lista de activos...');
  log('Etapa 1/3: preparando catálogo. Símbolos disponibles: '+symbols.length);
  // El catálogo ya está en memoria. No esperamos temporizadores antes de empezar.
  log('Preparación: filtrando catálogo local...');
  selected=chooseSymbols();
  log('Preparación: filtro completado ('+selected.length+' símbolos candidatos).');
  if(single)selected=selected.slice(0,1);
  if(!selected.length){
    const message='No hay activos compatibles en esta categoría. Revisa el catálogo o prueba «Todos».';
    $('results').textContent=message;setProgress('0 activos compatibles');log(message);log('Ejemplo catálogo: '+symbols.slice(0,5).map(x=>x.symbol+' ('+x.market+'/'+x.submarket+')').join(', '));return;
  }
  log('Etapa 2/3: '+selected.length+' activos seleccionados. Primer símbolo: '+selected[0].symbol);
  setProgress(`0/${selected.length} · solicitando velas...`);
  log('Etapa 2/3: solicitud de historial iniciada.');
  const h=Number($('horizon').value);
  const update=()=>setProgress(`${done}/${selected.length} completados · ${failed} errores`);
  async function worker(){
   while(cursor<selected.length&&!cancelScan){
    const item=selected[cursor++];
    try{
     log('Solicitando velas: '+item.symbol);
     const {candles,pages,mode}=await loadHistory(item.symbol);
     if(cancelScan)break;
     const technical=TA.calculate(candles),last=candles.length-1,signal=TA.signal(candles,technical,last),back=VALIDATION.run(candles,technical,h,item.symbol);
     allTrades.push(...back.records);
     const row={symbol:item.symbol,name:item.display_name||item.symbol,type:symbolType(item),direction:signal.dir,score:signal.score,reason:signal.why,lastTime:candles[last].epoch,close:candles[last].close,samples:candles.length,back,pages,quality:'Velas cerradas validables',mode};
     results.push(row);await registerForwardItem(row);
     log(item.symbol+': '+candles.length+' velas válidas');
    }catch(e){
     failed++;
     results.push({symbol:item.symbol,name:item.display_name||item.symbol,direction:'SIN DATOS',score:-1,error:String(e?.message||e)});
     log('ERROR '+item.symbol+': '+String(e?.message||e));
    }finally{done++;try{render();}catch(e){log('Error al mostrar resultado: '+e.message);}update();}
   }
  }
  await Promise.all(Array.from({length:Math.min(single?1:3,selected.length)},()=>worker()));
  log('Etapa 3/3: resultados calculados.');
  results.sort((a,b)=>Number(b.back?.enough)-Number(a.back?.enough)||b.score-a.score);render();update();
  if(!cancelScan && !single){
   const best=results.find(x=>x.back?.enough&&x.score>0&&x.direction!=='ESPERAR');
   if($('auto').checked&&!best)log('No se cambia de gráfico: ninguna señal alcanzó los requisitos mínimos de validación.');
   if($('auto').checked&&best){
    chrome.runtime.sendMessage({type:'NAVIGATE_DERIV',symbol:best.symbol},res=>{
     if(chrome.runtime.lastError)log(chrome.runtime.lastError.message);
     else log(res?.ok?'Gráfico cambiado a '+best.name:'No se cambió el gráfico: '+(res?.error||'Error'));
    });
   }
  }
  log(`Escaneo ${cancelScan?'cancelado':'finalizado'}: ${done} consultados, ${failed} errores. Ninguna orden ejecutada.`);
 }catch(e){
  const message='ERROR GENERAL durante preparación o escaneo: '+String(e?.stack||e?.message||e);
  log(message);setProgress('Error: revisar Registro');
 }finally{
  scanning=false;$('scan').disabled=!(ws&&ws.readyState===WebSocket.OPEN);
  $('test').disabled=$('scan').disabled;$('cancel').disabled=true;
  if(selected.length && $('count').textContent!=='Error: revisar Registro')setProgress(`${cancelScan?'Cancelado':'Finalizado'} · ${done}/${selected.length} · ${failed} errores`);
 }
}

function render(){
 $('count').textContent=`${results.filter(x=>x.score>=0).length} evaluados`;
 $('results').replaceChildren();
 for(const r of [...results].sort((a,b)=>Number(b.back?.enough)-Number(a.back?.enough)||b.score-a.score)){
  const div=document.createElement('div');div.className='asset';
  const hd=document.createElement('div');hd.className='asset-head';
  const title=document.createElement('span');title.textContent=r.name;hd.append(title);
  const side=document.createElement('span');side.className=r.direction==='SUBE'?'up':r.direction==='BAJA'?'down':'wait';side.textContent=r.direction+(r.score>0?` · ${r.score}/100`:'');hd.append(side);div.append(hd);
  const info=document.createElement('div');info.className='sub';
  if(r.error)info.textContent=`${r.symbol} · ${r.error}`;
  else {
   const rate=r.back.rate==null?'sin datos':r.back.rate.toFixed(1)+'%';
   info.textContent=`${r.symbol} · ${r.samples} velas cerradas (${r.pages} ${r.mode==='rápida'?'bloque rápido':'bloques'}) · ${r.reason} · Validación final 30%: ${r.back.n} señales, ${r.back.win} aciertos, ${r.back.lose} fallos, ${r.back.tie} empates (${rate}; Wilson 95%: ${r.back.ciLow.toFixed(1)}–${r.back.ciHigh.toFixed(1)}%). ${r.back.enough?'Mínimo estadístico preliminar alcanzado':'MUESTRA INSUFICIENTE / sin ventaja demostrada'}. No se comprueban pagos.`;
  }
  div.append(info);
  if(!r.error){const b=document.createElement('button');b.textContent='Ver gráfico en Deriv';b.style.marginTop='8px';b.addEventListener('click',()=>{
   chrome.runtime.sendMessage({type:'NAVIGATE_DERIV',symbol:r.symbol},res=>log(res?.ok?'Navegando a '+r.name:'No se pudo navegar: '+(res?.error||chrome.runtime.lastError?.message||'Error')));
  });div.append(b);}
  $('results').append(div);
 }
}
function exportCsv(){if(!results.length){log('Primero ejecuta un escaneo.');return;}
 const cols=['symbol','name','direction','score','samples','pages','close','lastTime','backN','backWin','backLose','backTie','backRate','wilsonLow','wilsonHigh','minimumMet','error'];
 const esc=v=>'"'+String(v??'').replaceAll('"','""')+'"';
 const data=results.map(x=>[x.symbol,x.name,x.direction,x.score,x.samples,x.pages,x.close,x.lastTime,x.back?.n,x.back?.win,x.back?.lose,x.back?.tie,x.back?.rate,x.back?.ciLow,x.back?.ciHigh,x.back?.enough,x.error].map(esc).join(','));
 const blob=new Blob([cols.join(',')+'\n'+data.join('\n')],{type:'text/csv;charset=utf-8'});
 const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='deriv-analyzer-demo-'+Date.now()+'.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1500);
}
function exportTrades(){
 if(!allTrades.length){log('No hay señales individuales para exportar.');return;}
 const cols=['symbol','entryTimeUTC','exitTimeUTC','direction','entry','exit','result','horizonMinutes','technicalScore'];
 const esc=v=>'"'+String(v??'').replaceAll('"','""')+'"';
 const data=allTrades.map(t=>[t.symbol,new Date(t.entryTime*1000).toISOString(),new Date(t.exitTime*1000).toISOString(),t.direction,t.entry,t.exit,t.result,t.horizon,t.score].map(esc).join(','));
 const blob=new Blob([cols.join(',')+'\n'+data.join('\n')],{type:'text/csv;charset=utf-8'});
 const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='deriv-senales-validacion-'+Date.now()+'.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1500);
}
$('tradesExport').addEventListener('click',exportTrades);
$('connect').addEventListener('click',()=>connect(false));
$('scan').addEventListener('click',()=>scan(false));
$('test').addEventListener('click',()=>scan(true));
$('cancel').addEventListener('click',()=>{cancelScan=true;log('Cancelación solicitada; esperando las consultas activas.');});
$('export').addEventListener('click',exportCsv);

$('settleForward').addEventListener('click',checkForward);
$('watch').addEventListener('click',toggleWatch);
window.addEventListener('beforeunload',stopWatch);
$('exportForward').addEventListener('click',exportForward);
restoreForward();
explainForward();

updateWatchUI();
