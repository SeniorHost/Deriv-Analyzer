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
let clockSyncAt=0,missedPings=0,clockAnchor=null,connectionTimer=null,apiReady=false;
const CLOCK_MAX_AGE=10*60*1000;
function invalidateClock(){clockAnchor=null;clockOffsetMs=null;clockSyncAt=0;}
function clockUsable(){return clockAnchor!==null&&performance.now()-clockAnchor.monotonic<=CLOCK_MAX_AGE;}
function assertSession(socket){if(ws!==socket||socket.readyState!==WebSocket.OPEN)throw new Error('La sesión API cambió');}
function updateConnectionUI(){
 const ready=apiReady&&clockUsable()&&!scanning;
 $('scan').disabled=!ready;$('test').disabled=!ready;updateWatchUI();
}
function stopConnectionTimer(){if(connectionTimer!==null)clearTimeout(connectionTimer);connectionTimer=null;}
const MAX_RECONNECT_ATTEMPTS=6;
function serverNowMs(){
 if(!clockUsable())throw new Error('Hora Deriv no sincronizada o caducada; vuelve a conectar');
 return clockAnchor.epochMs+performance.now()-clockAnchor.monotonic;
}
function serverNow(){return Math.floor(serverNowMs()/1000);}
function closedThrough(){return Math.floor((serverNowMs()-clockAnchor.uncertaintyMs)/1000);}
async function syncServerClock(socket=ws){
 const begin=performance.now();
 const response=await request({time:1},9000);
 const end=performance.now(),epoch=Number(response.time),rtt=end-begin;
 assertSession(socket);
 if(!Number.isSafeInteger(epoch)||epoch<1_500_000_000||rtt>4000)throw new Error('Hora Unix inválida o sincronización demasiado lenta');
 // La API redondea a segundos; conservar el margen de incertidumbre para no usar velas abiertas.
 clockAnchor={epochMs:epoch*1000+rtt/2,monotonic:end,uncertaintyMs:1000+rtt/2};
 clockOffsetMs=clockAnchor.epochMs-Date.now();clockSyncAt=end;
 log(`Hora Deriv sincronizada: diferencia servidor/local ${Math.round(clockOffsetMs/100)/10}s; RTT ${Math.round(rtt)}ms.`);
}
function stopHeartbeat(){if(heartbeatTimer!==null)clearTimeout(heartbeatTimer);heartbeatTimer=null;}
function startHeartbeat(socket){
 stopHeartbeat();
 heartbeatTimer=setTimeout(async()=>{
  heartbeatTimer=null;
  if(ws!==socket||socket.readyState!==WebSocket.OPEN)return;
  try{
   await request({ping:1},9000);
   assertSession(socket);
   missedPings=0;reconnectAttempts=0; // Reiniciar retroceso solo tras 30 s de conexión realmente funcional.
   if(performance.now()-clockSyncAt>5*60*1000){
    try{await syncServerClock(socket);}catch(e){if(ws===socket)disconnect(socket,'No se pudo renovar la hora del servidor: '+e.message);return;}
   }
  }catch(e){
   if(ws!==socket)return;
   missedPings++;
   log(`Pulso de conexión fallido (${missedPings}/2): ${e.message}`);
   if(missedPings>=2){disconnect(socket,'API sin respuesta');return;}
  }
  if(ws===socket&&socket.readyState===WebSocket.OPEN)startHeartbeat(socket);
 },30000);
}
function stopReconnect(){if(reconnectTimer!==null)clearTimeout(reconnectTimer);reconnectTimer=null;}
function scheduleReconnect(){
 if(reconnectTimer!==null)return;
 if(reconnectAttempts>=MAX_RECONNECT_ATTEMPTS){
  log('Reconexión automática detenida tras 6 intentos. Pulsa Conectar API para continuar.');
  stopWatch();return;
 }
 const delay=Math.min(30000,2000*2**reconnectAttempts);
 reconnectAttempts++;
 log(`API: reconexión automática ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS} en ${Math.round(delay/1000)}s.`);
 reconnectTimer=setTimeout(()=>{reconnectTimer=null;connect(true);},delay);
 updateWatchUI();
}
let persistedForward=[];
function persistForward(){
 const snapshot=structuredClone(forwardRecords);
 const write=saving.catch(()=>{}).then(()=>navigator.locks.request(FORWARD_KEY,async()=>{
  const stored=await chrome.storage.local.get(FORWARD_KEY);
  const current=stored[FORWARD_KEY]??[];
  if(!Array.isArray(current))throw new Error('Formato de almacenamiento desconocido; no se sobrescribirá');
  const merged=FORWARD.mergeRecords(current,snapshot,persistedForward,FORWARD_MAX);
  await chrome.storage.local.set({[FORWARD_KEY]:merged});
  persistedForward=structuredClone(snapshot);
  // Conservar referencias de las evaluaciones en curso y cambios posteriores a esta captura.
  const latest=FORWARD.mergeRecords(merged,forwardRecords,snapshot,FORWARD_MAX);
  const local=new Map(forwardRecords.map(r=>[FORWARD.recordKey(r),r]));
  forwardRecords=latest.map(r=>{
   const previous=local.get(FORWARD.recordKey(r));
   return previous&&typeof previous==='object'?Object.assign(previous,r):r;
  });
 }));
 saving=write;return write;
}
let storageReady=false;
async function restoreForward(){try{
 const r=await chrome.storage.local.get(FORWARD_KEY);
 if(r[FORWARD_KEY]!==undefined&&!Array.isArray(r[FORWARD_KEY]))throw new Error('Formato de almacenamiento desconocido; no se sobrescribirá');
 forwardRecords=Array.isArray(r[FORWARD_KEY])?r[FORWARD_KEY]:[];
 persistedForward=structuredClone(forwardRecords);storageReady=true;renderForward();log(`Seguimiento restaurado: ${forwardRecords.length} registros.`);
 }catch(e){log('Error al restaurar señales: '+e.message);}}
