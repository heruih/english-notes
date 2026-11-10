/* ===== 03_editor.js · 今日复习 / 编辑器 / 大标题折叠 / 赋能词整体化 ===== */
/* ============ 今日复习（间隔重复） ============ */
function reviewQueue(mode){
  const list=mode==='free'?state.words.slice():dueList();
  list.sort((a,b)=>{
    const da=srsDue(a),db=srsDue(b);
    if(da!==db) return da-db;
    return (a.term||'').localeCompare(b.term||'');
  });
  return list;
}
function buildReview(mode){
  const q=reviewQueue(mode||'due').filter(w=>!aPending(w)).slice(0,10);
  ui.flash={mode:mode||'due',ids:q.map(w=>w.id),idx:0,flipped:false,graded:0,total:q.length};
  return ui.flash;
}
function flipFlash(){
  if(!ui.flash||!ui.flash.ids.length) return;
  ui.flash.flipped=!ui.flash.flipped;
  renderFlash();
}
function stepFlash(d){
  if(!ui.flash) return;
  const L=ui.flash.ids.length;
  let ni=ui.flash.idx+d;
  if(ni<0) ni=0;
  if(ni>L-1) ni=L-1;
  ui.flash.idx=ni; ui.flash.flipped=false;
  renderFlash();
}
function gradeCurrent(g){
  const f=ui.flash;
  if(!f||!f.ids.length) return;
  const w=state.words.find(x=>x.id===f.ids[f.idx]);
  if(!w) return;
  const s=srsGrade(w,g);
  save();
  const tip={0:'已记为「忘了」，10 分钟后再练',1:'记为「有点难」',2:'记为「记住了」'}[g]+' · '+SRS_LABEL[s.box];
  f.idx++; f.flipped=false; f.graded++;
  renderFlash();
  toast(tip);
}
function renderFlash(){
  $('#paneTitle').textContent='今日复习';
  $('#btnNewNote').style.display='none';
  const box=$('#noteList');
  if(!state.words.length){
    box.innerHTML='<div class="empty-state">'+
      '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>'+
      '<div><b>还没有单词可复习</b><br>回到笔记，选中英文单词点「empower」存入表达库。</div></div>';
    return;
  }
  const sum=srsSummary();
  if(!ui.flash) buildReview('due');
  const f=ui.flash;
  const stats='<div class="rv-stats">'+
    '<div class="rv-stat hot"><div class="n">'+sum.due+'</div><div class="l">今日到期</div></div>'+
    '<div class="rv-stat"><div class="n">'+sum.fresh+'</div><div class="l">没练过</div></div>'+
    '<div class="rv-stat ok"><div class="n">'+sum.done+'</div><div class="l">已掌握</div></div>'+
  '</div>';
  if(!f.ids.length||f.idx>=f.ids.length){
    const nxt=state.words.filter(w=>!aPending(w)).sort((a,b)=>srsDue(a)-srsDue(b))[0];
    const nxtTxt=nxt?('下一个到期：'+esc(nxt.term)+'（'+srsNextLabel(nxt)+'）'):'全部单词都已掌握';
    box.innerHTML=stats+
      '<div class="flash-empty">'+
        '<div class="big">🎉</div>'+
        '<b>'+(f.graded?'本轮复习完成了':'现在没有到期的单词')+'</b>'+
        '<div style="font-size:13px;color:var(--text2);line-height:1.7">'+(f.graded?('本轮复习 '+f.graded+' 个单词，已按记忆强度安排下次时间。'):nxtTxt)+'</div>'+
        '<div style="display:flex;gap:10px;flex-wrap:wrap;justify-content:center">'+
          '<button class="btn primary" id="rvFree">自由复习一轮（最多 10 个）</button>'+
          '<button class="btn" id="rvReset">重来今日</button>'+
        '</div>'+
        '<div style="font-size:12px;color:var(--text3)">记忆曲线：1 → 3 → 7 → 15 → 30 天</div>'+
      '</div>';
    const fb=$('#rvFree'); if(fb) fb.addEventListener('click',()=>{ buildReview('free'); renderFlash(); });
    const rb=$('#rvReset'); if(rb) rb.addEventListener('click',()=>{ buildReview('due'); renderFlash(); });
    return;
  }
  const w=state.words.find(x=>x.id===f.ids[f.idx]);
  if(!w){ f.idx=f.ids.length; renderFlash(); return; }
  const total=f.ids.length;
  const pos=f.idx+1;
  const pct=Math.round((f.idx/total)*100);
  /* 保留原始序号：标亮的存储键是（词, 例句序号, 原文快照），过滤后序号会错位就查不到 */
  const examples=(w.examples||[]).map((x,oi)=>({x:x,oi:oi})).filter(o=>o.x.sense!=='原文').slice(0,2);
  const s=w.srs||{box:1,due:0};
  const origEx=(w.examples||[]).find(x=>x.sense==='原文');
  const srcN=w.notes&&w.notes[0]?(state.notes.find(x=>x.id===w.notes[0].noteId)||null):null;
  const shots=(w?shotsGet(w.term):[]).slice(0,4);
  /* 方案 A：复习卡背面只读配图缓存，绝不发起网络请求（不会卡顿、不会超时） */
  const picRec=wmImgCached(w.term);
  const picCand=(picRec&&Array.isArray(picRec.cands)&&picRec.cands.length)?picRec.cands[Math.min(picRec.idx||0,picRec.cands.length-1)]:null;
  const picUrl=picCand?(picCand.thumb||picCand.src||''):'';
  const backFace=
    '<div class="flash-face flash-back">'+
      (w.phonetic?'<div class="fb-phon">'+esc(w.phonetic)+'</div>':'')+
      '<div class="fb-def">'+esc(w.definition||'（暂无释义）')+'</div>'+
      (w.collocations&&w.collocations.length?'<div class="fb-coll">'+w.collocations.map(c=>'<span class="coll-chip">'+esc(c)+'</span>').join('')+'</div>':'')+
      (origEx?'<div class="fb-orig">原句：'+esc(origEx.en)+'</div>':'')+
      (picUrl||shots.length?'<div class="fb-shot">'+(picUrl?'<img class="word-pic" src="'+esc(picUrl)+'" alt="配图" data-fbpic="1" loading="lazy" referrerpolicy="no-referrer">':'')+shots.map((sh,i)=>'<img class="word-shot" src="'+sh.dataUrl+'" alt="截图" data-fbshot="'+i+'">').join('')+'</div>':'')+
      (examples.length?'<div class="fb-ex">'+examples.map((o,i)=>{const x=o.x;return '<div class="fb-ex-item"><div class="fb-ex-row"><div class="e" data-fbcn="'+i+'">“'+qwHTML(x.en,w.term,w.term,o.oi)+'”</div>'+speakBtn(x.en)+'</div>'+(x.cn?'<div class="c hided"><span class="cn-real">'+esc(x.cn)+'</span><span class="cn-tip">点这一行看中文</span></div>':'')+'</div>';}).join('')+'</div>':(origEx?'<div class="fb-tagline">原文句已在上方</div>':'<div class="fb-tagline">这个词还没有例句</div>'))+
      '<div class="fb-tagline">第 '+s.box+' 箱 · '+(s.due<=Date.now()?'今天到期':srsNextLabel(w))+'</div>'+
      (srcN?'<div class="fb-src">来自笔记：'+esc(srcN.title||'')+'</div>':'')+
    '</div>';
  const dueMode=f.mode!=='free';
  box.innerHTML='<div class="rv-wrap">'+stats+
    '<div class="rv-bar"><i style="width:'+pct+'%"></i></div>'+
    '<div class="flash-wrap">'+
      '<div class="flash-progress">'+(dueMode?'待复习':'自由复习')+'　'+pos+' / '+total+'</div>'+
      '<div class="flash-scene"><div class="flash-card'+(f.flipped?' flipped':'')+'" id="flashCard">'+
        '<div class="flash-face flash-front"><div class="flash-term-row"><div class="flash-term">'+esc(w.term)+'</div>'+speakBtn(w.term,'','word')+
          '<button class="speak-btn follow-btn" data-wordfollow="'+esc(w.term)+'" aria-label="跟读这个单词"><svg class="icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="2" width="6" height="11" rx="3"/><path d="M5 10a7 7 0 0 0 14 0M12 17v4M8 21h8"/></svg></button>'+
        '</div>'+(w.followBest?'<div class="flash-best">跟读最佳 '+w.followBest+' 分</div>':'')+'<div class="flash-hint">点击卡片看释义'+(w.examples&&w.examples.length?'和例句':'')+'</div></div>'+
        backFace+
      '</div></div>'+
      (dueMode?
        (f.flipped?'<div class="grade-row">'+
          '<button class="grade-btn again" data-grade="0">忘了<small>10 分钟后再练</small></button>'+
          '<button class="grade-btn hard" data-grade="1">有点难<small>缩短间隔</small></button>'+
          '<button class="grade-btn good" data-grade="2">记住了<small>拉长间隔</small></button>'+
        '</div>':'<div style="font-size:12.5px;color:var(--text3);height:52px;display:flex;align-items:center">先回想，再点卡片翻开</div>')
        :'<div class="flash-actions">'+
          '<button class="btn" id="flashPrev"'+(f.idx===0?' disabled':'')+'>上一张</button>'+
          '<button class="btn" id="flashNext"'+(f.idx===total-1?' disabled':'')+'>下一张</button>'+
          '<button class="btn" id="flashExit">回到今日复习</button>'+
        '</div>')+
    '</div>'+
  '</div>';
  const card=$('#flashCard');
  card.addEventListener('click',flipFlash);
  $$('#flashCard [data-wordfollow]').forEach(b=>b.addEventListener('click',e=>{
    e.stopPropagation();
    openFollow(b.getAttribute('data-wordfollow'),b.getAttribute('data-wordfollow'),'');
  }));
  $$('#flashCard [data-play]').forEach(b=>b.addEventListener('click',e=>{
    e.stopPropagation();
    if(b.getAttribute('data-play-kind')==='word') speakWord(b.getAttribute('data-play'));
    else speak(b.getAttribute('data-play'),b.getAttribute('data-play-lang')||'en-US');
  }));
  $$('#flashCard [data-fbshot]').forEach(b=>b.addEventListener('click',e=>{
    e.stopPropagation();
    openShotViewerFor(w.term,Number(b.dataset.fbshot));
  }));
  /* 点配图 → 打开词卡（那里能换一张、看大图、触发搜索） */
  $$('#flashCard [data-fbpic]').forEach(b=>b.addEventListener('click',e=>{
    e.stopPropagation();
    openWordModal(w.term,null,null,w);
  }));
  $$('#flashCard [data-fbcn]').forEach(el=>el.addEventListener('click',e=>{
    e.stopPropagation();            /* 别让卡片跟着翻回去 */
    const it=el.closest('.fb-ex-item');
    const c=it&&it.querySelector('.c');
    if(c) c.classList.toggle('hided');
  }));
  /* 中文那一行自己也能点开/收起 */
  $$('#flashCard .fb-ex-item .c').forEach(el=>el.addEventListener('click',e=>{
    e.stopPropagation();
    el.classList.toggle('hided');
  }));
  $$('.grade-btn').forEach(b=>b.addEventListener('click',()=>gradeCurrent(Number(b.dataset.grade))));
  const pv=$('#flashPrev'), nx=$('#flashNext'), ex=$('#flashExit');
  if(pv) pv.addEventListener('click',()=>stepFlash(-1));
  if(nx) nx.addEventListener('click',()=>stepFlash(1));
  if(ex) ex.addEventListener('click',()=>{ buildReview('due'); renderFlash(); });
}

