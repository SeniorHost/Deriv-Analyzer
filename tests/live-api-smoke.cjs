// Optional network check; default test suite stays offline and deterministic.
const {execFileSync}=require('node:child_process');const path=require('node:path');const assert=require('node:assert/strict');const {harness}=require('./harness.cjs');
(async()=>{
 const data=JSON.parse(execFileSync('python3',[path.join(__dirname,'live-api-probe.py')],{encoding:'utf8',timeout:90000,maxBuffer:4*1024*1024}));
 const h=harness();await h.ready();h.ctx.data=data;
 h.run('clockAnchor.epochMs=data.time*1000;clockAnchor.monotonic=performance.now()');
 const candles=h.run('validateCandles(rawCandles({candles:data.chunks.flat()})).slice(-2400)');assert.equal(candles.length,2400);
 h.ctx.candles=candles;const validation=h.run('VALIDATION.run(candles,TA.calculate(candles),5,"1HZ10V")');
 assert.ok(validation.records.every(r=>r.exitTime-r.entryTime===300));
 assert.equal(h.run('FORWARD.currentTick(data.tick,data.tick.tick.epoch).ok'),true);
 assert.equal(h.run('FORWARD.exitTick(data.history,data.expiry).ok'),true);
 assert.equal(data.ping.ping,'pong');
 console.log(JSON.stringify({result:'PASS',publicCatalog:data.catalogCount,closedCandles:candles.length,validationCases:validation.n,tickSubscriptionAndForget:true,historicalExpiryTick:true,ping:true}));
})().catch(error=>{console.error(error);process.exitCode=1;});
