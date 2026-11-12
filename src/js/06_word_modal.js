/* ===== 06_word_modal.js · 单词弹窗 / 配图 / 草稿 / 设置 / 云同步 / 启动绑定 ===== */
/* ============ 单词弹窗 ============ */
let wmState=null;

/* ============ 单词配图：本站图优先，其次 Pexels 免费搜图（要自己填 Key） ============ */
/* 缓存单独一个 key，不写进 state.words，也不进云同步 */
const WM_IMG_KEY='english-notes-wmimg-v1';
const WM_IMG_TTL=180*864e5;       /* 配好的图记半年，别到期就重新搜一遍 */
const WM_IMG_MISS=7*864e5;        /* 搜过确实没图的词，一周内不再重复搜 */
const WM_IMG_FAIL=5*6e4;          /* 图链全挂：5 分钟后可以再试（不永久判死） */
let imgSeq=0;
let imgState={term:'',cands:[],idx:0,src:''};
let paintedTerm='';               /* 已经画出来的词：同一个词再打开直接沿用 */
let wmOpenedAt=0;                 /* 词卡刚打开的时间：用于挡住"自动弹情景口语" */
let paintedRec=null;
function wmImgAll(){
  try{ const o=JSON.parse(localStorage.getItem(WM_IMG_KEY)||'{}'); return (o&&typeof o==='object'&&!Array.isArray(o))?o:{}; }catch(_){ return {}; }
}
function wmImgFlush(all){
  const keys=Object.keys(all);
  if(keys.length>120){
    keys.sort((a,b)=>(all[b].at||0)-(all[a].at||0));
    keys.slice(120).forEach(k=>{ delete all[k]; });
  }
  try{ localStorage.setItem(WM_IMG_KEY,JSON.stringify(all)); }catch(_){ }
}
function wmImgKeyOf(t){ return String(t||'').trim().toLowerCase(); }
/* 一次性修复老缓存：早期版本把 Pixabay 的 _640 改成了不存在的 _960（全部 403），
   导致图加载失败被收起、还被记成"这个词没图"。这里就地改回并解除误判。 */
