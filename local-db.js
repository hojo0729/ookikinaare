/* local-db.js: stand-in for the Claude artifact runtime (window.claude.use("db"|"user"|"sample")).
   Stores everything in this device's IndexedDB. To share between phones later, replace this file
   with an implementation that talks to Supabase/Firebase and exposes the same small API. */
(function(){
"use strict";
const DB_NAME="ookikunare", STORE="docs";
let dbp=null;
function open(){
  if(dbp) return dbp;
  dbp=new Promise((res,rej)=>{
    const r=indexedDB.open(DB_NAME,1);
    r.onupgradeneeded=()=>{r.result.createObjectStore(STORE,{keyPath:"path"});};
    r.onsuccess=()=>res(r.result); r.onerror=()=>rej(r.error);
  });
  return dbp;
}
function tx(mode,fn){
  return open().then(db=>new Promise((res,rej)=>{
    const t=db.transaction(STORE,mode), s=t.objectStore(STORE); let out;
    Promise.resolve(fn(s)).then(v=>{out=v},rej);
    t.oncomplete=()=>res(out); t.onerror=()=>rej(t.error); t.onabort=()=>rej(t.error);
  }));
}
const req=r=>new Promise((res,rej)=>{r.onsuccess=()=>res(r.result); r.onerror=()=>rej(r.error);});
const listeners=new Set();
function notify(){listeners.forEach(f=>{try{f()}catch(e){}});}
function rid(){
  const a=new Uint8Array(10); (crypto||window.msCrypto).getRandomValues(a);
  return Array.from(a,b=>b.toString(16).padStart(2,"0")).join("");
}
function snapOf(path,row){return {id:path.split("/").pop(),exists:!!row,data:()=>row?JSON.parse(JSON.stringify(row.data)):undefined};}
function docRef(path){
  return {
    id:path.split("/").pop(), path,
    async get(){const row=await tx("readonly",s=>req(s.get(path))); return snapOf(path,row);},
    async set(data){await tx("readwrite",s=>{s.put({path,col:path.split("/")[0],data:JSON.parse(JSON.stringify(data))});}); notify();},
    async delete(){await tx("readwrite",s=>{s.delete(path);}); notify();},
    onSnapshot(cb,err){
      let alive=true;
      const run=async()=>{try{const row=await tx("readonly",s=>req(s.get(path))); if(alive) cb(snapOf(path,row));}catch(e){if(err)err(e);}};
      listeners.add(run); run();
      return ()=>{alive=false; listeners.delete(run);};
    }
  };
}
function colRef(name,q){
  q=q||{};
  const api={
    doc(id){return docRef(name+"/"+(id||rid()));},
    orderBy(f,dir){return colRef(name,Object.assign({},q,{f,dir:dir||"asc"}));},
    limit(n){return colRef(name,Object.assign({},q,{n}));},
    async _read(){
      const rows=await tx("readonly",s=>req(s.getAll()));
      let docs=rows.filter(r=>r.col===name).map(r=>({id:r.path.split("/").pop(),data:()=>JSON.parse(JSON.stringify(r.data)),_v:r.data}));
      if(q.f){docs.sort((a,b)=>{const x=a._v[q.f],y=b._v[q.f]; return (x>y?1:x<y?-1:0)*(q.dir==="desc"?-1:1);});}
      if(q.n) docs=docs.slice(0,q.n);
      return {docs};
    },
    onSnapshot(cb,err){
      let alive=true;
      const run=async()=>{try{const s=await api._read(); if(alive) cb(s);}catch(e){if(err)err(e);}};
      listeners.add(run); run();
      return ()=>{alive=false; listeners.delete(run);};
    }
  };
  return api;
}
const dbApi={collection:colRef, doc:docRef};
const userApi={can:()=>true};
window.claude={
  use:async name=>{
    if(name==="db") return dbApi;
    if(name==="user") return userApi;
    throw new Error("not available: "+name);
  }
};
/* backup helpers */
window.__backup={
  async exportJson(){
    const rows=await tx("readonly",s=>req(s.getAll()));
    return JSON.stringify({app:"ookikunare",v:1,savedAt:Date.now(),rows});
  },
  async importJson(text){
    const j=JSON.parse(text); if(!j||j.app!=="ookikunare"||!Array.isArray(j.rows)) throw new Error("bad file");
    await tx("readwrite",s=>{j.rows.forEach(r=>{if(r&&typeof r.path==="string"&&r.data) s.put({path:r.path,col:String(r.path).split("/")[0],data:r.data});});});
    notify(); return j.rows.length;
  }
};
try{ if(navigator.storage&&navigator.storage.persist) navigator.storage.persist(); }catch(e){}
})();
