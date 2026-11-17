const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.resolve(__dirname,'..');
const flush=async()=>{for(let i=0;i<40;i++)await Promise.resolve();};
function harness(options={}){
 let mono=0,wall=1800000008000,nextTimer=0;
 const timers=new Map(),elements=new Map(),sockets=[],writes=[],downloads=[];
 let stored=options.records,failWrite=false;
 const element=()=>({textContent:'',disabled:false,value:'',checked:false,style:{},children:[],listeners:{},
 setAttribute(name,value){this[name]=value;},addEventListener(name,fn){this.listeners[name]=fn;},append(...children){this.children.push(...children);},replaceChildren(){this.children=[];},click(){this.listeners.click?.();if(this.download)downloads.push(this);}});
 const get=id=>{if(!elements.has(id))elements.set(id,element());return elements.get(id);};
 get('horizon').value='5';get('market').value='synthetic';
 class FakeDate extends Date{constructor(...args){super(...(args.length?args:[wall+mono]));}static now(){return wall+mono;}}
 class Socket{
  static OPEN=1;static CONNECTING=0;static CLOSED=3;
  constructor(url){this.url=url;this.readyState=0;this.sent=[];sockets.push(this);}
  open(){this.readyState=1;this.onopen?.();}
  close(){this.readyState=3;this.onclose?.({code:1000,reason:'test'});}
  emit(m){this.onmessage?.({data:JSON.stringify(m)});}
  send(raw){if(this.throwSend)throw new Error('send failed');const m=JSON.parse(raw);this.sent.push(m);options.respond?.(this,m,ctx);}
 }
 const ctx=vm.createContext({console,navigator:{locks:options.locks||{request:async(_name,...args)=>args.at(-1)({})}},Date:FakeDate,performance:{now:()=>mono},structuredClone,AbortController,
 setTimeout(fn,delay){const id=++nextTimer;timers.set(id,{fn,at:mono+delay});return id;},clearTimeout:id=>timers.delete(id),
 WebSocket:Socket,Blob,URL:class extends URL{static createObjectURL(blob){downloads.push(blob);return 'blob:test';}static revokeObjectURL(){}},
 document:{getElementById:get,createElement:element},window:{addEventListener(){}},
 chrome:{storage:{local:options.storage||{get:()=>options.get?options.get():Promise.resolve(structuredClone({deriv_analyzer_forward_v16:stored})),set:async data=>{if(failWrite)throw new Error('quota');stored=structuredClone(data.deriv_analyzer_forward_v16);writes.push(stored);}}},runtime:{sendMessage(_m,fn){fn?.({ok:true});}}}});
 for(const file of ['indicators.js','forward.js','room.js','comparator.js','adaptive.js','adaptive-follow.js','panel.js'])vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),ctx,{filename:file});
 const run=code=>vm.runInContext(code,ctx);
 async function tick(ms){const target=mono+ms;for(;;){await flush();const entries=[...timers].filter(([,t])=>t.at<=target).sort((a,b)=>a[1].at-b[1].at);if(!entries.length)break;const [id,t]=entries[0];mono=t.at;timers.delete(id);t.fn();}mono=target;await flush();}
 async function ready(){await flush();run('connect()');const socket=sockets.at(-1);socket.open();await flush();const time=socket.sent.find(x=>x.time);socket.emit({req_id:time.req_id,time:Math.floor((wall+mono)/1000)});await flush();const catalog=socket.sent.find(x=>x.active_symbols);socket.emit({req_id:catalog.req_id,active_symbols:[{underlying_symbol:'1HZ10V',underlying_symbol_name:'Volatility 10 Index',market:'synthetic'}]});await flush();return socket;}
 return {ctx,run,get,sockets,writes,downloads,timers,ready,tick,flush,now:()=>Math.floor((wall+mono)/1000),setWall:v=>{wall=v;},failWrite:v=>{failWrite=v;},records:()=>stored};
}
function candles(n,end=1800000000){return Array.from({length:n},(_,i)=>{const close=100+Math.sin(i/4)*2+i*.005;return {epoch:end-(n-1-i)*60,open:close-.1,high:close+.5,low:close-.5,close};});}
function record(overrides={}){return {id:'test',symbol:'1HZ10V',name:'Volatility',entryTime:1799999600,exitTime:1799999900,entry:100,exit:null,horizon:5,direction:'SUBE',status:'PENDIENTE',priceBasis:'OBSERVED_TICK',...overrides};}
module.exports={harness,flush,candles,record,root};
