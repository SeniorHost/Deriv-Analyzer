'use strict';
// Same-origin document lock. No service-worker keepalive and no monitoring without a view.
class MarketSession{
 constructor({locks,channel,setTimer=(fn,ms)=>setTimeout(fn,ms),clearTimer=id=>clearTimeout(id),id=crypto.randomUUID()}){
  this.locks=locks;this.channel=channel;this.setTimer=setTimer;this.clearTimer=clearTimer;this.id=id;this.owner=false;this.closed=false;this.listeners=[];this.pending=new Map();this.last=null;this.seq=0;
  this.ready=new Promise(resolve=>{this.resolveReady=resolve;});channel.onmessage=e=>this.receive(e.data);this.tryOwner();
 }
 async tryOwner(){if(this.closed)return;try{await this.locks.request('deriv-scanner-owner-v1',{ifAvailable:true},async lock=>{this.resolveReady(!!lock);if(!lock)return;this.owner=true;this.emit({type:'role',owner:true});await new Promise(resolve=>{this.release=resolve;});this.owner=false;});}catch(error){this.resolveReady(false);this.emit({type:'error',error:String(error)});}if(!this.closed)this.timer=this.setTimer(()=>this.tryOwner(),2000);}
 on(fn){this.listeners.push(fn);}
 emit(data){for(const fn of this.listeners)fn(data);}
 receive(m){if(!m||m.sender===this.id)return;if(m.type==='snapshot'){this.last=m.value;this.emit(m);}else if(m.type==='command'&&this.owner){Promise.resolve().then(()=>this.handler?.(m.command)).then(value=>this.channel.postMessage({type:'reply',sender:this.id,to:m.sender,seq:m.seq,value}),error=>this.channel.postMessage({type:'reply',sender:this.id,to:m.sender,seq:m.seq,error:String(error?.message||error)}));}else if(m.type==='reply'&&m.to===this.id){const p=this.pending.get(m.seq);if(p){this.pending.delete(m.seq);this.clearTimer(p.timer);m.error?p.reject(new Error(m.error)):p.resolve(m.value);}}else if(m.type==='hello'&&this.owner&&this.last)this.publish(this.last);}
 publish(value){if(!this.owner)return;this.last=value;this.channel.postMessage({type:'snapshot',sender:this.id,value});}
 command(command){if(this.owner)return Promise.resolve().then(()=>this.handler?.(command));const seq=++this.seq;return new Promise((resolve,reject)=>{const timer=this.setTimer(()=>{this.pending.delete(seq);reject(new Error('No respondió la vista que controla la sesión'));},15000);this.pending.set(seq,{resolve,reject,timer});this.channel.postMessage({type:'command',sender:this.id,seq,command});});}
 close(){if(this.closed)return;this.beforeClose?.();if(this.owner&&this.last)this.publish({...this.last,connected:false,ownerClosed:true});this.closed=true;this.clearTimer(this.timer);this.release?.();this.channel.close();for(const p of this.pending.values()){this.clearTimer(p.timer);p.reject(new Error('Vista cerrada'));}this.pending.clear();}
}
const MARKET_SESSION=new MarketSession({locks:navigator.locks,channel:new BroadcastChannel('deriv-scanner-session-v1')});
window.addEventListener('beforeunload',()=>MARKET_SESSION.close());
