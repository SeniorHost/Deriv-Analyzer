const {test}=require('node:test');
const assert=require('node:assert/strict');
const {harness}=require('./harness.cjs');
test('controls wait for time and nonempty normalized catalog',async()=>{
 const h=harness();h.run('connect()');const s=h.sockets[0];assert.equal(h.get('scan').disabled,true);s.open();await h.flush();
 s.emit({req_id:s.sent[0].req_id,time:h.now()});await h.flush();assert.equal(h.get('scan').disabled,true);
 const req=s.sent.find(m=>m.active_symbols);s.emit({req_id:req.req_id,active_symbols:[{underlying_symbol:'1HZ10V'}]});await h.flush();
 assert.equal(h.get('scan').disabled,false);assert.equal(h.run('symbols[0].symbol'),'1HZ10V');
});
test('connecting sockets have a deadline and retry without monitoring',async()=>{
 const h=harness();h.run('connect()');await h.tick(12000);assert.equal(h.run('ws'),null);await h.tick(2000);assert.equal(h.sockets.length,2);
});
test('invalid time or empty catalog prevents readiness',async()=>{
 for(const failure of ['time','catalog']){const h=harness();h.run('connect()');const s=h.sockets[0];s.open();await h.flush();s.emit({req_id:s.sent[0].req_id,time:failure==='time'?null:h.now()});await h.flush();if(failure==='catalog'){const m=s.sent.find(m=>m.active_symbols);s.emit({req_id:m.req_id,active_symbols:[]});await h.flush();}assert.equal(h.get('scan').disabled,true);assert.equal(h.run('apiReady'),false);assert.equal(h.run('ws'),null);}
});
test('reconnection invalidates old clock and ignores old callbacks',async()=>{
 const h=harness();const old=await h.ready();const staleClose=old.onclose;h.run('connect()');staleClose({code:1006});assert.equal(h.run('clockUsable()'),false);assert.equal(h.run('ws===null'),false);assert.equal(h.run('reconnectTimer'),null);
});
test('a local wall clock jump cannot shift synchronized server time',async()=>{
 const h=harness();await h.ready();const before=h.run('serverNowMs()');h.setWall(1);await h.tick(1000);assert.equal(h.run('serverNowMs()'),before+1000);
});
test('late clock reply from old session cannot overwrite new session',async()=>{
 const h=harness();const old=await h.ready();const promise=h.run('syncServerClock()');promise.catch(()=>{});const req=old.sent.at(-1),callback=old.onmessage;
 h.run('connect()');callback({data:JSON.stringify({req_id:req.req_id,time:1900000000})});await assert.rejects(promise,/Reconectando/);assert.equal(h.run('clockUsable()'),false);
});
test('send exceptions clean pending requests and timers',async()=>{
 const h=harness();const s=await h.ready();s.throwSend=true;await assert.rejects(h.run('request({ping:1})'),/send failed/);assert.equal(h.run('pending.size'),0);
});
test('API errors, malformed JSON, response correlation and timeout',async()=>{
 const h=harness();const s=await h.ready();const p=h.run('request({ping:1},100)');p.catch(()=>{});s.onmessage({data:'bad JSON'});s.emit(null);s.emit({req_id:999,ping:'pong'});assert.equal(h.run('pending.size'),1);await h.tick(100);await assert.rejects(p,/timeout/);assert.equal(h.run('pending.size'),0);
 const p2=h.run('request({ping:1})');s.emit({req_id:s.sent.at(-1).req_id,error:{message:'rate limit'}});await assert.rejects(p2,/rate limit/);
});
test('heartbeat closes silent open socket after two missing pongs',async()=>{
 const h=harness();await h.ready();await h.tick(78000);assert.equal(h.run('ws'),null);assert.equal(h.run('pending.size'),0);
});
test('backoff stops after six retries and manual connect resets it',async()=>{
 const h=harness();h.run('connect()');for(let i=0;i<7;i++){h.sockets.at(-1).onerror();await h.tick(i<6?Math.min(30000,2000*2**i):0);}assert.equal(h.sockets.length,7);assert.equal(h.run('reconnectTimer'),null);h.run('connect()');assert.equal(h.run('reconnectAttempts'),0);
});
test('one-shot tick observation forgets its subscription and late orphan',async()=>{
 const h=harness();const s=await h.ready();const p=h.run('request({ticks:"1HZ10V",subscribe:1},1000,m=>m.tick.epoch>=10)');const req=s.sent.at(-1);
 s.emit({req_id:req.req_id,subscription:{id:'sub'},tick:{epoch:9}});assert.equal(h.run('pending.size'),1);
 s.emit({req_id:req.req_id,subscription:{id:'sub'},tick:{epoch:10}});await p;
 assert.ok(s.sent.some(m=>m.forget==='sub'));
 s.emit({req_id:999,subscription:{id:'orphan'},tick:{epoch:10}});assert.ok(s.sent.some(m=>m.forget==='orphan'));
});
test('timed out observation cancels a known subscription',async()=>{
 const h=harness();const s=await h.ready();const p=h.run('request({ticks:"1HZ10V",subscribe:1},100,()=>false)');p.catch(()=>{});s.emit({req_id:s.sent.at(-1).req_id,subscription:{id:'sub'},tick:{epoch:1}});await h.tick(100);await assert.rejects(p,/timeout/);assert.ok(s.sent.some(m=>m.forget==='sub'));
});
test('a successful reconnect resumes monitoring only after fresh initialization',async()=>{
 const h=harness();const old=await h.ready();h.run('toggleWatch()');old.onclose({code:1006});assert.equal(h.run('watchTimer'),null);await h.tick(2000);const s=h.sockets.at(-1);s.open();await h.flush();s.emit({req_id:s.sent.find(m=>m.time).req_id,time:h.now()});await h.flush();assert.equal(h.run('watchTimer'),null);s.emit({req_id:s.sent.find(m=>m.active_symbols).req_id,active_symbols:[{symbol:'1HZ10V'}]});await h.flush();assert.equal(h.run('watchOn'),true);assert.notEqual(h.run('watchTimer'),null);assert.equal(h.run('apiReady'),true);
});
test('excessive clock RTT is rejected and stale clocks block scans',async()=>{
 const h=harness();h.run('connect()');const s=h.sockets[0];s.open();await h.flush();await h.tick(5000);s.emit({req_id:s.sent[0].req_id,time:h.now()});await h.flush();assert.equal(h.run('apiReady'),false);
 const h2=harness();await h2.ready();h2.run('clockAnchor.monotonic=-CLOCK_MAX_AGE-1');await h2.run('scan()');assert.equal(h2.run('scanning'),false);assert.throws(()=>h2.run('serverNow()'),/caducada/);
});
test('a new socket gets its own allowance of missed heartbeat replies',async()=>{
 const h=harness();await h.ready();h.run('missedPings=2;connect()');const s=h.sockets.at(-1);s.open();assert.equal(h.run('missedPings'),0);
});
