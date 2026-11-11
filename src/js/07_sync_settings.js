/* ============ 云同步（GitHub Gist / WebDAV / 自建地址） ============
   不依赖本机 localStorage：整份数据存到你自己的一个私密位置，
   换设备 / 换网址填同一份凭据就能接上；合并按 id + 更新时间，删除用墓碑记录。 */
const SYNC_FILE='english-notes-sync.json';
const SYNC_KEEP_DAYS=120;
let syncBusy=false,syncTimer=0,syncTypingTimer=0,syncStartAt=0;
/* 请求超时：手机网络到 api.github.com 经常直接卡住（不给响应也不报错） */
let SYNC_TIMEOUT=15000;
/* 记住上一次同步的结果文案，别被后续渲染覆盖掉 */
let syncStatusMsg='',syncStatusErr=false;
function syncCfg(){
  state.meta=state.meta||{};
  /* 必须原地补齐、返回同一个对象：否则异步同步过程中写回的 Gist ID 会落到旧对象上丢掉 */
  if(!state.meta.sync||typeof state.meta.sync!=='object') state.meta.sync={};
  const c=state.meta.sync;
  ['ghToken','ghGistId','url','user','pass'].forEach(k=>{ if(typeof c[k]!=='string') c[k]=c[k]?String(c[k]):''; });
  if(!c.provider) c.provider='gist';
  if(typeof c.auto!=='boolean') c.auto=true;
  if(typeof c.lastAt!=='number') c.lastAt=0;
  if(typeof c.lastBy!=='string') c.lastBy='';
  if(!state.meta.device) state.meta.device=uid();
  return c;
}
/* 没填过通道时按 GitHub Gist 算（和界面上默认高亮的那一项一致） */
function syncProv(cfg){ return (cfg&&cfg.provider==='dav')?'dav':'gist'; }
function syncReady(cfg){
  if(!cfg) return false;
  return syncProv(cfg)==='gist'?!!String(cfg.ghToken||'').trim():!!String(cfg.url||'').trim();
}
function syncNeedMsg(cfg){
  return syncProv(cfg)==='gist'?'先填 GitHub Token（要勾 gist 权限）':'先填云端地址';
}
function addGrave(type,id){
  if(!id) return;
  state.grave=Array.isArray(state.grave)?state.grave:[];
  state.grave.push({t:type,id:id,at:Date.now()});
  if(state.grave.length>800) state.grave=state.grave.slice(-800);
}
function demoOnly(){
  const words=(state.words||[]).filter(w=>w.source!=='demo');
  const notes=(state.notes||[]).filter(n=>n.id!=='n_welcome');
  return !words.length&&!notes.length;
}
function localDoc(){
  return {v:1,at:Date.now(),device:state.meta&&state.meta.device||'',
    folders:state.folders||[],notes:state.notes||[],words:state.words||[],
    aiLog:state.aiLog||[],grave:state.grave||[],tagList:state.tagList||[]};
}
/* 两份数据合并：同 id 取更新时间较新的；墓碑时间晚于条目更新时间的视为已删除 */
function mergeDocs(a,b){
  a=a||{}; b=b||{};
  const gmap={};
  (a.grave||[]).concat(b.grave||[]).forEach(g=>{
    if(!g||!g.id) return;
    const k=g.t+':'+g.id;
    if(gmap[k]===undefined||gmap[k]<(g.at||0)) gmap[k]=g.at||0;
  });
  const cut=Date.now()-SYNC_KEEP_DAYS*DAY;
  const graveList=Object.keys(gmap).filter(k=>gmap[k]>cut).map(k=>{
    const p=k.split(':');
    return {t:p[0],id:p.slice(1).join(':'),at:gmap[k]};
  });
  const alive={};
  graveList.forEach(g=>{ alive[g.t+':'+g.id]=g.at; });
  const pick=(x,y,type)=>{
    const map=new Map();
    (x||[]).forEach(it=>{ if(it&&it.id) map.set(it.id,it); });
    (y||[]).forEach(it=>{
      if(!it||!it.id) return;
      const old=map.get(it.id);
      if(!old){ map.set(it.id,it); return; }
      const ta=old.updatedAt||old.createdAt||0,tb=it.updatedAt||it.createdAt||0;
      map.set(it.id,tb>=ta?it:old);
    });
    return [...map.values()].filter(it=>{
      const g=alive[type+':'+it.id];
      return !(g&&g>=(it.updatedAt||it.createdAt||0));
    });
  };
  const logs=new Map();
  (a.aiLog||[]).concat(b.aiLog||[]).forEach(l=>{ if(l&&l.id) logs.set(l.id,l); });
  /* 只要任意一台设备有真实内容，示例数据就不再参与同步（新设备不会被示例词污染） */
  const hasReal=d=>((d.words||[]).some(w=>w&&w.source!=='demo'))||((d.notes||[]).some(n=>n&&n.id!=='n_welcome'));
  const keepDemo=!hasReal(a)&&!hasReal(b);
  const notesOut=pick(a.notes,b.notes,'note');
  const wordsOut=pick(a.words,b.words,'word');
  /* 标签类别：两边取并集；被删除过的标签（墓碑）剔掉，别被另一台设备复活 */
  const tset=new Set();
  (a.tagList||[]).concat(b.tagList||[]).forEach(t=>{ if(t) tset.add(t); });
  wordsOut.forEach(w=>(w.tags||[]).forEach(t=>{ if(t) tset.add(t); }));
  const tagsOut=[...tset].filter(t=>{ const g=alive['tag:'+t]; return !g; });
  return {
    folders:pick(a.folders,b.folders,'folder').sort((x,y)=>(x.createdAt||0)-(y.createdAt||0)),
    notes:keepDemo?notesOut:notesOut.filter(n=>n.id!=='n_welcome'),
    words:keepDemo?wordsOut:wordsOut.filter(w=>w.source!=='demo'),
    aiLog:[...logs.values()].sort((x,y)=>(y.createdAt||0)-(x.createdAt||0)).slice(0,300),
    grave:graveList,
    tagList:tagsOut
  };
}
function applyDoc(doc){
  const snap=()=>JSON.stringify([state.folders,state.notes,state.words,state.aiLog]);
  const before=snap();
  state.folders=doc.folders||[]; state.notes=doc.notes||[];
  state.words=doc.words||[]; state.aiLog=doc.aiLog||[]; state.grave=doc.grave||[];
  state.tagList=Array.isArray(doc.tagList)?doc.tagList:[];
  (state.words||[]).forEach(ensureSrs);
  return snap()!==before;
}
/* ---------- 随身同步码：没有 GitHub 也能把数据搬到另一台设备 ---------- */
const CODE_PREFIX='ENSYNC1:';
function b64enc(s){ try{ return btoa(unescape(encodeURIComponent(String(s||'')))); }catch(_){ return ''; } }
function b64dec(s){ try{ return decodeURIComponent(escape(atob(String(s||'')))); }catch(_){ return ''; } }
function syncCodeMake(){
  const d=localDoc();
  const json=JSON.stringify({v:1,at:Date.now(),folders:d.folders||[],notes:d.notes||[],words:d.words||[],
    aiLog:(d.aiLog||[]).slice(0,100),tagList:d.tagList||[]});
  const code=CODE_PREFIX+b64enc(json);
  const box=$('#stCodeBox'); if(box) box.value=code;
  const note=$('#stCodeNote');
  if(note) note.textContent='已生成约 '+Math.max(1,Math.round(code.length/1024))+' KB · 点「复制」或「分享到…」发到另一台设备，在那边粘贴后点「导入粘贴的码」';
  return code;
}
function syncCodeApply(){
  const box=$('#stCodeBox');
  const raw=String(box?box.value:'').trim();
  const i=raw.indexOf(CODE_PREFIX);
  if(i<0){ toast('先把另一台设备的同步码粘到框里','warn'); return false; }
  let obj=null;
  try{ obj=JSON.parse(b64dec(raw.slice(i+CODE_PREFIX.length).replace(/\s+/g,''))); }catch(_){ }
  if(!obj||!Array.isArray(obj.words)||!Array.isArray(obj.notes)){ toast('同步码不完整，请重新复制一次','warn'); return false; }
  const merged=mergeDocs(localDoc(),obj);
  applyDoc(merged); save(); render();
  try{ syncSettingsUI(); }catch(_){ }
  const note=$('#stCodeNote');
  if(note) note.textContent='已导入并合并：现在共 '+state.words.length+' 个单词 · '+state.notes.length+' 篇笔记（本机内容都在）';
  toast('已导入，两边的都留下了');
  return true;
}
function syncCodeCopy(){
  const box=$('#stCodeBox');
  let v=box?String(box.value||'').trim():'';
  if(!v||v.indexOf(CODE_PREFIX)<0) v=syncCodeMake();
  const done=()=>toast('已复制，去另一台设备粘贴导入');
  const manual=()=>{
    try{ box.focus(); box.select(); document.execCommand('copy'); done(); }
    catch(_){ toast('复制失败：长按框里的码手动复制','warn'); }
  };
  try{
    if(navigator.clipboard&&navigator.clipboard.writeText) navigator.clipboard.writeText(v).then(done).catch(manual);
    else manual();
  }catch(_){ manual(); }
}
async function syncCodeShare(){
  const box=$('#stCodeBox');
  let v=box?String(box.value||'').trim():'';
  if(!v||v.indexOf(CODE_PREFIX)<0) v=syncCodeMake();
  try{
    if(navigator.share){ await navigator.share({title:'英语学习笔记 · 同步码',text:v}); return; }
  }catch(_){ }
  syncCodeCopy();
}
function syncB64(s){ try{ return btoa(unescape(encodeURIComponent(String(s||'')))); }catch(e){ return ''; } }
function syncAuth(cfg){ return cfg.user?{Authorization:'Basic '+syncB64(cfg.user+':'+(cfg.pass||''))}:{}; }
function syncFetch(url,opt,ms){
  const limit=ms||SYNC_TIMEOUT;
  const o=Object.assign({},opt||{});
  let ctrl=null;
  try{ if(typeof AbortController!=='undefined'){ ctrl=new AbortController(); o.signal=ctrl.signal; } }catch(_){}
  let timer=0;
  const timeout=new Promise((_,rej)=>{
    timer=setTimeout(()=>{
      try{ if(ctrl) ctrl.abort(); }catch(_){}
      const e=new Error('timeout'); e.name='AbortError'; rej(e);
    },limit);
  });
  return Promise.race([fetch(url,o),timeout]).finally(()=>clearTimeout(timer));
}
function syncHttpMsg(name,st){
  if(st===401||st===403) return name+' 拒绝访问：令牌或密码不对，或没有相应权限';
  if(st===404) return name+' 返回 404：地址不对，或文件还没建好';
  if(st===413) return name+' 说内容太大';
  if(st===429) return name+' 请求太频繁，等一会儿再试';
  if(st>=500) return name+' 服务端出错';
  return name+' 返回 HTTP '+st;
}
function syncNetMsg(task,err,ms){
  const aborted=!!(err&&(err.name==='AbortError'||/abort|timeout/i.test(String(err.message||err))));
  const sec=Math.round((ms||SYNC_TIMEOUT)/1000);
  if(aborted){
    if(/Gist|GitHub/i.test(task)) return 'GitHub 连接超时（'+sec+' 秒无响应）：当前网络访问不了 api.github.com，换 Wi-Fi/流量再试，或用自建地址（如 Cloudflare Worker）';
    return task+'超时（'+sec+' 秒无响应）：检查网络或地址后重试';
  }
  return task+'失败：可能网络不通，或被浏览器跨域（CORS）拦住了';
}
function syncWhen(t){
  if(!t) return '还没同步过';
  const d=new Date(t),n=new Date();
  const hm=('0'+d.getHours()).slice(-2)+':'+('0'+d.getMinutes()).slice(-2);
  if(d.toDateString()===n.toDateString()) return '今天 '+hm;
  return (d.getMonth()+1)+'月'+d.getDate()+'日 '+hm;
}
function syncSetStatus(t,err){
  syncStatusMsg=t||''; syncStatusErr=!!err;
  const el=$('#stSyncStatus');
  if(el){ el.textContent=t; el.classList.toggle('warn',!!err); }
}
async function syncPull(cfg){
  if(cfg.provider==='gist'){
    if(!cfg.ghGistId) return null;
    let r;
    try{ r=await syncFetch('https://api.github.com/gists/'+cfg.ghGistId,{headers:{Authorization:'Bearer '+cfg.ghToken,Accept:'application/vnd.github+json'}}); }
    catch(e){ throw new Error(syncNetMsg('读取 Gist',e)); }
    if(r.status===404) return null;
    if(!r.ok) throw new Error(syncHttpMsg('GitHub',r.status));
    const j=await r.json();
    const f=j.files&&j.files[SYNC_FILE];
    if(!f) return null;
    let txt=f.content||'';
    if(f.truncated&&f.raw_url){ try{ txt=await (await syncFetch(f.raw_url)).text(); }catch(e){} }
    try{ return JSON.parse(txt); }catch(e){ return null; }
  }
  let r;
  try{ r=await syncFetch(cfg.url,{method:'GET',headers:Object.assign({Accept:'application/json'},syncAuth(cfg)),cache:'no-store'}); }
  catch(e){ throw new Error(syncNetMsg('下载云端文件',e)); }
  if(r.status===404) return null;
  if(!r.ok) throw new Error(syncHttpMsg('云端地址',r.status));
  try{ return JSON.parse(await r.text()); }catch(e){ return null; }
}
async function syncPush(cfg,doc){
  const text=JSON.stringify(doc);
  if(cfg.provider==='gist'){
    const obj={description:'英语学习笔记 · 云同步（私有）',public:false,files:{}};
    obj.files[SYNC_FILE]={content:text};
    const common={Accept:'application/vnd.github+json',Authorization:'Bearer '+cfg.ghToken,'Content-Type':'application/json'};
    const send=(id)=>syncFetch('https://api.github.com/gists'+(id?'/'+id:''),
      {method:id?'PATCH':'POST',headers:common,body:JSON.stringify(obj)});
    let r;
    try{ r=await send(cfg.ghGistId); }
    catch(e){ throw new Error(syncNetMsg('写入 Gist',e)); }
    /* 原来的 Gist 被删了：丢掉旧 id，重新建一个 */
    if(r.status===404&&cfg.ghGistId){
      cfg.ghGistId='';
      try{ r=await send(''); }catch(e){ throw new Error(syncNetMsg('写入 Gist',e)); }
    }
    if(!r.ok) throw new Error(syncHttpMsg('GitHub',r.status));
    const j=await r.json();
    if(j&&j.id) cfg.ghGistId=j.id;
    return;
  }
  let r;
  try{ r=await syncFetch(cfg.url,{method:'PUT',headers:Object.assign({'Content-Type':'application/json'},syncAuth(cfg)),body:text}); }
  catch(e){ throw new Error(syncNetMsg('上传到云端',e)); }
  if(!r.ok) throw new Error(syncHttpMsg('云端地址',r.status));
}
async function syncNow(manual){
  const cfg=syncCfg();
  if(!syncReady(cfg)){
    if(manual){
      toast(syncNeedMsg(cfg),'warn');
      syncSetStatus(syncProv(cfg)==='gist'?'还没填 GitHub Token':'还没填云端地址',true);
    }
    return;
  }
  if(syncBusy){
    const waited=Date.now()-(syncStartAt||0);
    if(waited<SYNC_TIMEOUT+5000){
      if(manual) toast('上一次同步还没结束（'+Math.max(1,Math.round(waited/1000))+' 秒），再等等…','warn');
      return;
    }
    /* 超过 20 秒还挂着：多半是上一次请求卡死了，强制解锁重来 */
    syncBusy=false;
  }
  syncBusy=true; syncStartAt=Date.now();
  syncSetStatus('正在同步…');
  try{
    const remote=await syncPull(cfg);
    /* 新设备打开就有示例数据：此时别把示例和云端真数据混在一起 */
    const merged=(remote&&demoOnly())?Object.assign({},remote):mergeDocs(localDoc(),remote||{});
    const changed=applyDoc(merged);
    await syncPush(cfg,Object.assign({},merged,{v:1,at:Date.now(),device:state.meta.device}));
    cfg.lastAt=Date.now(); cfg.lastBy=state.meta.device;
    save(true);
    const editing=document.activeElement&&document.activeElement.isContentEditable;
    if(!editing) render();
    const cnt='笔记 '+state.notes.length+' · 单词 '+state.words.length+' · 文件夹 '+state.folders.length;
    syncSetStatus('已同步 '+syncWhen(cfg.lastAt)+' · '+cnt);
    if(!state.meta.sync.ghGistId&&syncProv(cfg)==='gist') syncSetStatus('已同步，但没拿到 Gist 编号，下次会再建一个',true);
    if(manual) toast(changed?'同步完成：已合并云端的新内容':'同步完成：两边已经一致','ok');
  }catch(e){
    const m=(e&&e.message)||String(e);
    syncSetStatus('同步失败：'+m,true);
    if(manual) toast('同步失败：'+m,'warn');
  }finally{ syncBusy=false; syncStartAt=0; }
}
function scheduleSync(){
  const cfg=state&&state.meta&&state.meta.sync;
  if(!cfg||!cfg.auto||!syncReady(cfg)) return;
  clearTimeout(syncTimer);
  syncTimer=setTimeout(()=>{ if(!syncBusy) syncNow(false); },5000);
}
/* 打开时自动拉一次，换设备就能把云端数据接回来 */
function syncOnBoot(){
  const cfg=syncCfg();
  if(cfg.auto&&syncReady(cfg)) setTimeout(()=>{ if(!syncBusy) syncNow(false); },1500);
}