/* ============ 编辑器 ============ */
const titleEl=$('#noteTitle'), bodyEl=$('#noteBody'), editorWrap=$('#editorWrap');
function renderEditor(){
  const n=state.notes.find(x=>x.id===ui.note);
  if(!n||ui.mode!=='edit'){ editorWrap.classList.add('hidden'); return; }
  editorWrap.classList.remove('hidden');
  $('#edBreadcrumb').textContent=folderName()+' / '+(n.title||'无标题');
  if(ui.lastNote!==ui.note){
    titleEl.innerText=(n.title==='无标题')?'':n.title;
    bodyEl.innerHTML=n.content||'';
    ui.lastNote=ui.note;
    applyFolds();
    lockWords();
    const h=$('#edHint'); if(h) h.classList.remove('out');
  }
  updatePlaceholders();
  syncEdHint();
}

/* 首次新建笔记时的一行提示：用够 3 次就不再出现，输入第一个字就收起 */
const HINT_KEY='english-notes-hint-v1';
function hintShown(){ try{ return +(localStorage.getItem(HINT_KEY)||0)||0; }catch(_){ return 9; } }
function hintBump(){ try{ localStorage.setItem(HINT_KEY,String(Math.min(9,hintShown()+1))); }catch(_){ } }
let hintTimer=0;
function syncEdHint(){
  const el=$('#edHint');
  if(!el) return;
  const empty=!bodyEl.textContent.trim()&&!titleEl.textContent.trim();
  if(ui.mode!=='edit'||!empty||hintShown()>=3){ el.classList.add('hidden'); return; }
  el.classList.remove('hidden','out');
  clearTimeout(hintTimer);
  hintTimer=setTimeout(()=>{ hideEdHint(false); },7000);
}
function hideEdHint(countIt){
  const el=$('#edHint');
  if(!el||el.classList.contains('hidden')) return;
  el.classList.add('out');
  clearTimeout(hintTimer);
  setTimeout(()=>el.classList.add('hidden'),500);
  if(countIt) hintBump();
}
function updatePlaceholders(){
  titleEl.classList.toggle('empty',!titleEl.textContent.trim());
  bodyEl.classList.toggle('empty',!bodyEl.textContent.trim());
}
let saveTimer=null;
function onEditorInput(){
  try{ healWords(); }catch(_){ }
  try{ autoHeading(); }catch(_){ }
  try{ hideEdHint(true); }catch(_){ }
  clearTimeout(saveTimer);
  saveTimer=setTimeout(()=>{ persistEditor(); renderSidebar(); renderPane(); },400);
}
function persistEditor(){
  const n=state.notes.find(x=>x.id===ui.note);
  if(!n) return;
  n.title=titleEl.innerText.trim()||'无标题';
  n.content=bodyCleanHTML();
  n.sel=captureCaret();
  n.updatedAt=Date.now();
  updatePlaceholders();
  save();
}
/* 记忆输入位置：像备忘录一样，随时退出、下次进入还在原处 */
function captureCaret(){
  const el=bodyEl, s=window.getSelection();
  if(!s||s.rangeCount===0||!el.contains(s.anchorNode)) return null;
  const r=s.getRangeAt(0);
  let node=r.startContainer, path=[];
  while(node&&node!==el){
    const parent=node.parentNode;
    if(!parent) break;
    const idx=Array.prototype.indexOf.call(parent.childNodes,node);
    if(idx<0) break;
    path.unshift({i:idx,e:node.nodeType===1});
    node=parent;
  }
  if(node!==el) return null;
  return {path,off:r.startOffset};
}
function restoreCaret(sel){
  if(!sel){ focusEnd(bodyEl); return; }
  try{
    let node=bodyEl;
    for(const p of sel.path){
      const kids=node.childNodes;
      node=(p.i<kids.length)?kids[p.i]:null;
      if(!node){ node=null; break; }
    }
    if(!node){ focusEnd(bodyEl); return; }
    const r=document.createRange();
    if(node.nodeType===3) r.setStart(node,Math.min(sel.off||0,node.length));
    else r.setStart(node,Math.min(sel.off||0,node.childNodes.length));
    r.collapse(true);
    const s=window.getSelection(); s.removeAllRanges(); s.addRange(r);
    bodyEl.focus();
  }catch(_){ focusEnd(bodyEl); }
}
function focusEnd(el){
  el.focus();
  try{
    const r=document.createRange(); r.selectNodeContents(el); r.collapse(false);
    const s=window.getSelection(); s.removeAllRanges(); s.addRange(r);
  }catch(_){}
}
/* ============ 正文大标题 + 点一下收起（备忘录那套） ============ */
const FOLD_KEY='english-notes-fold-v1';
function foldAll(){
  try{ const o=JSON.parse(localStorage.getItem(FOLD_KEY)||'{}'); return (o&&typeof o==='object'&&!Array.isArray(o))?o:{}; }catch(_){ return {}; }
}
function foldOf(id){
  const a=foldAll()[id];
  return (a&&typeof a==='object'&&!Array.isArray(a))?a:{};
}
function foldSet(id,idx,on){
  if(!id) return;
  const all=foldAll();
  const m=Object.assign({},all[id]||{});
  if(on) m[idx]=1; else delete m[idx];
  if(Object.keys(m).length) all[id]=m; else delete all[id];
  try{ localStorage.setItem(FOLD_KEY,JSON.stringify(all)); }catch(_){ }
}
function isHead(el){ return !!(el&&el.nodeType===1&&el.classList&&el.classList.contains('nh')); }
function blockAtCaret(){
  const s=window.getSelection();
  if(!s||!s.rangeCount) return null;
  let n=s.anchorNode;
  if(!n) return null;
  if(n.nodeType===3) n=n.parentNode;
  while(n&&n!==bodyEl&&n.parentNode!==bodyEl) n=n.parentNode;
  return (n&&n!==bodyEl&&n.parentNode===bodyEl)?n:null;
}
function caretTo(el){
  try{
    const r=document.createRange(); r.selectNodeContents(el); r.collapse(false);
    const s=window.getSelection(); s.removeAllRanges(); s.addRange(r);
    bodyEl.focus();
  }catch(_){ }
}
function caretAtStart(el){
  const s=window.getSelection();
  if(!s||!s.rangeCount) return false;
  const r=s.getRangeAt(0);
  if(!r.collapsed||!el.contains(r.startContainer)) return false;
  const pre=document.createRange();
  pre.selectNodeContents(el);
  try{ pre.setEnd(r.startContainer,r.startOffset); }catch(_){ return false; }
  return pre.toString().length===0;
}
function headingIdx(h){
  let i=-1;
  for(const el of bodyEl.children){ if(isHead(el)) i++; if(el===h) return i; }
  return -1;
}
/* 把「折叠」画出来：只加视图用的 class，保存时会清掉 */
function applyFolds(){
  if(!bodyEl||!ui.note) return;
  const folded=foldOf(ui.note);
  let hi=-1, hide=false;
  Array.prototype.forEach.call(bodyEl.children,el=>{
    el.classList.remove('nh-fold');
    if(isHead(el)){
      hi++;
      hide=!!folded[hi];
      el.classList.toggle('folded',hide);
      return;
    }
    if(hide) el.classList.add('nh-fold');
  });
  try{ mvDecorate(); }catch(_){ }
}
function toggleFold(h,force){
  if(!h||!ui.note) return;
  const idx=headingIdx(h);
  if(idx<0) return;
  const next=(force===undefined)?!h.classList.contains('folded'):!!force;
  foldSet(ui.note,idx,next);
  applyFolds();
  try{ if(navigator.vibrate) navigator.vibrate(8); }catch(_){ }
}
/* 光标如果落在被收起的段落里，把那一节展开，免得看不见自己在哪 */
function revealCaret(){
  const b=blockAtCaret();
  if(!b||!b.classList.contains('nh-fold')) return;
  let p=b.previousElementSibling;
  while(p&&!isHead(p)) p=p.previousElementSibling;
  if(p) toggleFold(p,false);
}
/* 保存出去的正文：把只给界面看的 class 摘掉，内容一个字不改 */
function bodyCleanHTML(){
  const c=bodyEl.cloneNode(true);
  c.querySelectorAll('.mf,.mv-drop').forEach(e=>e.remove());
  c.querySelectorAll('.nh-fold').forEach(e=>e.classList.remove('nh-fold'));
  c.querySelectorAll('.folded').forEach(e=>e.classList.remove('folded'));
  c.querySelectorAll('.mv-pick').forEach(e=>e.classList.remove('mv-pick'));
  c.querySelectorAll('.en-word').forEach(e=>{
    e.removeAttribute('contenteditable');
    e.removeAttribute('spellcheck');
    e.classList.remove('mv-lift');
    if(!e.getAttribute('class')) e.removeAttribute('class');
  });
  c.querySelectorAll('.mv-hit').forEach(e=>e.classList.remove('mv-hit'));
  c.querySelectorAll('[style=""]').forEach(e=>e.removeAttribute('style'));
  c.querySelectorAll('[class=""]').forEach(e=>e.removeAttribute('class'));
  return c.innerHTML;
}

