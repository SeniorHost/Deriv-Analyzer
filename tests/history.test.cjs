const {test}=require('node:test');const assert=require('node:assert/strict');const {harness,candles}=require('./harness.cjs');
test('raw candles reject null, invalid OHLC, non-minute timestamps and deduplicate',()=>{
 const h=harness();h.ctx.input=[...candles(3),null,{epoch:1800000060,open:null,high:2,low:1,close:1},{epoch:1800000061,open:1,high:2,low:1,close:1},...candles(1)];assert.equal(h.run('rawCandles({candles:input}).length'),3);
});
test('clock uncertainty excludes a just-closed candle',async()=>{
 const h=harness();await h.ready();h.ctx.input=candles(100);h.run('clockAnchor.epochMs=1800000000000;clockAnchor.monotonic=performance.now()');assert.equal(h.run('validateCandles(input).at(-1).epoch'),1799999880);
});
test('cold history paginates backwards and returns 2400 closed candles',async()=>{
 const h=harness();const s=await h.ready();h.run('cancelScan=false');const p=h.run('loadHistory("1HZ10V")');await h.flush();
 const all=candles(2401);for(let i=0;i<3;i++){const m=s.sent.filter(m=>m.ticks_history).at(-1);const chunk=i===0?all.slice(-801):i===1?all.slice(800,1600):all.slice(0,800);if(i>0)assert.equal(Number(m.end),chunk.at(-1).epoch+59);s.emit({req_id:m.req_id,candles:chunk});await h.flush();}
 const result=await p;assert.equal(result.candles.length,2400);assert.equal(result.pages,3);assert.equal(result.candles.at(-1).epoch,1799999940);
});
test('cache needs zero calls within same closed minute and a small incremental query later',async()=>{
 const h=harness();const s=await h.ready();h.ctx.input=candles(2400,1799999940);h.run('cancelScan=false;historyCache.set("1HZ10V",{candles:input})');const cached=await h.run('loadHistory("1HZ10V")');assert.equal(cached.pages,0);assert.equal(s.sent.filter(m=>m.ticks_history).length,0);
 await h.tick(60000);const p=h.run('loadHistory("1HZ10V")');await h.flush();const m=s.sent.findLast(m=>m.ticks_history);assert.ok(m.count<=5);s.emit({req_id:m.req_id,candles:candles(4,1800000060)});const result=await p;assert.equal(result.candles.length,2400);assert.equal(result.candles.at(-1).epoch,1800000000);
});
test('transport failure does not multiply historical queries',async()=>{
 const h=harness();const s=await h.ready();h.ctx.input=candles(100,1799999880);h.run('cancelScan=false;historyCache.set("1HZ10V",{candles:input})');const p=h.run('loadHistory("1HZ10V")');p.catch(()=>{});await h.flush();const m=s.sent.findLast(m=>m.ticks_history);s.emit({req_id:m.req_id,error:{message:'rate limit'}});await assert.rejects(p,/rate limit/);assert.equal(s.sent.filter(m=>m.ticks_history).length,1);
});
test('cancel during pagination stops further pages',async()=>{
 const h=harness();const s=await h.ready();h.run('cancelScan=false');const p=h.run('loadHistory("1HZ10V")');p.catch(()=>{});await h.flush();const m=s.sent.findLast(m=>m.ticks_history);h.run('cancelScan=true');s.emit({req_id:m.req_id,candles:candles(801)});await assert.rejects(p,/Cancelado/);assert.equal(s.sent.filter(m=>m.ticks_history).length,1);
});
