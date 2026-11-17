'use strict';
// Selection and technical alerts only. No trading instructions or account access.
const ROOM=(()=>{
 const KEY='deriv_analyzer_room_v1',MAX=12;
 const valid=s=>typeof s==='string'&&/^[A-Za-z0-9_]{2,30}$/.test(s);
 function selection(value){if(!Array.isArray(value)||value.some(s=>!valid(s)))throw new Error('Selección inválida');const unique=[...new Set(value)];if(unique.length>MAX)throw new Error('Selección inválida');return unique;}
 function defaults(catalog){const preferred=catalog.filter(s=>/synthetic|volatility/i.test([s.market,s.display_name].join(' ')));return [...new Set([...preferred,...catalog].map(s=>s.symbol))].slice(0,6);}
 function pool(catalog,selected){const byId=new Map(catalog.map(s=>[s.symbol,s]));return [...new Set([...selected,...catalog.map(s=>s.symbol)])].filter(s=>byId.has(s)).slice(0,MAX).map(s=>byId.get(s));}
 function change(selected,old,next){selected=selection(selected);if(old!==null&&!selected.includes(old))throw new Error('El activo que deseas reemplazar ya no está seleccionado');if(!valid(next))throw new Error('Selecciona un activo válido');if(selected.includes(next)&&old!==next)throw new Error('Ese activo ya está en tu sala');const value=old!==null?selected.map(s=>s===old?next:s):[...selected,next];return selection(value);}
 function alert(row,now){const at=row.lastTime+60,until=at+60;return {id:`${row.symbol}|${row.lastTime}`,at,until,active:!row.error&&['SUBE','BAJA'].includes(row.direction)&&Number.isFinite(at)&&now>=at&&now<until};}
 function suggestions(rows,selected,now){
  const current=rows.filter(r=>selected.includes(r.symbol)&&alert(r,now).active);
  const floor=current.length?Math.min(...current.map(r=>r.score)):0;
  return rows.filter(r=>!selected.includes(r.symbol)&&alert(r,now).active&&r.score>=60&&r.score>=floor+10&&r.back?.enough).sort((a,b)=>b.score-a.score).slice(0,3);
 }
 return {KEY,MAX,valid,selection,defaults,pool,change,alert,suggestions};
})();
