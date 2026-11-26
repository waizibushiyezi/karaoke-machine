const BASE=new URL(self.registration.scope||'/',self.location.origin).pathname;
const PAGES='pages'==='pages';
const PREFIX='songbox-shell-'+encodeURIComponent(BASE)+'-';
const CACHE=PREFIX+'fe3ed30e7b967d32';
const assets=['icon.svg','manifest.webmanifest','icons/icon-180.png','icons/icon-192.png','icons/icon-512.png','icons/icon-maskable-512.png'].map(path=>BASE+path);
async function isShell(response){return response.ok&&(response.headers.get('X-Songbox-Shell')==='1'||PAGES&&response.headers.get('Content-Type')?.includes('text/html')&&(await response.clone().text()).includes('name="songbox-base" content="'+BASE+'"'));}
self.addEventListener('install',event=>{event.waitUntil((async()=>{const response=await fetch(BASE,{cache:'reload'});if(!await isShell(response))throw Error('App shell unavailable');const cache=await caches.open(CACHE);await cache.put(BASE,response);await cache.addAll(assets);if(!self.registration.active)await self.skipWaiting();})());});
self.addEventListener('activate',event=>event.waitUntil((async()=>{for(const key of await caches.keys())if((key.startsWith(PREFIX)||(BASE==='/'&&/^songbox-shell-[a-f0-9]{16}$/.test(key)))&&key!==CACHE)await caches.delete(key);await self.clients.claim();})()));
self.addEventListener('message',event=>{if(event.data?.type==='SKIP_WAITING')self.skipWaiting();if(event.data?.type==='CACHE_READY')event.waitUntil((async()=>{const cache=await caches.open(CACHE);event.source?.postMessage({type:'OFFLINE_READY',ready:!!await cache.match(BASE)});})());});
self.addEventListener('fetch',event=>{const url=new URL(event.request.url);if(url.origin!==self.location.origin||event.request.method!=='GET'||url.pathname.startsWith('/api/')||url.pathname.includes('signin')||url.pathname.includes('signout'))return;
 if(event.request.mode==='navigate'&&[BASE,BASE+'index.html',...(PAGES?[]:[BASE+'install'])].includes(url.pathname)){event.respondWith((async()=>{try{const response=await fetch(event.request);if(await isShell(response)){const cache=await caches.open(CACHE);await cache.put(BASE,response.clone());return response;}throw Error('No app shell');}catch(e){const cached=await caches.match(BASE);if(cached)return cached;return new Response('请先联网打开一次字母点唱机，保存离线页面。',{status:503,headers:{'Content-Type':'text/plain;charset=utf-8'}});}})());return;}
 if(assets.includes(url.pathname))event.respondWith((async()=>await caches.match(url.pathname)||await fetch(event.request))());
});