const WM_IMG_FIX='english-notes-wmimg-fix-v1';
function wmImgRepair(){
  try{
    if(localStorage.getItem(WM_IMG_FIX)==='2') return;
    const all=wmImgAll();
    let touched=false;
    Object.keys(all).forEach(k=>{
      const r=all[k]; if(!r||typeof r!=='object') return;
      let hit=false;
      (r.cands||[]).forEach(c=>{
        ['thumb','big','src'].forEach(f=>{
          if(c&&c[f]&&String(c[f]).indexOf('_960')>=0){
            c[f]=String(c[f]).replace(/_960/g,'_640'); hit=true;
          }
        });
      });
      if(r.imgFailAt){ delete r.imgFailAt; hit=true; }
      if(hit && r.cands && r.cands.length){ r.local=false; r.idx=0; }
      if(hit) touched=true;
      all[k]=r;
    });
    if(touched) wmImgFlush(all);
    localStorage.setItem(WM_IMG_FIX,'2');
  }catch(_){ }
}
function wmImgCached(t){
  const all=wmImgAll(), k=wmImgKeyOf(t), r=all[k];
  if(!r) return null;
  if(r.at&&Date.now()-r.at>WM_IMG_TTL){ delete all[k]; wmImgFlush(all); return null; }
  return r;
}
function wmImgStore(t,rec){
  const all=wmImgAll();
  const k=wmImgKeyOf(t);
  if(!k) return;
  rec.at=Date.now();
  rec.term=String(t).trim();
  all[k]=rec;
  wmImgFlush(all);
}
function wmIllusHide(){
  const el=$('#wmIllus');
  if(el) el.classList.add('hidden');
  wmMemoHide();
  imgState={term:'',cands:[],idx:0,src:''};
}
/* 图链全挂时不要"静默消失"：留一行可点的重试提示，用户知道发生了什么 */
function wmIllusFail(term,msg){
  const box=$('#wmIllus'), img=$('#wmIllusImg'), skel=$('#wmIllusSkel'), cap=$('#wmIllusCap'), more=$('#wmIllusMore'), conf=$('#wmIllusConfirm');
  if(!box){ wmIllusHide(); return; }
  box.classList.remove('hidden');
  if(skel) skel.classList.add('hidden');
  if(img){ img.classList.remove('ok'); img.removeAttribute('src'); }
  if(more) more.classList.add('hidden');
  if(conf) conf.classList.add('hidden');
  if(cap){
    cap.textContent=msg||'图片加载失败 · 点这里重试';
    cap.removeAttribute('href');
    cap.onclick=function(e){
      e.preventDefault(); e.stopPropagation();
      try{ const all=wmImgAll(), k=wmImgKeyOf(term); if(all[k]){ delete all[k].imgFailAt; wmImgFlush(all); } }catch(_){ }
      wmIllusLoad(term);
    };
  }
}
function wmMemoHide(){
  const el=$('#wmMemo');
  if(el) el.classList.add('hidden');
}
/* 没有配图时的一行画面提示：emoji + 一句话，用现有模型生成 */
function wmMemoPaint(memo,term){
  const box=$('#wmMemo'), em=$('#wmMemoEmoji'), sc=$('#wmMemoScene');
  if(!box||!memo||!memo.scene){ wmMemoHide(); return; }
  const ib=$('#wmIllus'); if(ib) ib.classList.add('hidden');
  if(em) em.textContent=memo.emoji||'';
  if(sc) sc.textContent=memo.scene;
  box.classList.remove('hidden');
  if(term){ paintedTerm=wmImgKeyOf(term); paintedRec={term:term,memo:memo}; }
}
function wmIllusBroken(rec){
  /* 一张挂了换下一张；全挂就收起，但只冷却 5 分钟，不把词判成"永远没图" */
  if(!rec||!rec.cands||!rec.cands.length){ wmIllusHide(); return; }
  if(rec.idx+1>=rec.cands.length){
    paintedTerm=''; paintedRec=null;
    /* 不再静默收起：给一行可点重试的提示（多半是手机到 cdn.pixabay.com 不通） */
    wmIllusFail(rec.term,'图片加载失败（网络）· 点这里重试');
    try{
      if(!rec.term) return;
      /* 站内插图缺失：7 天后再探一次；图库死链：5 分钟后再试（可能只是这一批链接挂了） */
      wmImgStore(rec.term, rec.src==='local'
        ? {local:false,cands:[],idx:0,localFailAt:Date.now()}
        : {local:false,cands:[],idx:0,imgFailAt:Date.now()});
    }catch(_){ }
    return;
  }
  rec.idx++;
  imgState=rec;
  try{
    if(rec.term&&rec.src!=='local') wmImgStore(rec.term,{local:false,cands:rec.cands,idx:rec.idx,prov:rec.src});
  }catch(_){ }
  wmIllusPaint(rec);
}
function wmIllusPaint(rec){
  const box=$('#wmIllus');
  if(!box||!rec||!rec.cands||!rec.cands.length){ wmIllusHide(); return; }
  wmMemoHide();
  const c=rec.cands[rec.idx]||rec.cands[0];
  if(!c||!(c.thumb||c.src)){ wmIllusHide(); return; }
  const img=$('#wmIllusImg'), cap=$('#wmIllusCap'), more=$('#wmIllusMore'), skel=$('#wmIllusSkel');
  box.classList.remove('hidden');
  if(skel) skel.classList.remove('hidden');
  if(img) img.classList.remove('ok');
  if(img){
    img.alt=rec.term||'';
    try{ img.referrerPolicy='no-referrer'; }catch(_){ }
    img.onload=()=>{ if(skel) skel.classList.add('hidden'); img.classList.add('ok'); };
    img.onerror=()=>wmIllusBroken(rec);
    img.src=c.thumb||c.src;
  }
  if(cap){
    cap.textContent=c.credit||'';
    if(c.page) cap.setAttribute('href',c.page); else cap.removeAttribute('href');
  }
  if(more) more.classList.toggle('hidden',rec.cands.length<2);
  imgState=rec;
  paintedTerm=wmImgKeyOf(rec.term||'');
  paintedRec=rec;
}
function wmIllusSkeleton(){
  const box=$('#wmIllus');
  if(!box) return;
  box.classList.remove('hidden');
  const skel=$('#wmIllusSkel'), img=$('#wmIllusImg'), cap=$('#wmIllusCap'), more=$('#wmIllusMore');
  if(skel) skel.classList.remove('hidden');
  if(img){ img.classList.remove('ok'); img.removeAttribute('src'); }
  if(cap) cap.textContent='';
  if(more) more.classList.add('hidden');
}
/* 站内资源地址：线上分享链接必须带 sharecode，否则静态文件会 403 */
function assetUrl(u){
  try{
    const sc=new URLSearchParams(location.search).get('sharecode');
    if(!sc||!u||/^([a-z]+:)?\/\//i.test(u)) return u;
    return u+(u.indexOf('?')>=0?'&':'?')+'sharecode='+encodeURIComponent(sc);
  }catch(_){ return u; }
}
/* 站点自带的插图：img/<单词>.webp|jpg|png */
function probeLocalImg(term){
  const slug=encodeURIComponent(String(term||'').trim().toLowerCase().replace(/[^a-z0-9\- ]/g,'').replace(/\s+/g,'-'));
  if(!slug) return Promise.resolve('');
  const tryList=['img/'+slug+'.webp','img/'+slug+'.jpg','img/'+slug+'.png'].map(assetUrl);
  return new Promise(resolve=>{
    let i=0;
    const next=()=>{
      if(i>=tryList.length){ resolve(''); return; }
      const u=tryList[i++];
      const im=new Image();
      im.onload=()=>resolve(u);
      im.onerror=next;
      im.src=u;
    };
    next();
  });
}
async function pexelsSearch(q,key){
  const ctrl=new AbortController();
  const timer=setTimeout(()=>ctrl.abort(),8000);
  try{
    const url='https://api.pexels.com/v1/search?per_page=10&orientation=landscape&query='+encodeURIComponent(q);
    const res=await fetch(url,{headers:{Authorization:key},signal:ctrl.signal});
    if(!res.ok) throw new Error('HTTP '+res.status);
    const data=await res.json();
    return (data.photos||[]).map(p=>({
      thumb:(p.src&&(p.src.large||p.src.medium||p.src.small))||'',
      page:p.url||'',
      credit:'Photo by '+(p.photographer||'Pexels')+' · Pexels'
    })).filter(x=>x.thumb);
  }finally{ clearTimeout(timer); }
}
async function pixabaySearch(q,key){
  const ctrl=new AbortController();
  const timer=setTimeout(()=>ctrl.abort(),8000);
  try{
    const url='https://pixabay.com/api/?key='+encodeURIComponent(key)
      +'&q='+encodeURIComponent(q)
      +'&image_type=photo&orientation=horizontal&safesearch=true&order=popular&per_page=12&lang=en';
    const res=await fetch(url,{signal:ctrl.signal});
    if(!res.ok) throw new Error('HTTP '+res.status);
    const data=await res.json();
    return (data.hits||[]).map(h=>({
      /* 只用 CDN 真实存在的尺寸：_640（webformatURL）/ _1280（largeImageURL）。
         之前把 _640 改成 _960，Pixabay 没有这个尺寸，全部 403 → 图加载失败被收起。 */
      thumb:String(h.webformatURL||'')||String(h.previewURL||''),
      big:String(h.largeImageURL||'')||String(h.webformatURL||''),
      page:h.pageURL||'',
      credit:'Photo by '+(h.user||'Pixabay')+' · Pixabay'
    })).filter(x=>x.thumb);
  }finally{ clearTimeout(timer); }
}
/* 用哪家图库：Pixabay 优先（Pexels 已暂停发新 Key） */
function photoKey(){
  const st=state.settings||{};
  const pb=String(st.pixabayKey||'').trim();
  if(pb) return {prov:'pixabay',key:pb};
  const px=String(st.pexelsKey||'').trim();
  if(px) return {prov:'pexels',key:px};
  return null;
}
function photoSearch(ph,q){
  return ph.prov==='pixabay'?pixabaySearch(q,ph.key):pexelsSearch(q,ph.key);
}
/* 记忆卡：让模型给一个 emoji + 一句有画面感的中文描述 */
async function memoryHook(term){
  try{
    const p=await aiCall([
      {role:'system',content:'You help people memorize English words with a mental image. For the given word output ONLY JSON: {"emoji":"ONE emoji","scene":"一句具体的中文画面，<=26字，要有人/物/动作，不要解释词义、不要用成语套话"}'},
      {role:'user',content:String(term||'')}
    ],{maxTokens:90});
    const em=p&&p.emoji?String(p.emoji).trim():'';
    const sc=p&&p.scene?String(p.scene).trim():'';
    if(!sc) return null;
    return {emoji:em.slice(0,8),scene:sc.slice(0,50)};
  }catch(_){ return null; }
}
/* 抽象词直接搜命中率低：让 AI 换成 2 个看得见的画面关键词再搜 */
async function imgKeywords(term){
  try{
    const p=await aiCall([
      {role:'system',content:'You pick stock-photo search keywords. Output ONLY a JSON object: {"keywords":["...","..."]}. Two short English visual phrases (2-3 words each) that describe a concrete scene a photo could show for the meaning of the given English word. Never return the word itself.'},
      {role:'user',content:String(term||'')}
    ],{maxTokens:120});
    const kw=(p&&Array.isArray(p.keywords))?p.keywords:[];
    return kw.filter(x=>typeof x==='string'&&x.trim()).map(x=>x.trim()).slice(0,2);
  }catch(_){ return []; }
}
async function wmIllusLoad(term){
  const t=String(term||'').trim();
  if(!t){ ++imgSeq; wmIllusHide(); return; }
  const boxEl=$('#wmIllus'), imgEl=$('#wmIllusImg');
  /* 这个词的画面已经有了：直接沿用，不重新请求、也不闪一下骨架 */
  if(paintedTerm&&paintedTerm===wmImgKeyOf(t)&&paintedRec&&paintedRec.memo){
    ++imgSeq;
    wmMemoPaint(paintedRec.memo,t);
    imgState=paintedRec;
    return;
  }
  if(paintedTerm&&paintedTerm===wmImgKeyOf(t)&&imgEl&&imgEl.classList.contains('ok')&&imgEl.getAttribute('src')){
    ++imgSeq;
    if(boxEl) boxEl.classList.remove('hidden');
    const sk=$('#wmIllusSkel'); if(sk) sk.classList.add('hidden');
    if(paintedRec) imgState=paintedRec;
    return;
  }
  ++imgSeq;
  wmIllusHide();
  const my=imgSeq;
  let rec=wmImgCached(t);
  if(!rec){ rec={local:null,cands:[],idx:0}; }
  /* 1) 本站自带插图（我离线画的）—— 秒开、不依赖网络 */
  const retryLocal=rec.local===false&&rec.localFailAt&&(Date.now()-rec.localFailAt>WM_IMG_MISS);
  if(rec.local===null||retryLocal){
    const u=await probeLocalImg(t);
    if(my!==imgSeq) return;
    rec.local=u||false;
    if(u) rec.cands=[{src:u,thumb:u,credit:'本站插图'}];
    wmImgStore(t,rec);
  }
  if(my!==imgSeq) return;
  if(rec.local){ wmIllusPaint({term:t,cands:rec.cands,idx:0,src:'local'}); return; }
  /* 2) 之前搜到过的照片 */
  if(rec.cands&&rec.cands.length){ wmIllusPaint({term:t,cands:rec.cands,idx:rec.idx||0,src:rec.prov||'pexels'}); return; }
  /* 2.5) 之前写过的记忆卡 */
  if(rec.memo&&rec.memo.scene){ wmMemoPaint(rec.memo,t); return; }
  /* 3) 配了图库 Key 就现搜照片 */
  const ph=photoKey();
  if(rec.imgFailAt&&Date.now()-rec.imgFailAt<WM_IMG_FAIL){ wmIllusHide(); return; }
  const missHit=rec.missAt&&(Date.now()-rec.missAt<WM_IMG_MISS);
  if(ph&&!missHit){
    wmIllusSkeleton();
    let cands=[], searched=false;
    const trySearch=async q=>{
      try{ const r=await photoSearch(ph,q); searched=true; return r||[]; }
      catch(_){ return []; }   /* 网络失败不算「没图」，下次还试 */
    };
    cands=await trySearch(t);
    if(my!==imgSeq) return;
    if(!cands.length){
      const kws=await imgKeywords(t);
      for(const k of kws){
        if(my!==imgSeq) return;
        cands=await trySearch(k);
        if(cands.length) break;
      }
    }
    if(my!==imgSeq) return;
    if(cands.length){
      const rec2={local:false,cands:cands.slice(0,6),idx:0,prov:ph.prov};
      wmImgStore(t,rec2);
      wmIllusPaint({term:t,cands:rec2.cands,idx:0,src:ph.prov});
      return;
    }
    if(searched) wmImgStore(t,Object.assign({},rec,{local:false,cands:[],idx:0,missAt:Date.now()}));
  }
  /* 4) 拿不到照片：给一行画面提示（emoji + 一句话），不花钱、用现有模型 */
  if(my!==imgSeq) return;
  const memo=await memoryHook(t);
  if(my!==imgSeq) return;
  if(!memo){ wmIllusHide(); return; }
  wmImgStore(t,Object.assign({},wmImgCached(t)||rec,{local:false,cands:[],idx:0,memo:memo}));
  wmMemoPaint(memo,t);
}
/* 去「标签聚合」建类别时，先把当前这个词的草稿存下来，建完自动回到它，不丢已填内容 */
let wmDraft=null;
function stashWmDraft(){
  if(!wmState) return false;
  wmDraft={term:wmState.term,note:wmState.note||null,range:wmState.range||null,existing:wmState.existing||null,
    definition:($('#wmDefinition')&&$('#wmDefinition').value)||'',
    examples:collectExamples(),tags:(wmState.tags||[]).slice(),
    collocations:(wmState.collocations||[]).slice(),
    mastered:!!wmState.mastered,aiDef:wmState.aiDef||'',dictExtra:wmState.dictExtra||null};
  return true;
}
function gotoTagPageForNewTag(){
  if(!stashWmDraft()) return;
  closeWordModal();
  ui.mode='tags'; ui.tag=null; ui.tagEdit=false; ui.tagNewOpen=true; ui.sideOpen=false;
  render();
  toast('建好标签后会自动回到这个词');
}
function resumeWmDraft(newTag){
  const d=wmDraft;
  if(!d) return false;
  wmDraft=null;
  if(newTag&&d.tags.indexOf(newTag)<0) d.tags.push(newTag);
  openWordModal(d.term,d.note,d.range,d.existing,null,d);
  return true;
}
let wmSeq=0;

/* ============ empower 草稿：没保存就退出，下次打开同一个词自动接上 ============ */
/* 存在独立 key 里，绝不写进 state.words / 云同步，保证已保存的单词一点都不动 */
const WM_DRAFT_KEY='english-notes-wmdraft-v1';
const WM_DRAFT_DAYS=14;
function wmDraftKey(t){ return String(t||'').trim().toLowerCase(); }
function wmDraftAll(){
  try{ const o=JSON.parse(localStorage.getItem(WM_DRAFT_KEY)||'{}'); return (o&&typeof o==='object'&&!Array.isArray(o))?o:{}; }catch(_){ return {}; }
}
function wmDraftFlush(all){
  const keys=Object.keys(all);
  if(keys.length>30){
    keys.sort((a,b)=>(all[b].savedAt||0)-(all[a].savedAt||0));
    keys.slice(30).forEach(k=>{ delete all[k]; });
  }
  try{ localStorage.setItem(WM_DRAFT_KEY,JSON.stringify(all)); }catch(_){}
}
function wmDraftGet(t){
  const all=wmDraftAll(), k=wmDraftKey(t), d=all[k];
  if(!d) return null;
  if(d.savedAt&&Date.now()-d.savedAt>WM_DRAFT_DAYS*864e5){ delete all[k]; wmDraftFlush(all); return null; }
  return d;
}
function wmDraftPut(d){
  if(!d||!d.term) return;
  const all=wmDraftAll(), now=Date.now();
  Object.keys(all).forEach(x=>{ if(all[x].savedAt&&now-all[x].savedAt>WM_DRAFT_DAYS*864e5) delete all[x]; });
  all[wmDraftKey(d.term)]=d;
  wmDraftFlush(all);
}
function wmDraftDel(t){
  const all=wmDraftAll(), k=wmDraftKey(t);
  if(all[k]){ delete all[k]; wmDraftFlush(all); }
}
/* 当前弹窗里值得存下来的内容：跟已保存的词一字不差就不存，避免凭空多出「草稿」 */
function wmDraftSnapshot(){
  if(!wmState||!wmState.term||wmState.saved) return null;
  const def=(($('#wmDefinition')&&$('#wmDefinition').value)||'').trim();
  const phon=(($('#wmPhonetic')&&$('#wmPhonetic').textContent)||'').trim();
  const examples=collectExamples();
  const tags=(wmState.tags||[]).slice();
  const old=wmState.existing||null;
  if(old){
    const oldEx=(old.examples||[]).map(x=>({en:x.en,cn:x.cn||'',sense:x.sense||''})).filter(x=>x.en);
    const defChanged=def!==((old.definition||'').trim());
    const tagsChanged=JSON.stringify(tags.slice().sort())!==JSON.stringify((old.tags||[]).slice().sort());
    const masterChanged=!!wmState.mastered!==!!old.mastered;
    const phonChanged=!!phon&&phon!==((old.phonetic||'').trim());
    /* 已有例句被换过一批（点过「换一批例句」）也算改动；只是打开时 AI 自动补的例子不算 */
    const exChanged=oldEx.length>0&&JSON.stringify(examples)!==JSON.stringify(oldEx);
    const collChanged=JSON.stringify((wmState.collocations||[]).slice().sort())!==JSON.stringify((old.collocations||[]).slice().sort());
    if(!(defChanged||tagsChanged||masterChanged||phonChanged||exChanged||collChanged)) return null;
  }else if(!def&&!examples.length&&!tags.length&&!phon&&!wmState.aiDef&&!(wmState.collocations&&wmState.collocations.length)){
    return null;   /* 全空的壳子不存 */
  }
  return {term:wmState.term,definition:def,phonetic:phon,examples,tags,
    collocations:(wmState.collocations||[]).slice(),
    mastered:!!wmState.mastered,aiDef:wmState.aiDef||'',dictExtra:wmState.dictExtra||null,savedAt:Date.now()};
}
function wmDraftSave(){
  if(!wmState||!wmState.term) return false;
  const d=wmDraftSnapshot();
  if(d) wmDraftPut(d); else wmDraftDel(wmState.term);
  return !!d;
}
let wmDraftTimer=null;
function scheduleWmDraft(ms){
  clearTimeout(wmDraftTimer);
  wmDraftTimer=setTimeout(()=>{ wmDraftSave(); },ms||700);
}
function wmAgoText(ts){
  const m=Math.round((Date.now()-(ts||0))/60000);
  if(m<1) return '刚刚';
  if(m<60) return m+' 分钟前';
  const h=Math.round(m/60);
  if(h<24) return h+' 小时前';
  return Math.round(h/24)+' 天前';
}
function showWmDraftBar(d){
  const bar=$('#wmDraftBar'), txt=$('#wmDraftTxt');
  if(!bar) return;
  if(!d){ bar.classList.add('hidden'); return; }
  if(txt) txt.textContent='已接上 '+wmAgoText(d.savedAt)+'的草稿（还没保存）';
  bar.classList.remove('hidden');
}

function openWordModal(term,note,range,existing,prefill,restore){
  if(!restore) wmDraft=null;
  wmState={
    term:String(term||'').trim(),note:note||null,range:range||null,existing:existing||null,
    examples:[],aiDef:'',busy:false,source:existing?(existing.source||'manual'):'ai',
    tags:(existing&&existing.tags)?[...existing.tags]:[],
    collocations:(existing&&Array.isArray(existing.collocations))?existing.collocations.slice():((state.words.find(x=>String(x.term||'').trim().toLowerCase()===String(term||'').trim().toLowerCase())||{}).collocations||[]).slice(),
    origSentence:extractOrigSentence(range||null),
    mastered:!!(existing&&existing.mastered),prefill:prefill||null,saved:false,
    dictExtra:(existing&&existing.dict)||(prefill&&prefill.dict)||null
  };
  showWmDraftBar(null);
  const mySeq=++wmSeq;
  /* 只有在正文里打开、且正文里真有这个词，才给「移动」入口 */
  const moveRow=$('#wmMoveRow');
  if(moveRow){
    const inBody=!!(ui.mode==='edit'&&ui.note&&mvFindSpan(wmState.term,existing&&existing.id));
    moveRow.classList.toggle('hidden',!inBody);
  }
  $('#wmTerm').textContent=wmState.term;
  $('#wmPhonetic').textContent=(existing&&existing.phonetic)||'';
  const bestEl=$('#wmFollowBest');
  if(bestEl){
    const best=(existing&&existing.followBest)||0;
    bestEl.textContent=best?('跟读最佳 '+best+' 分'):'';
    bestEl.classList.toggle('hidden',!best);
  }
  $('#wmDefinition').value=(existing&&existing.definition)||'';
  renderWmMaster();
  renderWmTags();
  renderWmColls();
  wmShotsBtnUpdate();
  $('#wmLoading').classList.add('hidden');
  $('#wmBody').classList.remove('hidden');
  $('#wordModal').classList.add('show');
  wmOpenedAt=Date.now();   /* 记下打开时刻：1.2 秒内的"情景口语自动打开"一律挡掉 */
  try{ wmIllusLoad(wmState.term); }catch(_){ }
  /* 从「标签聚合」建完类别回来：把刚才的草稿原样恢复（不重新调 AI） */
  if(restore){
    wmState.examples=(restore.examples||[]).map(x=>({en:x.en,cn:x.cn||'',sense:x.sense||''})).filter(x=>x.en);
    wmState.tags=(restore.tags||[]).slice();
    if(Array.isArray(restore.collocations)) wmState.collocations=restore.collocations.slice();
    wmState.mastered=!!restore.mastered;
    wmState.aiDef=restore.aiDef||'';
    if(restore.definition) $('#wmDefinition').value=restore.definition;
    renderWmMaster(); renderWmTags(); renderWmColls();
    renderExCards(); syncRegen();
    return;
  }
  /* 从词典页带过来的内容：释义、例句、标签、词形等 */
  if(prefill){
    if(prefill.definition&&!$('#wmDefinition').value.trim()) $('#wmDefinition').value=prefill.definition;
    if(prefill.phonetic&&!$('#wmPhonetic').textContent) $('#wmPhonetic').textContent=prefill.phonetic;
    /* 词典附带的考试标签也并进来（不覆盖已有标签） */
    (prefill.tags||[]).forEach(t=>{ if(t&&!wmState.tags.includes(t)) wmState.tags.push(t); });
    renderWmTags();
  }
  renderWmDictExtra(existing&&existing.dict?existing.dict:(prefill&&prefill.dict?prefill.dict:null));
  /* 上次没保存就退出的草稿：直接接上，不再重新问 AI */
  const dr=wmDraftGet(wmState.term);
  if(dr){
    if(dr.definition) $('#wmDefinition').value=dr.definition;
    if(dr.phonetic&&!$('#wmPhonetic').textContent) $('#wmPhonetic').textContent=dr.phonetic;
    if(dr.aiDef) wmState.aiDef=dr.aiDef;
    if(dr.dictExtra&&!wmState.dictExtra){ wmState.dictExtra=dr.dictExtra; renderWmDictExtra(dr.dictExtra); }
    if(Array.isArray(dr.tags)) wmState.tags=dr.tags.slice();
    if(Array.isArray(dr.collocations)) wmState.collocations=dr.collocations.slice();
    wmState.mastered=!!dr.mastered;
    wmState.examples=(dr.examples||[]).map(x=>({en:x.en,cn:x.cn||'',sense:x.sense||''})).filter(x=>x.en);
    renderWmMaster(); renderWmTags(); renderWmColls();
    showWmDraftBar(dr);
    if(wmState.examples.length){ renderExCards(); syncRegen(); }
    else renderExCards();
    return;
  }
  wmState.examples=((existing&&existing.examples)?existing.examples:(prefill&&prefill.examples)||[])
    .map(x=>({en:x.en,cn:x.cn||'',sense:x.sense||''})).filter(x=>x.en);
  ensureOrigFirst();
  if(wmState.examples.length){ renderExCards(); syncRegen(); }
  else renderExCards();
}
/* 核心：自动挑选 2-3 句典型例句 */
function wmGenExamples(){
  const term=wmState&&wmState.term;
  if(!term||wmState.busy) return;
  const mySeq=++wmSeq;
  wmState.busy=true;
  setRegenBusy(true,'AI 挑选中…');
  renderExSkeleton();
  const hasKey=aAiReady();
  if(!hasKey){
    /* 没配置 AI：退回免费词典的英文例句，并提示去配置 */
    askDict(term).then(r=>{
      if(mySeq!==wmSeq) return;
      if(!$('#wmPhonetic').textContent&&r.phonetic) $('#wmPhonetic').textContent=r.phonetic;
      if(!$('#wmDefinition').value.trim()&&r.definition) $('#wmDefinition').value=r.definition;
      wmState.busy=false; setRegenBusy(false);
      wmState.examples=(r.examples||[]).filter(x=>x&&x.en).slice(0,3);
      ensureOrigFirst();
      renderExCards({noKey:true});
      scheduleWmDraft(200);
    }).catch(()=>{
      if(mySeq!==wmSeq) return;
      wmState.busy=false; setRegenBusy(false);
      wmState.examples=[];
      renderExCards({noKey:true,notFound:true});
    });
    return;
  }
  aiPack(term).then(p=>{
    if(mySeq!==wmSeq) return;
    const raw=(p.examples||[]).filter(x=>x&&String(x.en).trim()).slice(0,3);
    const seen=new Set(),uniq=[];
    raw.forEach(x=>{
      const k=String(x.en).trim().toLowerCase();
      if(seen.has(k)) return;
      seen.add(k);
      uniq.push({en:String(x.en).trim(),cn:String(x.cn||'').trim(),sense:String(x.sense||'').trim()});
    });
    if(uniq.length<2) throw new Error('AI 至少需要返回 2 句例句');
    wmState.busy=false; setRegenBusy(false);
    wmState.examples=uniq;
    ensureOrigFirst();
    wmState.aiDef=String(p.definition||'').trim();
    wmState.source='ai';
    if(!$('#wmPhonetic').textContent&&p.phonetic) $('#wmPhonetic').textContent=String(p.phonetic).trim();
    renderExCards();
    scheduleWmDraft(200);
    if(!uniq.length) toast('AI 没挑到例句，点「换一批例句」再试','warn');
  }).catch(err=>{
    if(mySeq!==wmSeq) return;
    wmState.busy=false; setRegenBusy(false);
    wmState.examples=[];
    renderExCards({error:aiErrText(err)});
  });
}
function renderExSkeleton(){
  const box=$('#wmExamples');
  if(!box) return;
  box.innerHTML='<div class="ex-skel"></div><div class="ex-skel" style="height:58px;opacity:.6"></div>';
}
function exCardHTML(x,i){
  const term=wmState?wmState.term:'';
  return '<div class="ex-card">'+
    (x.sense?'<span class="ex-sense">'+esc(x.sense)+'</span>':'')+
    '<div class="ex-en-text" data-excn="'+i+'"><span class="t">'+qwHTML(x.en,term,term,i)+'</span></div>'+
    (x.cn?'<div class="ex-cn-text hided" data-excn="'+i+'"><span class="cn-real">'+esc(x.cn)+'</span><span class="cn-tip">点这一行看中文</span></div>':'')+
    '<div class="ex-act">'+
      '<button class="ex-act-btn" data-wmplay="'+i+'" aria-label="发音"><svg class="icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5 6 9H2v6h4l5 4V5z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18.5 5.5a9 9 0 0 1 0 13"/></svg>发音</button>'+
      '<button class="ex-act-btn" data-follow="'+i+'" aria-label="跟读"><svg class="icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 5v14l8-7z"/><path d="M12 5v14l8-7z"/></svg>跟读</button>'+
    '</div>'+
  '</div>';
}
function syncExCnBtn(){
  const b=$('#wmCnAll');
  if(!b) return;
  const list=$$('#wmExamples .ex-cn-text');
  const allShown=list.length>0&&list.every(el=>!el.classList.contains('hided'));
  b.textContent=allShown?'收起中文':'显示全部中文';
}
function setExCnAll(show){
  $$('#wmExamples .ex-cn-text').forEach(el=>el.classList.toggle('hided',!show));
  syncExCnBtn();
}
function toggleExCnRow(enEl){
  const card=enEl.closest('.ex-card');
  const cn=card&&card.querySelector('.ex-cn-text');
  if(!cn) return;
  cn.classList.toggle('hided');
  syncExCnBtn();
}
function renderExCards(opt){
  opt=opt||{};
  const box=$('#wmExamples');
  if(!box) return;
  const list=(wmState.examples||[]);
  let tip='';
  if(opt.error){
    tip='<div class="ex-empty"><b>例句没生成出来</b><br>'+esc(opt.error)+
      '<br>请检查设置里的接口地址 / API Key / 模型名，然后点「换一批例句」重试。</div>';
  }else if(opt.noKey){
    tip='<div class="ex-empty"><b>还没配置 AI，例句无法自动生成。</b><br>'+
      (list.length?'下面是免费词典的英文例句（可能没有中文翻译）。':'当前词典也没有收录这个例句。')+
      '<div style="margin-top:8px"><button class="mini-btn" id="exGoSettings" style="color:var(--accent);font-weight:700">去设置 API →</button></div></div>';
  }else if(!list.length){
    tip='<div class="ex-empty">先写自己的理解与句子，需要扩展时再点下方按钮请 ChatGPT 帮忙。</div>';
  }
  box.innerHTML=tip+list.map(exCardHTML).join('');
  const gs=$('#exGoSettings');
  if(gs) gs.addEventListener('click',()=>{ closeWordModal(); openSettings(); });
  syncRegen(); syncExCnBtn();
}
function syncRegen(){
  const b=$('#wmRegen');
  if(!b||b.dataset.busy==='1') return;
  b.textContent=(wmState&&wmState.examples&&wmState.examples.length)?'换一批 2—3 句':'生成 2—3 句例句';
}
function setRegenBusy(on,label){
  const b=$('#wmRegen');
  if(!b) return;
  b.dataset.busy=on?'1':'0';
  b.disabled=!!on;
  b.textContent=on?(label||'AI 挑选中…'):'换一批例句';
}
function renderWmDictExtra(d){
  const sec=$('#wmDictSec'),box=$('#wmDictExtra');
  if(!sec||!box) return;
  if(!d||(!(d.forms&&d.forms.length)&&!(d.phrs&&d.phrs.length)&&!(d.syno&&(d.syno.syno||[]).length+d.syno.antonym.length))){
    sec.classList.add('hidden'); box.innerHTML=''; return;
  }
  let h='';
  if(d.forms&&d.forms.length){
    h+=d.forms.map(f=>'<div class="dx-row"><span class="dx-l">'+esc(f.label)+'</span><span class="dx-v">'+f.items.map(i=>'<span class="dx-chip">'+esc(i)+'</span>').join('')+'</span></div>').join('');
  }
  if(d.phrs&&d.phrs.length){
    h+='<div class="dx-row"><span class="dx-l">词组</span><span class="dx-v">'+d.phrs.slice(0,6).map(x=>'<span class="dx-chip">'+esc(x)+'</span>').join('')+'</span></div>';
  }
  const sy=d.syno||{};
  if((sy.syno||[]).length) h+='<div class="dx-row"><span class="dx-l">近义</span><span class="dx-v">'+esc(sy.syno.join('，'))+'</span></div>';
  if((sy.antonym||[]).length) h+='<div class="dx-row"><span class="dx-l">反义</span><span class="dx-v">'+esc(sy.antonym.join('，'))+'</span></div>';
  if((sy.rel||[]).length) h+='<div class="dx-row"><span class="dx-l">联想</span><span class="dx-v">'+esc(sy.rel.slice(0,8).join('；'))+'</span></div>';
  box.innerHTML=h;
  sec.classList.remove('hidden');
}
function collectExamples(){
  return (wmState&&wmState.examples?wmState.examples:[])
    .map(x=>({en:x.en,cn:x.cn||'',sense:x.sense||''}))
    .filter(x=>x.en);
}
function renderWmTags(){
  const box=$('#wmTags');
  if(!box) return;
  const sel=(wmState&&Array.isArray(wmState.tags))?wmState.tags:[];
  const names=tagNames();
  sel.forEach(t=>{ if(names.indexOf(t)<0) names.push(t); });
  if(!names.length){
    box.innerHTML='<div class="tag-empty">还没有标签类别。点右上角「＋ 新建类别」，先在「标签聚合」里建好，回到单词时直接勾选。</div>';
    return;
  }
  box.innerHTML=names.map(t=>{
    const on=sel.indexOf(t)>=0;
    return '<button type="button" class="pick-chip'+(on?' on':'')+'" data-tag="'+esc(t)+'">'+(on?'✓ ':'')+'# '+esc(t)+'</button>';
  }).join('');
}
function toggleWmTag(name){
  const t=String(name||'').trim();
  if(!t||!wmState) return;
  if(!Array.isArray(wmState.tags)) wmState.tags=[];
  const i=wmState.tags.indexOf(t);
  if(i>=0) wmState.tags.splice(i,1); else wmState.tags.push(t);
  renderWmTags();
  scheduleWmDraft(200);
}
function saveWord(){
  ensureOrigFirst();
  const term=wmState.term;
  const def=$('#wmDefinition').value.trim();
  const examples=collectExamples();
  const tags=[...new Set((wmState.tags||[]).map(putTag).filter(Boolean))];
  const noteRef=wmState.note?{noteId:wmState.note.id,noteTitle:wmState.note.title}:null;
  const word=upsertWord({term,phonetic:$('#wmPhonetic').textContent,definition:def,examples,tags,collocations:wmState.collocations||[],notes:noteRef?[noteRef]:[],source:wmState.existing?wmState.existing.source:(wmState.source||'ai'),mastered:wmState.mastered});
  if(wmState.dictExtra) word.dict=wmState.dictExtra;
  /* 手动切换掌握状态时，把记忆箱一起对齐 */
  const s=ensureSrs(word);
  if(wmState.mastered&&s.box<6){ s.box=6; s.due=Date.now()+30*DAY; }
  if(!wmState.mastered&&s.box>=6){ s.box=5; s.due=Date.now(); }
  word.mastered=s.box>=6;
  if(!word.phonetic&&$('#wmPhonetic').textContent) word.phonetic=$('#wmPhonetic').textContent.trim();
  save();
  /* 已经存进表达库，草稿使命结束 */
  wmState.saved=true;
  wmDraftDel(term);
  if(wmState.range&&!wmState.existing){
    highlightWord(wmState.range,word);
  }
  closeWordModal();
  toast(examples.length?('已加入表达库 · '+examples.length+' 条例句'):'已加入表达库');
  render();
}

function highlightWord(range,word){
  try{
    const node=range.commonAncestorContainer;
    const host=node.nodeType===1?node:node.parentElement;
    if(!host||!editorWrap.contains(host)) return;
    if(host.closest('.en-word')) return;
    const span=document.createElement('span');
    span.className='en-word';
    span.setAttribute('data-wid',word.id);
    span.title=(word.definition||'').replace(/\n/g,' · ').slice(0,140)+(word.examples&&word.examples[0]?'\n例：'+word.examples[0].en:'');
    range.surroundContents(span);
    lockWords(span);
    const n=state.notes.find(x=>x.id===ui.note);
    if(n){ n.content=bodyCleanHTML(); n.updatedAt=Date.now(); save(); }
  }catch(_){ /* 选区已失效则跳过高亮 */ }
}
function closeWordModal(){
  /* 没保存就关掉：把填过的内容存成草稿，下次打开同一个词接上 */
  try{ clearTimeout(wmDraftTimer); wmDraftSave(); }catch(e){}
  imgSeq++;
  $('#wordModal').classList.remove('show'); wmSeq++;
  try{ if('speechSynthesis' in window) speechSynthesis.cancel(); }catch(e){}
  /* 关弹窗顺手把键盘收起来，不然它会一直压着页面 */
  try{ const a=document.activeElement; if(a&&a.blur&&a!==document.body) a.blur(); }catch(e){}
  syncKbUI();
}
function renderWmMaster(){
  const el=$('#wmMaster');
  if(!el) return;
  el.textContent=wmState.mastered?'已掌握':'未掌握';
  el.classList.toggle('done',!!wmState.mastered);
}

/* ============ AI 对话（情景口语练习） ============ */
let aiState={seq:0,phase:'scenes',term:'',definition:'',examples:[],scenes:[],scene:null,lines:[],attempt:'',attemptPromptCn:'',busy:false};
const TONE_SYSTEM={
  friend:'You are a friendly native English-speaking friend. Chat naturally and colloquially, correct mistakes lightly, teach one natural alternative per turn, and always stay warm and lively — never robotic.',
  tutor:'You are a patient, rigorous private English tutor for Chinese learners. Give clear, detailed corrections and grammar explanations, and stay encouraging.',
  humor:'You are a humorous, energetic English practice partner. Use light jokes and fun comments to keep practice entertaining, while still correcting clearly and correctly.',
  strict:'You are a strict but fair English speaking-exam examiner. Point out errors directly, ask the learner to rephrase when needed, and score strictly.'
};
function toneSystem(){ return (TONE_SYSTEM[state.settings.tone]||TONE_SYSTEM.friend); }
async function aiCall(messages,opts){
  const st=aiApiConfig();
  const base=(st.baseUrl||'').replace(/\/+$/,'');
  if(!st.apiKey) throw new Error('未配置 '+(st.label||'模型')+' API Key，请先在设置中填写');
  const canJson=st.name==='deepseek'||String(base).toLowerCase().indexOf('deepseek')>=0;
  const once=async(useJson)=>{
    const ctrl=new AbortController();
    const to=opts&&opts.timeout||30000;
    const timer=setTimeout(()=>ctrl.abort(),to);
    try{
      const body={model:st.model,temperature:0.85,messages};
      if(opts&&opts.maxTokens) body.max_tokens=opts.maxTokens;
      if(useJson) body.response_format={type:'json_object'};
      const res=await fetch(base+'/chat/completions',{
        method:'POST',
        headers:{'Content-Type':'application/json','Authorization':'Bearer '+st.apiKey},
        body:JSON.stringify(body),
        signal:ctrl.signal
      });
      if(!res.ok){
        let t=''; try{ t=await res.text(); }catch(_){}
        const err=new Error('HTTP '+res.status+' '+(t||'').slice(0,120));
        err.status=res.status;
        throw err;
      }
      const data=await res.json();
      const content=data&&data.choices&&data.choices[0]&&data.choices[0].message?data.choices[0].message.content:'';
      const p=parseAI(content);
      if(!p) throw new Error('返回内容无法解析，请重试');
      return p;
    }finally{ clearTimeout(timer); }
  };
  try{
    return await once(canJson);
  }catch(err){
    /* 有的模型/版本不支持 response_format，会被 400 拒掉，去掉参数再试一次 */
    if(canJson&&err&&err.status===400) return await once(false);
    throw err;
  }
}
function aiWordCtx(){
  const terms=(aiState.terms&&aiState.terms.length)?aiState.terms:(aiState.term?[aiState.term]:[]);
  if(terms.length>1){
    return '这些单词：'+terms.map(t=>'"'+t+'"').join('、')+'（释义：'+(aiState.definition||'暂无')+'）';
  }
  return '"'+aiState.term+'"（释义：'+(aiState.definition||'暂无')+(aiState.examples.length?'；例句：'+aiState.examples.join('；'):'')+'）';
}
async function aiSuggestScenes(){
  const multi=aiState.terms&&aiState.terms.length>1;
  const task=multi?'给出一个能把这些词都用上的生活或职场场景（尽量都自然用上）。':'给出该词最常用、最适合做口语练习的 3 个生活或职场场景。';
  return aiCall([{role:'system',content:'你是英语情景口语设计者。直接输出一个 JSON 对象本身：不要 markdown、不要 ```json 代码块、不要任何解释或前后缀文字。'},
    {role:'user',content:'学习者在学 '+aiWordCtx()+'。'+task+'严格输出 JSON：{"scenes":[{"title":"场景中文名，6字以内","desc":"一句话说明这个场景里怎么用，20字以内（中文）"}]}'}]);
}
async function aiBuildDialogue(){
  const multi=aiState.terms&&aiState.terms.length>1;
  const useTxt=multi?('自然使用这些单词（尽量都用到）：'+aiState.terms.join('、')):'自然使用该单词至少一次';
  const youTxt=multi?'其中恰好一句是「由学习者口译说出」，用 who:"YOU" 表示，只给 promptCn（中文提示他要说的话，翻译成英文后应自然用到至少一个目标词）':'其中恰好一句是「由学习者口译说出」，用 who:"YOU" 表示，只给 promptCn（中文提示他要说的话，翻译成英文后应自然用到该单词）';
  return aiCall([{role:'system',content:'你是英语口语教练。'+toneSystem()+'直接输出一个 JSON 对象本身：不要 markdown、不要 ```json 代码块、不要任何解释或前后缀文字。'},
    {role:'user',content:'单词 '+aiWordCtx()+'，场景「'+aiState.scene.title+'」：'+aiState.scene.desc+'。创作一段 4-5 句、包含 1-2 个来回的自然口语对话，'+useTxt+'；'+youTxt+'；目标词必须放在 YOU 这一句最自然的位置；其余行 who 为 A/B，带 en（英文原句）和 cn（中文翻译）。严格输出 JSON：{"lines":[{"who":"A","en":"…","cn":"…"},{"who":"YOU","promptCn":"…"}]}'}]);
}
async function aiJudge(attempt){
  const ctx=aiState.lines.filter(l=>l.who!=='YOU').map(l=>l.who+': '+(l.en||'')).join('\n');
  const multi=aiState.terms&&aiState.terms.length>1;
  const stdTxt=multi?'标准地道的英文句子（尽量用上这些目标词）':'标准地道的英文句子（必须使用该单词）';
  return aiCall([{role:'system',content:'你是严格的英语口语陪练。'+toneSystem()+'直接输出一个 JSON 对象本身：不要 markdown、不要 ```json 代码块、不要任何解释或前后缀文字。'},
    {role:'user',content:'单词 '+aiWordCtx()+'。对话语境：\n'+ctx+'\n学习者口译的句子："'+attempt+'"（中文提示：'+aiState.attemptPromptCn+'）。判断语法是否正确、表达是否地道，并给出标准说法。严格输出 JSON：{"score":0-100,"verdict":"很地道/基本正确/需要改进/不太对","comment":"中文点评，指出具体问题并解释","standard":"'+stdTxt+'"}'}]);
}
function aiShowLoading(t){ $('#aiBody').classList.add('hidden'); $('#aiLoading').classList.remove('hidden'); $('#aiLoadStatus').textContent=t; }
function aiShowBody(){ $('#aiLoading').classList.add('hidden'); $('#aiBody').classList.remove('hidden'); }
function aiSetChatbar(phase){
  const bar=$('#aiChatbar'),input=$('#aiInput'),send=$('#aiSend'),again=$('#aiAgain');
  if(phase==='scenes'){ bar.classList.add('hidden'); again.textContent='换一批情景'; }
  else if(phase==='practice'){ bar.classList.remove('hidden'); input.placeholder='把上面中文提示说成英文（尽量用 '+aiState.term+'）…'; send.textContent='提交答案'; again.textContent='换个场景'; }
  else if(phase==='review'){ bar.classList.add('hidden'); again.textContent='再来一轮'; }
}
function aiRenderScenes(){
  const prev=(state.aiLog||[]).filter(x=>String(x.term).toLowerCase()===String(aiState.term).toLowerCase());
  const best=prev.length?Math.max.apply(null,prev.map(x=>x.score||0)):null;
  const tip=(aiState.terms&&aiState.terms.length>1)?('一次对话练 '+aiState.terms.length+' 个词，选一个情景开始')
    :(prev.length?('这个词练过 '+prev.length+' 次'+(best!=null?'，最高 '+best+' 分':'')+'，选一个情景继续'):'选择一个情景，开始今天的开口练习');
  $('#aiScene').innerHTML='<div class="ai-hint">'+esc(tip)+'</div>'+
    aiState.scenes.map((s,i)=>'<div class="scene-card" data-scene="'+i+'">'+
      '<span class="scene-num">0'+(i+1)+'</span>'+
      '<span class="scene-main"><span class="scene-title">'+esc(s.title)+'</span><span class="scene-desc">'+esc(s.desc||'')+'</span></span>'+
      '<svg class="icon-sm scene-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>'+
      '</div>').join('');
}
function aiRenderDialogue(){
  $('#aiScene').innerHTML=aiState.lines.map(l=>{
    if(l.who==='YOU'){
      return '<div class="ai-line ai-you"><div class="ai-text"><div class="ai-en"><span class="you-tag">你说</span><span class="you-prompt">'+esc(l.promptCn||'')+'</span>'+speakBtn(l.promptCn||'','zh-CN')+'</div></div></div>';
    }
    return '<div class="ai-line"><div class="ai-text"><div class="ai-en">'+esc(l.en||'')+speakBtn(l.en||'','en-US')+'</div>'+(l.cn?'<div class="ai-cn">'+esc(l.cn)+'</div>':'')+'</div></div>';
  }).join('');
  $('#aiScene').scrollTop=$('#aiScene').scrollHeight;
}
function aiRenderReview(d,attempt){
  const score=Math.max(0,Math.min(100,parseInt(d.score,10)||0));
  $('#aiScene').innerHTML=
    '<div class="ai-line ai-user"><div class="ai-text"><div class="ai-en">'+esc(attempt)+speakBtn(attempt,'en-US')+'</div></div></div>'+
    '<div class="ai-fb">'+
      '<div class="ai-fb-top"><span class="ai-score big">'+score+' 分</span>'+(d.verdict?'<span class="ai-verdict">'+esc(String(d.verdict))+'</span>':'')+'</div>'+
      (d.comment?'<div class="ai-comment">'+esc(String(d.comment))+'</div>':'')+
      (d.standard?'<div class="ai-corrected"><span class="ai-corr-label">标准答案 · 点喇叭跟读</span><span class="ai-corr-en">'+esc(String(d.standard))+speakBtn(String(d.standard),'en-US')+'</span></div>':'')+
      '<div class="ai-fb-actions"><button class="mini-btn" id="aiGotoScenes">换个场景</button></div>'+
    '</div>';
  $('#aiScene').scrollTop=$('#aiScene').scrollHeight;
}
function aiGotoScenes(){
  stopAiDictation();
  aiState.phase='scenes';
  aiShowBody();
  aiSetChatbar('scenes');
  aiRenderScenes();
}
function startScene(sc){
  if(!sc) return;
  aiState.scene=sc;
  aiState.phase='practice';
  aiState.attempt=''; aiState.attemptPromptCn='';
  const mySeq=++aiState.seq;
  aiShowLoading('正在生成对话…');
  aiBuildDialogue().then(r=>{
    if(mySeq!==aiState.seq) return;
    const lines=(r.lines||[]).filter(x=>x&&(x.who==='YOU'?x.promptCn:x.en));
    if(!lines.some(x=>x.who==='YOU')) throw new Error('对话缺少练习句，请重试');
    aiState.lines=lines;
    aiState.phase='practice';
    aiShowBody();
    aiSetChatbar('practice');
    aiRenderDialogue();
  }).catch(err=>{
    if(mySeq!==aiState.seq) return;
    aiShowBody();
    $('#aiScene').innerHTML='<div class="empty-state">'+esc(aiErrText(err))+'</div>';
    const r=$('#aiRetry'); if(r) r.addEventListener('click',()=>startScene(sc));
  });
}
async function submitAttempt(){
  if(aiState.phase!=='practice'||aiState.busy) return;
  const input=$('#aiInput');
  const text=input.value.trim();
  if(!text){ toast('先把你的翻译说出来或写下来','warn'); return; }
  stopAiDictation();
  aiState.busy=true;
  const youLine=aiState.lines.find(l=>l.who==='YOU');
  aiState.attempt=text;
  aiState.attemptPromptCn=(youLine&&youLine.promptCn)||'';
  input.value='';
  const mySeq=++aiState.seq;
  aiShowLoading('正在批改你的句子…');
  aiJudge(text).then(d=>{
    if(mySeq!==aiState.seq) return;
    aiState.phase='review';
    aiShowBody();
    aiSetChatbar('review');
    aiRenderReview(d,text);
    saveSpeakLog(d,text);
  }).catch(err=>{
    if(mySeq!==aiState.seq) return;
    aiShowBody();
    aiSetChatbar('practice');
    toast(String(err&&err.message||'批改失败，请重试'),'warn');
  }).finally(()=>{ aiState.busy=false; });
}
function saveSpeakLog(d,attempt){
  const score=Math.max(0,Math.min(100,parseInt(d.score,10)||0));
  const sc=aiState.scene||{};
  state.aiLog.unshift({
    id:uid(),term:aiState.term,scene:sc.title||'',sceneDesc:sc.desc||'',
    promptCn:aiState.attemptPromptCn||'',attempt:String(attempt||''),
    score,verdict:String(d.verdict||''),comment:String(d.comment||''),
    standard:String(d.standard||''),createdAt:Date.now()
  });
  if(state.aiLog.length>300) state.aiLog.length=300;
  save();
  const chip=$('#aiScoreChip');
  if(chip){ chip.textContent=score+' 分'; chip.classList.remove('hidden'); }
  renderSidebar();
}
function scoreClass(s){ return s>=80?'good':(s>=60?'mid':'bad'); }
function renderSpeakLog(){
  $('#paneTitle').textContent='口语记录';
  $('#btnNewNote').style.display='none';
  const box=$('#noteList');
  const log=state.aiLog||[];
  if(!log.length){
    box.innerHTML='<div class="empty-state">'+
      '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.4 8.4 0 0 1-9 8.4L4 21l1.2-3.7A8.4 8.4 0 1 1 21 11.5z"/></svg>'+
      '<div><b>还没有练习记录</b><br>在单词卡片里点「AI 对话」，选一个情景开口翻译，成绩会自动存在这里。</div></div>';
    return;
  }
  const avg=Math.round(log.reduce((s,x)=>s+(x.score||0),0)/log.length);
  const weak=log.filter(x=>x.score<80).slice(0,12);
  const weakIds=new Set(weak.map(x=>x.id));
  const rest=log.filter(x=>!weakIds.has(x.id)).slice(0,60);
  const itemHTML=x=>'<div class="log-item" data-log="'+x.id+'">'+
    '<div class="log-top"><span class="log-term">'+esc(x.term)+'</span>'+
      '<span class="log-scene">'+esc(x.scene||'情景练习')+'</span>'+
      '<span class="log-score '+scoreClass(x.score)+'">'+x.score+'</span></div>'+
    (x.attempt?'<div class="log-line">你：<b>'+esc(x.attempt)+'</b></div>':'')+
    (x.standard?'<div class="log-line">标准：'+esc(x.standard)+'</div>':'')+
    '<div class="log-meta">'+fmtDate(x.createdAt)+' · 点一下再练一次</div>'+
  '</div>';
  let h='<div class="rv-stats" style="padding:14px 14px 6px">'+
    '<div class="rv-stat"><div class="n">'+log.length+'</div><div class="l">练习次数</div></div>'+
    '<div class="rv-stat '+(avg>=80?'ok':'hot')+'"><div class="n">'+avg+'</div><div class="l">平均分</div></div>'+
    '<div class="rv-stat"><div class="n">'+weak.length+'</div><div class="l">待加强</div></div>'+
  '</div>';
  if(weak.length){
    h+='<div class="sr-group"><div class="sr-group-title">错题重练 <span>低于 80 分</span></div><div class="log-list" style="padding:0 0 6px">'+
      weak.map(itemHTML).join('')+'</div></div>';
  }
  if(rest.length){
    h+='<div class="sr-group"><div class="sr-group-title">'+(weak.length?'其余记录':'全部记录')+
      ' <span>'+rest.length+'</span></div><div class="log-list" style="padding:0 0 20px">'+
      rest.map(itemHTML).join('')+'</div></div>';
  }
  box.innerHTML=h;
}
function openAiPractice(term,scene){
  const w=state.words.find(x=>String(x.term).toLowerCase()===String(term).toLowerCase());
  const sc=scene&&scene.title?scene:{title:'自由练习',desc:'自然地把这个词用进一句话'};
  aiState={seq:0,phase:'practice',term:String(term||''),definition:w?w.definition:'',
    examples:w?(w.examples||[]).map(x=>x.en).slice(0,2):[],scenes:[],scene:sc,
    lines:[],attempt:'',attemptPromptCn:'',busy:false};
  $('#aiTitle').textContent='情景口语 · '+term;
  $('#aiSub').textContent=sc.title;
  $('#aiScoreChip').classList.add('hidden');
  $('#aiScene').innerHTML='';
  $('#aiModal').classList.add('show');
  if(!aAiReady()){
    aiShowBody();
    aiSetChatbar('scenes');
    $('#aiScene').innerHTML=aiGuideHtml('未配置模型 API，练习前请先在设置里填写');
    const r=$('#aiRetry'); if(r) r.addEventListener('click',()=>openAiPractice(term,sc));
    const g=$('#aiGotoSettings'); if(g) g.addEventListener('click',()=>{ closeAiModal(); openSettings(); });
    return;
  }
  startScene(sc);
}
function aiAgainAction(){
  if(aiState.phase==='scenes'){ openAiDialogue(); return; }
  if(aiState.phase==='practice'){ aiGotoScenes(); return; }
  if(aiState.phase==='review'){ startScene(aiState.scene); }
}
let aiDictation=null;
let aiDictationBlocked=false;
function stopAiDictation(){
  const rec=aiDictation;
  aiDictation=null;
  $('#aiMic').classList.remove('on');
  if(rec){try{rec.abort();}catch(_){}}
}
function aiMicDictate(){
  if(aiState.busy||aiDictation)return;
  const SR=window.SpeechRecognition||window.webkitSpeechRecognition,input=$('#aiInput');
  const keyboard=()=>{
    input.focus();
    toast('可用键盘上的麦克风听写，或直接输入','warn');
  };
  if(!SR||aiDictationBlocked){keyboard();return;}
  try{
    const rec=new SR();
    aiDictation=rec;
    rec.lang='en-US'; rec.interimResults=false; rec.maxAlternatives=1;
    rec.onresult=e=>{
      if(aiDictation!==rec)return;
      const t=(e.results[0][0].transcript||'').trim();
      if(t){input.value=(input.value?input.value+' ':'')+t;input.focus();}
    };
    rec.onerror=e=>{
      if(aiDictation!==rec)return;
      stopAiDictation();
      if(e.error==='not-allowed'||e.error==='service-not-allowed'){
        aiDictationBlocked=true;
        keyboard();
      }else toast('没听清，可以再试一次','warn');
    };
    rec.onend=()=>{
      if(aiDictation!==rec)return;
      aiDictation=null;
      $('#aiMic').classList.remove('on');
    };
    stopSpeech();
    rec.start();
    $('#aiMic').classList.add('on');
    toast('请说出你的英文翻译…');
  }catch(_){stopAiDictation();keyboard();}
}
function aiGuideHtml(msg){
  return '<div class="empty-state">'+esc(msg)+
    '<div style="font-size:12.5px;color:var(--text2);line-height:1.9;margin-top:10px;text-align:left;background:var(--s2);border:1px solid var(--s4);border-radius:10px;padding:12px">使用方法：<br>① 点左上角菜单 → 最下方「设置」<br>② 点一个服务商按钮（DeepSeek / OpenAI / 智谱）<br>③ 粘贴你的 API Key → 保存设置<br>④ 回到这里再点「AI 对话」</div>'+
    '<div style="display:flex;gap:8px;justify-content:center;margin-top:14px">'+
    '<button class="btn" id="aiRetry">重试</button>'+
    '<button class="btn primary" id="aiGotoSettings">去设置</button></div></div>';
}
function openAiDialogue(ev){
  /* 只认真人点击：无事件的调用（自动触发）在词卡刚打开 1.5 秒内一律忽略 */
  if(ev&&ev.isTrusted===false) return;
  if(!ev&&Date.now()-(wmOpenedAt||0)<1500) return;
  const term=wmState.term;
  const ex=state.words.find(x=>x.term.toLowerCase()===term.toLowerCase());
  const definition=($('#wmDefinition').value||'').trim()||(ex&&ex.definition)||'';
  const examples=collectExamples().map(x=>x.en).filter(Boolean);
  if(!examples.length&&ex) examples.push(...(ex.examples||[]).map(x=>x.en).filter(Boolean));
  aiState={seq:0,phase:'scenes',term,definition,examples,scenes:[],scene:null,lines:[],attempt:'',attemptPromptCn:'',busy:false};
  $('#aiTitle').textContent='情景口语 · '+term;
  $('#aiSub').textContent='选情景 → 开口翻译 → AI 批改 → 跟读';
  $('#aiScoreChip').classList.add('hidden');
  $('#aiScene').innerHTML='';
  $('#aiModal').classList.add('show');
  const mySeq=++aiState.seq;
  aiShowLoading('正在为你挑选最常用的情景…');
  if(!aAiReady()){
    aiShowBody();
    aiSetChatbar('scenes');
    $('#aiScene').innerHTML=aiGuideHtml('未配置模型 API，请先在设置中填写');
    $('#aiRetry').addEventListener('click',openAiDialogue);
    $('#aiGotoSettings').addEventListener('click',()=>{ closeAiModal(); openSettings(); });
    return;
  }
  aiSuggestScenes().then(r=>{
    if(mySeq!==aiState.seq) return;
    const sc=(r.scenes||[]).filter(x=>x&&x.title).slice(0,3);
    if(!sc.length) throw new Error('返回内容无法解析，请重试');
    aiState.scenes=sc;
    aiState.phase='scenes';
    aiShowBody();
    aiSetChatbar('scenes');
    aiRenderScenes();
  }).catch(err=>{
    if(mySeq!==aiState.seq) return;
    aiShowBody();
    $('#aiScene').innerHTML='<div class="empty-state">'+esc(String(err&&err.message||'生成失败，请重试'))+'</div>';
    const r=$('#aiRetry'); if(r) r.addEventListener('click',openAiDialogue);
  });
}
function closeAiModal(){ stopAiDictation(); $('#aiModal').classList.remove('show'); aiState.seq++; try{ if('speechSynthesis' in window) speechSynthesis.cancel(); }catch(e){} }

