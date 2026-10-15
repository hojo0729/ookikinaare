const VER="v2";
const CORE="ookikunare-core-"+VER, RUNTIME="ookikunare-rt";
const FILES=["./","./index.html","./local-db.js","./manifest.webmanifest","./icons/icon-192.png","./icons/icon-512.png","./icons/apple-touch-icon.png"];
self.addEventListener("install",e=>{e.waitUntil(caches.open(CORE).then(c=>c.addAll(FILES)).then(()=>self.skipWaiting()));});
self.addEventListener("activate",e=>{
  e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k.startsWith("ookikunare-core-")&&k!==CORE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));
});
self.addEventListener("fetch",e=>{
  const r=e.request; if(r.method!=="GET") return;
  const u=new URL(r.url);
  if(u.origin===location.origin){
    /* app files: network first (so updates arrive), fall back to cache when offline */
    e.respondWith(fetch(r).then(res=>{const cp=res.clone(); caches.open(CORE).then(c=>c.put(r,cp)); return res;}).catch(()=>caches.match(r,{ignoreSearch:true}).then(m=>m||caches.match("./index.html"))));
    return;
  }
  if(u.hostname==="fonts.googleapis.com"||u.hostname==="fonts.gstatic.com"){
    e.respondWith(caches.open(RUNTIME).then(c=>c.match(r).then(m=>{
      const net=fetch(r).then(res=>{if(res.ok||res.type==="opaque") c.put(r,res.clone()); return res;}).catch(()=>m);
      return m||net;
    })));
  }
});
