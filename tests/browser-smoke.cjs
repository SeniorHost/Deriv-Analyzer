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
  if(!['/panel.html','/style.css','/panel.js','/forward.js','/indicators.js','/room.js','/room-ui.js'].includes(name)){res.writeHead(404);res.end();return;}
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
   globalThis.chrome={storage:{local:{get:async key=>({[key]:storage[key]}),set:async data=>{Object.assign(storage,data);localStorage.setItem('mock-storage',JSON.stringify(storage));}}},runtime:{sendMessage(m,cb){cb?.(m.type==='IMPORT_DERIV_TABS'?{ok:true,symbols:['VOL_11']}:{ok:true});}}};
  });
  let historyCalls=0;
  await page.routeWebSocket('wss://api.derivws.com/**',ws=>{
   ws.onMessage(raw=>{
    const m=JSON.parse(raw);sent.push(m);const respond=data=>ws.send(JSON.stringify({req_id:m.req_id,...data}));
    if(m.time)respond({time:Math.floor(Date.now()/1000)});
    else if(m.active_symbols)respond({active_symbols:Array.from({length:12},(_,i)=>({underlying_symbol:i?'VOL_'+i:'1HZ10V',underlying_symbol_name:'Volatility '+i,market:'synthetic_index'}))});
    else if(m.ticks_history){historyCalls++;const end=m.end==='latest'?Math.floor(Date.now()/60000)*60:Math.floor(Number(m.end)/60)*60;const candles=Array.from({length:m.count},(_,i)=>{const close=100+Math.sin((end/60-m.count+1+i)/4)*2;return {epoch:end-(m.count-1-i)*60,open:close,high:close+.5,low:close-.5,close};});respond({candles});}
    else if(m.ticks)setTimeout(()=>respond({subscription:{id:'tick'},tick:{symbol:m.ticks,epoch:Math.floor(Date.now()/1000),quote:101}}),2100);
    else if(m.forget)respond({forget:1});
    else if(m.ping)respond({ping:'pong'});
    else throw new Error('Unexpected API operation');
   });
  });
  await page.goto('http://127.0.0.1:'+server.address().port+'/panel.html');
  assert.equal(await page.title(),'Mi sala de trading · Deriv Analyzer');
  assert.equal(await page.locator('#scan').isEnabled(),false);
  await page.click('#connect');await page.waitForFunction(()=>document.querySelector('#status').textContent==='Conectada');
  assert.match(await page.locator('#log').innerText(),/Hora Deriv sincronizada/);
  await page.waitForFunction(()=>document.querySelector('#count').textContent.includes('Finalizado'),{},{timeout:15000});
  assert.match(await page.locator('#count').innerText(),/12\/12 · 0 errores/);
  assert.equal(await page.locator('.room-card').count(),6);assert.equal(historyCalls,36);
  assert.equal(await page.locator('#auto').isChecked(),false);
  await page.evaluate(async()=>{
   cancelScan=false;
   await registerForwardItem({symbol:'1HZ10V',name:'Simulated signal',direction:'SUBE',close:100,lastTime:Math.floor(closedThrough()/60)*60-60,score:70},1);
   const stored=await chrome.storage.local.get('deriv_analyzer_forward_v16');
   if(!stored.deriv_analyzer_forward_v16?.some(r=>r.horizon===1&&r.status==='PENDIENTE'))throw new Error('Prospective entry was not persisted');
  });
  await page.click('#editRoom');
  await page.selectOption('#addAsset','VOL_6');await page.click('#addRoom');
  await page.waitForFunction(()=>document.querySelector('#roomCount').textContent==='7/12 activos');
  await page.locator('.selection-row select').first().selectOption('VOL_7');
  await page.locator('.selection-row button').first().click();
  await page.waitForFunction(()=>ROOM_UI.selected.includes('VOL_7')&&!ROOM_UI.selected.includes('1HZ10V'));
  await page.click('#importTabs');await page.waitForFunction(()=>ROOM_UI.selected.includes('VOL_11'));
  assert.equal(await page.locator('.room-card').count(),8);
  await page.locator('.selection-row button').filter({hasText:'Quitar'}).first().click();
  await page.waitForFunction(()=>ROOM_UI.selected.length===7);
  if(process.env.ROOM_SCREENSHOT)await page.screenshot({path:process.env.ROOM_SCREENSHOT,fullPage:true});
  const downloadPromise=page.waitForEvent('download');await page.click('#exportForward');const download=await downloadPromise;
  const file=path.join(output,'forward.csv');await download.saveAs(file);assert.match(await fs.readFile(file,'utf8'),/^symbol,name,recordedAt/);
  // Reload checks selection and records using a persistent Chrome-storage mock.
  await page.reload();await page.waitForFunction(()=>document.querySelector('#forwardCount').textContent.includes('pendientes'));
  await page.waitForFunction(()=>document.querySelectorAll('.room-card').length===7);
  assert.deepEqual(errors,[]);assert.equal(sent.some(m=>m.buy||m.sell||m.proposal||m.authorize),false);
  console.log('Browser smoke PASS: actual DOM, public-API mock, scan, prospective entry with Web Lock, CSV, reload; no page errors.');
 }finally{await browser.close();await new Promise(resolve=>server.close(resolve));await fs.rm(output,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
