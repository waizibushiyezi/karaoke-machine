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
