import http from 'node:http';
import {pathToFileURL} from 'node:url';

const UPSTREAM='https://alphabet-songbox.waizibushiyezi.chatgpt.site/api/version';
const PAGE=`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>字母点唱机 · 连接测试</title><style>body{font:17px/1.8 system-ui,-apple-system,"PingFang SC",sans-serif;margin:0;background:#f4f0fc;color:#302441;padding:28px 18px}main{max-width:560px;margin:8vh auto;background:white;border-radius:24px;padding:30px;box-shadow:0 12px 50px #7350c916}h1{font-size:28px;line-height:1.4}p{color:#665b77}button{font:inherit;background:#7350c9;color:white;border:0;border-radius:12px;padding:14px 22px;cursor:pointer;width:100%}button:disabled{opacity:.6}#status{background:#f4f0fc;padding:18px;border-radius:12px;overflow-wrap:anywhere;margin:20px 0}.tag{font-weight:600;color:#7350c9}.note{font-size:15px}</style><main><span class="tag">♫ 字母点唱机</span><h1>先把连接检查好</h1><p>这个页面用来确认你的手机能否访问新服务，以及新服务能否连接原账号系统。</p><div id="status" role="status">新服务页面已打开。请点下方按钮继续检查。</div><button id="check">开始连接测试</button><p class="note">测试不需要账号或密码，不会创建账号，也不会修改曲库。测试通过后，仍需继续接入正式注册功能。</p><p class="note">首次唤醒免费测试服务可能需要稍等一会儿。</p></main><script>const button=document.getElementById('check'),status=document.getElementById('status');button.onclick=async()=>{button.disabled=true;status.textContent='正在检查与原账号系统的连接…';try{const response=await fetch('/check',{cache:'no-store'}),data=await response.json();status.textContent=response.ok&&data.ok?'连接测试通过。请把这个结果告诉管理员，继续完成账号功能接入。':'新服务可以打开，但暂时无法连接原账号系统。请把这个结果告诉管理员。';}catch(e){status.textContent='连接未完成，请稍后再试，或切换网络后重新打开此页面。';}finally{button.disabled=false;}};</script></html>`;
const common={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','X-Robots-Tag':'noindex, nofollow'};
const json=(body,status=200)=>Response.json(body,{status,headers:common});

export function createHandler(fetchUpstream=fetch){
 let cached=null,pending=null;
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
  if(!['GET','HEAD'].includes(request.method))return json({error:'此页面仅用于连接测试，不接收账号信息。'},405);
  if(path==='/health')return json({ok:true,service:'songbox-connectivity-check'});
  if(path==='/check'){const result=await check();return json(result,result.ok?200:502);}
  if(path==='/')return new Response(request.method==='HEAD'?null:PAGE,{headers:{...common,'Content-Type':'text/html;charset=utf-8','Content-Security-Policy':"default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'"}});
  return json({error:'Not found'},404);
 };
}

export function start(port=Number(process.env.PORT)||10000){
 const handle=createHandler();
 const server=http.createServer(async(req,res)=>{
  try{
   // No body is read, forwarded or logged. Only a fixed public version URL is fetched.
   const response=await handle(new Request('http://localhost'+req.url,{method:req.method}));
   res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));
  }catch(e){res.writeHead(500,{'Content-Type':'application/json',...common});res.end('{"error":"Connection check unavailable"}');}
 });
 server.listen(port,'0.0.0.0',()=>console.log('Songbox connection test listening on port '+port));
 process.on('SIGTERM',()=>{server.close(()=>process.exit(0));setTimeout(()=>process.exit(0),10000).unref();});
 return server;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)start();