/* ============ 设置 ============ */
function backupAgeDays(){
  const t=state.meta&&state.meta.backupAt;
  if(!t) return null;
  return Math.floor((Date.now()-t)/DAY);
}
function backupNoteText(){
  const cfg=state&&state.meta&&state.meta.sync;
  if(cfg&&syncReady(cfg)&&cfg.lastAt) return '已开启云同步（'+syncWhen(cfg.lastAt)+'）：换设备能接回来；再导出一份备份更保险';
  const d=backupAgeDays();
  if(d===null) return '还没有备份过：清缓存或换设备会丢数据，建议先导出一份';
  if(d<=0) return '上次备份：今天';
  if(d===1) return '上次备份：昨天';
  return '上次备份：'+d+' 天前'+(d>=7?'（有点久了，建议再导出一次）':'');
}
function stGroupSummary(){
  const st=state.settings||{};
  const set=(id,txt)=>{ const el=$('#'+id); if(el) el.textContent=txt; };
  set('stgSumAi',st.apiKey?('已配置 · '+(st.model||'默认模型')):'未配置 Key');
  set('stgSumImg',st.pixabayKey?'已有 Pixabay Key':(st.pexelsKey?'已有 Pexels Key':'未配置 · 用记忆卡代替'));
  set('stgSumLook',(st.theme==='light'?'浅色':'深色')+' · 字号'+(st.fs==='l'?'大':(st.fs==='s'?'小':'中')));
  try{
    const cfg0=state.meta&&state.meta.sync;
    if(cfg0&&syncReady(cfg0)&&cfg0.lastAt) set('stgSumData','已开启云同步');
    else{
      const d0=backupAgeDays();
      set('stgSumData',d0===null?'还没有备份':(d0<=0?'今天备份过':(d0===1?'昨天备份过':d0+' 天前备份')));
    }
  }catch(_){ }
  try{
    const cfg=syncLiveCfg();
    set('stgSumSync',syncReady(cfg)?(cfg.lastAt?('已同步 · '+syncWhen(cfg.lastAt)):'已配置 · 还没同步'):'未配置');
  }catch(_){ }
}
function syncSettingsUI(){
  const st=state.settings||{};
  try{ stGroupSummary(); }catch(_){ }
  $$('#stTheme [data-theme-val]').forEach(b=>b.classList.toggle('on',(st.theme||'dark')===b.dataset.themeVal));
  $$('#stFs [data-fs-val]').forEach(b=>b.classList.toggle('on',(st.fs||'m')===b.dataset.fsVal));
  const n=$('#stBackupNote');
  if(n){
    n.textContent=backupNoteText();
    const d=backupAgeDays();
    n.classList.toggle('warn',d===null||d>=7);
  }
  const cfg=syncLiveCfg();
  const prov=syncProv(cfg);
  $$('#stSyncProv [data-syncprov-val]').forEach(b=>b.classList.toggle('on',prov===b.dataset.syncprovVal));
  $$('#stSyncAuto [data-syncauto-val]').forEach(b=>b.classList.toggle('on',(cfg.auto?'1':'0')===b.dataset.syncautoVal));
  const g=$('#stSyncGist'),d=$('#stSyncDav');
  if(g) g.classList.toggle('hidden',prov!=='gist');
  if(d) d.classList.toggle('hidden',prov!=='dav');
  fillIfIdle('stGhToken',cfg.ghToken); fillIfIdle('stGhGist',cfg.ghGistId);
  fillIfIdle('stDavUrl',cfg.url); fillIfIdle('stDavUser',cfg.user); fillIfIdle('stDavPass',cfg.pass);
  const box=$('#stSyncStatus');
  if(box){
    const ok=syncReady(cfg);
    if(syncBusy){
      box.textContent='正在同步…';
      box.classList.remove('warn');
    }else if(syncStatusMsg){
      /* 上一次同步的结果（成功/失败）保留在这里，别被普通刷新盖掉 */
      box.textContent=syncStatusMsg;
      box.classList.toggle('warn',syncStatusErr);
    }else{
      let t='';
      if(cfg.lastAt) t='上次同步 '+syncWhen(cfg.lastAt);
      if(!ok) t=(t?t+' · ':'')+syncNeedMsg(cfg);
      if(!t) t='已配置，还没同步过';
      box.textContent=t;
      box.classList.toggle('warn',!ok);
    }
  }
}
/* 刚填好凭据、还从没同步过：自动传一次，省得再点。3 秒内只触发一次，避免重复建 Gist */
let firstSyncAt=0;
function maybeFirstSync(){
  const cfg=syncCfg();
  if(!cfg.auto||!syncReady(cfg)||cfg.lastAt) return;
  const now=Date.now();
  if(now-firstSyncAt<3000) return;
  firstSyncAt=now;
  setTimeout(()=>{ if(!syncBusy) syncNow(false); },400);
}
function syncLiveCfg(){
  const cfg=Object.assign({},syncCfg());
  const val=id=>{ const el=$('#'+id); return el?String(el.value||''):''; };
  if(val('stGhToken').trim()) cfg.ghToken=val('stGhToken').trim();
  if(val('stGhGist').trim()) cfg.ghGistId=val('stGhGist').trim();
  if(val('stDavUrl').trim()) cfg.url=val('stDavUrl').trim();
  if(val('stDavUser').trim()) cfg.user=val('stDavUser').trim();
  if(val('stDavPass')) cfg.pass=val('stDavPass');
  return cfg;
}
function fillIfIdle(id,v){
  const el=$('#'+id);
  if(el&&document.activeElement!==el) el.value=v||'';
}
function grabSyncFields(){
  const cfg=syncCfg();
  /* 空输入框不能覆盖已保存的值：Gist ID 本来就“留空自动新建”，
     以前这里会把刚拿到的 ID 抹成空，导致每同步一次就多建一个 Gist。
     只有用户正聚焦在该框里手动清空，才算真的要删除。 */
  const take=(id,key,mask)=>{
    const el=$('#'+id);
    if(!el) return;
    const v=mask?String(el.value||''):String(el.value||'').trim();
    if(v||document.activeElement===el) cfg[key]=v;
  };
  take('stGhToken','ghToken');
  take('stGhGist','ghGistId');
  take('stDavUrl','url');
  take('stDavUser','user');
  take('stDavPass','pass',true);
  return cfg;
}
function openSettings(){
  $('#stBase').value=state.settings.baseUrl||'';
  $('#stKey').value=state.settings.apiKey||'';
  $('#stModel').value=state.settings.model||'';
  $('#stPexels').value=state.settings.pexelsKey||'';
  $('#stPixabay').value=state.settings.pixabayKey||'';
  $('#stTone').value=state.settings.tone||'friend';
  $$('#settingsModal .st-group').forEach(g=>g.classList.toggle('open',g.id==='stgAi'));
  syncSettingsUI();
  $('#settingsModal').classList.add('show');
}
function saveSettings(){
  state.settings=Object.assign({},state.settings,{
    baseUrl:$('#stBase').value.trim(),apiKey:$('#stKey').value.trim(),model:$('#stModel').value.trim(),
    pexelsKey:$('#stPexels').value.trim(),pixabayKey:$('#stPixabay').value.trim(),tone:$('#stTone').value||'friend',
    theme:state.settings.theme||'dark',fs:state.settings.fs||'m'});
  save(); applyTheme(); $('#settingsModal').classList.remove('show');
  toast('设置已保存');
  /* 刚配好 AI，顺手把当前打开的词条例句补上 */
  // AI is requested only by an explicit learner action.
}
async function testConn(){
  const base=($('#stBase').value.trim()||'https://api.openai.com/v1').replace(/\/+$/,'');
  const key=$('#stKey').value.trim();
  const model=$('#stModel').value.trim()||'gpt-4o-mini';
  if(!key){ toast('先把 API Key 填上','warn'); return; }
  const btn=$('#stTest'), orig=btn.textContent;
  btn.disabled=true; btn.textContent='测试中…';
  const ctrl=new AbortController();
  const timer=setTimeout(()=>ctrl.abort(),20000);
  try{
    const res=await fetch(base+'/chat/completions',{
      method:'POST',
      headers:{'Content-Type':'application/json','Authorization':'Bearer '+key},
      body:JSON.stringify({model,temperature:0,messages:[{role:'user',content:'Reply with the single word: ok'}]}),
      signal:ctrl.signal
    });
    if(!res.ok){ let t=''; try{ t=await res.text(); }catch(_){} throw new Error('HTTP '+res.status+' '+String(t).slice(0,110)); }
    const d=await res.json();
    const txt=(d&&d.choices&&d.choices[0]&&d.choices[0].message&&d.choices[0].message.content)||'';
    toast(txt?'连接成功，模型可用':'连接成功，但返回内容为空','ok');
  }catch(err){
    const msg=(err&&err.name==='AbortError')?'请求超时（20 秒）':aiErrText(err);
    toast('连接失败：'+msg,'warn');
  }finally{ clearTimeout(timer); btn.disabled=false; btn.textContent=orig; }
}
function exportData(){
  try{
    const blob=new Blob([JSON.stringify(state,null,2)],{type:'application/json'});
    const a=document.createElement('a');
    a.href=URL.createObjectURL(blob);
    a.download='english-notes-backup-'+new Date().toISOString().slice(0,10)+'.json';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(()=>URL.revokeObjectURL(a.href),4000);
    state.meta=state.meta||{};
    state.meta.backupAt=Date.now();
    save();
    syncSettingsUI();
    toast('已导出备份文件');
  }catch(e){ toast('导出失败：'+e.message,'warn'); }
}
function csvCell(v){
  return '"'+String(v==null?'':v).replace(/"/g,'""')+'"';
}
function exportAnki(){
  const words=state.words.slice().sort((a,b)=>a.term.toLowerCase().localeCompare(b.term.toLowerCase()));
  if(!words.length){ toast('表达库还是空的','warn'); return; }
  const rows=[['Front','Back','Tags'].map(csvCell).join(',')];
  words.forEach(w=>{
    const front='<b>'+esc(w.term)+'</b>'+(w.phonetic?'<br><span style="color:#888">'+esc(w.phonetic)+'</span>':'');
    let back='<div style="font-size:16px;line-height:1.7">'+esc(w.definition||'（暂无释义）').replace(/\n/g,'<br>')+'</div>';
    if((w.examples||[]).length){
      back+='<hr>';
      back+=(w.examples||[]).map(x=>'<div style="margin:8px 0"><div>'+esc(x.en)+'</div>'+(x.cn?'<div style="color:#888;font-size:14px">'+esc(x.cn)+'</div>':'')+'</div>').join('');
    }
    if((w.tags||[]).length) back+='<div style="margin-top:8px;color:#888;font-size:13px">#'+w.tags.map(t=>esc(t)).join(' #')+'</div>';
    rows.push([csvCell(front),csvCell(back),csvCell((w.tags||[]).join(' '))].join(','));
  });
  const csv='\ufeff'+rows.join('\r\n');
  try{
    const blob=new Blob([csv],{type:'text/csv;charset=utf-8'});
    const a=document.createElement('a');
    a.href=URL.createObjectURL(blob);
    a.download='anki-cards-'+new Date().toISOString().slice(0,10)+'.csv';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(()=>URL.revokeObjectURL(a.href),4000);
    toast('已导出 '+words.length+' 张 Anki 卡片');
  }catch(e){ toast('导出失败：'+e.message,'warn'); }
}
function importData(file){
  const fr=new FileReader();
  fr.onload=()=>{
    try{
      const d=JSON.parse(fr.result);
      if(!d||!Array.isArray(d.words)||!Array.isArray(d.notes)) throw new Error('不是本应用的备份文件');
      showConfirm({
        title:'导入备份？',
        msg:'将用备份覆盖当前的笔记与生词（'+d.words.length+' 个单词 / '+d.notes.length+' 篇笔记），当前内容会被替换。',
        okText:'导入',danger:true,onOk(){
          state=migrate({folders:Array.isArray(d.folders)?d.folders:[],notes:d.notes,words:d.words,
            aiLog:Array.isArray(d.aiLog)?d.aiLog:[],
            meta:d.meta||{backupAt:null},
            settings:Object.assign({},d.settings||{})});
          save(); applyTheme(); ui.note=null; ui.mode='list'; ui.folder='all'; render();
          $('#settingsModal').classList.remove('show');
          toast('导入完成');
        }
      });
    }catch(e){ toast('导入失败：'+e.message,'warn'); }
  };
  fr.onerror=()=>toast('读取文件失败','warn');
  fr.readAsText(file);
}
function clearSettings(){
  showConfirm({title:'清除 AI 配置？',msg:'清除后，赋能将改用免费词典查询。',okText:'清除',danger:true,onOk(){
    state.settings={baseUrl:'',apiKey:'',model:'',tone:'friend',theme:state.settings.theme||'dark',fs:state.settings.fs||'m'}; save();
    $('#stBase').value=''; $('#stKey').value=''; $('#stModel').value=''; $('#stTone').value='friend';
    $('#settingsModal').classList.remove('show');
    toast('已清除配置');
  }});
}

/* ============ 确认弹窗 / 提示 ============ */
let confirmCb=null;
function showConfirm(opt){
  $('#cfTitle').textContent=opt.title;
  $('#cfMsg').textContent=opt.msg||'';
  $('#cfMsg').style.padding='';
  $('#cfOk').textContent=opt.okText||'确定';
  $('#cfOk').classList.toggle('danger',!!opt.danger);
  confirmCb=opt.onOk||null;
  $('#confirmModal').classList.add('show');
}
function closeConfirm(){ $('#confirmModal').classList.remove('show'); confirmCb=null; }
let toastTimer=null;
function toast(msg,type){
  const t=$('#toast'); t.textContent=msg;
  t.className='show'+(type==='warn'?' warn':'');
  clearTimeout(toastTimer);
  toastTimer=setTimeout(()=>{ t.className=''; },3000);
}

/* ============ 表达库批量操作 ============ */
function handleBatch(kind){
  const list=filteredWords();
  const sel=ui.sel.map(id=>state.words.find(w=>w.id===id)).filter(Boolean);
  if(kind==='exit'){ ui.selMode=false; ui.sel=[]; renderPane(); return; }
  if(kind==='all'){
    ui.sel=(ui.sel.length===list.length)?[]:list.map(w=>w.id);
    renderPane(); return;
  }
  if(!sel.length){ toast('先在卡片上点选单词','warn'); return; }
  if(kind==='tag'){
    const names=tagNames();
    if(!names.length){
      toast('先去「标签聚合」建几个标签类别','warn');
      ui.mode='tags'; ui.tagNewOpen=true; render();
      return;
    }
    showConfirm({title:'批量打标签',msg:'',okText:'应用'});
    const msg=$('#cfMsg');
    msg.style.padding='12px 20px 0';
    const picked=new Set();
    const draw=()=>{
      msg.innerHTML='<div class="pick-tags">'+names.map(t=>'<button type="button" class="pick-chip'+(picked.has(t)?' on':'')+'" data-pick="'+esc(t)+'">'+(picked.has(t)?'✓ ':'')+'# '+esc(t)+'</button>').join('')+'</div>';
    };
    draw();
    msg.onclick=e=>{
      const b=e.target.closest('[data-pick]');
      if(!b) return;
      const t=b.dataset.pick;
      if(picked.has(t)) picked.delete(t); else picked.add(t);
      draw();
    };
    confirmCb=()=>{
      if(!picked.size){ toast('至少选一个标签','warn'); return; }
      const arr=[...picked];
      sel.forEach(w=>{ w.tags=[...new Set([...(w.tags||[]),...arr])]; w.updatedAt=Date.now(); });
      arr.forEach(putTag);
      save(); render(); toast('已为 '+sel.length+' 个单词打上 '+arr.map(t=>'#'+t).join(' '));
    };
    return;
  }
  if(kind==='ex'){
    const need=sel.filter(w=>!(w.examples&&w.examples.length));
    batchGenExamples(need.length?need:sel);
    return;
  }
  if(kind==='master'){
    sel.forEach(w=>{ const s=ensureSrs(w); s.box=6; w.mastered=true; w.updatedAt=Date.now(); });
    save(); render(); toast('已标记 '+sel.length+' 个为已掌握');
    return;
  }
  if(kind==='del'){
    showConfirm({
      title:'删除 '+sel.length+' 个单词？',msg:'例句和练习记录里的引用会一并移除，删除后无法恢复。',
      okText:'删除',danger:true,onOk(){
        const ids=new Set(sel.map(w=>w.id));
        ids.forEach(id=>addGrave('word',id));
        state.words=state.words.filter(w=>!ids.has(w.id));
        ui.sel=[];
        save(); render(); toast('已删除 '+ids.size+' 个单词');
      }
    });
  }
}
/* ============ 侧边栏滑动关闭 ============ */
function bindSideSwipe(){
  const sb=$('#sidebar');
  if(!sb) return;
  let x0=0,y0=0,dx=0,on=false;
  sb.addEventListener('touchstart',e=>{
    if(window.innerWidth>=768||!ui.sideOpen) return;
    const t=e.touches[0]; x0=t.clientX; y0=t.clientY; dx=0; on=true;
    sb.style.transition='none';
  },{passive:true});
  sb.addEventListener('touchmove',e=>{
    if(!on) return;
    const t=e.touches[0];
    const ddx=t.clientX-x0, ddy=t.clientY-y0;
    if(Math.abs(ddy)>Math.abs(ddx)&&Math.abs(ddy)>12){ on=false; sb.style.transition=''; sb.style.transform=''; return; }
    dx=Math.min(0,ddx);
    sb.style.transform='translateX('+dx+'px)';
  },{passive:true});
  sb.addEventListener('touchend',()=>{
    if(!on) return;
    on=false;
    sb.style.transition='';
    sb.style.transform='';
    if(dx<-60){ ui.sideOpen=false; render(); }
  },{passive:true});
}
/* ============ 备份提醒 ============ */
let backupWarned=false;
function backupReminder(){
  if(backupWarned) return;
  if(state.words.length<10) return;
  const d=backupAgeDays();
  if(d===null||d>=7){
    backupWarned=true;
    toast(d===null?'还没备份过：设置里可导出备份，避免清缓存丢数据':'距上次备份已 '+d+' 天，建议到设置里导出一次','warn');
  }
}

/* ============ 事件绑定 ============ */
function bindEvents(){
  /* 侧边栏 */
  $('#btnNewFolder').addEventListener('click',()=>{
    showConfirm({title:'新建文件夹',msg:'',okText:'创建',danger:false,onOk:null});
    const msg=$('#cfMsg');
    msg.innerHTML='<input id="cfInput" placeholder="文件夹名称" style="width:100%;border:1px solid var(--s5);border-radius:10px;padding:11px 12px;font-size:16px;background:var(--s0);color:var(--text);box-sizing:border-box">';
    msg.style.padding='12px 20px 0';
    const inp=msg.querySelector('#cfInput');
    setTimeout(()=>inp.focus(),60);
    confirmCb=()=>{
      const name=inp.value.trim();
      if(!name){ toast('请输入文件夹名称','warn'); $('#btnNewFolder').click(); return; }
      createFolder(name);
      render();
      toast('已创建文件夹');
    };
    inp.addEventListener('keydown',e=>{ if(e.key==='Enter'){ e.preventDefault(); $('#cfOk').click(); } });
  });
  $('#btnSettings').addEventListener('click',openSettings);
  $('#stClose').addEventListener('click',()=>$('#settingsModal').classList.remove('show'));
  $('#stSave').addEventListener('click',saveSettings);
  /* 设置分组：手风琴，点开一个就收起别的 */
  $$('#settingsModal .st-g-head').forEach(h=>{
    h.addEventListener('click',()=>{
      const g=h.parentElement;
      const open=g.classList.contains('open');
      $$('#settingsModal .st-group').forEach(x=>x.classList.remove('open'));
      if(!open) g.classList.add('open');
    });
  });
  $('#stCodeGen').addEventListener('click',syncCodeMake);
  $('#stCodeCopy').addEventListener('click',syncCodeCopy);
  $('#stCodeShare').addEventListener('click',syncCodeShare);
  $('#stCodeApply').addEventListener('click',syncCodeApply);
  $('#stTest').addEventListener('click',testConn);
  $('#stExport').addEventListener('click',exportData);
  $('#stImport').addEventListener('click',()=>$('#stImportFile').click());
  $('#stImportFile').addEventListener('change',e=>{
    const f=e.target.files&&e.target.files[0];
    e.target.value='';
    if(f) importData(f);
  });
  const PROVIDERS={
    deepseek:{baseUrl:'https://api.deepseek.com',model:'deepseek-flash'},
    openai:{baseUrl:'https://api.openai.com/v1',model:'gpt-4o-mini'},
    zhipu:{baseUrl:'https://open.bigmodel.cn/api/paas/v4',model:'glm-4-flash'}
  };
  $$('#settingsModal [data-prov]').forEach(b=>b.addEventListener('click',()=>{
    const p=PROVIDERS[b.dataset.prov];
    if(!p) return;
    $('#stBase').value=p.baseUrl;
    $('#stModel').value=p.model;
    toast('已填入 '+b.textContent+' 配置，只需粘贴 API Key','warn');
  }));
  $('#stClear').addEventListener('click',clearSettings);
  $$('#stTheme [data-theme-val]').forEach(b=>b.addEventListener('click',()=>{
    state.settings.theme=b.dataset.themeVal; save(); applyTheme(); syncSettingsUI();
  }));
  $$('#stFs [data-fs-val]').forEach(b=>b.addEventListener('click',()=>{
    state.settings.fs=b.dataset.fsVal; save(); applyTheme(); syncSettingsUI();
  }));
  $('#stAnki').addEventListener('click',exportAnki);
  /* 云同步 */
  $$('#stSyncProv [data-syncprov-val]').forEach(b=>b.addEventListener('click',()=>{
    const cfg=grabSyncFields();
    cfg.provider=b.dataset.syncprovVal==='dav'?'dav':'gist';
    save(); syncSettingsUI();
  }));
  $$('#stSyncAuto [data-syncauto-val]').forEach(b=>b.addEventListener('click',()=>{
    const cfg=grabSyncFields();
    cfg.auto=b.dataset.syncautoVal==='1';
    save(); syncSettingsUI();
    toast(cfg.auto?'已开启自动同步（改完 5 秒内上传）':'已改为手动同步');
  }));
  ['stGhToken','stGhGist','stDavUrl','stDavUser','stDavPass'].forEach(id=>{
    const el=$('#'+id);
    if(!el) return;
    /* 边打边保存：手机上打完 token 直接点按钮也不会丢 */
    el.addEventListener('input',()=>{
      syncStatusMsg=''; syncStatusErr=false;
      syncSettingsUI();
      clearTimeout(syncTypingTimer);
      syncTypingTimer=setTimeout(()=>{ grabSyncFields(); save(); maybeFirstSync(); },600);
    });
    el.addEventListener('change',()=>{
      grabSyncFields(); save(); syncSettingsUI();
      maybeFirstSync();
    });
  });
  $('#stSyncNow').addEventListener('click',()=>{
    const cfg=grabSyncFields();
    save(true);
    if(!syncReady(cfg)){
      toast(cfg.provider==='gist'?'先填 GitHub Token（要勾 gist 权限）':'先填云端地址','warn');
      return;
    }
    syncSettingsUI();
    syncNow(true);
  });
  $('#sideNav').addEventListener('click',e=>{
    const fmore=e.target.closest('[data-fmore]');
    if(fmore){ e.stopPropagation(); openFolderMenu(fmore.dataset.fmore); return; }
    const f=e.target.closest('[data-folder]');
    if(f){ persistEditor(); ui.folder=f.dataset.folder; ui.note=null; ui.mode='list'; ui.tag=null; ui.sideOpen=false; render(); return; }
    const nav=e.target.closest('[data-nav]');
    if(!nav) return;
    const k=nav.dataset.nav;
    persistEditor();
    if(k==='today'){ ui.mode='today'; }
    else if(k==='all'){ ui.mode='list'; ui.folder='all'; }
    else if(k==='words'){ ui.mode='words'; ui.wordFilter='all'; ui.wordTag=''; }
    else if(k==='tags'){ ui.mode='tags'; }
    else if(k==='flash'){ ui.mode='flash'; ui.flash=null; }
    else if(k==='speak'){ ui.mode='speak'; }
    if(ui.mode!=='words'){ ui.selMode=false; ui.sel=[]; }
    ui.note=null; ui.tag=null; ui.sideOpen=false;
    render();
  });
  $('#scrim').addEventListener('click',()=>{ ui.sideOpen=false; render(); });
  $('#btnMenu').addEventListener('click',()=>{ ui.sideOpen=true; render(); });

  /* 行菜单 + 删除撤销 */
  $('#rowMenuBody').addEventListener('click',e=>{
    const b=e.target.closest('[data-rmi]');
    if(!b) return;
    const it=rowMenuItems&&rowMenuItems[+b.dataset.rmi];
    closeRowMenu();
    if(it&&it.act) setTimeout(()=>{ try{ it.act(); }catch(_){ } },20);
  });
  $('#rowMenu').addEventListener('click',e=>{ if(e.target.id==='rowMenu') closeRowMenu(); });
  $('#undoBtn').addEventListener('click',runUndo);

  /* 底部导航：笔记 / 表达库 / 复习 / 更多 */
  $('#tabbar').addEventListener('click',e=>{
    const t=e.target.closest('[data-tab]');
    if(!t) return;
    const k=t.dataset.tab;
    if(k==='more'){ ui.sideOpen=true; render(); return; }
    persistEditor();
    if(k==='today'){ ui.mode='today'; ui.note=null; ui.tag=null; }
    else if(k==='list'){ ui.mode='list'; ui.folder='all'; ui.note=null; ui.tag=null; }
    else if(k==='words'){ ui.mode='words'; ui.note=null; ui.selMode=false; ui.sel=[]; ui.wordFilter='all'; ui.wordTag=''; }
    else if(k==='flash'){ ui.mode='flash'; ui.note=null; ui.flash=null; }
    ui.sideOpen=false;
    render();
  });

  /* 内容区 */
  $('#btnNewNote').addEventListener('click',newNote);
  $('#globalSearch').addEventListener('input',e=>{
    const q=e.target.value.trim();
    ui.search=q;
    $('#searchClear').classList.toggle('hidden',!q);
    if(q&&ui.mode!=='search'){ ui.prevMode=ui.mode; ui.mode='search'; ui.selMode=false; ui.sel=[]; }
    if(!q&&ui.mode==='search'){ ui.mode=ui.prevMode||'list'; }
    render();
  });
  $('#searchClear').addEventListener('click',()=>{
    $('#globalSearch').value=''; ui.search=''; $('#searchClear').classList.add('hidden');
    if(ui.mode==='search'){ ui.mode=ui.prevMode||'list'; }
    render();
  });
  $('#noteList').addEventListener('click',e=>{
    const play=e.target.closest('[data-play]');
    if(play){
      const t=play.getAttribute('data-play'),lg=play.getAttribute('data-play-lang')||'en-US';
      if(play.getAttribute('data-play-kind')==='word') speakWord(t); else speak(t,lg);
      return;
    }
    const fixex=e.target.closest('[data-fixex]');
    if(fixex){
      const w=state.words.find(x=>x.id===fixex.dataset.fixex);
      if(w) batchGenExamples([w]);
      return;
    }
    const srnote=e.target.closest('[data-srnote]');
    if(srnote){ jumpToNote(srnote.dataset.srnote); return; }
    const logItem=e.target.closest('[data-log]');
    if(logItem){
      const rec=(state.aiLog||[]).find(x=>x.id===logItem.dataset.log);
      if(rec) openAiPractice(rec.term,{title:rec.scene||'自由练习',desc:rec.sceneDesc||''});
      return;
    }
    const batchBtn=e.target.closest('[data-batch]');
    if(batchBtn){ handleBatch(batchBtn.dataset.batch); return; }
    if(e.target.closest('#wbSelMode')){
      ui.selMode=!ui.selMode; ui.sel=[]; renderPane(); return;
    }
    const mbtn=e.target.closest('[data-master]');
    if(mbtn){
      const w=state.words.find(x=>x.id===mbtn.dataset.master);
      if(w){ w.mastered=!w.mastered; w.updatedAt=Date.now(); save(); render(); }
      return;
    }
    const wf=e.target.closest('[data-wfilter]');
    if(wf){ ui.wordFilter=wf.dataset.wfilter; render(); return; }
    const ndel=e.target.closest('[data-ndel]');
    if(ndel){ e.stopPropagation(); deleteNote(ndel.dataset.ndel); return; }
    const wlink=e.target.closest('[data-wlink]');
    if(wlink){ e.stopPropagation(); jumpToNote(wlink.dataset.wlink); return; }
    const chip=e.target.closest('[data-chip]');
    if(chip){
      const t=chip.dataset.chip;
      ui.mode='tags'; ui.tag=t; ui.sideOpen=false; render();
      return;
    }
    if(e.target.closest('#tagNewBtn')){ ui.tagNewOpen=!ui.tagNewOpen; renderPane(); return; }
    if(e.target.closest('#tagEditBtn')){ ui.tagEdit=!ui.tagEdit; renderPane(); return; }
    if(e.target.closest('#tagNameOk')){ addTagFromPane(); return; }
    const tgedit=e.target.closest('[data-tg-edit]');
    if(tgedit){ e.stopPropagation(); renameTagDialog(tgedit.dataset.tgEdit); return; }
    const tgdel=e.target.closest('[data-tg-del]');
    if(tgdel){ e.stopPropagation(); deleteTagDialog(tgdel.dataset.tgDel); return; }
    const tag=e.target.closest('[data-tag]');
    if(tag){
      const t=tag.dataset.tag;
      ui.tag=(ui.tag===t)?null:t; render();
      return;
    }
    const clear=e.target.closest('#tagClear');
    if(clear){ ui.tag=null; render(); return; }
    const wshot=e.target.closest('[data-wshot]');
    if(wshot){
      e.stopPropagation();
      const wid=wshot.dataset.wshot;
      const w=state.words.find(x=>x.id===wid);
      openShotViewerFor(w?w.term:'',Number(wshot.dataset.shoti));
      return;
    }
    const card=e.target.closest('[data-wid]');
    if(card){
      if(ui.selMode){
        const id=card.dataset.wid;
        const i=ui.sel.indexOf(id);
        if(i>=0) ui.sel.splice(i,1); else ui.sel.push(id);
        renderPane();
        return;
      }
      const w=state.words.find(x=>x.id===card.dataset.wid);
      if(w) openWordModal(w.term,null,null,w);
      return;
    }
    const item=e.target.closest('[data-note]');
    if(item) openNote(item.dataset.note);
  });

  /* 表达库：排序与标签筛选 */
  $('#noteList').addEventListener('keydown',e=>{
    if(e.target&&e.target.id==='tagNameInput'&&e.key==='Enter'){ e.preventDefault(); addTagFromPane(); }
  });
  $('#noteList').addEventListener('change',e=>{
    const t=e.target;
    if(t.id==='wbSort'){ ui.wordSort=t.value; renderPane(); return; }
    if(t.id==='wbTag'){ ui.wordTag=t.value; renderPane(); return; }
  });

  /* 编辑器 */
  $('#btnBack').addEventListener('click',backToList);
  $('#btnDelNote').addEventListener('click',()=>{ if(ui.note) deleteNote(ui.note); });
  titleEl.addEventListener('input',onEditorInput);
  bodyEl.addEventListener('input',onEditorInput);
  bodyEl.addEventListener('paste',e=>{
    e.preventDefault();
    const text=(e.clipboardData||window.clipboardData).getData('text/plain');
    document.execCommand('insertText',false,text);
    onEditorInput();
  });
  /* 随时退出都不丢内容与位置：离开页面/切后台前立即落盘 */
  const flushNow=()=>{ if(saveTimer){ clearTimeout(saveTimer); saveTimer=null; } persistEditor(); };
  window.addEventListener('pagehide',flushNow);
  window.addEventListener('beforeunload',flushNow);
  document.addEventListener('visibilitychange',()=>{ if(document.visibilityState==='hidden') flushNow(); });
  titleEl.addEventListener('mouseup',scheduleCheck);
  bodyEl.addEventListener('mouseup',scheduleCheck);
  titleEl.addEventListener('touchend',scheduleCheck);
  bodyEl.addEventListener('touchend',scheduleCheck);
  titleEl.addEventListener('keyup',scheduleCheck);
  bodyEl.addEventListener('keyup',scheduleCheck);
  titleEl.addEventListener('keydown',handleEnterInWord);
  bodyEl.addEventListener('keydown',handleEnterInWord);
  /* 大标题：回车往下回到正文，行首退格变回正文 */
  bodyEl.addEventListener('keydown',e=>{
    if(e.isComposing) return;
    const b=blockAtCaret();
    if(!b||!isHead(b)) return;
    if(e.key==='Enter'&&!e.shiftKey){
      e.preventDefault();
      const div=document.createElement('div');
      div.appendChild(document.createElement('br'));
      b.parentNode.insertBefore(div,b.nextSibling);
      caretTo(div);
      applyFolds();
      onEditorInput();
      return;
    }
    if(e.key==='Backspace'&&caretAtStart(b)){
      e.preventDefault();
      b.classList.remove('nh');
      if(!b.textContent.trim()) b.innerHTML='<br>';
      applyFolds();
      onEditorInput();
    }
  });
  /* 点大标题左边那块小箭头 → 收起 / 展开下面这一段 */
  bodyEl.addEventListener('click',e=>{
    /* 拿起状态下的投放按钮 */
    const drop=e.target.closest&&e.target.closest('.mv-drop');
    if(drop&&bodyEl.contains(drop)){
      e.preventDefault(); e.stopPropagation();
      const h=drop.parentElement, hi=headList().indexOf(h);
      if(mvState.kind==='word') mvDropWord(h||null);
      else if(mvState.kind==='section') mvDropSection(h);
      return;
    }
    /* 大标题右边的「⋯」 */
    const mf=e.target.closest&&e.target.closest('.mf');
    if(mf&&bodyEl.contains(mf)){
      e.preventDefault(); e.stopPropagation();
      openMvMenu(mf.parentElement);
      return;
    }
    const h=e.target.closest&&e.target.closest('.nh');
    if(!h||!bodyEl.contains(h)) return;
    const r=h.getBoundingClientRect();
    if(e.clientX-r.left>32) return;
    if(lpFired){ lpFired=false; return; }
    e.preventDefault();
    e.stopPropagation();
    toggleFold(h);
  });
  /* 长按左边小方块 0.38 秒 → 拿起整节（点一下仍是收起） */
  let lpTimer=0, lpFired=false, lpX=0, lpY=0;
  bodyEl.addEventListener('pointerdown',e=>{
    const h=e.target.closest&&e.target.closest('.nh');
    if(!h||!bodyEl.contains(h)) return;
    const r=h.getBoundingClientRect();
    if(e.clientX-r.left>32) return;
    lpX=e.clientX; lpY=e.clientY; lpFired=false;
    clearTimeout(lpTimer);
    lpTimer=setTimeout(()=>{
      lpFired=true;
      mvLiftSection(h);
    },380);
  },{passive:true});
  bodyEl.addEventListener('pointermove',e=>{
    if(!lpTimer) return;
    if(Math.abs(e.clientX-lpX)>12||Math.abs(e.clientY-lpY)>12){ clearTimeout(lpTimer); lpTimer=0; }
  },{passive:true});
  ['pointerup','pointercancel'].forEach(ev=>{
    bodyEl.addEventListener(ev,()=>{ clearTimeout(lpTimer); lpTimer=0; },{passive:true});
  });
  editorWrap.addEventListener('mousedown',e=>{ if(e.target.closest('.en-word')) e.preventDefault(); });
  editorWrap.addEventListener('click',handleWordTap);
  document.addEventListener('mousedown',e=>{ if(!e.target.closest('#empowerPill')) hidePill(); });
  document.addEventListener('pointerdown',e=>{ if(!e.target.closest('#empowerPill')) hidePill(); },true);
  document.addEventListener('scroll',()=>{ if(pill.classList.contains('show')) placePill(); },true);
  document.addEventListener('selectionchange',()=>{ if(ui.mode==='edit') scheduleCheck(); });
  /* 手指按到操作条上：先记时间，别让“选区一收起就隐藏”把按钮吃掉 */
  ['pointerdown','touchstart'].forEach(ev=>{
    pill.addEventListener(ev,()=>{ pillHoldAt=Date.now(); },{passive:true,capture:true});
  });
  /* 按下就执行（不等 click）：键盘/布局一变化，click 可能落到别处 */
  function bindPillAction(btn,fn){
    let last=0;
    const fire=()=>{ if(Date.now()-last<400) return; last=Date.now(); pillHoldAt=Date.now(); fn(); };
    btn.addEventListener('pointerdown',e=>{ e.preventDefault(); fire(); });
    btn.addEventListener('click',e=>{ e.preventDefault(); fire(); });
    btn.addEventListener('touchend',e=>{ e.preventDefault(); fire(); });
  }
  bindPillAction($('#btnEmpower'),()=>{
    const term=ui.empowerText,range=ui.selectedRange;
    hidePill();
    if(!term) return;
    const n=state.notes.find(x=>x.id===ui.note);
    openWordModal(term,n?{id:n.id,title:n.title}:null,range,null);
  });
  bindPillAction($('#btnDict'),()=>{
    const term=ui.empowerText;
    hidePill();
    openDict(term||'');
  });
  /* 单词卡片里的「移动」→ 拿起这个词 */
  const wmMoveBtn=$('#wmMove');
  if(wmMoveBtn) wmMoveBtn.addEventListener('click',()=>{
    const sp=mvFindSpan(wmState.term,wmState.existing&&wmState.existing.id);
    if(!sp){ toast('先在正文里打开带这个词的笔记','warn'); return; }
    mvLiftWord(sp);
  });
  $('#mvCancel').addEventListener('click',()=>{ mvReset(); toast('已取消，原样没动'); });
  $('#mvPrev').addEventListener('click',()=>mvJump(-1));
  $('#mvNext').addEventListener('click',()=>mvJump(1));
  $('#mvEnd').addEventListener('click',()=>{ if(mvState.kind==='word') mvDropWord(null); });
  $('#mvUndo').addEventListener('click',()=>{
    const fn=mvState.revert;
    mvReset();
    if(fn){ fn(); toast('已撤销'); }
  });
  $('#mvMenu').addEventListener('click',e=>{
    if(e.target.id==='mvMenu'){ closeMvMenu(); return; }
    const it=e.target.closest('.mv-item');
    if(!it) return;
    const act=it.getAttribute('data-act'), h=mvMenuHead;
    closeMvMenu();
    if(!h) return;
    if(act==='lift') mvLiftSection(h);
    else if(act==='up') mvMoveSection(h,-1);
    else if(act==='down') mvMoveSection(h,1);
  });
  /* 收起键盘：笔记用顶栏的键，其它地方用浮出的小按钮 */
  const closeKb=()=>{ closeKeyboard(); };
  btnKb.addEventListener('click',closeKb);
  kbChip.addEventListener('pointerdown',e=>{ e.preventDefault(); });
  kbChip.addEventListener('click',e=>{ e.preventDefault(); closeKb(); });
  document.addEventListener('focusin',()=>setTimeout(syncKbUI,60));
  document.addEventListener('focusout',()=>setTimeout(syncKbUI,120));
  if(window.visualViewport){
    window.visualViewport.addEventListener('resize',()=>{
      syncKbUI();
      if(pill.classList.contains('show')) placePill();
    });
  }
  $('#dictClose').addEventListener('click',closeDict);
  $('#dictGo').addEventListener('click',()=>loadDict($('#dictSearch').value));
  $('#dictSearch').addEventListener('keydown',e=>{ if(e.key==='Enter'){ e.preventDefault(); loadDict($('#dictSearch').value); } });
  $('#dictToEmpower').addEventListener('click',()=>{
    const w=dictState.word;
    const d=dictState.data;
    closeDict();
    if(!w) return;
    const ex=state.words.find(x=>String(x.term).toLowerCase()===String(w).toLowerCase())||null;
    let prefill=null;
    if(d){
      const defs=(d.defs||[]).filter(x=>x&&x.cn);
      const definition=defs.map(x=>{
        const pos=(x.pos||'').trim();
        return (pos?pos+' ':'')+String(x.cn||'').trim();
      }).join('；');
      prefill={
        definition,
        phonetic:(d.us||d.uk||''),
        tags:(d.tags||[]).filter(Boolean).slice(0,4),
        examples:(d.examples||[]).filter(x=>x&&x.en).map(x=>({en:x.en,cn:x.cn||'',
          sense:defs.length===1?String(defs[0].cn||'').slice(0,6):''})),
        dict:{forms:(d.forms||[]).filter(f=>f&&(f.items||[]).length),phrs:(d.phrs||[]).filter(Boolean),syno:d.syno||{}}
      };
    }
    openWordModal(w,null,null,ex,prefill);
  });
  /* 例句跟读页 */
  $('#followBack').addEventListener('click',closeFollow);
  $('#followPlay').addEventListener('click',playFollow);
  $('#followMic').addEventListener('click',toggleFollowRec);
  $('#followOut').addEventListener('click',()=>playFollowRec());
  $('#followCmp').addEventListener('click',compareFollow);

  /* 复习键盘：空格翻卡，1/2/3 评分，自由模式用左右箭头 */
  document.addEventListener('keydown',e=>{
    if(ui.mode!=='flash') return;
    if(e.target&&/INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
    if(document.querySelector('.modal.show')||$('#aiModal').classList.contains('show')) return;
    const f=ui.flash;
    const dueMode=f&&f.mode!=='free';
    if(dueMode&&f&&f.flipped&&['1','2','3'].includes(e.key)){
      e.preventDefault(); gradeCurrent(Number(e.key)-1); return;
    }
    if(e.key===' '||e.key==='Enter'){ e.preventDefault(); flipFlash(); }
    else if(e.key==='ArrowRight'){ e.preventDefault(); stepFlash(1); }
    else if(e.key==='ArrowLeft'){ e.preventDefault(); stepFlash(-1); }
  });

  /* 单词弹窗 */
  $('#wmClose').addEventListener('click',closeWordModal);
  $('#wmSpeak').addEventListener('click',()=>{ if(wmState.term) speakWord(wmState.term); });
  $('#wmFollow').addEventListener('click',()=>{
    const t=wmState&&wmState.term;
    if(!t){ toast('还没有单词','warn'); return; }
    openFollow(t,t,'');
  });
  /* 快查小卡 */
  $('#qdClose').addEventListener('click',closeQuickDict);
  $('#qdMask').addEventListener('click',closeQuickDict);
  $('#qdSpeak').addEventListener('click',()=>{ if(qdState.show) speakWord(qdState.show); });
  $('#qdMark').addEventListener('click',()=>{
    const c=qdMarkCtx();
    if(!c){ toast('只能在例句里标亮：先点一下句子里的词','warn'); return; }
    const on=qmToggleAt(c.wkey,c.exi,c.snap,c.from,c.to,c.label);
    try{ repaintEx(c.exi); }catch(_){ }
    qdState.sel=null;
    try{ qdSelClear(); syncQdPhraseBar(); syncQdMark(); }catch(_){ }
    try{ if(on&&navigator.vibrate) navigator.vibrate(12); }catch(_){ }
    toast(on?(c.phrase?'已标亮这句里的这一小段':'已标亮这句里的这个词'):'已取消标亮', on?'ok':'');
    /* 标亮后收起卡片，让你直接看到黄底效果 */
    if(on) setTimeout(()=>{ try{ closeQuickDict(); }catch(_){ } }, 260);
  });
  $('#qdPhNext').addEventListener('click',()=>{ qdExtend(1); });
  $('#qdPhBack').addEventListener('click',()=>{ qdExtend(-1); });
  $('#qdFull').addEventListener('click',()=>{
    const w=qdState.show;
    closeQuickDict();
    if(w) openDict(w);
  });
  /* 快查里直接存词：绝不切换/覆盖正在编辑的单词卡片 */
  $('#qdSave').addEventListener('click',()=>{
    const w=String(qdState.show||'').trim();
    if(!w) return;
    const key=w.toLowerCase();
    const exist=(state.words||[]).find(x=>String(x.term||'').toLowerCase()===key);
    if(exist){ closeQuickDict(); toast('「'+exist.term+'」已经在表达库里了'); return; }
    const def=String(qdState.data&&(qdState.data.mine||qdState.data.cn)||'').trim()
      ||String((qdState.data&&qdState.data.en&&qdState.data.en[0])||'').trim();
    upsertWord({term:w,definition:def,examples:[],tags:[],source:'manual',notes:[]});
    save();
    closeQuickDict();
    toast(def?'已加入表达库：'+w:'已加入表达库：'+w+'（还没释义，可在表达库里补）','ok');
  });
  $('#wmMaster').addEventListener('click',()=>{ wmState.mastered=!wmState.mastered; renderWmMaster(); scheduleWmDraft(200); });
  $('#wmAi').addEventListener('click',openAiDialogue);
  $('#aiClose').addEventListener('click',closeAiModal);
  $('#aiClose2').addEventListener('click',closeAiModal);
  $('#aiAgain').addEventListener('click',aiAgainAction);
  $('#aiSend').addEventListener('click',submitAttempt);
  $('#aiInput').addEventListener('keydown',e=>{ if(e.key==='Enter') submitAttempt(); });
  $('#aiMic').addEventListener('click',aiMicDictate);
  $('#aiModal').addEventListener('click',e=>{ if(e.target===e.currentTarget) closeAiModal(); });
  $('#aiScene').addEventListener('click',e=>{
    const sc=e.target.closest('[data-scene]');
    if(sc){ startScene(aiState.scenes[parseInt(sc.getAttribute('data-scene'),10)]); return; }
    const gs=e.target.closest('#aiGotoScenes');
    if(gs){ aiGotoScenes(); return; }
    const p=e.target.closest('[data-play]');
    if(p) speak(p.getAttribute('data-play'),p.getAttribute('data-play-lang')||'en-US');
  });
  $('#wordModal').addEventListener('click',e=>{ if(e.target===e.currentTarget) closeWordModal(); });
  $('#settingsModal').addEventListener('click',e=>{ if(e.target===e.currentTarget) $('#settingsModal').classList.remove('show'); });
  $('#wmSave').addEventListener('click',saveWord);
  $('#wmRegen').addEventListener('click',()=>wmGenExamples());
  $('#wmDefinition').addEventListener('input',()=>scheduleWmDraft(700));
  $('#wmDraftDrop').addEventListener('click',()=>{
    if(!wmState) return;
    const term=wmState.term, note=wmState.note, range=wmState.range, existing=wmState.existing;
    wmDraftDel(term);
    wmState.saved=true;
    openWordModal(term,note,range,existing);
    toast('已丢弃这份草稿','ok');
  });
  $('#wmUseAiDef').addEventListener('click',()=>{
    const v=(wmState&&wmState.aiDef)||'';
    if(!v){ wmGenExamples(); return; }
    $('#wmDefinition').value=v;
    scheduleWmDraft(200);
    toast('已填入 AI 释义，可自行修改','ok');
  });
  $('#wmExamples').addEventListener('click',e=>{
    const qw=e.target.closest('.qw');
    if(qw){
      e.stopPropagation();
      const row=qw.closest('[data-excn]');
      const exi=row?Number(row.getAttribute('data-excn')):-1;
      const wi=Number(qw.getAttribute('data-i'));
      openQuickDict(qw.dataset.q||qw.textContent,(exi>=0&&qw.hasAttribute('data-i')&&!isNaN(wi))?{exi,wi}:null);
      return;
    }
    const enRow=e.target.closest('[data-excn]');
    if(enRow){ toggleExCnRow(enRow); return; }
    const sp=e.target.closest('[data-wmplay]');
    if(sp){
      const x=(wmState.examples||[])[Number(sp.dataset.wmplay)];
      if(x&&x.en) speak(x.en,'en-US');
      return;
    }
    const fo=e.target.closest('[data-follow]');
    if(fo){
      const x=(wmState.examples||[])[Number(fo.dataset.follow)];
      if(x&&x.en) openFollow(x.en,wmState.term,x.cn||''); else toast('这句还没有内容','warn');
      return;
    }
  });
  $('#wmTags').addEventListener('click',e=>{
    const chip=e.target.closest('[data-tag]');
    if(!chip) return;
    toggleWmTag(chip.dataset.tag);
  });
  $('#wmTagNew').addEventListener('click',gotoTagPageForNewTag);
  $('#wmCnAll').addEventListener('click',()=>{
    const list=$$('#wmExamples .ex-cn-text');
    const allShown=list.length>0&&list.every(el=>!el.classList.contains('hided'));
    setExCnAll(!allShown);
  });

  /* 核心搭配：添加 / 删除 */
  $('#wmCollAdd').addEventListener('click',addWmColl);
  $('#wmCollInput').addEventListener('keydown',e=>{
    if(e.key==='Enter'){ e.preventDefault(); addWmColl(); }
  });
  $('#wmColls').addEventListener('click',e=>{
    const chip=e.target.closest('[data-coll]');
    if(!chip) return;
    removeWmColl(Number(chip.dataset.coll));
  });

  /* 截图：全局悬浮导入 / 释义区查看按钮 / 大图查看器（点任意处返回） */
  $('#ocrFileInput').addEventListener('change',ocrImportImage);
  $('#wmShotsBtn').addEventListener('click',()=>{
    const t=wmState&&wmState.term; if(!t) return;
    const list=shotsGet(t);
    if(!list.length){ toast('还没有截图，点右下角「+」导入','warn'); return; }
    openShotViewerFor(t,0);
  });
  $('#shotViewer').addEventListener('click',e=>{
    if(e.target.closest('#svPrev')||e.target.closest('#svNext')||e.target.closest('#svDel')) return;
    closeShotViewer();
  });
  $('#svPrev').addEventListener('click',e=>{ e.stopPropagation(); viewerStep(-1); });
  $('#svNext').addEventListener('click',e=>{ e.stopPropagation(); viewerStep(1); });
  $('#svDel').addEventListener('click',e=>{ e.stopPropagation(); viewerDel(); });
  /* OCR 导入：词框点选 / 挂载 */
  $('#ocrSheet').addEventListener('click',e=>{
    if(e.target.closest('[data-ocr-close]')||e.target.id==='ocrSheet'){
      $('#ocrSheet').classList.remove('show');
      ocrSel=[]; ocrDataUrl=''; ocrWords=[];
      const ed=$('#ocrEdit'); if(ed) ed.value='';
      $('#ocrBoxes').innerHTML=''; $('#ocrImg').src='';
      $('#ocrImgWrap').classList.add('hidden'); $('#ocrSelected').classList.add('hidden');
    }
  });
  $('#ocrBoxes').addEventListener('click',e=>{
    const b=e.target.closest('.ocr-box'); if(!b) return;
    b.classList.toggle('on');
    const idx=Number(b.dataset.wi);
    const word=(ocrWords&&ocrWords[idx])||'';
    const ed=$('#ocrEdit'); if(!ed) return;
    if(b.classList.contains('on')){
      const cur=ed.value.trim();
      ed.value=cur?cur+' '+word:word;
    }else{
      ed.value=ed.value.trim().split(/\s+/).filter(t=>t.toLowerCase()!==word.toLowerCase()).join(' ');
    }
  });
  $('#ocrMount').addEventListener('click',ocrMount);

  /* 写作练习 */
  $('#writeClose').addEventListener('click',closeWriteModal);
  $('#writeModal').addEventListener('click',e=>{ if(e.target===e.currentTarget) closeWriteModal(); });
  $('#writeBack').addEventListener('click',()=>{
    if(writeState.step==='review'){ writeState.step='topic'; writeRender(); }
    else if(writeState.step==='topic'){ writeState.step='pick'; writeRender(); }
  });
  $('#writeNext').addEventListener('click',()=>{
    if(writeState.step==='pick'){ writeGenAndShow(); }
    else if(writeState.step==='topic'){ writeSubmit(); }
    else if(writeState.step==='review'){ writeSaveNote(); }
  });
  $('#writeContent').addEventListener('keydown',e=>{
    if(e.target&&e.target.id==='writeArea'&&(e.ctrlKey||e.metaKey)&&e.key==='Enter'){ e.preventDefault(); writeSubmit(); }
  });

  /* 确认弹窗 */
  $('#cfOk').addEventListener('click',()=>{
    const cb=confirmCb; closeConfirm();
    if(cb) cb();
  });
  $('#cfCancel').addEventListener('click',closeConfirm);
}

function jumpToNote(noteId){
  const n=state.notes.find(x=>x.id===noteId);
  if(!n){ toast('这篇笔记已被删除','warn'); return; }
  ui.folder=n.folderId; ui.note=n.id; ui.mode='edit'; ui.tag=null; ui.sideOpen=false;
  render();
}

/* ============ 今日工作台 ============ */
function dayStart(ts){ const d=new Date(ts||Date.now()); d.setHours(0,0,0,0); return d.getTime(); }
function isToday(ts){ const s=dayStart(Date.now()); return !!(ts&&ts>=s&&ts<s+DAY); }
function todayNewWords(){ return state.words.filter(w=>isToday(w.createdAt)); }
function weakSpeakLogs(){ return (state.aiLog||[]).filter(x=>x.score<80); }
function weakSpeakLogsToday(){ return (state.aiLog||[]).filter(x=>x.score<80&&isToday(x.createdAt)); }
function todayCard(go,title,desc,num){
  return '<div class="today-card" data-go="'+go+'">'+
    '<div class="tc-num">'+num+'</div>'+
    '<div class="tc-main"><div class="tc-title">'+title+'</div><div class="tc-desc">'+desc+'</div></div>'+
    '<svg class="icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color:var(--text3)"><path d="M9 6l6 6-6 6"/></svg>'+
  '</div>';
}
function renderToday(){
  $('#paneTitle').textContent='今日';
  $('#btnNewNote').style.display='inline-flex';
  const box=$('#noteList');
  const due=dueCount();
  const fresh=todayNewWords().length;
  const weak=weakSpeakLogsToday().length;
  const writeCnt=writeLogCountToday();
  const packN=packableWords().length;
  box.innerHTML=
    '<div class="rv-stats">'+
      '<div class="rv-stat hot"><div class="n">'+due+'</div><div class="l">今日到期</div></div>'+
      '<div class="rv-stat"><div class="n">'+fresh+'</div><div class="l">今日新词</div></div>'+
      '<div class="rv-stat'+(weak?' hot':'')+'"><div class="n">'+weak+'</div><div class="l">口语待加强</div></div>'+
    '</div>'+
    '<div class="today-greet">每天 45 分钟：先复习，再开口，最后写一段。</div>'+
    '<div class="today-actions">'+
      todayCard('flash','闪卡复习','把到期的词过一遍',due)+
      todayCard('pack','打包口语','难词一次练 '+packN+' 个',packN)+
      todayCard('write','写作练习','今日已写 '+writeCnt+' 篇 · 用今天的词写一段',writeCnt)+
      todayCard('words','今日新词','回看今天攒的生词',fresh)+
    '</div>'+
    '<div class="today-tip">输入 25′（视频+跟读）→ 加工 10′（搭配+标签）→ 复习 10′（闪卡）。每周 2 次口语打包、1 次写作。</div>';
  $$('#noteList [data-go]').forEach(el=>el.addEventListener('click',()=>{
    const g=el.dataset.go;
    if(g==='flash'){ ui.mode='flash'; ui.flash=null; render(); }
    else if(g==='words'){ ui.mode='words'; ui.wordFilter='today'; ui.selMode=false; ui.sel=[]; render(); }
    else if(g==='speak'){ ui.mode='speak'; render(); }
    else if(g==='write'){ openWriteModal(); }
    else if(g==='pack'){ openAiPackPractice(packableWords()); }
  }));
}
function packableWords(){
  let arr=(state.words||[]).filter(w=>!w.mastered&&isDue(w)&&((w.srs&&w.srs.box)||1)<=2);
  if(arr.length<2){ arr=(state.words||[]).filter(w=>!w.mastered&&isDue(w)); }
  if(arr.length<2){ arr=todayNewWords(); }
  if(arr.length<2){ arr=(state.words||[]).filter(w=>!w.mastered); }
  return arr.slice(0,5);
}
/* 多词打包口语：一次对话练 2-5 个词 */
function openAiPackPractice(terms){
  const list=(terms&&terms.length)?terms:(packableWords());
  if(!list.length){ toast('还没有可以打包练习的词，先去攒几个','warn'); return; }
  aiState={seq:0,phase:'scenes',terms:list.map(w=>w.term),
    term:list.map(w=>w.term).join(' · '),
    definition:list.map(w=>(w.definition||'').split('\n')[0]).filter(Boolean).join('；'),
    examples:list.slice(0,4).reduce((a,w)=>a.concat((w.examples||[]).map(x=>x.en)),[]),
    scenes:[],scene:null,lines:[],attempt:'',attemptPromptCn:'',busy:false};
  $('#aiTitle').textContent='情景口语 · '+list.length+' 词';
  $('#aiSub').textContent='一次对话，尽量用上这些词';
  $('#aiScoreChip').classList.add('hidden');
  $('#aiScene').innerHTML='';
  $('#aiModal').classList.add('show');
  const mySeq=++aiState.seq;
  aiShowLoading('正在挑场景…');
  if(!aAiReady()){
    aiShowBody(); aiSetChatbar('scenes');
    $('#aiScene').innerHTML=aiGuideHtml('未配置模型 API，请先在设置中填写');
    const r=$('#aiRetry'); if(r) r.addEventListener('click',()=>openAiPackPractice(list));
    const g=$('#aiGotoSettings'); if(g) g.addEventListener('click',()=>{ closeAiModal(); openSettings(); });
    return;
  }
  aiSuggestScenes().then(r=>{
    if(mySeq!==aiState.seq) return;
    const sc=(r.scenes||[]).filter(x=>x&&x.title).slice(0,3);
    if(!sc.length) throw new Error('返回内容无法解析，请重试');
    aiState.scenes=sc; aiState.phase='scenes';
    aiShowBody(); aiSetChatbar('scenes'); aiRenderScenes();
  }).catch(err=>{
    if(mySeq!==aiState.seq) return;
    aiShowBody();
    $('#aiScene').innerHTML='<div class="empty-state">'+esc(String(err&&err.message||'生成失败，请重试'))+'</div>';
    const r=$('#aiRetry'); if(r) r.addEventListener('click',()=>openAiPackPractice(list));
  });
}
