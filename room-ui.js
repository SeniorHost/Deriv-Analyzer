'use strict';
const ROOM_UI=(()=>{
 let selected=null,seen=[],usable=false,queue=Promise.resolve(),signature='',disposed=false,createSymbol=null;
 const message=text=>{$('roomMessage').textContent=text;};
 const ready=(async()=>{try{
  const value=typeof MARKET_STORE==='undefined'?(await chrome.storage.local.get(ROOM.KEY))[ROOM.KEY]:await MARKET_STORE.read();
  if(value!==undefined){selected=value.selection===null?null:ROOM.selection(value.selection);seen=Array.isArray(value.seen)?value.seen.filter(s=>typeof s==='string').slice(-240):[];}
  usable=true;editor();render(results);
 }catch(e){message('No se pudo restaurar la sala: '+e.message);}})();
 function save(){if(typeof MARKET_STORE!=='undefined')return MARKET_STORE.seen(seen);return chrome.storage.local.set({[ROOM.KEY]:{selection:selected,seen:seen.slice(-240)}});}
 function change(fn){
  queue=queue.catch(()=>{}).then(async()=>{
   await ready;if(!usable)throw new Error('Selección no restaurada; vuelve a abrir el panel');
   if(typeof MARKET_STORE!=='undefined'){const value=await MARKET_STORE.update(fn);selected=value.selection;editor();render(results);message('Favoritos guardados; la sala dinámica no los modifica.');return;}
   const next=ROOM.selection(fn(selected||[])),previous=selected;selected=next;
   try{await save();}catch(e){selected=previous;throw e;}
   editor();render(results);message('Selección guardada. No se han cambiado tus pestañas.');
   if(apiReady&&!scanning)void scan(false);
  }).catch(e=>message(e.message));return queue;
 }
 function select(label,values){const el=document.createElement('select');el.setAttribute('aria-label',label);for(const [value,text] of values){const option=document.createElement('option');option.value=value;option.textContent=text;el.append(option);}return el;}
 function button(label,fn){const el=document.createElement('button');el.textContent=label;el.addEventListener('click',fn);return el;}
 function editor(){
  const available=symbols.filter(s=>!(selected||[]).includes(s.symbol));
  const add=$('addAsset');add.replaceChildren();for(const s of available){const o=document.createElement('option');o.value=s.symbol;o.textContent=s.display_name;add.append(o);}
  $('addRoom').disabled=!usable||!available.length||(selected||[]).length>=(typeof MARKET_STORE==='undefined'?ROOM.MAX:7);
  $('selectionEditor').replaceChildren();
  for(const code of selected||[]){
   const row=document.createElement('div');row.className='selection-row';
   const name=document.createElement('span');name.textContent=symbols.find(s=>s.symbol===code)?.display_name||code;row.append(name);
   const target=select('Reemplazar '+code,available.map(s=>[s.symbol,s.display_name]));row.append(target);
   const replace=button('Reemplazar',()=>change(list=>ROOM.change(list,code,target.value)));replace.disabled=!available.length;row.append(replace,button('Quitar',()=>change(list=>list.filter(s=>s!==code))));if(typeof MARKET_STORE!=='undefined'){for(const [label,delta] of [['Subir',-1],['Bajar',1]]){const move=button(label,()=>change(list=>{const at=list.indexOf(code),to=at+delta;if(at<0||to<0||to>=list.length)return list;const next=[...list];[next[at],next[to]]=[next[to],next[at]];return next;}));move.disabled=selected.indexOf(code)+delta<0||selected.indexOf(code)+delta>=selected.length;row.append(move);}}$('selectionEditor').append(row);
  }
 }
 function open(code){
  createSymbol=null;$('createDerivTab').hidden=true;
  chrome.runtime.sendMessage({type:'OPEN_DERIV_ASSET',symbol:code},res=>{
   message(chrome.runtime.lastError?.message||res?.error||res?.message||'No se pudo activar Deriv.');
   if(res?.ok&&res.needsNewTab){createSymbol=code;$('createDerivTab').hidden=false;}
  });
 }
 $('createDerivTab').addEventListener('click',()=>{
  if(!createSymbol)return;const symbol=createSymbol;createSymbol=null;$('createDerivTab').hidden=true;
  chrome.runtime.sendMessage({type:'CREATE_DERIV_TAB',symbol},res=>message(chrome.runtime.lastError?.message||res?.error||res?.message||'No se pudo crear la pestaña.'));
 });
 function render(rows){
  let now=null;try{now=serverNow();}catch{}
  if(typeof SIMPLE_READER!=='undefined')$('roomTitle').textContent=typeof MARKET_STORE==='undefined'?`Mis ${selected===null?6:selected.length} activos`:'Mi sala · favoritos';
  $('roomCount').textContent=`${(selected||[]).length}/${typeof MARKET_STORE==='undefined'?12:7} activos`;
  const container=$('results');container.replaceChildren();
  const notices=[];
  for(const code of selected||[]){
   const r=rows.find(r=>r.symbol===code),card=document.createElement('article');card.className='room-card';
   const title=document.createElement('strong');title.textContent=r?.name||symbols.find(s=>s.symbol===code)?.display_name||code;card.append(title);
   if(typeof SIMPLE_READER!=='undefined'){
    const view=typeof ADAPT_UI==='undefined'?null:ADAPT_UI.view(code),method=$('primaryMethod').value||'adaptive',m=SIMPLE_READER.model(r,view,now,method);
    const trend=document.createElement('p');trend.className='observed-trend';trend.textContent='Tendencia observada: '+(m.trend||'SIN DATOS RECIENTES');card.append(trend);
    const status=document.createElement('div');status.className='room-direction '+(m.direction==='SUBE'?'up':m.direction==='BAJA'?'down':'wait');status.textContent=m.label;card.append(status);
    const source=document.createElement('p');source.className='signal-source';source.textContent='Señal principal: '+m.source;card.append(source);
    const config=document.createElement('p');config.className='muted';config.textContent='Velas: 1 minuto · Evaluación: 5 minutos';card.append(config);
    if(m.emittedAt!==null){const time=document.createElement('p');time.className='signal-time muted';time.textContent=`Emitida ${new Date(m.emittedAt*1000).toLocaleTimeString()} · vigente hasta ${new Date(m.expiresAt*1000).toLocaleTimeString()}`;card.append(time);}
    const why=document.createElement('p');why.className=m.disagreement?'method-disagreement':'simple-reason';why.textContent=m.reason;card.append(why);
    const go=button('Ir a Deriv',()=>open(code));go.setAttribute('aria-label','Ir a Deriv sin cambiar gráficos');card.append(go);container.append(card);
    const id=m.source+'|'+(r?.lastTime??'');if(m.direction!=='ESPERAR'&&!seen.includes(code+'|'+id)){seen.push(code+'|'+id);notices.push(`${title.textContent}: ${m.label} (${m.source})`);}
   }else{
   const a=r&&now!==null?ROOM.alert(r,now):null;
   const status=document.createElement('div');status.className='room-direction '+(a?.active?(r.direction==='SUBE'?'up':'down'):'wait');status.textContent=a?.active?(r.direction==='SUBE'?'RISE':'FALL'):'ESPERAR';card.append(status);
   const info=document.createElement('p');info.className='muted';
   info.textContent=!r?(apiReady&&!symbols.some(s=>s.symbol===code)?'Activo no disponible en el catálogo actual; reemplázalo al editar.':'Esperando análisis'):r.error?'Sin datos: '+r.error:now===null?'Sin conexión u hora fiable; alerta suspendida':`Señal: ${new Date(a.at*1000).toLocaleTimeString()} · ${a.active?'Vigente hasta '+new Date(a.until*1000).toLocaleTimeString():['SUBE','BAJA'].includes(r.direction)?'Caducada':'Sin señal direccional'} · Puntuación técnica ${r.score}/100 (no probabilidad)`;
   card.append(info,button('Ir a Deriv (sin cambiar gráficos)',()=>open(code)));container.append(card);
   if(a?.active&&!seen.includes(a.id)){seen.push(a.id);notices.push(`${title.textContent}: ${status.textContent}`);}
   }
  }
  if(!selected?.length){const p=document.createElement('p');p.className='muted';p.textContent=selected===null?'Conecta para preparar seis activos recomendados.':'Tu sala está vacía. Usa Agregar activo manualmente.';container.append(p);}
  if(notices.length){$('alertStatus').textContent='Nuevas alertas técnicas: '+notices.join(' · ');seen=seen.slice(-240);queue=queue.catch(()=>{}).then(()=>save()).catch(e=>message('No se pudo guardar el historial de alertas: '+e.message));}
  else {const text=rows.some(r=>(selected||[]).includes(r.symbol)&&now!==null&&(typeof SIMPLE_READER==='undefined'?ROOM.alert(r,now).active:SIMPLE_READER.model(r,typeof ADAPT_UI==='undefined'?null:ADAPT_UI.view(r.symbol),now,$('primaryMethod').value||'adaptive').direction!=='ESPERAR'))?'Alertas vigentes · sin novedades para esta vela.':'Sin alertas técnicas vigentes.';if($('alertStatus').textContent!==text)$('alertStatus').textContent=text;}
  $('suggestions').replaceChildren();
  const alternatives=now===null?[]:ROOM.suggestions(rows,selected||[],now);
  for(const r of alternatives){
   const box=document.createElement('div');box.className='suggestion';const label=document.createElement('p');label.textContent=`${r.name} · ${r.direction==='SUBE'?'RISE':'FALL'} · ${r.score}/100 técnicos`;box.append(label);
   const target=select('Activo que deseas reemplazar por '+r.symbol,(selected||[]).map(s=>[s,symbols.find(x=>x.symbol===s)?.display_name||s]));box.append(target);
   const approve=button('Aprobar reemplazo',()=>{
    let currentNow;try{currentNow=serverNow();}catch{return message('Reconecta antes de revisar alternativas.');}
    if(!ROOM.suggestions(results,selected||[],currentNow).some(x=>x.symbol===r.symbol))return message('La sugerencia caducó; espera el próximo análisis.');
    void change(list=>{if(!ROOM.suggestions(results,list,serverNow()).some(x=>x.symbol===r.symbol))throw new Error('La sugerencia caducó; espera el próximo análisis.');return ROOM.change(list,target.value,r.symbol);});
   });approve.disabled=!(selected||[]).length;box.append(approve);$('suggestions').append(box);
  }
  if(!alternatives.length)$('suggestions').textContent='Sin alternativas que cumplan los criterios en este escaneo.';
 }
 async function connected(){await ready;if(!usable)return;await queue;if(selected===null){selected=ROOM.defaults(symbols);try{if(typeof MARKET_STORE!=='undefined')await MARKET_STORE.update(()=>selected.slice(0,7));else await save();}catch(e){selected=null;message('No se pudo guardar la selección inicial: '+e.message);return;}}editor();render(results);if(!watchOn)toggleWatch();void scan(false);}
 $('editRoom').addEventListener('click',()=>{const editor=$('roomEditor');editor.hidden=!editor.hidden;$('editRoom').setAttribute('aria-expanded',String(!editor.hidden));});
 $('addRoom').addEventListener('click',()=>{const next=$('addAsset').value;void change(list=>ROOM.change(list,null,next));});
 $('importTabs').addEventListener('click',()=>chrome.runtime.sendMessage({type:'INSPECT_DERIV_VIEWS'},res=>{
  const reference=$('syncReference');reference.replaceChildren();
  if(chrome.runtime.lastError||!res?.ok)return message(chrome.runtime.lastError?.message||res?.error||'No se pudieron consultar las vistas de Deriv.');
  const detected=[...new Set((Array.isArray(res.symbols)?res.symbols:[]).filter(ROOM.valid))].slice(0,100);
  message('No podemos enumerar ni activar los gráficos internos de Deriv. La selección de la sala no cambió. Solo se consultaron URLs de pestañas de Chrome.');
  if(!detected.length){reference.textContent='No hay símbolos identificables en las URLs. Usa Editar activos para reemplazar manualmente.';return;}
  const note=document.createElement('p');note.className='muted';note.textContent='Referencia de URLs (no inventario de gráficos internos): '+detected.join(', ');reference.append(note);
  const old=select('Activo seleccionado que deseas reemplazar',(selected||[]).map(code=>[code,code]));
  const next=select('Símbolo detectado para reemplazo manual',detected.map(code=>[code,code]));
  const approve=button('Confirmar reemplazo manual',()=>{const before=old.value,after=next.value;void change(list=>{
   if(!symbols.some(s=>s.symbol===after))throw new Error('Conecta y comprueba que el activo está disponible antes de reemplazarlo');
   return ROOM.change(list,before,after);
  });});approve.disabled=!(selected||[]).length;
  reference.append(old,next,approve);
 }));
 if(typeof SIMPLE_READER!=='undefined'){
  let preferenceWrite=Promise.resolve(),methodChanged=false;
  void chrome.storage.local.get('deriv_analyzer_primary_method_v1').then(value=>{const method=value.deriv_analyzer_primary_method_v1;if(!methodChanged&&['original','adaptive'].includes(method))$('primaryMethod').value=method;render(results);}).catch(e=>message('No se pudo restaurar el método: '+e.message));
  $('primaryMethod').addEventListener('change',()=>{methodChanged=true;const method=$('primaryMethod').value;if(!['original','adaptive'].includes(method))return;render(results);preferenceWrite=preferenceWrite.catch(()=>{}).then(()=>chrome.storage.local.set({deriv_analyzer_primary_method_v1:method})).catch(e=>message('Método solo en memoria: '+e.message));});
 }
 function refresh(){if(disposed)return;const next=results.map(r=>{try{if(typeof SIMPLE_READER!=='undefined')return JSON.stringify(SIMPLE_READER.model(r,typeof ADAPT_UI==='undefined'?null:ADAPT_UI.view(r.symbol),serverNow(),$('primaryMethod').value||'adaptive'));return ROOM.alert(r,serverNow()).active;}catch{return false;}}).join('|');if(next!==signature){signature=next;render(results);}setTimeout(refresh,1000);}
 setTimeout(refresh,1000);window.addEventListener('beforeunload',()=>{disposed=true;});
 return {ready,connected,render,change,async refreshFavorites(){if(typeof MARKET_STORE==='undefined')return;const value=await MARKET_STORE.read();selected=value.selection;seen=value.seen||[];editor();render(results);$('favoriteMigration').textContent=value.overflow?.length?'Selección anterior completa conservada; fuera de los siete favoritos activos: '+value.overflow.join(', '):'';},get selected(){return [...(selected||[])];}};
})();
