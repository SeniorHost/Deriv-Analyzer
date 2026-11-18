'use strict';
// A single coalescing writer. All waiters target a revision, never an old full snapshot.
class AutoDemoPersistence{
 constructor({read,write,snapshot,validate,allowed,onError,onSaved,delay=100,timeout=10000}){Object.assign(this,{read,write,snapshot,validate,allowed,onError,onSaved,delay,timeout});this.waiters=[];this.writing=false;this.timer=null;this.dirty=false;this.closed=false;this.savedRevision=-1;}
 save({urgent=false}={}){if(this.closed||!this.allowed())return Promise.reject(new Error('Vista sin control'));const revision=this.snapshot(false).revision;if(!this.dirty&&!this.writing&&revision<=this.savedRevision)return Promise.resolve();this.dirty=true;const promise=new Promise((resolve,reject)=>this.waiters.push({revision,resolve,reject}));if(urgent){clearTimeout(this.timer);this.timer=null;void this.flush();}else if(!this.timer&&!this.writing)this.timer=setTimeout(()=>{this.timer=null;void this.flush();},this.delay);return promise;}
 async flush(){if(this.writing||this.closed||!this.dirty)return;this.writing=true;this.dirty=false;let timer;
  try{await new Promise((resolve,reject)=>{timer=setTimeout(()=>reject(new Error('Persistencia sin respuesta')),this.timeout);(async()=>{if(!this.allowed())throw new Error('Vista sin control');const old=await this.read();if(old!==undefined)await this.validate(old);if(!this.allowed())throw new Error('Vista sin control');const value=this.snapshot(true);if(old?.revision>value.revision)throw new Error('Revisión antigua');await this.write(value);if(this.closed)throw new Error('Escritura tardía tras timeout');if(!this.allowed())throw new Error('Vista sin control');this.savedRevision=value.revision;this.onSaved?.(value.revision);const done=this.waiters.filter(w=>w.revision<=value.revision);this.waiters=this.waiters.filter(w=>w.revision>value.revision);done.forEach(w=>w.resolve());resolve();})().catch(reject);});}
  catch(error){this.closed=true;this.dirty=false;this.onError?.(error);for(const w of this.waiters.splice(0))w.reject(error);}
  finally{clearTimeout(timer);this.writing=false;if(this.dirty&&!this.closed){this.timer=setTimeout(()=>{this.timer=null;void this.flush();},0);}}
 }
 close(){this.closed=true;clearTimeout(this.timer);for(const w of this.waiters.splice(0))w.reject(new Error('Vista cerrada'));}
}
