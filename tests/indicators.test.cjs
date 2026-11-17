const {test}=require('node:test');const assert=require('node:assert/strict');const {harness,candles}=require('./harness.cjs');
function copy(v){return JSON.parse(JSON.stringify(v));}
test('all indicator values and signals equal prefix-only calculations (no future data)',()=>{
 const h=harness();h.ctx.input=candles(400);const full=copy(h.run('TA.calculate(input)'));
 for(let n=61;n<=400;n+=7){h.ctx.n=n;const prefix=copy(h.run('TA.calculate(input.slice(0,n))'));for(const k of ['e9','e21','e50','r','a'])assert.deepEqual(prefix[k],full[k].slice(0,n));for(const k of ['diff','signal','hist'])assert.deepEqual(prefix.m[k],full.m[k].slice(0,n));assert.deepEqual(copy(h.run('TA.signal(input,TA.calculate(input),n-1)')),copy(h.run('TA.signal(input.slice(0,n),TA.calculate(input.slice(0,n)),n-1)')));}
});
test('constant prices produce EMA 100, RSI 50, MACD zero and ATR 2',()=>{
 const h=harness();h.ctx.input=candles(100).map(c=>({...c,open:100,close:100,high:101,low:99}));h.run('globalThis.calc=TA.calculate(input)');assert.equal(h.run('calc.e9[99]'),100);assert.equal(h.run('calc.e21[99]'),100);assert.equal(h.run('calc.r[99]'),50);assert.equal(h.run('calc.m.hist[99]'),0);assert.equal(h.run('calc.a[99]'),2);
});
test('EMA and Wilder RSI/ATR match independent reference calculations',()=>{
 const h=harness();const c=candles(120);h.ctx.input=c;const t=copy(h.run('TA.calculate(input)'));let ema=c.slice(0,9).reduce((a,v)=>a+v.close,0)/9;for(let i=9;i<c.length;i++)ema=c[i].close*.2+ema*.8;assert.ok(Math.abs(ema-t.e9.at(-1))<1e-10);
 let gain=0,loss=0;for(let i=1;i<=14;i++){const d=c[i].close-c[i-1].close;gain+=Math.max(d,0)/14;loss+=Math.max(-d,0)/14;}for(let i=15;i<c.length;i++){const d=c[i].close-c[i-1].close;gain=(gain*13+Math.max(d,0))/14;loss=(loss*13+Math.max(-d,0))/14;}assert.ok(Math.abs(100-100/(1+gain/loss)-t.r.at(-1))<1e-10);
 let atr=0;const tr=c.map((v,i)=>i?Math.max(v.high-v.low,Math.abs(v.high-c[i-1].close),Math.abs(v.low-c[i-1].close)):v.high-v.low);atr=tr.slice(0,14).reduce((a,b)=>a+b,0)/14;for(let i=14;i<c.length;i++)atr=(atr*13+tr[i])/14;assert.ok(Math.abs(atr-t.a.at(-1))<1e-10);
});
test('gaps restart indicator warmup instead of joining disconnected minutes',()=>{
 const h=harness();h.ctx.input=candles(180).map((c,i)=>({...c,epoch:c.epoch+(i>=100?60:0)}));assert.equal(h.run('TA.calculate(input).e9[100]'),null);assert.equal(h.run('TA.calculate(input).m.hist[120]'),null);assert.equal(h.run('TA.signal(input,TA.calculate(input),120).dir'),'ESPERAR');
});
test('backtest uses actual close timestamps, last 30%, fixed horizon and non-overlap',()=>{
 const h=harness();h.ctx.input=candles(1000);const r=copy(h.run('VALIDATION.run(input,TA.calculate(input),5,"TEST")'));assert.ok(r.n>0);
 let previous=0;for(const t of r.records){assert.ok(t.entryTime>=h.ctx.input[700].epoch+60);assert.equal(t.exitTime-t.entryTime,300);assert.ok(t.entryTime>previous);previous=t.exitTime;const i=h.ctx.input.findIndex(c=>c.epoch+60===t.entryTime);assert.equal(t.entry,h.ctx.input[i].close);assert.equal(t.exit,h.ctx.input[i+5].close);const signal=copy(h.run(`TA.signal(input.slice(0,${i+1}),TA.calculate(input.slice(0,${i+1})),${i})`));assert.equal(t.direction,signal.dir);}
 assert.equal(r.win+r.lose+r.tie,r.n);assert.deepEqual(copy(h.run('TA.backtest(input,TA.calculate(input),5)')),{win:r.win,lose:r.lose,tie:r.tie,n:r.n,rate:r.rate});
});
test('invalid horizons fail fast and Wilson matches known limits',()=>{
 const h=harness();for(const n of [0,-1,1.5,Infinity])assert.throws(()=>h.run(`VALIDATION.run([],{},${n},'X')`),/Horizonte/);assert.equal(h.run('VALIDATION.wilson(0,0).low'),0);assert.equal(h.run('VALIDATION.wilson(0,0).high'),1);assert.ok(Math.abs(h.run('VALIDATION.wilson(50,100).low')-.40382982859014716)<1e-6);
});
