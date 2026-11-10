/* ============ 我的截图：单词关联截图（独立 key，不碰 words 数据） ============ */
const SHOTS_KEY='english-notes-shots-v1';
const SHOT_MAX_PER_WORD=4;
const SHOT_MAX_TOTAL=80;
function shotsAll(){
  try{ const o=JSON.parse(localStorage.getItem(SHOTS_KEY)||'{}'); return (o&&typeof o==='object'&&!Array.isArray(o))?o:{}; }catch(_){ return {}; }
}
function shotsFlush(all){ return aStore(SHOTS_KEY,JSON.stringify(all)); }
function shotsKeyOf(t){ return String(t||'').trim().toLowerCase(); }
function shotsGet(t){ const all=shotsAll(); return all[shotsKeyOf(t)]||[]; }
function shotsTotal(all){ return Object.keys(all).reduce((s,k)=>s+(Array.isArray(all[k])?all[k].length:0),0); }
/* 选图 → 压成 640px 宽 JPEG → base64（控制 localStorage 体积） */
function shotCompress(file){
  return new Promise((resolve,reject)=>{
    const url=URL.createObjectURL(file);
    const img=new Image();
    img.onload=()=>{
      try{
        const MAX=640;
        const sc=Math.min(1,MAX/Math.max(img.width,img.height));
        const w=Math.max(1,Math.round(img.width*sc));
        const h=Math.max(1,Math.round(img.height*sc));
        const cv=document.createElement('canvas'); cv.width=w; cv.height=h;
        const ctx=cv.getContext('2d');
        ctx.drawImage(img,0,0,w,h);
        resolve(cv.toDataURL('image/jpeg',0.7));
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

