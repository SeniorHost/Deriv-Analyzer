// Optional DOM integration check: requires Playwright and Chromium, no extension policy changes.
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const path=require('node:path');
const fs=require('node:fs/promises');
const os=require('node:os');
const http=require('node:http');
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
 const server=http.createServer(async(req,res)=>{
  const name=req.url.split('?')[0];
  if(!['/panel.html','/style.css','/panel.js','/forward.js','/indicators.js','/room.js','/room-ui.js','/comparator.js','/comparator-ui.js','/adaptive.js','/adaptive-follow.js','/adaptive-ui.js','/simple-reader.js'].includes(name)){res.writeHead(404);res.end();return;}
  res.setHeader('Content-Type',name.endsWith('.js')?'application/javascript':name.endsWith('.css')?'text/css':'text/html');
  try{res.end(await fs.readFile(path.resolve(__dirname,'..'+name)));}catch{res.writeHead(500);res.end();}
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const output=await fs.mkdtemp(path.join(os.tmpdir(),'deriv-browser-'));
 try{
  const page=await browser.newPage();const errors=[],sent=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.addInitScript(()=>{
   const storage=JSON.parse(localStorage.getItem('mock-storage')||'{}');
   globalThis.__storage=storage;globalThis.__roomMessages=[];globalThis.chrome={storage:{local:{get:async key=>({[key]:storage[key]}),set:async data=>{Object.assign(storage,data);localStorage.setItem('mock-storage',JSON.stringify(storage));}}},runtime:{sendMessage(m,cb){__roomMessages.push(m);cb?.(m.type==='INSPECT_DERIV_VIEWS'?{ok:true,symbols:['VOL_11'],internalChartsSupported:false,scope:'browser-urls-only'}:{ok:true,mode:'deriv-workspace',message:'Deriv activado sin cambiar sus gráficos. Selecciona el gráfico interno manualmente.'});}}};
  });
  let historyCalls=0;
  await page.routeWebSocket('wss://api.derivws.com/**',ws=>{
   ws.onMessage(raw=>{
    const m=JSON.parse(raw);sent.push(m);const respond=data=>ws.send(JSON.stringify({req_id:m.req_id,...data}));
    if(m.time)respond({time:Math.floor(Date.now()/1000)});
    else if(m.active_symbols)respond({active_symbols:Array.from({length:12},(_,i)=>({underlying_symbol:i?'VOL_'+i:'1HZ10V',underlying_symbol_name:'Volatility '+i,market:'synthetic_index',submarket:'random_index',underlying_symbol_type:'stockindex'}))});
    else if(m.ticks_history){historyCalls++;const end=m.end==='latest'?Math.floor(Date.now()/60000)*60:Math.floor(Number(m.end)/60)*60;const candles=Array.from({length:m.count},(_,i)=>{const close=100+Math.sin((end/60-m.count+1+i)/4)*2;return {epoch:end-(m.count-1-i)*60,open:close,high:close+.5,low:close-.5,close};});respond({candles});}
    else if(m.ticks)setTimeout(()=>{respond({subscription:{id:'tick'+m.req_id},tick:{symbol:m.ticks,epoch:Math.floor(Date.now()/1000),quote:101}});for(let i=1;i<=60;i++)setTimeout(()=>respond({subscription:{id:'tick'+m.req_id},tick:{symbol:m.ticks,epoch:Math.floor(Date.now()/1000),quote:101+i/10}}),i*100);},2100);
    else if(m.forget)respond({forget:1});
    else if(m.ping)respond({ping:'pong'});
    else throw new Error('Unexpected API operation');
   });
  });
  await page.goto('http://127.0.0.1:'+server.address().port+'/panel.html');
  assert.equal(await page.title(),'Mi sala de trading · Deriv Analyzer');
  assert.equal(await page.locator('#scan').isEnabled(),false);
  await page.click('#connect');await page.waitForFunction(()=>document.querySelector('#status').textContent==='Conectada');
  assert.match(await page.locator('#log').textContent(),/Hora Deriv sincronizada/);
  await page.waitForFunction(()=>document.querySelector('#count').textContent.includes('Finalizado'),{},{timeout:15000});
  assert.match(await page.locator('#count').innerText(),/12\/12 · 0 errores/);
  assert.equal(await page.locator('#results .room-card').count(),6);assert.equal(historyCalls,36);
  assert.equal(await page.locator('#auto').isChecked(),false);
  await page.evaluate(async()=>{
   cancelScan=false;
   await registerForwardItem({symbol:'1HZ10V',name:'Simulated signal',direction:'SUBE',close:100,lastTime:Math.floor(closedThrough()/60)*60-60,score:70},1);
   const stored=await chrome.storage.local.get('deriv_analyzer_forward_v16');
   if(!stored.deriv_analyzer_forward_v16?.some(r=>r.horizon===1&&r.status==='PENDIENTE'))throw new Error('Prospective entry was not persisted');
  });
  assert.equal(await page.locator('#advanced').getAttribute('open'),null);
  assert.equal(await page.locator('article.room-card').count(),6);
  assert.match(await page.locator('#results').innerText(),/Tendencia observada/);
  assert.match(await page.locator('#results').innerText(),/Señal principal: Lector adaptativo/);
  assert.match(await page.locator('#results').innerText(),/SIN CONFIRMACIÓN/);
  assert.equal(await page.locator('#log').isVisible(),false);
  assert.equal(await page.locator('#readerCards').isVisible(),false);
  assert.equal(await page.locator('#results .signal-time').count(),0);
  assert.doesNotMatch(await page.locator('#results').innerText(),/Wilson|Retrospectivo/);
  if(process.env.SIMPLE_SCREENSHOT)await page.screenshot({path:process.env.SIMPLE_SCREENSHOT,fullPage:true});
  await page.evaluate(()=>{
   globalThis.__realReaderView=ADAPT_UI.view;globalThis.__watchWasOn=watchOn;if(watchOn)stopWatch();globalThis.__testRow=results.find(r=>r.symbol===ROOM_UI.selected[0]);globalThis.__oldRow={direction:__testRow.direction,lastTime:__testRow.lastTime,emittedAt:__testRow.emittedAt};
   const at=serverNow();__testRow.direction='BAJA';__testRow.lastTime=at-60;__testRow.emittedAt=at;
   globalThis.__presentationFixture={reading:{sourceCloseAt:at,emittedAt:serverNow(),expiresAt:at+60,direction:'ESPERAR'},observed:{sourceCloseAt:at,trend:'ALCISTA'}};
   ADAPT_UI.view=code=>code===__testRow.symbol?__presentationFixture:__realReaderView(code);ROOM_UI.render(results);
  });
  assert.match(await page.locator('#results .room-card').first().innerText(),/Tendencia observada: ALCISTA/);
  assert.match(await page.locator('#results .room-card').first().innerText(),/SIN CONFIRMACIÓN/);
  assert.match(await page.locator('#results .room-card').first().innerText(),/Métodos en desacuerdo/);
  await page.locator('#advanced > summary').click();
  await page.locator('section[aria-label="Lector inteligente de gráficos"] > details > summary').click();
  await page.waitForFunction(()=>document.querySelectorAll('#readerCards .reader-detail').length===6);
  assert.equal(await page.locator('#readerEnable').isChecked(),false);
  await page.selectOption('#primaryMethod','original');
  assert.match(await page.locator('#results').innerText(),/Señal principal: Sistema original/);
  assert.match(await page.locator('#results .room-card').first().innerText(),/BAJA/);
  await page.selectOption('#primaryMethod','adaptive');
  await page.evaluate(()=>{__presentationFixture.reading.direction='SUBE';ROOM_UI.render(results);});
  assert.equal(await page.locator('#results .room-card').first().locator('.signal-time').count(),1);
  await page.evaluate(()=>{__presentationFixture.reading.expiresAt=serverNow()-1;ROOM_UI.render(results);});
  assert.equal(await page.locator('#results .room-card').first().locator('.signal-time').count(),0);
  await page.evaluate(()=>{ADAPT_UI.view=__realReaderView;Object.assign(__testRow,__oldRow);ROOM_UI.render(results);if(__watchWasOn)toggleWatch();});
  assert.equal(await page.locator('article.room-card').count(),6);
  assert.match(await page.locator('#readerCards').innerText(),/horizonte simulado 5 min/);
  await page.locator('#readerCards details').first().locator('summary').click();
  assert.match(await page.locator('#readerCards').innerText(),/Sin ventaja demostrada/);
  await page.locator('section[aria-label="Comparador de estrategias"] summary').click();
  assert.equal(await page.locator('#cmpEnable').isChecked(),false);
  assert.equal(await page.locator('#cmpResults > div').count(),2);
  await page.selectOption('#cmpMode','ticks');await page.click('#cmpTicks');
  await page.waitForFunction(()=>document.querySelector('#cmpStatus').textContent.includes('insuficientes'));
  await page.selectOption('#cmpMode','time');
  await page.click('#editRoom');
  await page.locator('.selection-row select').first().selectOption('VOL_7');
  await page.locator('.selection-row button').first().click();
  await page.waitForFunction(()=>ROOM_UI.selected.includes('VOL_7')&&!ROOM_UI.selected.includes('1HZ10V'));
  assert.equal(await page.locator('#results .room-card').count(),6);
  await page.click('#importTabs');await page.waitForFunction(()=>document.querySelector('#syncReference').textContent.includes('VOL_11'));
  assert.equal(await page.locator('#results .room-card').count(),6);
  assert.equal(await page.evaluate(()=>ROOM_UI.selected.includes('VOL_11')),false);
  await page.locator('#syncReference select').first().selectOption('VOL_1');
  await page.locator('#syncReference select').last().selectOption('VOL_11');
  await page.getByRole('button',{name:'Confirmar reemplazo manual'}).click();
  await page.waitForFunction(()=>ROOM_UI.selected.includes('VOL_11')&&!ROOM_UI.selected.includes('VOL_1'));
  assert.equal(await page.locator('#results .room-card').count(),6);
  await page.click('#importTabs');assert.equal(await page.locator('#results .room-card').count(),6);
  await page.locator('.room-card button').first().click();
  assert.equal(await page.evaluate(()=>__roomMessages.some(m=>m.type==='CREATE_DERIV_TAB')),false);
  await page.selectOption('#addAsset','VOL_6');await page.click('#addRoom');
  await page.waitForFunction(()=>ROOM_UI.selected.length===7);
  await page.locator('.selection-row').filter({hasText:'Volatility 6'}).getByRole('button',{name:'Quitar'}).click();
  await page.waitForFunction(()=>ROOM_UI.selected.length===6);
  if(process.env.ROOM_SCREENSHOT)await page.screenshot({path:process.env.ROOM_SCREENSHOT,fullPage:true});
  const downloadPromise=page.waitForEvent('download');await page.click('#exportForward');const download=await downloadPromise;
  const file=path.join(output,'forward.csv');await download.saveAs(file);assert.match(await fs.readFile(file,'utf8'),/^symbol,name,recordedAt/);
  await page.check('#readerEnable');
  await page.waitForFunction(()=>Boolean(__storage.deriv_analyzer_adaptive_v1?.enabled));
  await page.evaluate(()=>{const at=serverNow();void ADAPT_UI.signal({symbol:ROOM_UI.selected[0],family:'VOLATILITY',strategy:'volatility-impulse',version:ADAPTIVE.VERSION,direction:'SUBE',emittedAt:at,expiresAt:at+60},{dir:'SUBE'});});
  await page.waitForFunction(()=>__storage.deriv_analyzer_adaptive_v1?.groups.some(g=>g.entries.filter(e=>e.source==='LECTOR_PROSPECTIVO').every(e=>e.entryTime)));
  await page.check('#cmpEnable');
  await page.waitForFunction(()=>Boolean(__storage.deriv_analyzer_comparator_v1?.enabled));
  await page.evaluate(()=>{void CMP_UI.signal({symbol:ROOM_UI.selected[0],lastTime:Math.floor(closedThrough()/60)*60-60,direction:'SUBE'});});
  await page.waitForFunction(()=>{const s=__storage.deriv_analyzer_comparator_v1;return s.groups.some(g=>g.evaluations.filter(r=>r.mode==='ticks').every(r=>r.status==='ACIERTO'));},{},{timeout:15000});
  await page.evaluate(()=>ws.close());
  await page.waitForFunction(()=>{const s=__storage.deriv_analyzer_comparator_v1;return s.groups.some(g=>g.evaluations.filter(r=>r.mode==='time').every(r=>r.status==='INCOMPLETA'));});
  await page.waitForFunction(()=>__storage.deriv_analyzer_adaptive_v1?.groups.some(g=>g.entries.every(e=>e.status==='INCOMPLETA'||e.status==='SIN_SENAL')));
  const readerDownloadPromise=page.waitForEvent('download');await page.click('#readerExport');const readerDownload=await readerDownloadPromise;const readerFile=path.join(output,'reader.csv');await readerDownload.saveAs(readerFile);assert.match(await fs.readFile(readerFile,'utf8'),/LECTOR_PROSPECTIVO/);
  const cmpDownloadPromise=page.waitForEvent('download');await page.click('#cmpExport');const cmpDownload=await cmpDownloadPromise;
  const cmpFile=path.join(output,'comparator.csv');await cmpDownload.saveAs(cmpFile);assert.match(await fs.readFile(cmpFile,'utf8'),/PROSPECTIVO_FLUJO/);
  // Reload checks selection and records using a persistent Chrome-storage mock.
  await page.reload();await page.waitForFunction(()=>document.querySelector('#forwardCount').textContent.includes('pendientes'));
  await page.waitForFunction(()=>document.querySelectorAll('#results .room-card').length===6);
  assert.equal(await page.locator('#primaryMethod').inputValue(),'adaptive');
  assert.equal(await page.locator('#advanced').getAttribute('open'),null);
  assert.equal(await page.locator('article.room-card').count(),6);
  assert.deepEqual(errors,[]);assert.equal(sent.some(m=>m.buy||m.sell||m.proposal||m.authorize),false);
  console.log('Browser smoke PASS: actual DOM, public-API mock, scan, prospective entry with Web Lock, CSV, reload; no page errors.');
 }finally{await browser.close();await new Promise(resolve=>server.close(resolve));await fs.rm(output,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
