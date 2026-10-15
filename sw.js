const CACHE='liubai-v3-records';
const ROOT=new URL('./',self.location.href).href;
const ASSETS=['./','./index.html','./style.css','./app.js','./core.js','./records.js','./timer.js','./focus.js','./manifest.webmanifest','./icons/icon.svg','./icons/icon-192.png','./icons/icon-512.png','./icons/maskable-512.png','./icons/apple-touch-icon.png'].map(p=>new URL(p,ROOT).href);
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('liubai-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{const url=new URL(event.request.url);if(event.request.method!=='GET'||url.origin!==self.location.origin||!url.href.startsWith(ROOT))return;event.respondWith(fetch(event.request).then(response=>{if(response.ok&&ASSETS.includes(url.href)){const copy=response.clone();event.waitUntil(caches.open(CACHE).then(c=>c.put(event.request,copy)));}return response;}).catch(async()=>{const cached=await caches.match(event.request);if(cached)return cached;if(event.request.mode==='navigate')return caches.match(new URL('./index.html',ROOT).href);return Response.error();}));});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(self.clients.matchAll({type:'window',includeUncontrolled:true}).then(async clients => {
    const existing=clients.find(client=>client.url.startsWith(ROOT));
    if(existing) return existing.focus();
    return self.clients.openWindow(ROOT);
  }));
});
