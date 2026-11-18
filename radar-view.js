'use strict';
// Presentation only: no API, timers, storage writes or navigation without a click.
const RADAR_VIEW=(()=>{
 const views=new WeakMap();
 function element(tag,cls){const e=document.createElement(tag);if(cls)e.className=cls;return e;}
 function text(e,value){if(e.textContent!==value)e.textContent=value;}
 function hidden(e,value){if(e.hidden!==value)e.hidden=value;}
 function create(symbol,actions){
  const card=element('article','dynamic-card'),name=element('strong'),trend=element('p','muted'),signal=element('div','room-direction'),method=element('p','signal-source'),reason=element('p','simple-reason'),age=element('p','muted'),emitted=element('p','muted'),expires=element('p','muted'),evidence=element('p','muted'),open=element('button'),favorite=element('button');
  card.dataset.symbol=symbol;card.append(name,trend,signal,method,reason,age,emitted,expires,evidence,open,favorite);
  text(open,'Ir a Deriv');open.addEventListener('click',()=>actions.open(symbol));favorite.addEventListener('click',()=>actions.favorite(symbol));
  return {card,name,trend,signal,method,reason,age,emitted,expires,evidence,favorite};
 }
 function render(area,rows,now,connected,favorites,actions){
  let view=views.get(area);if(!view){view={cards:new Map(),empty:element('p','muted')};text(view.empty,'Todavía no hay resultados; conecta para iniciar el radar progresivo.');views.set(area,view);}
  const unique=[...new Map(rows.map(r=>[r.symbol,r])).values()].slice(0,MARKET_CORE.RADAR_LIMIT),wanted=new Set(unique.map(r=>r.symbol));
  for(const [symbol,v] of view.cards)if(!wanted.has(symbol)){v.card.remove();view.cards.delete(symbol);}
  if(unique.length)view.empty.remove();else if(!view.empty.parentNode)area.append(view.empty);
  unique.forEach((r,index)=>{
   let v=view.cards.get(r.symbol);if(!v){v=create(r.symbol,actions);view.cards.set(r.symbol,v);}
   const state=MARKET_CORE.state(r,now,connected),live=state==='confirmed',color=live?(r.direction==='SUBE'?'rise':'fall'):state==='observation'?'observation':'inactive';
   const cls='dynamic-card radar-'+color;if(v.card.className!==cls)v.card.className=cls;
   if(v.card.dataset.state!==state)v.card.dataset.state=state;
   text(v.name,r.name||r.symbol);text(v.trend,(r.family||'Sin familia')+' · Tendencia: '+(r.trend||'sin datos'));
   text(v.signal,live?(r.direction==='SUBE'?'RISE':'FALL'):({observation:'SIN CONFIRMACIÓN',expired:'Caducada',stale:'Datos antiguos',closed:'Mercado cerrado',error:'Error de datos',connection:'Sin conexión fiable',unsupported:'Sin estrategia compatible',pending:'Pendiente de análisis'}[state]||'Sin datos'));
   text(v.method,r.method?r.method+'@'+r.version:'Sin método disponible');text(v.reason,r.reason||'Esperando velas cerradas y actualizadas.');
   text(v.age,Number.isFinite(now)&&Number.isFinite(r.sourceCloseAt)?(r.technical?.score?'Puntuación TA original '+r.technical.score.value+' (no probabilidad; no califica este método) · ':'')+'Datos cerrados hace '+Math.max(0,Math.floor(now-r.sourceCloseAt))+' s':'Antigüedad no disponible');
   hidden(v.emitted,!live);hidden(v.expires,!live);
   if(live){text(v.emitted,'Emitida '+new Date(r.emittedAt*1000).toLocaleTimeString());text(v.expires,Math.max(0,Math.floor(r.expiresAt-now))+' s de vigencia restantes');}
   text(v.evidence,`Evidencia experimental · ${r.prospectiveN||0} cohortes prospectivas evaluadas · sin ventaja demostrada`);
   const selected=favorites.includes(r.symbol);text(v.favorite,selected?'Ya está en favoritos':'Añadir a favoritos');const disabled=selected||favorites.length>=7;if(v.favorite.disabled!==disabled)v.favorite.disabled=disabled;
   if(area.children[index]!==v.card)area.insertBefore(v.card,area.children[index]||null);
  });
 }
 return {render};
})();
