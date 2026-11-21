import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHandler} from './server.mjs';

test('health check is fast and does not contact the account system',async()=>{
 const handle=createHandler(()=>{throw Error('must not fetch');});
 const response=await handle(new Request('https://test.local/health'));
 assert.equal(response.status,200);assert.equal((await response.json()).ok,true);
});
test('successful public upstream check never forwards credentials and deduplicates checks',async()=>{
 let calls=0;
 const handle=createHandler(async(url,options)=>{calls++;assert.equal(url,'https://alphabet-songbox.waizibushiyezi.chatgpt.site/api/version');assert.equal(options.method,'GET');assert.equal(options.headers.Authorization,undefined);assert.equal(options.headers.Cookie,undefined);return Response.json({version:'0123456789abcdef'});});
 const r=await handle(new Request('https://test.local/check?target=https://evil.test',{headers:{Authorization:'do-not-forward',Cookie:'private'}}));
 assert.equal(r.status,200);assert.deepEqual(await r.json(),{ok:true,stage:'upstream-connected'});
 await handle(new Request('https://test.local/check'));assert.equal(calls,1);
});
test('blocked and malformed upstream responses give a sanitized failure',async()=>{
 for(const response of [new Response('<blocked private debug>',{status:403}),Response.json({version:'bad'}),Response.json(null)]){
  const handle=createHandler(async()=>response);const r=await handle(new Request('https://test.local/check'));
  assert.equal(r.status,502);assert.deepEqual(await r.json(),{ok:false,stage:'upstream-unavailable'});
 }
});
test('untrusted registration and arbitrary proxy destinations are unavailable',async()=>{
 const handle=createHandler(()=>{throw Error('must not fetch');});
 assert.equal((await handle(new Request('https://test.local/api/auth/register',{method:'POST',body:'private-input'}))).status,403);
 assert.equal((await handle(new Request('https://test.local/https://evil.test'))).status,404);
 assert.equal((await handle(new Request('https://test.local/'))).headers.get('Cache-Control'),'no-store');
});

