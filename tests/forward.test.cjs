const {test}=require('node:test');const assert=require('node:assert/strict');
const {harness,record}=require('./harness.cjs');
function row(h){return {symbol:'1HZ10V',name:'Volatility',direction:'SUBE',close:100,lastTime:Math.floor(h.now()/60)*60-60,score:70};}
async function observe(h,s,r=row(h),horizon=5){h.ctx.row=r;const p=h.run(`registerForwardItem(row,${horizon})`);await h.flush();const req=s.sent.findLast(m=>m.ticks);return {p,req};}
test('entry waits for a tick after signal, uses tick price and frozen horizon',async()=>{
 const h=harness();const s=await h.ready();h.run('cancelScan=false');await h.tick(500);
 const {p,req}=await observe(h,s);h.get('horizon').value='1';
 s.emit({req_id:req.req_id,subscription:{id:'s'},tick:{epoch:h.now()-1,quote:90}});await h.flush();assert.equal(h.run('forwardRecords.length'),0);
 await h.tick(2000);s.emit({req_id:req.req_id,subscription:{id:'s'},tick:{epoch:h.now(),quote:101}});await p;
 assert.equal(h.records()[0].entry,101);assert.equal(h.records()[0].exitTime-h.records()[0].entryTime,300);assert.ok(h.records()[0].entryTime>=h.records()[0].signalTime);assert.equal(h.run('forwardStats.saved'),1);
 await h.run('registerForwardItem(row,5)');assert.equal(h.run('forwardStats.duplicate'),1);
});
test('storage restoration finishes before registration and preserves existing records',async()=>{
 let release;const h=harness({get:()=>new Promise(r=>release=r)});const s=await h.ready();h.run('cancelScan=false');const p=h.run('registerForwardItem({symbol:"1HZ10V",direction:"ESPERAR",close:1,lastTime:1800000000},5)');await h.flush();assert.equal(s.sent.filter(m=>m.ticks).length,0);release({deriv_analyzer_forward_v16:[record()]});await p;assert.equal(h.run('forwardRecords.length'),1);
});
test('failed storage restore never overwrites existing unknown storage',async()=>{
 const h=harness({records:{unknown:'data'}});await h.ready();h.run('cancelScan=false');await assert.rejects(h.run('registerForwardItem({})'),/Almacenamiento/);assert.equal(h.writes.length,0);
});
test('storage write failure is not reported as saved; pending stays in memory',async()=>{
 const h=harness();const s=await h.ready();h.run('cancelScan=false');h.failWrite(true);const {p,req}=await observe(h,s);await h.tick(2000);s.emit({req_id:req.req_id,subscription:{id:'s'},tick:{epoch:h.now(),quote:100}});await p;
 assert.equal(h.run('forwardStats.saved'),0);assert.equal(h.run('forwardRecords.length'),1);assert.match(h.get('log').textContent,/solo en memoria/);
 h.failWrite(false);await h.run('persistForward()');assert.equal(h.records().length,1);
});
test('retention removes resolved records before pending records',async()=>{
 const h=harness();await h.flush();h.ctx.old=record();h.run("forwardRecords=Array.from({length:1500},(_,i)=>({...old,id:String(i)}));forwardRecords.push({...old,id:'resolved',status:'ACIERTO'});trimForward()");assert.equal(h.run('forwardRecords.length'),1500);assert.equal(h.run("forwardRecords.some(r=>r.id==='0')"),true);assert.equal(h.run("forwardRecords.some(r=>r.id==='resolved')"),false);
});
test('queued writes capture immutable snapshots',async()=>{
 const h=harness({records:[record()]});await h.flush();const p=h.run("const write=persistForward();forwardRecords[0].entry=200;write");await p;assert.equal(h.records()[0].entry,100);
});
test('settlement selects final tick at or before expiry and persists outcome',async()=>{
 const h=harness({records:[record()]});const s=await h.ready();const p=h.run('checkForward()');await h.flush();const m=s.sent.findLast(m=>m.ticks_history);assert.equal(m.end,'1799999900');s.emit({req_id:m.req_id,history:{times:[1799999899,1799999900,1799999901],prices:[99,101,1]}});await p;assert.equal(h.records()[0].exit,101);assert.equal(h.records()[0].status,'ACIERTO');assert.equal(h.records()[0].exitQuoteTime,1799999900);
});
test('stale settlement ticks stay pending, malformed records never queried',async()=>{
 const h=harness({records:[record(),record({id:'bad',direction:'OTHER'}),null]});const s=await h.ready();const p=h.run('checkForward()');await h.flush();const requests=s.sent.filter(m=>m.ticks_history);assert.equal(requests.length,1);s.emit({req_id:requests[0].req_id,history:{times:[1799999880],prices:[101]}});await p;assert.equal(h.run('forwardRecords[0].status'),'PENDIENTE');h.run('exportForward()');assert.equal(h.downloads.length,2);
});
test('legacy candle records settle separately and do not inflate tick success rate',async()=>{
 const legacy=record({priceBasis:undefined});const h=harness({records:[legacy]});const s=await h.ready();const p=h.run('checkForward()');await h.flush();const m=s.sent.findLast(m=>m.ticks_history);assert.equal(m.style,'candles');
 // Legacy candle exits are aligned to a minute.
 s.emit({req_id:m.req_id,candles:[]});await p;assert.equal(h.run('forwardRecords[0].status'),'PENDIENTE');
 h.run("forwardRecords[0].status='ACIERTO';renderForward()");assert.match(h.get('forwardCount').textContent,/sin tasa/);
});
test('reconnection during a quote never records it in the new session',async()=>{
 const h=harness();const s=await h.ready();h.run('cancelScan=false');const {p}=await observe(h,s);h.run('connect()');await p;assert.equal(h.run('forwardRecords.length'),0);
});
test('unknown directions and malformed numeric history cannot generate outcomes',()=>{
 const h=harness();assert.throws(()=>h.run("FORWARD.outcome(1,2,'OTHER')"),/inválidos/);assert.throws(()=>h.run("FORWARD.outcome(NaN,2,'SUBE')"),/inválidos/);
 assert.equal(h.run("FORWARD.exitTick({history:{times:[100,101],prices:[2]}},101).ok"),false);
 assert.equal(h.run("FORWARD.currentTick({tick:{epoch:100,quote:1}},NaN).ok"),false);
 for(const [direction,exit,want] of [['SUBE',2,'ACIERTO'],['BAJA',2,'FALLO'],['SUBE',1,'EMPATE'],['BAJA',.5,'ACIERTO']])assert.equal(h.run(`FORWARD.outcome(1,${exit},'${direction}')`),want);
});
test('settlement waits for expiry and keeps Fall and ties distinct',async()=>{
 const h=harness({records:[record({id:'fall',direction:'BAJA'}),record({id:'tie'}),record({id:'future',entryTime:1800000000,exitTime:1800000300})]});const s=await h.ready();const p=h.run('checkForward()');await h.flush();const req=s.sent.filter(m=>m.ticks_history);assert.equal(req.length,2);s.emit({req_id:req[0].req_id,history:{times:[1799999900],prices:[99]}});s.emit({req_id:req[1].req_id,history:{times:[1799999900],prices:[100]}});await p;assert.equal(h.records()[0].status,'ACIERTO');assert.equal(h.records()[1].status,'EMPATE');assert.equal(h.records()[2].status,'PENDIENTE');
});
test('legacy candle results use an exact closed candle at expiry',async()=>{
 const h=harness({records:[record({priceBasis:'CANDLE_CLOSE_LEGACY',entryTime:1799999580,exitTime:1799999880})]});const s=await h.ready();const p=h.run('checkForward()');await h.flush();const m=s.sent.findLast(m=>m.ticks_history);s.emit({req_id:m.req_id,candles:[{epoch:1799999820,open:100,high:102,low:99,close:101}]});await p;assert.equal(h.records()[0].status,'ACIERTO');assert.equal(h.records()[0].exitQuoteTime,1799999880);assert.match(h.get('forwardCount').textContent,/1 heredadas/);
});
test('failed settlement write reports in-memory result separately from persisted results',async()=>{
 const h=harness({records:[record()]});const s=await h.ready();h.failWrite(true);const p=h.run('checkForward()');await h.flush();const m=s.sent.findLast(m=>m.ticks_history);s.emit({req_id:m.req_id,history:{times:[1799999900],prices:[101]}});await p;assert.equal(h.records()[0].status,'PENDIENTE');assert.equal(h.run('forwardRecords[0].status'),'ACIERTO');assert.match(h.get('log').textContent,/0 señales resueltas.*1 resultados solo en memoria/);
});
test('two panels serialize read-merge-write and cannot erase records or downgrade results',async()=>{
 let value=[record()],queue=Promise.resolve();
 const storage={get:async()=>structuredClone({deriv_analyzer_forward_v16:value}),set:async data=>{await Promise.resolve();value=structuredClone(data.deriv_analyzer_forward_v16);}};
 const locks={request(_name,fn){const p=queue.then(fn);queue=p.catch(()=>{});return p;}};
 const a=harness({storage,locks}),b=harness({storage,locks});await a.flush();await b.flush();
 a.run("forwardRecords[0].status='ACIERTO';forwardRecords[0].exit=101");b.ctx.newRecord=record({id:'second'});b.run('forwardRecords.push(newRecord)');
 await Promise.all([a.run('persistForward()'),b.run('persistForward()')]);assert.equal(value.length,2);assert.equal(value.find(r=>r.id==='test').status,'ACIERTO');assert.equal(b.run('forwardRecords[0].status'),'ACIERTO');
 b.run("forwardRecords[0].status='PENDIENTE'");await b.run('persistForward()');assert.equal(value.find(r=>r.id==='test').status,'ACIERTO');
});
test('concurrent duplicate observations keep the first durable entry price',()=>{
 const h=harness();h.ctx.first=record();h.ctx.second=record({entry:200});assert.equal(h.run('FORWARD.mergeRecords([first],[second],[])[0].entry'),100);
});
