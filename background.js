function configurePanel(){
 chrome.sidePanel.setPanelBehavior({openPanelOnActionClick:true}).catch(()=>{});
}
chrome.runtime.onInstalled.addListener(configurePanel);
chrome.runtime.onStartup.addListener(configurePanel);
configurePanel();
function derivSymbol(tab){
 try{const url=new URL(tab.url);if(url.origin!=='https://dtrader.deriv.com')return null;const symbol=url.searchParams.get('symbol');return typeof symbol==='string'&&/^[A-Za-z0-9_]{2,30}$/.test(symbol)?symbol:null;}catch{return null;}
}
chrome.runtime.onMessage.addListener((msg,sender,sendResponse)=>{
 if(!['IMPORT_DERIV_TABS','OPEN_DERIV_ASSET'].includes(msg?.type))return;
 (async()=>{
  const tabs=await chrome.tabs.query({url:'https://dtrader.deriv.com/*'});
  if(msg.type==='IMPORT_DERIV_TABS')return {ok:true,symbols:[...new Set(tabs.map(derivSymbol).filter(Boolean))]};
  if(typeof msg.symbol!=='string'||!/^[A-Za-z0-9_]{2,30}$/.test(msg.symbol))throw new Error('Activo inválido');
  const tab=tabs.find(t=>derivSymbol(t)===msg.symbol);
  if(tab){await chrome.tabs.update(tab.id,{active:true});await chrome.windows.update(tab.windowId,{focused:true});}
  else {const url=new URL('https://dtrader.deriv.com/');url.searchParams.set('symbol',msg.symbol);url.searchParams.set('chart_type','candle');url.searchParams.set('interval','1m');await chrome.tabs.create({url:url.href,active:true});}
  return {ok:true};
 })().then(sendResponse,error=>sendResponse({ok:false,error:String(error?.message||error)}));
 return true;
});
chrome.runtime.onMessage.addListener((msg,sender,sendResponse)=>{
 if(msg?.type!=='NAVIGATE_DERIV'||typeof msg.symbol!=='string'||!/^[A-Za-z0-9_]{2,30}$/.test(msg.symbol))return;
 (async()=>{
  const tabs=await chrome.tabs.query({active:true,currentWindow:true});
  const tab=tabs[0];
  if(!tab||!/^https:\/\/dtrader\.deriv\.com\//.test(tab.url||''))throw new Error('Abre primero dtrader.deriv.com en la pestaña activa.');
  const url=new URL(tab.url);
  url.searchParams.set('symbol',msg.symbol);
  url.searchParams.set('chart_type','candle');
  url.searchParams.set('interval','1m');
  await chrome.tabs.update(tab.id,{url:url.toString()});
 })().then(()=>sendResponse({ok:true}),error=>sendResponse({ok:false,error:String(error?.message||error)}));
 return true;
});