const origin='https://waizibushiyezi.github.io';
test('API preflight allows only the app origin, exact routes and intended methods',async()=>{
 const handle=createHandler(()=>{throw Error('must not fetch');});
 const preflight=(url,originValue=origin,method='POST',headers='content-type,authorization')=>new Request(url,{method:'OPTIONS',headers:{Origin:originValue,'Access-Control-Request-Method':method,'Access-Control-Request-Headers':headers}});
 let response=await handle(preflight('https://test.local/api/auth/register'));assert.equal(response.status,204);assert.equal(response.headers.get('Access-Control-Allow-Origin'),origin);assert.equal(response.headers.get('Access-Control-Allow-Credentials'),null);
 response=await handle(preflight('https://test.local/api/auth/register','https://evil.test'));assert.equal(response.status,403);assert.equal(response.headers.get('Access-Control-Allow-Origin'),null);
 assert.equal((await handle(preflight('https://test.local/api/auth/register',origin,'DELETE'))).status,403);
 assert.equal((await handle(preflight('https://test.local/api/auth/register',origin,'POST','x-private'))).status,403);
 assert.equal((await handle(preflight('https://test.local/api/admin/claim'))).status,404);
});
test('API proxy preserves JSON and bearer auth, strips unrelated identity and never caches private responses',async()=>{
 const token='a'.repeat(64),body=JSON.stringify({username:'测试用户',password:'test-only-password'});let captured;
 const handle=createHandler(async(url,options)=>{captured={url,options};return Response.json({user:{id:'test'},token},{headers:{'Set-Cookie':'must-not-escape'}});});
 const request=new Request('https://test.local/api/auth/login',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json',Authorization:'Bearer '+token,Cookie:'private-cookie','oai-authenticated-user-id':'forged'},body});
 const response=await handle(request);assert.equal(response.status,200);assert.equal((await response.json()).token,token);assert.equal(response.headers.get('Set-Cookie'),null);assert.equal(response.headers.get('Cache-Control'),'no-store');assert.equal(captured.url,'https://alphabet-songbox.waizibushiyezi.chatgpt.site/api/auth/login');assert.equal(captured.options.headers.get('Authorization'),'Bearer '+token);assert.equal(captured.options.headers.get('Cookie'),null);assert.equal(captured.options.headers.get('oai-authenticated-user-id'),null);assert.equal(captured.options.body.toString(),body);assert.equal(captured.options.redirect,'error');
});
test('conflicts and rate limits retain status and CORS; gateway errors remain readable JSON',async()=>{
 for(const status of [401,403,409,429]){
  const handle=createHandler(async()=>Response.json({error:'upstream'}, {status,headers:{'Retry-After':'600'}}));
  const response=await handle(new Request('https://test.local/api/library',{headers:{Origin:origin}}));assert.equal(response.status,status);assert.equal(response.headers.get('Access-Control-Allow-Origin'),origin);assert.equal(response.headers.get('Retry-After'),'600');
 }
 for(const failure of [async()=>new Response('<blocked>',{status:403}),async()=>{throw Error('private detail');}]){
  const response=await createHandler(failure)(new Request('https://test.local/api/auth/me',{headers:{Origin:origin}}));assert.equal(response.status,502);assert.equal(response.headers.get('Access-Control-Allow-Origin'),origin);assert(!(await response.text()).includes('private detail'));
 }
});
test('oversized and non-JSON writes are rejected without reaching the upstream',async()=>{
 const handle=createHandler(()=>{throw Error('must not fetch');});
 let response=await handle(new Request('https://test.local/api/library',{method:'PUT',headers:{Origin:origin,'Content-Type':'text/plain'},body:'text'}));assert.equal(response.status,415);
 response=await handle(new Request('https://test.local/api/library',{method:'PUT',headers:{Origin:origin,'Content-Type':'application/json'},body:'x'.repeat(5000001)}));assert.equal(response.status,413);
});

test('library sharing routes are forwarded only through the same authenticated API channel',async()=>{
 const seen=[];const handle=createHandler(async(url,options)=>{seen.push({url,options});return Response.json({ok:true});});
 for(const [path,method] of [['/api/library-shares','GET'],['/api/library-shares','POST'],['/api/library-shares/resolve','POST'],['/api/library-shares/import','POST'],['/api/library-shares/revoke','POST']]){
  const response=await handle(new Request('https://test.local'+path,{method,headers:{Origin:origin,Authorization:'Bearer '+'b'.repeat(64),'Content-Type':'application/json'},...(method==='POST'?{body:'{}'}:{})}));assert.equal(response.status,200);assert.equal(seen.at(-1).url,'https://alphabet-songbox.waizibushiyezi.chatgpt.site'+path);assert.equal(seen.at(-1).options.headers.get('Authorization'),'Bearer '+'b'.repeat(64));
 }
});

test('admin account preview and apply routes forward through the fixed allowlist',async()=>{
 const paths=[];const handle=createHandler(async(url,options)=>{paths.push(url);assert.equal(options.method,'POST');assert.equal(options.headers.get('Authorization'),'Bearer '+'c'.repeat(64));return Response.json({ok:true});});
 for(const path of ['/api/admin/accounts/preview','/api/admin/accounts/apply']){
  assert.equal((await handle(new Request('https://test.local'+path,{method:'POST',headers:{Origin:origin,Authorization:'Bearer '+'c'.repeat(64),'Content-Type':'application/json'},body:'{}'}))).status,200);
  assert.equal(paths.at(-1),'https://alphabet-songbox.waizibushiyezi.chatgpt.site'+path);
  assert.equal((await handle(new Request('https://test.local'+path,{headers:{Origin:origin}}))).status,405);
 }
});

test('music preview verifies app login before contacting a music platform and never forwards app secrets',async()=>{
 const calls=[];const handler=createHandler(async(url,options)=>{calls.push(url);if(url.endsWith('/api/auth/me')){assert.equal(options.headers.get('Authorization'),'Bearer '+'d'.repeat(64));return Response.json({user:{id:'test-account'}});}assert.equal(options.headers.Authorization,undefined);assert.equal(options.headers.Cookie,undefined);assert.equal(new URL(url).hostname,'music.163.com');return Response.json({code:200,result:{privacy:0,name:'测试歌单',trackCount:1,tracks:[{id:1,name:'测试歌曲',artists:[]}]}});});
 const req=()=>new Request('https://test.local/api/playlist-preview',{method:'POST',headers:{Origin:origin,Authorization:'Bearer '+'d'.repeat(64),'Content-Type':'application/json'},body:JSON.stringify({link:'https://music.163.com/playlist?id=123'})});
 const response=await handler(req());assert.equal(response.status,200);assert.equal(response.headers.get('Access-Control-Allow-Origin'),origin);assert.equal(response.headers.get('Cache-Control'),'no-store');assert.equal((await response.json()).playlist.received,1);assert.equal(calls.length,2);
 for(let i=0;i<11;i++)assert.equal((await handler(req())).status,200);assert.equal((await handler(req())).status,429);
});
test('music preview rejects missing/revoked login, invalid URL and wrong origin without external metadata access',async()=>{
 let calls=0;const handler=createHandler(async(url)=>{calls++;assert(url.endsWith('/api/auth/me'));return Response.json({user:null});});
 const req=(link,authorization='Bearer '+'d'.repeat(64),from=origin)=>new Request('https://test.local/api/playlist-preview',{method:'POST',headers:{Origin:from,...(authorization?{Authorization:authorization}:{}),'Content-Type':'application/json'},body:JSON.stringify({link})});
 assert.equal((await handler(req('https://music.163.com/playlist?id=123',''))).status,401);assert.equal(calls,0);assert.equal((await handler(req('https://evil.test/'))).status,400);assert.equal(calls,0);assert.equal((await handler(req('https://music.163.com/playlist?id=123',undefined,'https://evil.test'))).status,403);assert.equal(calls,0);assert.equal((await handler(req('https://music.163.com/playlist?id=123'))).status,401);assert.equal(calls,1);
});

test('history route forwards authenticated reads and rejects writes through the allowlist',async()=>{
 let captured;const handler=createHandler(async(url,options)=>{captured={url,options};return Response.json({announcements:[],next:null});});
 const response=await handler(new Request('https://test.local/api/announcements/history?before=20',{headers:{Origin:origin,Authorization:'Bearer '+'f'.repeat(64)}}));assert.equal(response.status,200);assert.equal(captured.url,'https://alphabet-songbox.waizibushiyezi.chatgpt.site/api/announcements/history?before=20');assert.equal(captured.options.headers.get('Authorization'),'Bearer '+'f'.repeat(64));assert.equal(response.headers.get('Cache-Control'),'no-store');assert.equal((await handler(new Request('https://test.local/api/announcements/history',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:'{}'}))).status,405);
});

test('private companion reads and writes use only the authenticated gateway channel',async()=>{
 const seen=[];const handler=createHandler(async(url,options)=>{seen.push({url,options});return Response.json({revision:1,profile:{name:'test'}});});for(const method of ['GET','PUT']){const response=await handler(new Request('https://test.local/api/companion'+(method==='GET'?'?revision=0':''),{method,headers:{Origin:origin,Authorization:'Bearer '+'e'.repeat(64),'Content-Type':'application/json'},...(method==='PUT'?{body:'{"revision":0,"profile":{}}'}:{})}));assert.equal(response.status,200);assert.equal(response.headers.get('Cache-Control'),'no-store');assert.equal(seen.at(-1).options.headers.get('Authorization'),'Bearer '+'e'.repeat(64));assert.equal(new URL(seen.at(-1).url).pathname,'/api/companion');}assert.equal((await handler(new Request('https://test.local/api/companion',{method:'DELETE',headers:{Origin:origin}}))).status,405);
});
