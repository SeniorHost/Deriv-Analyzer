chrome.runtime.onInstalled.addListener(() => chrome.sidePanel.setPanelBehavior({openPanelOnActionClick:true}));
chrome.runtime.onStartup.addListener(() => chrome.sidePanel.setPanelBehavior({openPanelOnActionClick:true}));
chrome.sidePanel.setPanelBehavior({openPanelOnActionClick:true}).catch(()=>{});
chrome.runtime.onMessage.addListener((msg,sender,sendResponse)=>{
  if(msg?.type !== 'NAVIGATE_DERIV' || !/^[A-Za-z0-9_]{2,30}$/.test(msg.symbol||'')) return;
  chrome.tabs.query({active:true,currentWindow:true},async tabs=>{
    const tab=tabs[0];
    if(!tab || !/^https:\/\/dtrader\.deriv\.com\//.test(tab.url||'')) {sendResponse({ok:false,error:'Abre primero dtrader.deriv.com en la pestaña activa.'});return;}
    try {
      const url=new URL(tab.url);
      url.searchParams.set('symbol',msg.symbol);
      url.searchParams.set('chart_type','candle');
      url.searchParams.set('interval','1m');
      await chrome.tabs.update(tab.id,{url:url.toString()});
      sendResponse({ok:true});
    } catch(e) {sendResponse({ok:false,error:String(e)});}
  });
  return true;
});
