'use strict';
const CMP_UI=(()=>{
 let state=null,queue=Promise.resolve(),busy=false,disposed=false,history=new Map(),tickHistory=new Map();const active=new Map();
 const note=text=>{$('cmpStatus').textContent=text;};
 const ready=(async()=>{try{const locks=await navigator.locks.query();const live=locks.held.map(lock=>lock.name).filter(name=>name.startsWith('deriv-comparator-stream:')).map(name=>name.slice('deriv-comparator-stream:'.length));state=COMPARATOR.restore((await chrome.storage.local.get(COMPARATOR.KEY))[COMPARATOR.KEY],live);$('cmpEnable').checked=state.enabled;await save();render();}catch(e){state=null;note(e.message);}})();
 function save(){if(!state)return Promise.reject(new Error('Comparador no restaurado'));const snapshot=structuredClone(state);const p=queue.catch(()=>{}).then(()=>navigator.locks.request(COMPARATOR.KEY,async()=>{
  const value=(await chrome.storage.local.get(COMPARATOR.KEY))[COMPARATOR.KEY];
  if(value!==undefined&&(value.version!==1||!Array.isArray(value.groups)))throw new Error('Formato desconocido; no se sobrescribirá');
  const merged=new Map((value?.groups||[]).map(g=>[g.id,g]));
  for(const g of snapshot.groups){const old=merged.get(g.id);if(!old)merged.set(g.id,g);else if(g.entryTime===old.entryTime&&g.count>=old.count){g.evaluations=g.evaluations.map(r=>{const prior=old.evaluations.find(x=>x.mode===r.mode&&x.duration===r.duration);return prior&&['ACIERTO','FALLO','EMPATE'].includes(prior.status)?prior:r;});merged.set(g.id,g);}}
  const groups=[...merged.values()];while(groups.length>120){const i=groups.findIndex(COMPARATOR.done);if(i<0)break;groups.splice(i,1);}
  await chrome.storage.local.set({[COMPARATOR.KEY]:{version:1,enabled:snapshot.enabled,groups}});
 }));queue=p;return p;}

 function persist(){void save().catch(e=>note('Resultados solo en memoria: '+e.message));}
 function render(){
  const code=$('cmpAsset').value,mode=$('cmpMode').value||'time',duration=Number($('cmpDuration').value||5);$('cmpResults').replaceChildren();
  const sources=['RETROSPECTIVO','PROSPECTIVO'];
  for(const source of sources){
   let records=[],updated=null,limitation='';
   if(source==='RETROSPECTIVO'){
    const h=history.get(code);updated=h?.updated;
    if(h&&mode==='time')records=VALIDATION.run(h.c,h.t,duration,code).records;
    else if(h&&tickHistory.has(code)&&mode==='ticks'){const window=tickHistory.get(code);records=COMPARATOR.tickBacktest(h.c,h.t,duration,window.ticks,code);updated=window.updated;}
    else limitation=mode==='ticks'?'Solicita una ventana de ticks reales. Las velas no se convierten en ticks.':'Espera un escaneo de este activo.';
   }else {const groups=state?.groups.filter(g=>g.symbol===code)||[];records=groups.flatMap(g=>g.evaluations.filter(r=>r.mode===mode&&r.duration===duration));updated=groups.length?Math.max(...groups.map(g=>g.updatedAt)):null;if(!groups.length)limitation='Activa la recopilación; solo se registran nuevas señales, sin reconstruir entradas pasadas.';}
   const stats=COMPARATOR.stats(records),box=document.createElement('div');box.className='suggestion';
   const title=document.createElement('strong');title.textContent=source==='RETROSPECTIVO'?'Retrospectivo · referencia histórica':'Prospectivo · ticks observados';
   const text=document.createElement('p');text.className='muted';text.textContent=`${stats.win} aciertos · ${stats.lose} fallos · ${stats.tie} empates · ${stats.n} muestras evaluadas (${stats.decisive} sin empate). Aciertos observados: ${stats.rate===null?'sin datos':stats.rate.toFixed(1)+'%'} · Wilson 95%: ${stats.low===null?'sin datos':stats.low.toFixed(1)+'–'+stats.high.toFixed(1)+'%'}. Evidencia: ${stats.evidence}${stats.n<30?' · Datos insuficientes':''}. Sin ventaja demostrada. ${records.filter(r=>r.status==='PENDIENTE').length} pendientes · ${records.filter(r=>r.status==='INCOMPLETA').length} incompletas. ${limitation} Actualización: ${updated?new Date(updated*1000).toLocaleString():'todavía no disponible'}`;
   box.append(title,text);$('cmpResults').append(box);
  }
 }
 function assets(){const el=$('cmpAsset'),previous=el.value;el.replaceChildren();for(const s of symbols){const o=document.createElement('option');o.value=s.symbol;o.textContent=s.display_name;el.append(o);}if(symbols.some(s=>s.symbol===previous))el.value=previous;render();}
 function durations(){const el=$('cmpDuration');el.replaceChildren();for(const n of $('cmpMode').value==='ticks'?COMPARATOR.TICKS:COMPARATOR.TIME){const o=document.createElement('option');o.value=String(n);o.textContent=n+($('cmpMode').value==='ticks'?' ticks':' min');el.append(o);}if($('cmpMode').value==='time')el.value='5';render();}
 function onHistory(symbol,c,t){history.set(symbol,{c,t,updated:serverNow()});if(history.size>12)history.delete(history.keys().next().value);if($('cmpAsset').options.length!==symbols.length)assets();render();}
 async function collect(row){
  await ready;if(!state?.enabled||disposed||!ROOM_UI.selected.includes(row.symbol)||!['SUBE','BAJA'].includes(row.direction)||!COMPARATOR.allowed(state.groups,row))return;
  if(active.size>=3){note('Señal de '+row.symbol+' no recopilada: límite de tres flujos. No se reconstruirá una entrada pasada.');return;}
  let now;try{now=serverNow();if(now-row.lastTime-60<0||now-row.lastTime-60>60)return;}catch{return;}
  if(active.has(row.symbol))return;const socket=ws,signalAt=Math.ceil((serverNowMs()+clockAnchor.uncertaintyMs)/1000);active.set(row.symbol,null);let group=null,lastSave=0,lastSettled=0;const controller=new AbortController();let watchdog=setTimeout(()=>controller.abort(),9000);
  try{
   await request({ticks:row.symbol,subscribe:1},620000,m=>{
    assertSession(socket);if(disposed)throw new Error('Panel cerrado');const current=FORWARD.currentTick(m,serverNow(),2);if(!current.ok)throw new Error(current.reason);
    if(m.tick.symbol!==row.symbol)throw new Error('Símbolo de tick incorrecto');
    if(!group){if(current.epoch<signalAt)return false;group=COMPARATOR.create(row,{epoch:current.epoch,price:current.price},signalAt);state.groups.push(group);while(state.groups.length>120){const i=state.groups.findIndex(g=>COMPARATOR.done(g));if(i<0)break;state.groups.splice(i,1);}active.set(row.symbol,group);persist();}
    else COMPARATOR.feed(group,{epoch:current.epoch,price:current.price},serverNow());
    clearTimeout(watchdog);watchdog=setTimeout(()=>controller.abort(),15000);
    const settled=group.evaluations.filter(r=>r.status!=='PENDIENTE').length;
    if(serverNow()-lastSave>=5||settled!==lastSettled||COMPARATOR.done(group)){persist();lastSave=serverNow();lastSettled=settled;render();}
    return COMPARATOR.done(group);
   },controller.signal);
  }catch(e){if(group){COMPARATOR.interrupt(group,e.message);persist();}note('Flujo no evaluable: '+e.message);}
  finally{clearTimeout(watchdog);active.delete(row.symbol);render();}
 }
 async function signal(row){try{await navigator.locks.request('deriv-comparator-stream:'+row.symbol,{ifAvailable:true},async lock=>{if(lock)await collect(row);});}catch(e){note('No se pudo reservar el flujo: '+e.message);}}
 $('cmpEnable').addEventListener('change',async()=>{await ready;if(!state)return;$('cmpEnable').disabled=true;const previous=state.enabled;state.enabled=$('cmpEnable').checked;try{await save();note(state.enabled?'Recopilación activa para señales nuevas; máximo tres flujos, sin solapamiento por activo durante 10 min.':'No se crearán nuevas entradas; los flujos ya iniciados terminan su evaluación.');}catch(e){state.enabled=previous;$('cmpEnable').checked=previous;note(e.message);}finally{$('cmpEnable').disabled=false;}});
 $('cmpMode').addEventListener('change',durations);$('cmpAsset').addEventListener('change',render);$('cmpDuration').addEventListener('change',render);
 $('cmpTicks').addEventListener('click',async()=>{
  if(busy)return;busy=true;$('cmpTicks').disabled=true;const code=$('cmpAsset').value;
  try{if(!history.has(code))throw new Error('Primero escanea el activo');if(tickHistory.has(code)&&serverNow()-tickHistory.get(code).updated<60){render();return;}const response=await request({ticks_history:code,end:'latest',count:1000,style:'ticks'},12000);tickHistory.set(code,{ticks:COMPARATOR.ticks(response),updated:serverNow()});if(tickHistory.size>12)tickHistory.delete(tickHistory.keys().next().value);note('Ventana de hasta 1.000 ticks reales. Cobertura limitada; no es un historial completo.');render();}catch(e){note('Datos insuficientes: '+e.message);}finally{busy=false;$('cmpTicks').disabled=false;}
 });
 $('cmpExport').addEventListener('click',()=>{
  const cols=['asset','mode','duration','direction','signal_time','entry_time','entry_price','target_time','exit_time','exit_price','result','evaluation_source','reason'];
  const esc=v=>'"'+String(v??'').replaceAll('"','""')+'"';const iso=t=>Number.isFinite(t)?new Date(t*1000).toISOString():'';
  const rows=(state?.groups||[]).flatMap(g=>g.evaluations.map(r=>[g.symbol,r.mode,r.duration,g.direction,iso(g.signalAt),iso(g.entryTime),g.entry,iso(r.target),iso(r.exitTime),r.exit,r.status,g.source,r.reason].map(esc).join(',')));
  const code=$('cmpAsset').value,mode=$('cmpMode').value,duration=Number($('cmpDuration').value),h=history.get(code);
  if(h){const retro=mode==='time'?VALIDATION.run(h.c,h.t,duration,code).records:tickHistory.has(code)?COMPARATOR.tickBacktest(h.c,h.t,duration,tickHistory.get(code).ticks,code):[];for(const r of retro)rows.push([code,mode,duration,r.direction,iso(r.signalTime||r.entryTime),iso(r.entryTime),r.entry,mode==='time'?iso(r.exitTime):'',iso(r.exitTime),r.exit,r.result,mode==='time'?'RETROSPECTIVO_CIERRE':'RETROSPECTIVO_TICKS','Referencia histórica no ejecutable'].map(esc).join(','));}
  const url=URL.createObjectURL(new Blob([cols.join(',')+'\n'+rows.join('\n')],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download='deriv-comparador.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),3000);
 });
 window.addEventListener('beforeunload',()=>{disposed=true;});
 durations();return {ready,onHistory,signal,render};
})();
