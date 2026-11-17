function configurePanel(){
 chrome.sidePanel.setPanelBehavior({openPanelOnActionClick:true}).catch(()=>{});
}
chrome.runtime.onInstalled.addListener(configurePanel);
chrome.runtime.onStartup.addListener(configurePanel);
configurePanel();
function derivSymbol(tab){
 try{const url=new URL(tab.pendingUrl||tab.url);if(url.origin!=='https://dtrader.deriv.com')return null;const symbol=url.searchParams.get('symbol');return typeof symbol==='string'&&/^[A-Za-z0-9_]{2,30}$/.test(symbol)?symbol:null;}catch{return null;}
}
// Serializar navegación: dos clics no deben crear dos pestañas del mismo activo.
let navigation=Promise.resolve();
chrome.runtime.onMessage.addListener((msg,sender,sendResponse)=>{
 if(!['IMPORT_DERIV_TABS','INSPECT_DERIV_VIEWS','OPEN_DERIV_ASSET','CREATE_DERIV_TAB'].includes(msg?.type))return;
 const run=async()=>{
  const tabs=(await chrome.tabs.query({})).filter(tab=>{
   try{return new URL(tab.pendingUrl||tab.url).origin==='https://dtrader.deriv.com';}catch{return false;}
  });
  if(['IMPORT_DERIV_TABS','INSPECT_DERIV_VIEWS'].includes(msg.type))return {
   ok:true,symbols:[...new Set(tabs.map(derivSymbol).filter(Boolean))],tabCount:tabs.length,
   internalChartsSupported:false,scope:'browser-urls-only'
  };
  if(typeof msg.symbol!=='string'||!/^[A-Za-z0-9_]{2,30}$/.test(msg.symbol))throw new Error('Activo inválido');
  const exact=tabs.find(t=>derivSymbol(t)===msg.symbol);
  const tab=exact||(msg.type==='OPEN_DERIV_ASSET'?(tabs.find(t=>t.active)||tabs[0]):null);
  if(tab){
   await chrome.tabs.update(tab.id,{active:true});await chrome.windows.update(tab.windowId,{focused:true});
   return {ok:true,mode:exact?'url-tab':'deriv-workspace',internalChartsSupported:false,
    message:exact?'Pestaña de Deriv con ese símbolo en la URL activada. La vista interna no está verificada.':'Deriv activado sin cambiar sus gráficos. Selecciona el gráfico interno manualmente.'};
  }
  if(msg.type!=='CREATE_DERIV_TAB')return {ok:true,needsNewTab:true,message:'No hay una pestaña de Deriv identificable. Puedes crear una explícitamente.'};
  const url=new URL('https://dtrader.deriv.com/');url.searchParams.set('symbol',msg.symbol);url.searchParams.set('chart_type','candle');url.searchParams.set('interval','1m');
  await chrome.tabs.create({url:url.href,active:true});
  return {ok:true,mode:'created',message:'Nueva pestaña creada por tu solicitud. La selección de la sala no cambió.'};
 };
 const operation=msg.type==='OPEN_DERIV_ASSET'||msg.type==='CREATE_DERIV_TAB'?navigation.catch(()=>{}).then(run):run();
 if(['OPEN_DERIV_ASSET','CREATE_DERIV_TAB'].includes(msg.type))navigation=operation;
 operation.then(sendResponse,error=>sendResponse({ok:false,error:String(error?.message||error)}));
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