async function requireForward(){await forwardReady;if(!storageReady)throw new Error('Almacenamiento sin restaurar; vuelve a abrir el panel');}
function validForward(r){
 return r&&typeof r.symbol==='string'&&/^[A-Za-z0-9_]{2,30}$/.test(r.symbol)&&
 ['SUBE','BAJA'].includes(r.direction)&&Number.isFinite(r.entry)&&r.entry>0&&
 Number.isSafeInteger(r.entryTime)&&Number.isSafeInteger(r.exitTime)&&r.entryTime>0&&r.exitTime<=8640000000000&&
 (r.priceBasis===undefined||['OBSERVED_TICK','CANDLE_CLOSE_LEGACY'].includes(r.priceBasis))&&
 [1,5].includes(r.horizon)&&r.exitTime-r.entryTime===r.horizon*60;
}
function trimForward(){
 while(forwardRecords.length>FORWARD_MAX){
  const index=forwardRecords.findIndex(r=>r&&['ACIERTO','FALLO','EMPATE'].includes(r.status));
  if(index<0)break;forwardRecords.splice(index,1);
 }
}
function renderForward(){
 const waiting=forwardRecords.filter(r=>r?.status==='PENDIENTE').length;
 const complete=forwardRecords.filter(r=>validForward(r)&&r.priceBasis==='OBSERVED_TICK'&&Number.isFinite(r.exit)&&r.exit>0&&['ACIERTO','FALLO','EMPATE'].includes(r.status));
 const legacy=forwardRecords.filter(r=>validForward(r)&&r.priceBasis!=='OBSERVED_TICK').length;
 const invalid=forwardRecords.filter(r=>!validForward(r)).length;
 const wins=complete.filter(r=>r.status==='ACIERTO').length;
 const decisive=complete.filter(r=>r.status!=='EMPATE').length;
 $('forwardCount').textContent=`${waiting} pendientes · ${complete.length} resueltas · ${decisive?(wins/decisive*100).toFixed(1)+'% aciertos':'sin tasa todavía'}${legacy?' · '+legacy+' heredadas':''}${invalid?' · '+invalid+' inválidas conservadas':''}`;
 $('forwardRecent').textContent=forwardRecords.slice(-7).reverse().map(r=>{
  if(!validForward(r))return 'Registro heredado o inválido conservado; revisar CSV.';
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
async function registerForwardItem(r,h=Number($('horizon').value),socket=ws){
 await requireForward();assertSession(socket);
 if(cancelScan||![1,5].includes(h))return;
 if(r.error||!Number.isFinite(r.close)||!Number.isFinite(r.lastTime)){
  forwardStats.invalid++;explainForward();return;
 }
 if(!['SUBE','BAJA'].includes(r.direction)){
  forwardStats.wait++;explainForward();return;
 }
 // Exige una vela cerrada reciente; NO exige que el análisis termine en <25 s.
 const closedAt=r.lastTime+60, now=closedThrough(), age=now-closedAt;
 if(age<0||age>90){
  forwardStats.stale++;explainForward();log(`Seguimiento ${r.symbol}: cierre no reciente (${age}s).`);return;
 }
 // Una sola señal por símbolo, vela, duración y dirección: evita contar repetidamente la misma observación.
 const id=`${r.symbol}|${r.lastTime}|${h}|${r.direction}|TICK`;
 if(forwardRecords.some(x=>x?.id===id)){
  forwardStats.duplicate++;explainForward();return;
 }
 try{
  const receivedRequestAt=new Date().toISOString();
  const signalAt=serverNowMs();
  const m=await request({ticks:r.symbol,subscribe:1},9000,message=>{
   const tick=FORWARD.currentTick(message,serverNow(),Math.ceil(clockAnchor.uncertaintyMs/1000));
   return tick.ok&&tick.epoch>=Math.ceil((signalAt+clockAnchor.uncertaintyMs)/1000)&&tick.epoch>=closedAt;
  });
  assertSession(socket);if(cancelScan)return;
  const t=FORWARD.currentTick(m,serverNow(),Math.ceil(clockAnchor.uncertaintyMs/1000));
  if(!t.ok || t.epoch<closedAt){
   forwardStats.quote++;explainForward();log(`Seguimiento ${r.symbol}: tick rechazado (${t.reason||'anterior al cierre usado'}).`);return;
  }
  // Tiempo y precio observados después de evaluar el indicador. Nunca se inventa una entrada pasada.
  const record={id,symbol:r.symbol,name:r.name,entryTime:t.epoch,sourceCloseTime:r.lastTime,
   exitTime:t.epoch+h*60,direction:r.direction,entry:t.price,exit:null,score:r.score,
   horizon:h,status:'PENDIENTE',priceBasis:'OBSERVED_TICK',quoteLagSeconds:t.lag,
   recordedAt:new Date().toISOString(),requestAt:receivedRequestAt,signalTime:signalAt/1000,exitQuoteTime:null,
   note:'Cotización pública observada tras emitir señal; no precio ejecutable, no contrato comprado'};
  // Revisar de nuevo duplicados tras la espera de red.
  if(forwardRecords.some(x=>x?.id===id)){
   forwardStats.duplicate++;explainForward();return;
  }
  if(forwardRecords.filter(x=>x?.status==='PENDIENTE').length>=FORWARD_MAX)throw new Error('Límite de pendientes alcanzado; exporta y evalúa antes de registrar más');
  forwardRecords.push(record);trimForward();renderForward();
  try{await persistForward();}catch(e){log('Señal solo en memoria; no se pudo guardar: '+e.message);return;}
  forwardStats.saved++;explainForward();
  log(`Seguimiento GUARDADO: ${r.symbol} ${r.direction==='SUBE'?'Rise':'Fall'}, entrada tick ${t.price} a ${new Date(t.epoch*1000).toLocaleTimeString()}, cierre usado ${age}s atrás.`);
 }catch(e){
  forwardStats.quote++;explainForward();log(`Seguimiento ${r.symbol}: no se obtuvo cotización (${e.message}).`);
 }
}
async function checkForward(){
 try{await requireForward();serverNow();}catch(e){log(e.message);return;}
 if(settling){log('Ya se están evaluando señales.');return;}
 if(!ws||ws.readyState!==WebSocket.OPEN){log('Conecta la API para evaluar pendientes.');return;}
 const socket=ws,now=closedThrough();
 const due=forwardRecords.filter(r=>validForward(r)&&r.status==='PENDIENTE' && now>=r.exitTime+(r.priceBasis==='OBSERVED_TICK'?4:60));
 if(!due.length){
  const pendingCount=forwardRecords.filter(r=>r?.status==='PENDIENTE').length;
  log(pendingCount?`Hay ${pendingCount} pendiente(s), pero aún no vence ninguna. Consulta tras su duración simulada.`:'No hay señales pendientes: ejecuta un escaneo con SUBE/BAJA o activa el monitoreo.');return;
 }
 settling=true;$('settleForward').disabled=true;
 let resolved=0,missed=0,notSaved=0,cursor=0;
 try{
  async function worker(){
   while(cursor<due.length){
    const item=due[cursor++];
    if(ws!==socket)break;
    try{
     if(item.priceBasis==='OBSERVED_TICK'){
      const response=await request({ticks_history:item.symbol,end:String(item.exitTime),count:10,style:'ticks'},12000);
      assertSession(socket);
      const tick=FORWARD.exitTick(response,item.exitTime,15);
      if(!tick.ok){missed++;log(`Sin tick de salida usable para ${item.symbol}: ${tick.reason}`);continue;}
      item.exit=tick.price;item.exitQuoteTime=tick.epoch;
     }else{
      // Compatibilidad con registros de v1.6/v1.7: nunca mezclar cierre de vela con tick observado.
      const response=await request({ticks_history:item.symbol,end:String(item.exitTime),count:8,style:'candles',granularity:60},12000);
      assertSession(socket);
      const candle=rawCandles(response).find(c=>c.epoch===item.exitTime-60);
      if(!candle){missed++;log(`Sin vela de salida exacta para registro antiguo ${item.symbol}.`);continue;}
      item.exit=candle.close;item.exitQuoteTime=candle.epoch+60;
      item.priceBasis='CANDLE_CLOSE_LEGACY';
     }
     item.status=FORWARD.outcome(item.entry,item.exit,item.direction);
     item.checkedAt=new Date().toISOString();
     try{await persistForward();resolved++;}catch(e){notSaved++;log(`Resultado de ${item.symbol} solo en memoria; no se pudo guardar: ${e.message}`);}
     renderForward();
    }catch(e){missed++;log(`Error al evaluar ${item.symbol}: ${e.message}`);}
   }
  }
  await Promise.all(Array.from({length:Math.min(3,due.length)},()=>worker()));
  renderForward();log(`Evaluación: ${resolved} señales resueltas, ${missed} sin tick/vela fiable (siguen pendientes), ${notSaved} resultados solo en memoria.`);
 }finally{settling=false;$('settleForward').disabled=false;}
}
function exportForward(){
 if(!forwardRecords.length)log('Seguimiento vacío: CSV con cabeceras. Escanea o activa monitoreo; se mostrará el motivo de los descartes.');
 const cols=['symbol','name','recordedAt','entryTimeUTC','exitTimeUTC','direction','riseFall','entry','exit','status','score','horizonMinutes','priceBasis','sourceCloseTimeUTC','exitQuoteTimeUTC','quoteLagSeconds','checkedAt','note'];
 const esc=v=>'"'+String(v??'').replaceAll('"','""')+'"';
 const iso=v=>Number.isSafeInteger(v)&&Number.isFinite(new Date(v*1000).getTime())?new Date(v*1000).toISOString():'';
 const rows=forwardRecords.map(value=>{const r=value&&typeof value==='object'?value:{};return [r.symbol,r.name,r.recordedAt,iso(r.entryTime),iso(r.exitTime),r.direction,r.direction==='SUBE'?'Rise':'Fall',r.entry,r.exit,r.status,r.score,r.horizon,r.priceBasis||'CANDLE_CLOSE_LEGACY',iso(r.sourceCloseTime),iso(r.exitQuoteTime),r.quoteLagSeconds,r.checkedAt,r.note].map(esc).join(',');});
 const url=URL.createObjectURL(new Blob([cols.join(',')+'\n'+rows.join('\n')],{type:'text/csv;charset=utf-8'}));
 const a=document.createElement('a');a.href=url;a.download='deriv-seguimiento-prospectivo-v19-'+Date.now()+'.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),3000);
}
// Solo dentro del panel abierto. No hay vigilancia remota ni escaneos con el navegador cerrado.
function updateWatchUI(){
 const connected=Boolean(apiReady&&clockUsable()&&ws&&ws.readyState===WebSocket.OPEN);
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
 if(!watchOn||!apiReady||!clockUsable()||!ws||ws.readyState!==WebSocket.OPEN)return;
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
 if(!apiReady||!clockUsable()){log('Conecta y sincroniza primero la API.');return;}
 watchOn=true;updateWatchUI();scheduleWatch();log('Monitoreo activo: un escaneo por minuto y evaluación de señales vencidas. Sin compras.');
}

function log(t){$('log').textContent=new Date().toLocaleTimeString()+' · '+t+'\n'+$('log').textContent.slice(0,2200);}
function state(s,ok=false){$('status').textContent=s;$('status').className='pill'+(ok?' ok':'');}
function forgetSubscription(socket,id){
 if(!id||ws!==socket||socket.readyState!==WebSocket.OPEN)return;
 request({forget:id},5000).catch(e=>{if(ws===socket)log('No se pudo cancelar suscripción: '+e.message);});
}
function request(data,timeout=16000,accept=null){return new Promise((resolve,reject)=>{
 const socket=ws;
 if(!socket||socket.readyState!==WebSocket.OPEN)return reject(new Error('API desconectada'));
 const req_id=++requestId;
 const finish=(error,message)=>{
  const p=pending.get(req_id);if(!p)return;
  pending.delete(req_id);clearTimeout(p.timer);
  if(p.subscriptionId)forgetSubscription(socket,p.subscriptionId);
  if(error)reject(error);else resolve(message);
 };
 const timer=setTimeout(()=>finish(new Error('No llegó respuesta de API (timeout)')),timeout);
 pending.set(req_id,{socket,resolve,reject,timer,finish,accept,subscriptionId:null});
 try{socket.send(JSON.stringify({...data,req_id}));}catch(e){finish(e);}
 });}
function cleanPending(error){for(const p of [...pending.values()]){clearTimeout(p.timer);p.reject(error)}pending.clear();}
function disconnect(socket,reason){
 if(ws!==socket)return;
 ws=null;apiReady=false;symbols=[];invalidateClock();stopHeartbeat();stopConnectionTimer();clearWatchTimer();
 socket.onopen=socket.onclose=socket.onerror=socket.onmessage=null;
 try{socket.close();}catch{}
 cancelScan=true;cleanPending(new Error(reason));
 state('Desconectada');$('detail').textContent=reason;updateConnectionUI();log(reason);scheduleReconnect();
}
function connect(isRetry=false){
 stopReconnect();stopHeartbeat();stopConnectionTimer();clearWatchTimer();
 apiReady=false;symbols=[];invalidateClock();cancelScan=true;
 if(ws){
  const old=ws;ws=null;old.onclose=old.onerror=old.onmessage=old.onopen=null;
  try{old.close();}catch{}
 }
 cleanPending(new Error('Reconectando'));
 if(!isRetry)reconnectAttempts=0;
 state(isRetry?'Reconectando...':'Conectando...');
 $('detail').textContent='Esperando conexión, hora y catálogo públicos.';updateConnectionUI();
 let socket;
 try{socket=new WebSocket(API);ws=socket;}
 catch(e){state('Error');log(e.message);scheduleReconnect();return;}
 connectionTimer=setTimeout(()=>disconnect(socket,'Tiempo agotado al abrir WebSocket'),12000);
 socket.onopen=async()=>{
  if(ws!==socket)return;
  stopConnectionTimer();missedPings=0;state('Sincronizando...');startHeartbeat(socket);
  try{
   await syncServerClock(socket);assertSession(socket);
   const m=await request({active_symbols:'brief'});assertSession(socket);
   symbols=(Array.isArray(m.active_symbols)?m.active_symbols:[]).map(normalizeSymbol).filter(Boolean);
   if(!symbols.length)throw new Error('El catálogo público está vacío');
   apiReady=true;state('Conectada',true);updateConnectionUI();
   $('detail').textContent=`${symbols.length} símbolos obtenidos por API pública. No requiere contraseña.`;
   log(`API pública conectada: ${symbols.length} símbolos, solo lectura.`);
   if(typeof ROOM_UI!=='undefined'){await ROOM_UI.connected();}else if(watchOn)scheduleWatch();
  }catch(e){if(ws===socket)disconnect(socket,'No se pudo preparar la API: '+e.message);}
 };
 socket.onmessage=e=>{
  if(ws!==socket)return;
  let msg;try{msg=JSON.parse(e.data)}catch{return;}
  if(!msg||typeof msg!=='object')return;
  const id=msg.req_id??msg.echo_req?.req_id;
  const p=pending.get(id);
  if(!p){if(msg.subscription?.id)forgetSubscription(socket,msg.subscription.id);return;}
  if(p.socket!==socket)return;
  if(msg.subscription?.id)p.subscriptionId=msg.subscription.id;
  if(msg.error){p.finish(new Error(msg.error.message||msg.error.code||'Error API'));return;}
  try{if(!p.accept||p.accept(msg))p.finish(null,msg);}catch(error){p.finish(error);}
 };
 socket.onerror=()=>disconnect(socket,'Error en conexión WebSocket');
 socket.onclose=event=>disconnect(socket,`Conexión cerrada (código ${event?.code??'desconocido'}, motivo ${event?.reason||'no informado'}).`);
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
function chooseSymbols(){if(typeof ROOM_UI!=='undefined')return ROOM.pool(symbols,ROOM_UI.selected);const market=$('market').value;
 const filtered=symbols.filter(s=>s && typeof s.symbol==='string' && /^[A-Za-z0-9_]{2,30}$/.test(s.symbol) && (market==='all'||symbolType(s)===market));
 const candidates=filtered.sort((a,b)=>{
  const n=s=>/volatility (10|25|50|75|100)( index)?\b|índice de volatilidad|EUR\/USD|USD\/JPY/i.test(s.display_name||'')?0:1;
  return n(a)-n(b);
 });
 return candidates.slice(0,12);
}
function rawCandles(m){
 const raw=Array.isArray(m.candles)?m.candles:(Array.isArray(m.history?.candles)?m.history.candles:[]);
 const byTime=new Map(),num=v=>v===null||v===undefined||v===''?NaN:Number(v);
 for(const v of raw){
  if(!v||typeof v!=='object')continue;
  const c={epoch:num(v.epoch??v.time),open:num(v.open),high:num(v.high),low:num(v.low),close:num(v.close)};
  if(Number.isSafeInteger(c.epoch)&&c.epoch>0&&c.epoch%60===0&&
   ['open','high','low','close'].every(k=>Number.isFinite(c[k])&&c[k]>0)&&
   c.high>=Math.max(c.open,c.close,c.low)&&c.low<=Math.min(c.open,c.close,c.high))byTime.set(c.epoch,c);
 }
 return [...byTime.values()].sort((a,b)=>a.epoch-b.epoch);
}
function validateCandles(arr){
 const now=closedThrough();
 const closed=arr.filter(c=>c.epoch+60<=now);
 if(closed.length<90)throw new Error(`Solo ${closed.length} velas cerradas`);
 const latest=closed.at(-1).epoch;
 if(now-latest>600)throw new Error('Última vela demasiado antigua');
 let gaps=0;for(let i=1;i<closed.length;i++)if(closed[i].epoch-closed[i-1].epoch!==60)gaps++;
 if(gaps>closed.length*.05)throw new Error(`Historial con ${gaps} huecos de minuto`);
 return closed;
}
async function loadHistory(symbol,socket=ws){
 assertSession(socket);
 const previous=historyCache.get(symbol);
 if(previous?.candles?.length>=90){
  const lastCached=previous.candles.at(-1).epoch;
  const latestClosed=Math.floor(closedThrough()/60)*60-60;
  if(lastCached===latestClosed)return {candles:validateCandles(previous.candles),pages:0,mode:'rápida'};
  const count=Math.ceil((serverNow()-lastCached)/60)+2;
  if(count<=180){
   // Un error de transporte no se resuelve descargando tres páginas más.
   const m=await request({ticks_history:symbol,end:'latest',count:Math.max(3,count),style:'candles',granularity:60},12000);
   assertSession(socket);if(cancelScan)throw new Error('Cancelado');
   const fresh=rawCandles(m);
   if(fresh.length&&fresh[0].epoch<=lastCached+60){
    const merged=new Map(previous.candles.map(c=>[c.epoch,c]));
    for(const candle of fresh)merged.set(candle.epoch,candle);
    const candles=validateCandles([...merged.values()].sort((a,b)=>a.epoch-b.epoch)).slice(-2400);
    historyCache.set(symbol,{candles});
    log(`${symbol}: actualización rápida, ${fresh.length} velas recibidas`);
    return {candles,pages:1,mode:'rápida'};
   }
   log(`${symbol}: actualización sin solapamiento; reconstruyendo historial.`);
  }
 }
 const all=new Map();let end='latest',pages=0;
 for(let page=0;page<3;page++){
  assertSession(socket);if(cancelScan)throw new Error('Cancelado');
  // Una vela abierta puede ocupar una plaza de la primera página.
  const count=page===0?801:800;
  const response=await request({ticks_history:symbol,end:String(end),count,style:'candles',granularity:60},12000);
  assertSession(socket);if(cancelScan)throw new Error('Cancelado');
  const chunk=rawCandles(response);
  log(`${symbol}: bloque ${page+1}: ${chunk.length} velas recibidas`);
  if(!chunk.length)break;
  for(const c of chunk)all.set(c.epoch,c);
  pages++;
  const earliest=chunk[0].epoch;
  if(end!=='latest' && earliest>=Number(end))break;
  end=earliest-1;
  if(chunk.length<count)break;
 }
 const candles=validateCandles([...all.values()].sort((a,b)=>a.epoch-b.epoch)).slice(-2400);
 historyCache.set(symbol,{candles});
 return {candles,pages,mode:'completa'};
}

let cancelScan=false;
async function scan(single=false){
 if(scanning){log('Ya hay un escaneo en curso.');return;}
 if(!apiReady||!clockUsable()){updateConnectionUI();log('Conecta y sincroniza la API antes de escanear.');return;}
 const socket=ws;
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
  const h=typeof ROOM_UI!=='undefined'?5:Number($('horizon').value);
  const update=()=>setProgress(`${done}/${selected.length} completados · ${failed} errores`);
  async function worker(){
   while(cursor<selected.length&&!cancelScan){
    const item=selected[cursor++];
    try{
     log('Solicitando velas: '+item.symbol);
     const {candles,pages,mode}=await loadHistory(item.symbol,socket);
     if(cancelScan)break;
     const technical=TA.calculate(candles),last=candles.length-1,signal=TA.signal(candles,technical,last),back=VALIDATION.run(candles,technical,h,item.symbol);
     allTrades.push(...back.records);
     const row={symbol:item.symbol,name:item.display_name||item.symbol,type:symbolType(item),direction:signal.dir,score:signal.score,reason:signal.why,lastTime:candles[last].epoch,close:candles[last].close,samples:candles.length,back,pages,quality:'Velas cerradas validables',mode};
     results.push(row);
     try{await registerForwardItem(row,h,socket);}catch(e){log(`Seguimiento ${item.symbol} no registrado: ${e.message}`);}
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
  log(`Escaneo ${cancelScan?'cancelado':'finalizado'}: ${done} consultados, ${failed} errores. Ninguna orden ejecutada.`);
 }catch(e){
  const message='ERROR GENERAL durante preparación o escaneo: '+String(e?.stack||e?.message||e);
  log(message);setProgress('Error: revisar Registro');
 }finally{
  scanning=false;updateConnectionUI();
  $('cancel').disabled=true;
  if(selected.length && $('count').textContent!=='Error: revisar Registro')setProgress(`${cancelScan?'Cancelado':'Finalizado'} · ${done}/${selected.length} · ${failed} errores`);
 }
}

function render(){
 if(typeof ROOM_UI!=='undefined'){ROOM_UI.render(results);return;}
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
window.addEventListener('beforeunload',()=>{stopWatch();stopHeartbeat();stopConnectionTimer();const old=ws;ws=null;if(old){old.onclose=old.onerror=null;old.close();}cleanPending(new Error('Panel cerrado'));});
$('exportForward').addEventListener('click',exportForward);
const forwardReady=restoreForward();
explainForward();

updateWatchUI();
