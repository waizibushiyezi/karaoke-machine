import http from 'node:http';
import PlaylistImport from './playlist-import.mjs';
import {pathToFileURL} from 'node:url';

const UPSTREAM='https://alphabet-songbox.waizibushiyezi.chatgpt.site/api/version';
const ORIGIN='https://waizibushiyezi.github.io';
const API_METHODS=new Map([
 ['/api/version',['GET']],['/api/auth/me',['GET']],['/api/auth/login',['POST']],['/api/auth/register',['POST']],['/api/auth/logout',['POST']],
 ['/api/playlist-preview',['POST']],['/api/library',['GET','PUT']],['/api/usage',['POST']],['/api/admin/overview',['GET']],['/api/admin/accounts/preview',['POST']],['/api/admin/accounts/apply',['POST']],['/api/admin/announcements',['GET','POST']],
 ['/api/announcements/current',['GET']],['/api/announcements/history',['GET']],['/api/announcements/read',['POST']],
 ['/api/library-shares',['GET','POST']],['/api/library-shares/resolve',['POST']],['/api/library-shares/import',['POST']],['/api/library-shares/revoke',['POST']]
]);
const BODY_LIMIT=5000000;
const PAGE=`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>字母点唱机 · 连接测试</title><style>body{font:17px/1.8 system-ui,-apple-system,"PingFang SC",sans-serif;margin:0;background:#f4f0fc;color:#302441;padding:28px 18px}main{max-width:560px;margin:8vh auto;background:white;border-radius:24px;padding:30px;box-shadow:0 12px 50px #7350c916}h1{font-size:28px;line-height:1.4}p{color:#665b77}button{font:inherit;background:#7350c9;color:white;border:0;border-radius:12px;padding:14px 22px;cursor:pointer;width:100%}button:disabled{opacity:.6}#status{background:#f4f0fc;padding:18px;border-radius:12px;overflow-wrap:anywhere;margin:20px 0}.tag{font-weight:600;color:#7350c9}.note{font-size:15px}</style><main><span class="tag">♫ 字母点唱机</span><h1>先把连接检查好</h1><p>这个页面用来确认你的手机能否访问新服务，以及新服务能否连接原账号系统。</p><div id="status" role="status">新服务页面已打开。请点下方按钮继续检查。</div><button id="check">开始连接测试</button><p class="note">测试不需要账号或密码，不会创建账号，也不会修改曲库。正式注册和登录请返回字母点唱机。</p><p class="note">首次唤醒免费测试服务可能需要稍等一会儿。</p></main><script>const button=document.getElementById('check'),status=document.getElementById('status');button.onclick=async()=>{button.disabled=true;status.textContent='正在检查与原账号系统的连接…';try{const response=await fetch('/check',{cache:'no-store'}),data=await response.json();status.textContent=response.ok&&data.ok?'连接测试通过。请返回字母点唱机登录或注册。':'新服务可以打开，但暂时无法连接原账号系统。请把这个结果告诉管理员。';}catch(e){status.textContent='连接未完成，请稍后再试，或切换网络后重新打开此页面。';}finally{button.disabled=false;}};</script></html>`;
const common={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','X-Robots-Tag':'noindex, nofollow'};
const json=(body,status=200)=>Response.json(body,{status,headers:common});
function cors(response){const headers=new Headers(response.headers);headers.set('Access-Control-Allow-Origin',ORIGIN);headers.set('Vary','Origin');headers.set('Cache-Control','no-store');headers.delete('Set-Cookie');return new Response(response.body,{status:response.status,headers});}

async function accountApi(request,fetchUpstream,playlistState){
 const url=new URL(request.url),methods=API_METHODS.get(url.pathname);
 if(request.headers.get('Origin')!==ORIGIN)return json({error:'请求来源无效'},403);
 const reply=(body,status)=>cors(json(body,status));
 if(!methods)return reply({error:'未找到'},404);
 if(request.method==='OPTIONS'){
  const requested=(request.headers.get('Access-Control-Request-Headers')||'').toLowerCase().split(',').map(s=>s.trim()).filter(Boolean);
  if(!methods.includes(request.headers.get('Access-Control-Request-Method'))||requested.some(h=>!['content-type','authorization'].includes(h)))return reply({error:'请求格式无效'},403);
  return cors(new Response(null,{status:204,headers:{'Access-Control-Allow-Methods':methods.join(', '),'Access-Control-Allow-Headers':'Content-Type, Authorization','Access-Control-Max-Age':'600'}}));
 }
 if(!methods.includes(request.method))return reply({error:'不支持此操作'},405);
 if(url.search.length>1024)return reply({error:'输入过长'},413);
 const headers=new Headers({Origin:ORIGIN,Accept:'application/json','User-Agent':'Songbox-Account-Gateway/1.0 (+https://waizibushiyezi.github.io/karaoke-machine/)'});
 const authorization=request.headers.get('Authorization');
 if(authorization){if(!/^Bearer [a-f0-9]{64}$/.test(authorization))return reply({error:'登录信息无效'},401);headers.set('Authorization',authorization);}
 let body;
 if(['POST','PUT'].includes(request.method)){
  if(!request.headers.get('Content-Type')?.startsWith('application/json'))return reply({error:'需要 JSON'},415);
  if(Number(request.headers.get('Content-Length'))>BODY_LIMIT)return reply({error:'输入过长'},413);
  const reader=request.body?.getReader(),parts=[];let size=0;
  if(reader){while(true){const chunk=await reader.read();if(chunk.done)break;size+=chunk.value.length;if(size>BODY_LIMIT){await reader.cancel();return reply({error:'输入过长'},413);}parts.push(chunk.value);}}
  body=Buffer.concat(parts);headers.set('Content-Type','application/json');
 }
 try{
  if(url.pathname==='/api/playlist-preview'){
   if(!authorization)return reply({error:'请先登录自己的账号'},401);
   if(body.length>5000)return reply({error:'分享内容过长'},413);
   let input;try{input=JSON.parse(body.toString());PlaylistImport.parse(input?.link);}catch(e){return reply({error:e.code==='INVALID_LINK'?e.message:'请粘贴有效的歌单链接。'},400);}
   const me=await fetchUpstream(new URL('/api/auth/me',UPSTREAM).href,{method:'GET',headers,redirect:'error',signal:AbortSignal.timeout(25000)});
   if(!me.ok||!me.headers.get('Content-Type')?.includes('application/json')){await me.body?.cancel();return reply({error:'账号连接暂时不可用，请稍后重试。'},502);}
   const account=(await me.json()).user;if(!account?.id)return reply({error:'请先登录自己的账号'},401);
   const now=Date.now();for(const [id,value]of playlistState.hits)if(value.until<now)playlistState.hits.delete(id);
   let quota=playlistState.hits.get(account.id);if(!quota){if(playlistState.hits.size>=1000)return reply({error:'当前读取人数较多，请稍后再试。'},429);quota={count:0,until:now+600000};playlistState.hits.set(account.id,quota);}
   if(quota.count>=12||playlistState.inflight>=4)return reply({error:'读取次数较多或服务繁忙，请稍后再试，或使用粘贴列表。'},429);quota.count++;playlistState.inflight++;
   try{return reply({playlist:await PlaylistImport.load(input.link,fetchUpstream)},200);}catch(e){return reply({error:e.message},e.code==='INVALID_LINK'?400:422);}finally{playlistState.inflight--;}
  }
  const target=new URL(url.pathname+url.search,new URL(UPSTREAM).origin);
  const response=await fetchUpstream(target.href,{method:request.method,headers,body,redirect:'error',signal:AbortSignal.timeout(25000)});
  if(!response.headers.get('Content-Type')?.includes('application/json'))return reply({error:'账号服务暂时无法连接，请稍后重试。'},502);
  // No API response is cached. Cookies and provider headers never reach the client.
  const outgoing=new Headers(common);outgoing.set('Content-Type','application/json;charset=utf-8');
  if(response.headers.has('Retry-After'))outgoing.set('Retry-After',response.headers.get('Retry-After'));
  return cors(new Response(response.body,{status:response.status,headers:outgoing}));
 }catch(e){return reply({error:'账号服务连接超时或暂时不可用，请稍后重试。'},502);}
}

export function createHandler(fetchUpstream=fetch){
 let cached=null,pending=null;const playlistState={hits:new Map(),inflight:0};
 async function check(){
  if(cached&&Date.now()-cached.time<10000)return cached.value;
  if(pending)return pending;
  pending=(async()=>{
   try{
    const response=await fetchUpstream(UPSTREAM,{method:'GET',redirect:'error',signal:AbortSignal.timeout(12000),headers:{Accept:'application/json','User-Agent':'Songbox-Connectivity-Check/1.0 (+https://waizibushiyezi.github.io/karaoke-machine/)'}});
    if(!response.ok||!response.headers.get('Content-Type')?.includes('application/json'))throw Error('unavailable');
    const data=await response.json();if(!/^[a-f0-9]{16}$/.test(data?.version||''))throw Error('invalid response');
    return {ok:true,stage:'upstream-connected'};
   }catch(e){return {ok:false,stage:'upstream-unavailable'};}
  })();
  try{const value=await pending;cached={time:Date.now(),value};return value;}finally{pending=null;}
 }
 return async request=>{
  const path=new URL(request.url).pathname;
  if(path.startsWith('/api/'))return accountApi(request,fetchUpstream,playlistState);
  if(!['GET','HEAD'].includes(request.method))return json({error:'此页面仅用于连接测试，不接收账号信息。'},405);
  if(path==='/health')return json({ok:true,service:'songbox-account-gateway',gateway:true});
  if(path==='/check'){const result=await check();return json(result,result.ok?200:502);}
  if(path==='/')return new Response(request.method==='HEAD'?null:PAGE,{headers:{...common,'Content-Type':'text/html;charset=utf-8','Content-Security-Policy':"default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'"}});
  return json({error:'Not found'},404);
 };
}

export function start(port=Number(process.env.PORT)||10000){
 const handle=createHandler();
 const server=http.createServer(async(req,res)=>{
  try{
   const requestUrl=new URL(req.url,'http://localhost');
   let body;
   if(['POST','PUT'].includes(req.method)){
    if(Number(req.headers['content-length'])>BODY_LIMIT){req.resume();res.writeHead(413,{'Content-Type':'application/json',...common});res.end('{"error":"输入过长"}');return;}
    const parts=[];let size=0;for await(const part of req){size+=part.length;if(size>BODY_LIMIT){res.writeHead(413,{'Content-Type':'application/json',...common});res.end('{"error":"输入过长"}');return;}parts.push(part);}body=Buffer.concat(parts);
   }else req.resume();
   // Forward only the allowed API fields; never log bodies, passwords or tokens.
   const response=await handle(new Request(requestUrl,{method:req.method,headers:req.headers,body}));
   res.writeHead(response.status,Object.fromEntries(response.headers));
   if(response.body){for await(const part of response.body){if(!res.write(part))await new Promise(resolve=>res.once('drain',resolve));}}res.end();
  }catch(e){res.writeHead(500,{'Content-Type':'application/json',...common});res.end('{"error":"Connection check unavailable"}');}
 });
 server.listen(port,'0.0.0.0',()=>console.log('Songbox connection test listening on port '+port));
 process.on('SIGTERM',()=>{server.close(()=>process.exit(0));setTimeout(()=>process.exit(0),10000).unref();});
 return server;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)start();
