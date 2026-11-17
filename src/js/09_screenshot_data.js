/* ============ 我的截图：单词关联截图（独立 key，不碰 words 数据） ============ */
/* ---- IndexedDB 大对象存储：把截图/收件箱从 localStorage 5MB 挪到 IDB ---- */
const IDB_NAME='english-notes-blob-v1';
const IDB_VERSION=1;
const IDB_STORE_SHOTS='shots';
const IDB_STORE_INBOX='inbox';
let idbPromise=null;
function idbOpen(){
  if(idbPromise)return idbPromise;
  idbPromise=new Promise((resolve,reject)=>{
    if(typeof indexedDB==='undefined'){ reject(new Error('no-idb')); return; }
    let req;
    try{ req=indexedDB.open(IDB_NAME,IDB_VERSION); }catch(e){ reject(e); return; }
    req.onupgradeneeded=()=>{
      const db=req.result;
      if(!db.objectStoreNames.contains(IDB_STORE_SHOTS))db.createObjectStore(IDB_STORE_SHOTS);
      if(!db.objectStoreNames.contains(IDB_STORE_INBOX))db.createObjectStore(IDB_STORE_INBOX);
    };
    req.onsuccess=()=>resolve(req.result);
    req.onerror=()=>reject(req.error||new Error('idb-open-failed'));
    req.onblocked=()=>reject(new Error('idb-blocked'));
  });
  return idbPromise;
}
function idbGet(store,key){
  return idbOpen().then(db=>new Promise((resolve,reject)=>{
    const rq=db.transaction(store,'readonly').objectStore(store).get(key);
    rq.onsuccess=()=>resolve(rq.result);
    rq.onerror=()=>reject(rq.error);
  }));
}
function idbSet(store,key,val){
  return idbOpen().then(db=>new Promise((resolve,reject)=>{
    const rq=db.transaction(store,'readwrite').objectStore(store).put(val,key);
    rq.onsuccess=()=>resolve(true);
    rq.onerror=()=>reject(rq.error);
  }));
}
const SHOTS_KEY='english-notes-shots-v1';
const SHOT_MAX_PER_WORD=4;
/* 总上限放宽：IDB 容量足够大，不再用 80 的硬限制，保留一个大值做兜底 */
const SHOT_MAX_TOTAL=2000;
function shotsReadLocal(){
  try{ const o=JSON.parse(localStorage.getItem(SHOTS_KEY)||'{}'); return (o&&typeof o==='object'&&!Array.isArray(o))?o:{}; }catch(_){ return {}; }
}
let shotCache=null;
let shotReady=false;
let shotUseIdb=false;
/* 启动时调用：可用 IDB 就用 IDB，并把 LS 旧数据一次性搬过去；不可用则回退 LS */
async function shotsInit(){
  if(shotReady)return;
  try{
    await idbOpen();
    shotUseIdb=true;
    let data=await idbGet(IDB_STORE_SHOTS,'all');
    if(!data||typeof data!=='object'||Array.isArray(data)){
      const legacy=shotsReadLocal();
      data=shotsTotal(legacy)>0?legacy:{};
      if(shotsTotal(data)>0)await idbSet(IDB_STORE_SHOTS,'all',data);
    }
    shotCache=data;
    /* IDB 已确认接管且数据已在内存，清掉 LS 旧副本，不再白占 5MB 配额 */
    try{ localStorage.removeItem(SHOTS_KEY); }catch(_){ }
  }catch(e){
    shotUseIdb=false;
    shotCache=shotsReadLocal();
  }
  shotReady=true;
}
function shotsAll(){
  if(shotReady)return shotCache;
  return shotsReadLocal();
}
function shotsFlush(all){
  if(shotUseIdb){
    shotCache=all;
    idbSet(IDB_STORE_SHOTS,'all',all).catch(()=>{ try{ aStore(SHOTS_KEY,JSON.stringify(all)); }catch(_){ } });
    return true;
  }
  return aStore(SHOTS_KEY,JSON.stringify(all));
}
function shotsKeyOf(t){ return String(t||'').trim().toLowerCase(); }
function shotsGet(t){ const all=shotsAll(); return all[shotsKeyOf(t)]||[]; }
function shotsTotal(all){ return Object.keys(all).reduce((s,k)=>s+(Array.isArray(all[k])?all[k].length:0),0); }
/* 选图 → 压缩 JPEG → base64（控制 localStorage 体积）。
   配额治理：默认 560px / 0.62；单张超过目标体积再降一档重压，保证单张体积有上限。 */
