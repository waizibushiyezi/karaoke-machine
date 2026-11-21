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
test('registration and arbitrary proxy destinations are unavailable',async()=>{
 const handle=createHandler(()=>{throw Error('must not fetch');});
 assert.equal((await handle(new Request('https://test.local/api/auth/register',{method:'POST',body:'private-input'}))).status,405);
 assert.equal((await handle(new Request('https://test.local/https://evil.test'))).status,404);
 assert.equal((await handle(new Request('https://test.local/'))).headers.get('Cache-Control'),'no-store');
});
