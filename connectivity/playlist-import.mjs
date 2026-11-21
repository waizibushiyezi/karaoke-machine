// Public playlist metadata only. Never request audio, cookies or platform credentials.
const PlaylistImport=(()=>{
 const MAX_TRACKS=2000,MAX_BYTES=5000000;
 const hosts=new Set(['music.163.com','y.music.163.com','163cn.tv','y.qq.com','i.y.qq.com','i2.y.qq.com','c.y.qq.com','c6.y.qq.com']);
 const clean=value=>typeof value==='string'?value.replace(/[\u0000-\u001f\u007f]/g,' ').trim():'';
 const fail=(message,code='PLAYLIST_UNAVAILABLE')=>Object.assign(Error(message),{code});
 function safeUrl(value){let url;try{url=new URL(value);}catch{throw fail('请粘贴 QQ 音乐或网易云音乐的歌单分享链接。','INVALID_LINK');}if(!['https:','http:'].includes(url.protocol)||url.username||url.password||url.port||!hosts.has(url.hostname))throw fail('只支持 QQ 音乐和网易云音乐的官方歌单链接。','INVALID_LINK');url.protocol='https:';return url;}
 function fromUrl(url){
  const fragment=url.hash.startsWith('#/')?url.hash.slice(1):'',path=fragment?fragment.split('?')[0]:url.pathname,query=fragment?new URLSearchParams(fragment.split('?')[1]||''):url.searchParams;
  let provider,id;
  if(['music.163.com','y.music.163.com'].includes(url.hostname)&&/^\/(?:m\/)?playlist\/?$/.test(path)){provider='netease';id=query.get('id');}
  if(['y.qq.com','i.y.qq.com','i2.y.qq.com'].includes(url.hostname)){
   const match=path.match(/^\/n\/(?:ryqq(?:_v2)?|yqq)\/playlist\/(\d+)(?:\.html)?\/?$/)||path.match(/^\/a\/playlist\/(\d+)\/?$/);
   if(match){provider='qq';id=match[1];}
   else if(/^\/(?:n2\/m\/share\/details\/taoge|n[23]\/other\/pages\/details\/playlist)\.html$/.test(path)){provider='qq';id=query.get('id')||query.get('disstid');}
  }
  if(provider&&/^[1-9]\d{0,19}$/.test(id||''))return {provider,id,url:provider==='qq'?'https://y.qq.com/n/ryqq_v2/playlist/'+id:'https://music.163.com/playlist?id='+id};
  return null;
 }
 function parse(text){
  if(typeof text!=='string'||text.length>4096)throw fail('歌单分享内容过长，请只粘贴一个歌单链接。','INVALID_LINK');
  const found=text.match(/https?:\/\/[^\s<>"'\[\]]+/gi)||[];const links=[...new Set(found.map(s=>s.replace(/[。；，！、）)]+$/u,'')))];if(links.length!==1)throw fail('请粘贴一份歌单的完整链接或含链接的分享文案。微信卡片截图不能直接识别歌单。','INVALID_LINK');
  const url=safeUrl(links[0]),direct=fromUrl(url);if(direct)return direct;
  const short=url.hostname==='163cn.tv'&&/^\/[A-Za-z0-9_-]{2,80}\/?$/.test(url.pathname)||['c.y.qq.com','c6.y.qq.com'].includes(url.hostname)&&url.pathname==='/base/fcgi-bin/u'&&/^[A-Za-z0-9_-]{1,100}$/.test(url.searchParams.get('__')||'');
  if(!short)throw fail('这个链接不是支持的歌单地址，请在歌单分享面板复制链接。','INVALID_LINK');return {shortUrl:url.href};
 }
 async function body(response,signal){
  if(Number(response.headers.get('Content-Length'))>MAX_BYTES)throw fail('歌单内容超过读取容量，请拆成较小歌单或导入文本。');
  if(!response.body)return '';const reader=response.body.getReader(),decoder=new TextDecoder();let result='',size=0;
  try{while(true){if(signal.aborted)throw fail('读取歌单超时，请稍后重试或粘贴歌曲列表。');const item=await reader.read();if(item.done)break;size+=item.value.length;if(size>MAX_BYTES)throw fail('歌单内容超过读取容量，请拆成较小歌单或导入文本。');result+=decoder.decode(item.value,{stream:true});}return result+decoder.decode();}finally{await reader.cancel().catch(()=>{});}
 }
 function metadata(provider,id,data){
  const p=provider==='qq'?data?.cdlist?.[0]:data?.result||data?.playlist;
  if(provider==='qq'?(data?.code!==0||data?.subcode!==0||!p||p.dir_show!==1):(data?.code!==200||!p||p.privacy!==0))throw fail('平台未提供这份公开歌单。请确认歌单公开且分享有效，或改用粘贴列表 / 文本文件。');
  const raw=provider==='qq'?p.songlist:p.tracks;if(!Array.isArray(raw))throw fail('平台没有返回歌曲列表，请改用粘贴列表。');
  const tracks=[];let invalid=0;const ids=new Set();
  for(const row of raw.slice(0,MAX_TRACKS)){
   const name=clean(provider==='qq'?row?.songname:row?.name),artist=(provider==='qq'?row?.singer:row?.artists||row?.ar);const sourceId=String(provider==='qq'?row?.songid||row?.songmid||'':row?.id||'');
   if(!name||name.length>200){invalid++;continue;}const key=sourceId||name;if(ids.has(key))continue;ids.add(key);tracks.push({key:String(tracks.length),name,artist:Array.isArray(artist)?artist.map(a=>clean(a?.name)).filter(Boolean).join(' / ').slice(0,240):''});
  }
  const reported=Number(provider==='qq'?p.total_song_num:p.trackCount),total=Number.isSafeInteger(reported)&&reported>=0?reported:null;
  if(!tracks.length)throw fail('没有读取到可导入的歌曲。歌单可能为空、已关闭或需要平台登录，请改用粘贴列表。');
  const complete=total!==null&&raw.length===total&&raw.length<=MAX_TRACKS&&invalid===0&&tracks.length===total;
  return {provider,title:(clean(provider==='qq'?p.dissname:p.name)||'未命名歌单').slice(0,200),sourceUrl:provider==='qq'?'https://y.qq.com/n/ryqq_v2/playlist/'+id:'https://music.163.com/playlist?id='+id,tracks,total,received:tracks.length,complete,warning:complete?'':(total!==null?'平台标示 '+total+' 首，本次读取到 '+tracks.length+' 首。':'平台未提供完整总数，本次读取到 '+tracks.length+' 首。')+'只能导入下方已展示的歌曲；缺少部分可用粘贴列表或文本文件补充。'};
 }
 async function load(text,fetcher=fetch){
  let target=parse(text);const signal=AbortSignal.timeout(18000),headers={Accept:'application/json,text/html;q=0.8','User-Agent':'Mozilla/5.0 (compatible; SongboxPlaylistImport/1.0)'};
  try{
   if(target.shortUrl){let url=safeUrl(target.shortUrl);for(let hop=0;hop<4;hop++){
    const response=await fetcher(url.href,{method:'GET',headers,redirect:'manual',signal});const direct=fromUrl(url);if(direct){await response.body?.cancel();target=direct;break;}
    const location=response.headers.get('Location');await response.body?.cancel();if(![301,302,303,307,308].includes(response.status)||!location)throw fail('短链接未能展开，请复制歌单详情页的完整网址。');url=safeUrl(new URL(location,url).href);target=fromUrl(url)||{shortUrl:url.href};if(target.provider)break;
   }if(!target.provider)throw fail('短链接跳转过多，请复制歌单详情页的完整网址。');}
   const endpoint=target.provider==='qq'?'https://c.y.qq.com/qzone/fcg-bin/fcg_ucc_getcdinfo_byids_cp.fcg?type=1&json=1&utf8=1&onlysong=0&disstid='+target.id+'&format=json':'https://music.163.com/api/playlist/detail?id='+target.id+'&n=2000';
   const response=await fetcher(endpoint,{method:'GET',headers:{...headers,Referer:target.provider==='qq'?'https://y.qq.com/':'https://music.163.com/'},redirect:'manual',signal});
   if(!response.ok||response.status>=300) {await response.body?.cancel();throw fail('平台暂时没有返回歌单，请稍后重试或使用粘贴列表。');}
   let data;try{data=JSON.parse(await body(response,signal));}catch(e){if(e.code)throw e;throw fail('平台返回的歌单暂时无法识别，请使用粘贴列表或文本文件。');}return metadata(target.provider,target.id,data);
  }catch(e){if(e.code&&['INVALID_LINK','PLAYLIST_UNAVAILABLE'].includes(e.code))throw e;throw fail('暂时无法连接音乐平台，请稍后重试，或用粘贴列表 / 文本文件导入。');}
 }
 return {parse,metadata,load,MAX_TRACKS};
})();
export default PlaylistImport;