const SHOT_COMPRESS_EDGE=560;
const SHOT_COMPRESS_QUALITY=0.62;
const SHOT_COMPRESS_EDGE_2=420;
const SHOT_COMPRESS_QUALITY_2=0.5;
const SHOT_TARGET_BYTES=120*1024;
function shotDraw(img,maxEdge,quality){
  const sc=Math.min(1,maxEdge/Math.max(img.width,img.height));
  const w=Math.max(1,Math.round(img.width*sc));
  const h=Math.max(1,Math.round(img.height*sc));
  const cv=document.createElement('canvas');cv.width=w;cv.height=h;
  cv.getContext('2d').drawImage(img,0,0,w,h);
  return cv.toDataURL('image/jpeg',quality);
}
function shotCompress(file){
  return new Promise((resolve,reject)=>{
    const url=URL.createObjectURL(file);
    const img=new Image();
    img.onload=()=>{
      try{
        let dataUrl=shotDraw(img,SHOT_COMPRESS_EDGE,SHOT_COMPRESS_QUALITY);
        if(dataUrl.length>SHOT_TARGET_BYTES){
          const smaller=shotDraw(img,SHOT_COMPRESS_EDGE_2,SHOT_COMPRESS_QUALITY_2);
          if(smaller.length<dataUrl.length)dataUrl=smaller;
        }
        resolve(dataUrl);
      }catch(e){ reject(e); }
      finally{ try{ URL.revokeObjectURL(url); }catch(_){ } }
    };
    img.onerror=()=>{ try{ URL.revokeObjectURL(url); }catch(_){ } reject(new Error('图片读取失败')); };
    img.src=url;
  });
}
let viewerState=null;
function wmShotsBtnUpdate(){
  const b=$('#wmShotsN'); if(!b) return;
  const t=wmState&&wmState.term;
  b.textContent=String(t?shotsGet(t).length:0);
}
/* 单词弹窗里直接选图：逐张压缩后挂到当前词，返回成功/失败数 */
async function wmShotsAdd(term,files){
  const all=shotsAll(),k=shotsKeyOf(term);
  let list=Array.isArray(all[k])?all[k].slice():[];
  let added=0,failed=0;
  for(const file of files){
    if(list.length>=SHOT_MAX_PER_WORD){ failed++; continue; }
    try{
      const dataUrl=await shotCompress(file);
      list.push({id:uid(),dataUrl,at:Date.now()});
      added++;
    }catch(e){ failed++; }
  }
  if(added){ all[k]=list; shotsFlush(all); }
  return {added,failed};
}
/* 大图查看器：多张可左右切换，点任意位置返回 */
function openShotViewerFor(term,i){
  const list=shotsGet(term);
  if(!list.length) return;
  viewerState={term:term,idx:Math.max(0,Math.min(+i||0,list.length-1))};
  renderViewer();
}
function renderViewer(){
  const v=$('#shotViewer'); if(!v) return;
  const im=$('#shotViewerImg'); if(!im) return;
  if(!viewerState){ v.classList.remove('show'); return; }
  const list=shotsGet(viewerState.term);
  if(!list.length){ v.classList.remove('show'); viewerState=null; return; }
  const idx=Math.max(0,Math.min(viewerState.idx,list.length-1));
  viewerState.idx=idx;
  im.src=list[idx].dataUrl;
  const prev=$('#svPrev'), next=$('#svNext'), cnt=$('#svCount'), del=$('#svDel');
  if(prev) prev.style.visibility=(list.length>1&&idx>0)?'visible':'hidden';
  if(next) next.style.visibility=(list.length>1&&idx<list.length-1)?'visible':'hidden';
  if(cnt) cnt.textContent=(idx+1)+' / '+list.length;
  if(del) del.style.display=list.length?'block':'none';
  v.classList.add('show');
}
function viewerStep(d){
  if(!viewerState) return;
  const list=shotsGet(viewerState.term);
  if(!list.length){ closeShotViewer(); return; }
  viewerState.idx=Math.max(0,Math.min(viewerState.idx+d,list.length-1));
  renderViewer();
}
function viewerDel(){
  if(!viewerState) return;
  const term=viewerState.term;
  const all=shotsAll(), k=shotsKeyOf(term);
  const list=Array.isArray(all[k])?all[k]:[];
  const idx=viewerState.idx;
  if(list[idx]){ list.splice(idx,1); all[k]=list; shotsFlush(all); }
  const nlist=Array.isArray(all[k])?all[k]:[];
  if(!nlist.length){ closeShotViewer(); toast('已删除，这个词没有截图了','ok'); }
  else{ viewerState.idx=Math.max(0,Math.min(idx,nlist.length-1)); renderViewer(); toast('已删除这张截图','ok'); }
  if(wmState&&wmState.term&&wmState.term.toLowerCase()===term.toLowerCase()) wmShotsBtnUpdate();
}
function closeShotViewer(){ const v=$('#shotViewer'); if(v) v.classList.remove('show'); viewerState=null; }
/* 生词卡缩略图行：从独立 key 里按词条查 */
function shotsHTML(w){
  const list=w?shotsGet(w.term):[];
  if(!list.length) return '';
  return '<div class="wc-shot-row">'+list.map((s,i)=>'<img class="word-shot" src="'+s.dataUrl+'" alt="截图" data-wshot="'+w.id+'" data-shoti="'+i+'">').join('')+'</div>';
}

