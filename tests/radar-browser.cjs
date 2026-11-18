// Radar integration with real Chromium DOM and a controlled read-only API simulation.
const {chromium}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),http=require('node:http');
(async()=>{
 const root=path.resolve(__dirname,'..'),files=new Set(['panel.html','style.css',...require('node:fs').readdirSync(root).filter(f=>f.endsWith('.js'))]);
 const server=http.createServer(async(req,res)=>{const name=req.url.split('?')[0].slice(1);if(!files.has(name)){res.writeHead(404);return res.end();}res.setHeader('Content-Type',name.endsWith('.js')?'application/javascript':name.endsWith('.css')?'text/css':'text/html');res.end(await fs.readFile(path.join(root,name)));});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
 try{
  const page=await browser.newPage(),errors=[],sent=[],gates=new Map();let sockets=0;
  const vol=['R_10','R_25','R_50','R_75','R_100','1HZ10V','1HZ15V','1HZ25V','1HZ30V','1HZ50V','1HZ75V','1HZ90V','1HZ100V'];
  const catalog=[...vol.map(symbol=>({underlying_symbol:symbol,underlying_symbol_name:symbol,market:'synthetic_index',submarket:'random_index',underlying_symbol_type:'stockindex'})),...Array.from({length:17},(_,i)=>({underlying_symbol:'frxTEST'+String(i).padStart(2,'0'),market:'forex',underlying_symbol_type:'forex'}))];
  const base=Math.floor(Date.now()/60000)*60+10,started=Date.now(),time=()=>base+(Date.now()-started)/1000;
  page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(favorites=>{const data={deriv_scanner_favorites_v1:{version:1,selection:favorites,seen:[]},deriv_scanner_settings_v1:{requestsPerMinute:120,concurrency:2,refreshSeconds:180}};globalThis.__messages=[];globalThis.chrome={storage:{local:{get:async key=>({[key]:structuredClone(data[key])}),set:async values=>Object.assign(data,structuredClone(values))}},runtime:{sendMessage(m,cb){__messages.push(m);cb?.({ok:true});}}};},vol.slice(0,7));
  await page.routeWebSocket('wss://api.derivws.com/**',socket=>{sockets++;socket.onMessage(raw=>{
   const m=JSON.parse(raw);sent.push(m);const respond=data=>socket.send(JSON.stringify({req_id:m.req_id,...data}));
   if(m.time)return respond({time:Math.floor(time())});
   if(m.active_symbols)return respond({active_symbols:catalog});
   if(m.ping)return respond({ping:'pong'});
   if(m.forget)return respond({forget:1});
   if(!m.ticks_history)throw new Error('Unexpected API request '+JSON.stringify(m));
   const deliver=()=>{const end=m.end==='latest'?Math.floor(time()/60)*60:Math.floor(Number(m.end)/60)*60;respond({candles:Array.from({length:m.count},(_,i)=>{const close=100+Math.sin((end/60-m.count+i)/4);return {epoch:end-(m.count-1-i)*60,open:close-.01,close,high:close+.2,low:close-.2};})});};
   if(['frxTEST14','frxTEST15'].includes(m.ticks_history)&&!gates.has(m.ticks_history))gates.set(m.ticks_history,deliver);else deliver();
  });});
  await page.goto('http://127.0.0.1:'+server.address().port+'/panel.html');
  // Deterministic signal fixtures isolate scheduling/rendering from the already-tested rule engine.
  await page.evaluate(()=>{
   const analyze=MARKET_STRATEGIES.analyze;MARKET_STRATEGIES.analyze=(item,c,now,sequence)=>{if(!ADAPTIVE.valid(c,now))throw new Error('Invalid/open candles in pipeline');const r=analyze(item,c,now,sequence);const directions={R_10:'SUBE',R_25:'BAJA',frxTEST15:'BAJA',frxTEST16:'SUBE'};return {...r,direction:directions[item.symbol]||'ESPERAR',method:'browser-fixture',version:'test',reason:'Controlled scheduling fixture'};};
   globalThis.__entryWaiters=[];registerForwardItem=async row=>{if(['R_10','R_25'].includes(row.symbol))await new Promise(resolve=>__entryWaiters.push(resolve));};
  });
  await page.click('#connect');
  const rise=page.locator('#dynamicCards [data-symbol="R_10"]'),fall=page.locator('#dynamicCards [data-symbol="R_25"]');
  await page.waitForFunction(()=>__entryWaiters.length===2&&document.querySelector('[data-symbol="R_10"]')?.dataset.state==='confirmed'&&document.querySelector('[data-symbol="R_25"]')?.dataset.state==='confirmed');
  assert.equal(await page.locator('#dynamicCards .dynamic-card').count(),25);assert.equal(await page.evaluate(()=>scanning),true);
  assert.doesNotMatch(await page.locator('#count').innerText(),/Finalizado/);
  assert.match(await rise.getAttribute('class'),/radar-rise/);assert.match(await fall.getAttribute('class'),/radar-fall/);
  await page.waitForFunction(()=>getComputedStyle(document.querySelector('[data-symbol="R_10"]')).backgroundColor==='rgb(18, 61, 43)'&&getComputedStyle(document.querySelector('[data-symbol="R_25"]')).backgroundColor==='rgb(73, 36, 43)');
  await page.evaluate(()=>{globalThis.__stable=document.querySelector('[data-symbol="R_10"]');globalThis.__button=__stable.querySelector('button');__button.focus();globalThis.__stableIndex=[...__stable.parentNode.children].indexOf(__stable);__entryWaiters.forEach(resolve=>resolve());});
  await page.waitForFunction(()=>SCANNER_UI.snapshot().records.length>=20,{},{timeout:30000});
  const waitGate=async code=>{const until=Date.now()+30000;while(!gates.has(code)){if(Date.now()>until)throw new Error('Missing history gate '+code);await new Promise(resolve=>setTimeout(resolve,50));}};
  await waitGate('frxTEST15');assert.ok(gates.has('frxTEST14'));
  const slots=await page.locator('#dynamicCards .dynamic-card').evaluateAll(nodes=>nodes.map(e=>({symbol:e.dataset.symbol,state:e.dataset.state})));
  const yellowIndex=slots.findIndex(r=>r.state==='observation');assert.ok(yellowIndex>=0);assert.equal(await page.locator('#dynamicCards .radar-observation').first().evaluate(e=>getComputedStyle(e).backgroundColor),'rgb(64, 53, 26)');
  gates.get('frxTEST15')();
  await page.waitForFunction(()=>document.querySelector('[data-symbol="frxTEST15"]')?.dataset.state==='confirmed');
  assert.equal(await page.locator('#dynamicCards .dynamic-card').nth(yellowIndex).getAttribute('data-symbol'),'frxTEST15');
  await page.waitForFunction(()=>document.querySelector('[data-symbol="frxTEST16"]')?.dataset.state==='confirmed');
  assert.equal(await page.locator('[data-symbol="frxTEST16"]').getAttribute('class'),'dynamic-card radar-rise');
  assert.equal(await page.locator('[data-symbol="frxTEST15"]').getAttribute('class'),'dynamic-card radar-fall');
  assert.equal(await page.evaluate(()=>scanning),true);assert.ok(await page.evaluate(()=>SCANNER_UI.snapshot().records.length<symbols.length));
  assert.equal(await page.evaluate(()=>document.querySelector('[data-symbol="R_10"]')===__stable&&__stable.querySelector('button')===__button&&document.activeElement===__button&&[...__stable.parentNode.children].indexOf(__stable)===__stableIndex),true);
  assert.equal(new Set(await page.locator('#dynamicCards .dynamic-card').evaluateAll(nodes=>nodes.map(e=>e.dataset.symbol))).size,25);
  const before=sent.length;await page.evaluate(()=>{const readNow=serverNow,fixed=serverNow();serverNow=()=>fixed;SCANNER_UI.render();globalThis.__mutations=[];const observer=new MutationObserver(items=>__mutations.push(...items));observer.observe(document.querySelector('#dynamicCards'),{subtree:true,childList:true,attributes:true,characterData:true});for(let i=0;i<10;i++)SCANNER_UI.render();const changes=observer.takeRecords();observer.disconnect();serverNow=readNow;if(changes.length||__mutations.length)throw new Error('Unchanged render mutated the radar');});assert.equal(sent.length,before);
  assert.deepEqual(await page.evaluate(()=>ROOM_UI.selected),vol.slice(0,7));assert.deepEqual(await page.evaluate(()=>__messages),[]);
  gates.get('frxTEST14')();await page.waitForFunction(()=>SCANNER_UI.snapshot().records.length===30&&!scanning,{},{timeout:15000});
  await page.evaluate(()=>{stopWatch();const latest=Math.max(...SCANNER_UI.snapshot().records.map(r=>r.expiresAt||0));clockAnchor.epochMs+=(latest-serverNow()+1)*1000;SCANNER_UI.render();});
  assert.equal(await page.locator('#dynamicCards [data-state="confirmed"]').count(),0);assert.equal(await rise.getAttribute('class'),'dynamic-card radar-inactive');
  assert.equal(await page.evaluate(()=>document.querySelector('[data-symbol="R_10"]')===__stable),true);await page.waitForFunction(()=>getComputedStyle(document.querySelector('[data-symbol="R_10"]')).backgroundColor==='rgb(41, 47, 55)');
  assert.equal(sockets,1);assert.equal(sent.some(m=>m.buy||m.sell||m.authorize||m.proposal),false);assert.deepEqual(errors,[]);
  console.log('PASS radar: 25 slots; RISE/FALL before prospective wait and scan completion; yellow-first replacement; stable DOM/focus/positions; no render requests; remaining 30 assets processed; expiry gray; seven favorites and single socket preserved.');
 }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
