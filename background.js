function configurePanel(){
 chrome.sidePanel.setPanelBehavior({openPanelOnActionClick:true}).catch(()=>{});
}
chrome.runtime.onInstalled.addListener(configurePanel);
chrome.runtime.onStartup.addListener(configurePanel);
configurePanel();
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
