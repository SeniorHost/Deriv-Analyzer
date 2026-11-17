'use strict';
const ROOM_UI=(()=>{
 let selected=null,seen=[],usable=false,queue=Promise.resolve(),signature='',disposed=false,createSymbol=null;
 const message=text=>{$('roomMessage').textContent=text;};
 const ready=(async()=>{try{
  const value=(await chrome.storage.local.get(ROOM.KEY))[ROOM.KEY];
  if(value!==undefined){selected=ROOM.selection(value.selection);seen=Array.isArray(value.seen)?value.seen.filter(s=>typeof s==='string').slice(-240):[];}
  usable=true;editor();render(results);
 }catch(e){message('No se pudo restaurar la sala: '+e.message);}})();
 function save(){return chrome.storage.local.set({[ROOM.KEY]:{selection:selected,seen:seen.slice(-240)}});}
 function change(fn){
  queue=queue.catch(()=>{}).then(async()=>{
   await ready;if(!usable)throw new Error('Selección no restaurada; vuelve a abrir el panel');
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
  $('addRoom').disabled=!usable||!available.length||(selected||[]).length>=ROOM.MAX;
  $('selectionEditor').replaceChildren();
  for(const code of selected||[]){
   const row=document.createElement('div');row.className='selection-row';
   const name=document.createElement('span');name.textContent=symbols.find(s=>s.symbol===code)?.display_name||code;row.append(name);
   const target=select('Reemplazar '+code,available.map(s=>[s.symbol,s.display_name]));row.append(target);
   const replace=button('Reemplazar',()=>change(list=>ROOM.change(list,code,target.value)));replace.disabled=!available.length;row.append(replace,button('Quitar',()=>change(list=>list.filter(s=>s!==code))));$('selectionEditor').append(row);
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
  $('roomCount').textContent=`${(selected||[]).length}/12 activos`;
  const container=$('results');container.replaceChildren();
  const notices=[];
  for(const code of selected||[]){
   const r=rows.find(r=>r.symbol===code),card=document.createElement('article');card.className='room-card';
   const title=document.createElement('strong');title.textContent=r?.name||symbols.find(s=>s.symbol===code)?.display_name||code;card.append(title);
   const a=r&&now!==null?ROOM.alert(r,now):null;
   const status=document.createElement('div');status.className='room-direction '+(a?.active?(r.direction==='SUBE'?'up':'down'):'wait');status.textContent=a?.active?(r.direction==='SUBE'?'RISE':'FALL'):'ESPERAR';card.append(status);
   const info=document.createElement('p');info.className='muted';
   info.textContent=!r?(apiReady&&!symbols.some(s=>s.symbol===code)?'Activo no disponible en el catálogo actual; reemplázalo al editar.':'Esperando análisis'):r.error?'Sin datos: '+r.error:now===null?'Sin conexión u hora fiable; alerta suspendida':`Señal: ${new Date(a.at*1000).toLocaleTimeString()} · ${a.active?'Vigente hasta '+new Date(a.until*1000).toLocaleTimeString():['SUBE','BAJA'].includes(r.direction)?'Caducada':'Sin señal direccional'} · Puntuación técnica ${r.score}/100 (no probabilidad)`;
   card.append(info,button('Ir a Deriv (sin cambiar gráficos)',()=>open(code)));container.append(card);
   if(a?.active&&!seen.includes(a.id)){seen.push(a.id);notices.push(`${title.textContent}: ${status.textContent}`);}
  }
  if(!selected?.length){const p=document.createElement('p');p.className='muted';p.textContent=selected===null?'Conecta para preparar seis activos recomendados.':'Tu sala está vacía. Usa Agregar activo manualmente.';container.append(p);}
  if(notices.length){$('alertStatus').textContent='Nuevas alertas técnicas: '+notices.join(' · ');seen=seen.slice(-240);queue=queue.catch(()=>{}).then(()=>save()).catch(e=>message('No se pudo guardar el historial de alertas: '+e.message));}
  else {const text=rows.some(r=>(selected||[]).includes(r.symbol)&&now!==null&&ROOM.alert(r,now).active)?'Alertas vigentes · sin novedades para esta vela.':'Sin alertas técnicas vigentes.';if($('alertStatus').textContent!==text)$('alertStatus').textContent=text;}
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
 async function connected(){await ready;if(!usable)return;await queue;if(selected===null){selected=ROOM.defaults(symbols);try{await save();}catch(e){selected=null;message('No se pudo guardar la selección inicial: '+e.message);return;}}editor();render(results);if(!watchOn)toggleWatch();void scan(false);}
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
 function refresh(){if(disposed)return;const next=results.map(r=>{try{return ROOM.alert(r,serverNow()).active;}catch{return false;}}).join('|');if(next!==signature){signature=next;render(results);}setTimeout(refresh,1000);}
 setTimeout(refresh,1000);window.addEventListener('beforeunload',()=>{disposed=true;});
 return {ready,connected,render,change,get selected(){return [...(selected||[])];}};
})();
