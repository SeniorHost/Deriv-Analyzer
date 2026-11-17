const {test}=require('node:test');const assert=require('node:assert/strict');const {harness,candles}=require('./harness.cjs');
test('full 12-symbol scan, bounded workers, real indicators, registration and CSV exports',async()=>{
 const all=candles(2401);let active=0,max=0;
 const h=harness({respond(s,m,ctx){if(m.time||m.active_symbols)return;active++;max=Math.max(max,active);const respond=body=>{active--;s.emit({req_id:m.req_id,...body});};
  if(m.ticks_history){const end=m.end==='latest'?Infinity:Number(m.end);queueMicrotask(()=>respond({candles:all.filter(c=>c.epoch<=end).slice(-m.count)}));}
  else if(m.ticks){ctx.setTimeout(()=>respond({tick:{epoch:h.now(),quote:103},subscription:{id:'sub'+m.req_id}}),2000);}
  else queueMicrotask(()=>respond(m.forget?{forget:1}:{ping:'pong'}));
 }});
 const s=await h.ready();h.run("symbols=Array.from({length:12},(_,i)=>({symbol:'VOL_'+i,display_name:'Volatility '+i,market:'synthetic'}))");
 const p=h.run('scan(false)');await h.flush();await h.tick(10000);await p;
 assert.equal(h.run('results.length'),12);assert.equal(h.run('results.filter(r=>r.error).length'),0);assert.equal(h.run('scanning'),false);assert.ok(max<=3);assert.equal(s.sent.filter(m=>m.ticks_history).length,36);
 assert.equal(h.run('results[0].samples'),2400);assert.ok(h.run('allTrades.length')>0);
 h.run('exportCsv();exportTrades();exportForward()');assert.equal(h.downloads.filter(x=>x instanceof Blob).length,3);assert.equal(h.get('scan').disabled,false);
 assert.ok(s.sent.every(m=>['req_id','time','active_symbols','ticks_history','end','count','style','granularity','ticks','subscribe','forget','ping'].includes(Object.keys(m)[0])));
 assert.equal(s.sent.some(m=>m.buy||m.sell||m.proposal||m.authorize),false);
});
test('manual cancel keeps already-completed results and prevents automatic navigation',async()=>{
 const h=harness();const s=await h.ready();h.get('auto').checked=true;const p=h.run('scan(true)');await h.flush();const req=s.sent.find(m=>m.ticks_history);h.run('cancelScan=true');s.emit({req_id:req.req_id,candles:candles(801)});await p;assert.equal(h.run('scanning'),false);assert.equal(h.run('forwardRecords.length'),0);assert.equal(h.get('cancel').disabled,true);assert.match(h.get('count').textContent,/Cancelado/);
});