/* ============ 赋能词 = 一个整体：光标进不去，也改不了字母 ============ */
/* 用系统级的 contenteditable="false" 做原子块；再留一层自愈，防粘贴/输入法把字改掉 */
const wSnap=new WeakMap();
function wOK(s,t){ return s.childElementCount===0 && s.textContent===t; }
function wFix(s,t){ if(t!=null&&!wOK(s,t)) s.textContent=t; }
function lockWords(root){
  const b=root||bodyEl;
  if(!b||!b.querySelectorAll) return;
  const list=b.classList&&b.classList.contains('en-word')?[b]:Array.prototype.slice.call(b.querySelectorAll('.en-word'));
  list.forEach(s=>{
    if(!wSnap.has(s)) wSnap.set(s,s.textContent);
    else wFix(s,wSnap.get(s));
    if(s.getAttribute('contenteditable')!=='false') s.setAttribute('contenteditable','false');
    if(s.getAttribute('spellcheck')!=='false') s.setAttribute('spellcheck','false');
  });
}
/* 万一词里的字变了（粘贴、输入法、撤销），立刻还原成一个整体 */
function healWords(){
  if(!bodyEl) return 0;
  let n=0;
  bodyEl.querySelectorAll('.en-word').forEach(s=>{
    const t=wSnap.get(s);
    if(t!=null&&!wOK(s,t)){ s.textContent=t; n++; }
    if(s.getAttribute('contenteditable')!=='false') s.setAttribute('contenteditable','false');
  });
  return n;
}
/* 行首输入 # 空格 → 这一行变大标题 */
function autoHeading(){
  const b=blockAtCaret();
  if(!b||isHead(b)) return false;
  const t=b.textContent||'';
  const m=t.match(/^#{1,4}\s(.*)$/);
  if(!m) return false;
  const rest=(m[1]||'').replace(/\s+$/,'');
  b.classList.add('nh');
  b.textContent=rest;
  if(!rest) b.appendChild(document.createElement('br'));
  caretTo(b);
  return true;
}


