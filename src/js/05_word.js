/* ===== 05_word.js · 选词条 / 词典 / 例句标亮 / 快查 / 跟读 / AI 例句 ===== */
/* ============ 选词操作条 ============ */
const pill=$('#empowerPill');
const pillWord=$('#pillWord');
let pillTimer=null, pillHoldAt=0, pillHideTimer=null;
function scheduleCheck(){ clearTimeout(pillTimer); pillTimer=setTimeout(checkSelection,70); }
/* 手指刚碰到操作条的那一秒内，别自己把自己藏掉（否则点击会落空） */
function pillHeld(){ return Date.now()-pillHoldAt<900; }
function rangeInEditor(sel){
  if(!sel||sel.rangeCount===0) return false;
  const node=sel.getRangeAt(0).commonAncestorContainer;
  const host=node.nodeType===1?node:node.parentElement;
  return !!(host&&editorWrap.contains(host));
}
/* 贴在“看得见的那块屏幕”的右下角：iOS 弹键盘时布局视口不变，只能用 visualViewport 算 */
function placePill(){
  const vv=window.visualViewport;
  const h=pill.offsetHeight||150;
  if(!vv){ pill.style.top=''; pill.style.bottom='10px'; return; }
  pill.style.top=Math.max(0,Math.round(vv.offsetTop+vv.height-h-10))+'px';
  pill.style.bottom='auto';
}
function checkSelection(){
  const sel=window.getSelection();
  const dead=!sel||sel.isCollapsed||!rangeInEditor(sel);
  const text=dead?'':sel.toString().replace(/\s+/g,' ').trim();
  const bad=dead||!text||text.length>80||!/^[A-Za-z][A-Za-z'’\- ]*$/.test(text);
  if(bad){
    /* 选区被手指点收起时，别立刻把按钮抽走：留半秒，让那一下点击还落得到 */
    if(pillHeld()){ setTimeout(()=>{ if(!pillHeld()) checkSelection(); },950); return; }
    clearTimeout(pillHideTimer);
    pillHideTimer=setTimeout(()=>{ if(!pillHeld()) hidePill(); },520);
    return;
  }
  clearTimeout(pillHideTimer);
  ui.selectedRange=sel.getRangeAt(0).cloneRange();
  ui.empowerText=text;
  if(pillWord) pillWord.textContent=text.length>14?text.slice(0,14)+'…':text;
  pill.classList.add('show');
  placePill();
}
function hidePill(){ pill.classList.remove('show'); }

/* ============ 收起键盘 ============ */
const kbChip=$('#kbChip');
const btnKb=$('#btnKb');
const IS_TOUCH=(()=>{ try{ return matchMedia('(pointer:coarse)').matches||('ontouchstart' in window); }catch(_){ return 'ontouchstart' in window; } })();
function editableOf(el){
  if(!el||el===document.body) return null;
  if(el.isContentEditable) return el;
  if(/^(INPUT|TEXTAREA)$/.test(el.tagName)) return el;
  const ed=el.closest&&el.closest('[contenteditable="true"]');
  return ed||null;
}
/* 顶部收起键盘提示：笔记里用顶栏那个键，其它弹窗里用浮出的小按钮 */
function syncKbUI(){
  const ed=editableOf(document.activeElement);
  const inEditor=!!ed&&editorWrap.contains(ed);
  document.body.classList.toggle('typing',inEditor);
  const needChip=!!ed&&!inEditor&&IS_TOUCH;
  kbChip.classList.toggle('show',needChip);
  if(needChip){
    const vv=window.visualViewport;
    if(vv) kbChip.style.top=Math.round(vv.offsetTop+8)+'px';
    else kbChip.style.top='10px';
  }
}
function closeKeyboard(){
  syncKbUI();
  try{ const a=document.activeElement; if(a&&a.blur&&a!==document.body) a.blur(); }catch(_){}
  if(!pill.classList.contains('show')){
    try{ const s=window.getSelection(); if(s&&s.removeAllRanges) s.removeAllRanges(); }catch(_){}
  }
  setTimeout(()=>{ syncKbUI(); if(pill.classList.contains('show')) placePill(); },120);
}

/* ============ 词典页（欧路风格，数据由 AI 按欧路版式生成） ============ */
let dictState={word:'',seq:0,data:null};
const DICT_PROMPT=word=>'你是英汉词典编纂者。请为英文单词 "'+word+'" 提供一份完整词典词条。只输出一个 JSON 对象，不要输出其他文字，不要用代码块包裹。格式：{"uk":"英式音标，如 /wɪð\'drɔː/","us":"美式音标，如 /wɪð\'drɔː/","tags":["高考","四级","六级","考研","GRE","GMAT"等适用考试，最多4个，无法确定就省略该字段],"defs":[{"no":1,"pos":"vt. & vi.","cn":"取[收]回；中文释义（含词性）"},{"no":2,"pos":"","cn":"…"}],"forms":[{"label":"时态","items":["withdrew","withdrawn","withdrawing","withdraws"]},{"label":"形容词","items":["withdrawable"]},{"label":"名词","items":["withdrawer"]},{"label":"副词","items":[]}],"syno":{"syno":["近义词（纯英文）"],"antonym":["反义词（纯英文）"],"rel":["联想词 中文注释"]},"phrs":["词组 中文释义"],"examples":[{"en":"英文例句","cn":"中文翻译"}]}。要求：释义、时态变形、词组、联想词、例句都必须准确真实，与标准词典一致；forms 中 items 没有内容时给空数组；例句给 2-3 条。';
function aiLookupDict(word){
  return aiCall([{role:'system',content:'你是英汉词典编纂者。直接输出一个 JSON 对象本身：不要 markdown、不要 ```json 代码块、不要任何解释或前后缀文字。'},
    {role:'user',content:DICT_PROMPT(word)}]);
}
function openDict(word){
  dictState.word=String(word||'').trim();
  $('#dictPage').classList.add('show');
  $('#dictSearch').value=dictState.word;
  if(dictState.word) loadDict(dictState.word); else $('#dictSearch').focus();
}
function closeDict(){
  $('#dictPage').classList.remove('show');
  try{ const a=document.activeElement; if(a&&a.blur&&a!==document.body) a.blur(); }catch(_){}
  syncKbUI();
}
function loadDict(word){
  const w=String(word||'').trim();
  if(!w){ toast('请输入要查询的单词','warn'); return; }
  const mySeq=++dictState.seq;
  dictState.word=w;
  $('#dictLoading').classList.remove('hidden');
  $('#dictErr').classList.add('hidden');
  $('#dictContent').innerHTML='';
  dictState.data=null;
  aiLookupDict(w).then(d=>{
    if(mySeq!==dictState.seq) return;
    $('#dictLoading').classList.add('hidden');
    dictState.data=d;
    renderDict(d,w);
  }).catch(err=>{
    if(mySeq!==dictState.seq) return;
    $('#dictLoading').classList.add('hidden');
    $('#dictErr').classList.remove('hidden');
    $('#dictErr').textContent=state.settings.apiKey
      ?(String(err&&err.message||'查询失败，请重试')+'（请检查 API Key 是否有效、模型名是否正确、账户余额是否充足）')
      :'词典内容由 AI 生成：请先在设置中填写 API Key';
  });
}
function renderDict(d,word){
  const escv=esc;
  const tags=(d.tags||[]).filter(Boolean).slice(0,6);
  const defs=(d.defs||[]).filter(x=>x&&x.cn);
  const forms=(d.forms||[]).filter(f=>f&&f.label&&(f.items||[]).length);
  const syno=d.syno||{};
  const relArr=(syno.rel||[]).filter(Boolean);
  const phrs=(d.phrs||[]).filter(Boolean);
  const exs=(d.examples||[]).filter(x=>x&&x.en).slice(0,3);
  let h='';
  h+='<div class="dict-word">'+escv(word)+'</div>';
  h+='<div class="dict-phon">'+(d.uk?'<span>英 '+escv(d.uk)+'</span>':'')+(d.us?'<span>美 '+escv(d.us)+'</span>':'')+'</div>';
  h+='<div class="dict-btns">';
  h+='<button class="dict-btn" id="dictSpeakWord"><svg class="icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5 6 9H2v6h4l5 4V5z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18.5 5.5a9 9 0 0 1 0 13"/></svg>发音</button>';
  h+='<button class="dict-btn" id="dictFollow"><svg class="icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 5v14l8-7z"/><path d="M12 5v14l8-7z"/></svg>跟读</button>';
  h+='</div>';
  if(tags.length) h+='<div class="dict-tags">'+tags.map(t=>'<span class="dict-tag">'+escv(t)+'</span>').join('')+'</div>';
  h+='<div class="dict-sec"><div class="dict-sec-title">英汉-汉英词典</div>';
  if(defs.length){
    h+=defs.map(d2=>'<div class="dict-def"><span class="dict-def-no">'+(d2.no!=null?d2.no:'')+'</span><span>'+(d2.pos?'<span class="dict-def-pos">'+escv(d2.pos)+'</span>':'')+escv(d2.cn)+'</span></div>').join('');
  }else h+='<div class="dict-def"><span class="dict-def-no">—</span><span>暂无释义</span></div>';
  h+=forms.map(f=>'<div class="dict-forms"><span class="dict-forms-label">'+escv(f.label)+'：</span>'+f.items.map(i=>'<span class="dict-forms-item">'+escv(i)+'</span>').join('')+'</div>').join('');
  h+='</div>';
  if((syno.syno||[]).length||(syno.antonym||[]).length||relArr.length){
    h+='<div class="dict-sec"><div class="dict-sec-title">近义、反义、联想词</div>';
    if((syno.syno||[]).length) h+='<div class="dict-syno-block"><div class="dict-syno-h">近义词</div><div class="dict-syno-body">'+escv((syno.syno||[]).join('，'))+'</div></div>';
    if((syno.antonym||[]).length) h+='<div class="dict-syno-block"><div class="dict-syno-h">反义词</div><div class="dict-syno-body">'+escv((syno.antonym||[]).join('，'))+'</div></div>';
    if(relArr.length) h+='<div class="dict-syno-block"><div class="dict-syno-h">联想词</div><div class="dict-syno-body">'+escv(relArr.join('；'))+'</div></div>';
    h+='</div>';
  }
  if(phrs.length){
    h+='<div class="dict-sec"><div class="dict-sec-title">词组 | 习惯用语</div>';
    h+=phrs.map((p,i)=>'<div class="dict-phr"><span class="dict-phr-en">'+escv(p)+'</span><button class="speak-btn" data-dictphr="'+i+'" aria-label="朗读词组"><svg class="icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5 6 9H2v6h4l5 4V5z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18.5 5.5a9 9 0 0 1 0 13"/></svg></button></div>').join('');
    h+='</div>';
  }
  if(exs.length){
    h+='<div class="dict-sec"><div class="dict-sec-title">双语例句</div>';
    h+=exs.map((x,i)=>'<div class="dict-ex-row">'+
      '<div class="dict-ex-en2"><span class="dict-ex-num">'+(i+1)+'.</span><span>'+highlightTerm(x.en,word)+'</span></div>'+
      '<div class="dict-ex-cn2">'+escv(x.cn||'')+'</div>'+
      '<div class="dict-ex-act">'+
        '<button class="ex-act-btn" data-dictex="'+i+'" aria-label="发音"><svg class="icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5 6 9H2v6h4l5 4V5z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18.5 5.5a9 9 0 0 1 0 13"/></svg>发音</button>'+
        '<button class="ex-act-btn" data-dictfollow="'+i+'" aria-label="跟读"><svg class="icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 5v14l8-7z"/><path d="M12 5v14l8-7z"/></svg>跟读</button>'+
      '</div>'+
    '</div>').join('');
    h+='</div>';
  }
  $('#dictContent').innerHTML=h;
  const sw=$('#dictSpeakWord');
  if(sw) sw.addEventListener('click',()=>speakWord(dictState.word));
  const fl=$('#dictFollow');
  if(fl) fl.addEventListener('click',()=>speak(dictState.word,'en-US'));
  $$('#dictContent [data-dictphr]').forEach(b=>b.addEventListener('click',()=>speak(phrs[+b.dataset.dictphr],'en-US')));
  $$('#dictContent [data-dictex]').forEach(b=>b.addEventListener('click',()=>speak(exs[+b.dataset.dictex].en,'en-US')));
  $$('#dictContent [data-dictfollow]').forEach(b=>b.addEventListener('click',()=>{
    const x=exs[+b.dataset.dictfollow]||{};
    openFollow(x.en,dictState.word,x.cn||'');
  }));
}
/* 例句中高亮目标词（含常见变形） */
function highlightTerm(s,word){
  const t=esc(String(s||''));
  const w=String(word||'').trim();
  if(!w) return t;
  const q=w.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  try{ return t.replace(new RegExp('\\b('+q+')(?:[a-z]{0,4})?\\b','gi'),'<span class="hl">$&</span>'); }catch(_){ return t; }
}
/* 例句里每个英文词都包成可点的 span：点一下就能查这个词 */
/* ============ 例句里的「标亮」：荧光笔，只作用于点的那一句（独立存储，不动词库） ============
   记录结构：[{w:词条, e:例句序号, s:这句原文, f:起始词序号, t:结束词序号, k:文字, at:时间}]
   带 s 是为了「换一批例句」后旧标亮不会跑到新句子上；同一句重开仍然亮。 */
const QM_KEY='english-notes-qmarks-v2';
const QM_MAX=500;
let qmCache=null, qmRaw=null;
function qmNorm(s){ return String(s||'').replace(/\s+/g,' ').trim().toLowerCase(); }
function qmAll(){
  try{
    const raw=localStorage.getItem(QM_KEY)||'[]';
    if(qmCache&&raw===qmRaw) return qmCache;   /* 存储被外部改过就重新读，避免脏缓存 */
    const o=JSON.parse(raw);
    qmCache=Array.isArray(o)?o:[];
    qmRaw=raw;
  }catch(_){ qmCache=qmCache||[]; }
  return qmCache;
}
function qmFlush(){
  const all=qmAll();
  if(all.length>QM_MAX){
    /* 同一毫秒写入的 at 相同，按数组顺序兜底：后写入的算更新 */
    const drop=all.slice().sort((a,b)=>((b.at||0)-(a.at||0))).slice(QM_MAX);
    drop.forEach(r=>{ const i=all.indexOf(r); if(i>=0) all.splice(i,1); });
  }
  try{ const str=JSON.stringify(all); localStorage.setItem(QM_KEY,str); qmRaw=str; }catch(_){ }
}
function qmExKey(w,exi,snap){ return qmNorm(w)+'\u0001'+Number(exi)+'\u0001'+String(snap||''); }
let qmIdx={raw:null,map:null};
function qmIndex(){
  const all=qmAll();
  if(qmIdx.raw===qmRaw&&qmIdx.map) return qmIdx.map;
  const m=new Map();
  all.forEach(r=>{
    if(!r||typeof r!=='object') return;
    const k=qmExKey(r.w,r.e,r.s);
    const arr=m.get(k);
    if(arr) arr.push(r); else m.set(k,[r]);
  });
  qmIdx={raw:qmRaw,map:m};
  return m;
}
/* 这一句上已有的标记：长段优先，免得短段抢走长段的黄底 */
function qmMarks(wkey,exi,snap){
  if(typeof exi!=='number'||isNaN(exi)||!wkey) return [];
  const arr=qmIndex().get(qmExKey(wkey,exi,qmNorm(snap)));
  if(!arr||!arr.length) return [];
  return arr.slice().sort((a,b)=>((b.t-b.f)-(a.t-a.f))||(a.f-b.f));
}
/* 这个词在这句里是不是亮的 */
function qmHasAt(wkey,exi,snap,wi){
  return qmMarks(wkey,exi,snap).some(m=>wi>=m.f&&wi<=m.t);
}
function qmCount(){ return qmAll().length; }
/* 这一段是不是已经标亮了（范围要完全一样） */
function qmHasRange(wkey,exi,snap,f,t){
  return qmMarks(wkey,exi,snap).some(m=>m.f===f&&m.t===t);
}
/* 标亮 / 取消这一句里的这几个词 */
function qmToggleAt(wkey,exi,snap,f,t,label){
  const w=qmNorm(wkey), s=qmNorm(snap);
  if(!w||!s||typeof exi!=='number'||isNaN(exi)) return false;
  f=Math.max(0,Math.min(f,t)); t=Math.max(f,t);
  const all=qmAll(), key=qmExKey(w,exi,s);
  const hit=all.findIndex(r=>r&&qmExKey(r.w,r.e,r.s)===key&&r.f===f&&r.t===t);
  if(hit>=0){ all.splice(hit,1); qmFlush(); return false; }
  /* 同一处被别的范围盖住：先拆掉重叠的，免得两层黄底叠在一起 */
  for(let i=all.length-1;i>=0;i--){
    const r=all[i];
    if(!r||qmExKey(r.w,r.e,r.s)!==key) continue;
    if(!(r.t<f||r.f>t)) all.splice(i,1);
  }
  all.push({w:w,e:Number(exi),s:s,f:f,t:t,k:String(label||'').trim(),at:Date.now()});
  qmFlush(); return true;
}
/* ============ 老标亮搬迁：以前是「标了词，哪个句子都亮」，现在改成只亮当时那一处 ============
   老记录里只有词、没有句子，只能就着词库把它落回第一处出现的地方（每词最多留一处）。 */
const QM_LEGACY='english-notes-qmarks-v1';
const QM_LEGACY_DONE='english-notes-qmarks-v1-done';
function qmToks(s){ return (String(s||'').match(/[A-Za-z][A-Za-z'’\-]*/g)||[]).map(x=>x.toLowerCase()); }
/* 逐词精确匹配（老记录里的短语就是原句里的词） */
function qmFindRun(toks,run){
  for(let i=0;i+run.length<=toks.length;i++){
    let ok=true;
    for(let j=0;j<run.length;j++){ if(toks[i+j]!==run[j]){ ok=false; break; } }
    if(ok) return {f:i,t:i+run.length-1};
  }
  return null;
}
/* 单个词：允许词形变化（pitch → pitched / pitches） */
function qmFindLoose(toks,key){
  for(let i=0;i<toks.length;i++){
    if(toks[i]===key||toks[i].indexOf(key)===0) return {f:i,t:i};
  }
  return null;
}
function qmMigrateLegacy(){
  try{
    if(localStorage.getItem(QM_LEGACY_DONE)==='1') return 0;
    const words=(typeof state!=='undefined'&&state&&state.words)||null;
    if(!Array.isArray(words)) return 0;      /* 数据还没就绪：下次启动再来，别标 done */
    const raw=localStorage.getItem(QM_LEGACY);
    localStorage.setItem(QM_LEGACY_DONE,'1');
    if(!raw) return 0;
    let obj=null;
    try{ obj=JSON.parse(raw); }catch(_){ }
    if(!obj||typeof obj!=='object'||Array.isArray(obj)) return 0;
    const keys=Object.keys(obj);
    if(!keys.length) return 0;
    const all=qmAll();
    let moved=0;
    keys.forEach(k0=>{
      const key=qmNorm(k0);
      if(!key) return;
      const run=key.split(/\s+/).filter(Boolean);
      if(!run.length) return;
      /* ① 优先落回「这个短语/单词所属词条」的例句（当时多半就是点这里的） */
      let hit=null;
      for(let i=0;i<words.length&&!hit;i++){
        const w=words[i], term=String(w.term||'').trim();
        if(!term) continue;
        const q=term.toLowerCase();
        if(!run.some(t=>t===q||t.indexOf(q)===0)) continue;
        const exs=(w.examples||[]);
        for(let e=0;e<exs.length&&!hit;e++){
          const en=String((exs[e]&&exs[e].en)||'');
          const toks=qmToks(en);
          const r=run.length>1?qmFindRun(toks,run):qmFindLoose(toks,key);
          if(r) hit={w:term,e:e,s:en,f:r.f,t:r.t};
        }
      }
      /* ② 词库里查不到的词（当年在例句里随手标的）：全库找第一处，只标这一处 */
      if(!hit){
        for(let i=0;i<words.length&&!hit;i++){
          const w=words[i], term=String(w.term||'').trim();
          if(!term) continue;
          const exs=(w.examples||[]);
          for(let e=0;e<exs.length&&!hit;e++){
            const en=String((exs[e]&&exs[e].en)||'');
            const toks=qmToks(en);
            const r=run.length>1?qmFindRun(toks,run):qmFindLoose(toks,key);
            if(r) hit={w:term,e:e,s:en,f:r.f,t:r.t};
          }
        }
      }
      if(!hit) return;
      const kk=qmExKey(hit.w,hit.e,qmNorm(hit.s));
      if(all.some(r=>r&&qmExKey(r.w,r.e,r.s)===kk&&r.f===hit.f&&r.t===hit.t)) return;
      all.push({w:qmNorm(hit.w),e:hit.e,s:qmNorm(hit.s),f:hit.f,t:hit.t,
        k:String((obj[k0]&&obj[k0].term)||k0).trim(),at:(obj[k0]&&obj[k0].at)||Date.now()});
      moved++;
    });
    if(moved) qmFlush();
    /* 老数据挪到备份 key：留着不丢，但不再参与渲染 */
    try{ localStorage.setItem(QM_LEGACY+'-archive',raw); localStorage.removeItem(QM_LEGACY); }catch(_){ }
    return moved;
  }catch(_){ return 0; }
}
/* 单个可点的词。data-i 是它在句中的序号，短语扩展靠它定位 */
function spanWord(txt,wi,extra){
  return '<span class="qw'+(extra?' '+extra:'')+'" data-q="'+esc(String(txt).toLowerCase())+'" data-i="'+wi+'">'+esc(txt)+'</span>';
}
/* wkey = 哪个词条的例句，exi = 第几句：标亮只认这一句，别的句子不跟着亮 */
function qwHTML(s,term,wkey,exi){
  const q=String(term||'').trim().toLowerCase();
  const parts=String(s||'').split(/([A-Za-z][A-Za-z'’\-]*)/);
  const lows=[];
  for(let i=1;i<parts.length;i+=2) lows.push(parts[i].toLowerCase());
  const n=lows.length;
  /* 这一句上的标亮范围 → 每个词属于第几段（同一段的词连成一条黄底） */
  const inMark=new Array(n).fill(-1);
  qmMarks(wkey,exi,s).forEach((m,mi)=>{
    for(let i=Math.max(0,m.f);i<=Math.min(n-1,m.t);i++){ if(inMark[i]<0) inMark[i]=mi; }
  });
  let html='';
  for(let i=0,w=0;i<parts.length;){
    if(i%2===0){ html+=esc(parts[i]); i++; continue; }
    const mi=inMark[w];
    if(mi>=0){                          /* 整段标亮：外层包一个，底色才不会断开 */
      let len=1;
      while(w+len<n&&inMark[w+len]===mi) len++;
      if(len>1){
        let inner='';
        for(let k=0;k<len;k++){
          const pi=2*(w+k)+1;
          inner+=spanWord(parts[pi],w+k,'');
          if(k<len-1) inner+=esc(parts[pi+1]);
        }
        html+='<span class="qm qmp">'+inner+'</span>';
        i=2*(w+len-1)+2; w+=len;
        continue;
      }
    }
    const low=lows[w];
    const isTerm=!!q&&(low===q||low.indexOf(q)===0);
    html+=spanWord(parts[i],w,((isTerm?'hl ':'')+(mi>=0?'qm':'')).trim());
    i++; w++;
  }
  return html;
}
/* 取一句里的所有词节点（文档顺序 = 词序） */
function exWordEls(exi){
  const row=document.querySelector('.ex-en-text[data-excn="'+exi+'"]');
  if(!row) return [];
  return Array.prototype.slice.call(row.querySelectorAll('.qw'));
}
function exPhraseText(exi,from,to){
  const els=exWordEls(exi);
  if(!els.length) return '';
  const a=Math.max(0,Math.min(from,els.length-1));
  const b=Math.max(a,Math.min(to,els.length-1));
  return els.slice(a,b+1).map(e=>e.textContent).join(' ');
}
/* 这个词落在这一句的哪个已标亮段里（长段优先），用来"点黄底就选中整段" */
function qmRunAt(wkey,exi,snap,wi){
  const ms=qmMarks(wkey,exi,snap);
  for(let i=0;i<ms.length;i++){
    if(wi>=ms[i].f&&wi<=ms[i].t) return {from:ms[i].f,to:ms[i].t};
  }
  return null;
}
/* 只换这一句的 HTML，不动别处，也不重绘整页 */
function repaintEx(exi){
  const x=((wmState&&wmState.examples)||[])[exi];
  const row=document.querySelector('.ex-en-text[data-excn="'+exi+'"] .t');
  if(!row||!x) return false;
  const term=(wmState&&wmState.term)||'';
  row.innerHTML=qwHTML(x.en,term,term,exi);
  return true;
}

/* ============ 例句里点单词：快查（本地秒出 → 免费词典 → AI 中文） ============ */
const QD_KEY='english-notes-qdict-v1';
function qdCacheAll(){ try{ return JSON.parse(localStorage.getItem(QD_KEY)||'{}')||{}; }catch(_){ return {}; } }
function qdCacheGet(w){ try{ return qdCacheAll()[w]||null; }catch(_){ return null; } }
function qdCachePut(w,v){
  try{
    const c=qdCacheAll(); c[w]=Object.assign({},c[w]||{},v||{});
    const ks=Object.keys(c);
    if(ks.length>300) ks.slice(0,ks.length-300).forEach(k=>{ delete c[k]; });
    localStorage.setItem(QD_KEY,JSON.stringify(c));
  }catch(_){}
}
function quickAI(word){
  return aiCall([
    {role:'system',content:'你是简明英汉词典。直接输出一个 JSON 对象本身：不要 markdown、不要代码块、不要任何解释。'},
    {role:'user',content:'为英文单词 "'+word+'" 输出 {"phon":"国际音标","cn":"中文释义（含词性，最多两条，用；分隔）"}。准确、简短。'}
  ],{maxTokens:160});
}
const qdState={word:'',show:'',seq:0,data:null,sel:null};
let phSeq=0, phTimer=0;
/* 当前要标亮的位置：哪一句、哪几个词。只在这一句生效 */
function qdMarkCtx(){
  const s=qdState.sel;
  if(!s||typeof s.exi!=='number'||isNaN(s.exi)) return null;
  const x=((wmState&&wmState.examples)||[])[s.exi];
  if(!x||!String(x.en||'').trim()) return null;
  const term=(wmState&&wmState.term)||'';
  if(!term) return null;
  const txt=exPhraseText(s.exi,s.from,s.to);
  return {wkey:term,exi:s.exi,snap:x.en,from:s.from,to:s.to,
    label:txt||String(x.en),phrase:s.to>s.from};
}
function qdSelClear(){ document.querySelectorAll('.qw.sel').forEach(e=>e.classList.remove('sel')); }
function qdSelPaint(){
  const s=qdState.sel;
  qdSelClear();
  if(!s) return;
  exWordEls(s.exi).forEach((e,i)=>{ if(i>=s.from&&i<=s.to) e.classList.add('sel'); });
}
function syncQdPhraseBar(){
  const bar=$('#qdPhrase');
  if(!bar) return;
  const s=qdState.sel;
  bar.hidden=!s;
  if(!s) return;
  const txt=$('#qdPhraseTxt');
  if(txt) txt.textContent=exPhraseText(s.exi,s.from,s.to);
  const back=$('#qdPhBack');
  if(back) back.disabled=s.to<=s.from;
  const next=$('#qdPhNext');
  const els=exWordEls(s.exi);
  if(next) next.disabled=els.length>0&&s.to>=els.length-1;
}
function syncQdMark(){
  const b=$('#qdMark'); if(!b) return;
  const c=qdMarkCtx();
  const on=!!(c&&qmHasRange(c.wkey,c.exi,c.snap,c.from,c.to));
  b.classList.toggle('on',on);
  b.setAttribute('aria-pressed',on?'true':'false');
  b.disabled=!c;   /* 没选中例句里的词就没法标亮 */
  const t=$('#qdMarkTxt');
  if(t) t.textContent=on?'已标亮':(c&&c.phrase?'标亮整段':'标亮');
}
/* 短语的意思：改动后 300ms 才发，连点中间不发，结果进快查缓存 */
function phraseAI(p){
  return aiCall([
    {role:'system',content:'你是简明英汉词典。直接输出一个 JSON 对象本身：不要 markdown、不要代码块、不要任何解释。'},
    {role:'user',content:'英文短语 "'+p+'" 在这句话里的中文意思，输出 {"cn":"简短中文（不超过 24 字，可带词性）"}。'}
  ],{maxTokens:110});
}
function askPhraseMeaning(p){
  const key=String(p||'').trim().toLowerCase();
  if(!key||key.indexOf(' ')<0) return;
  const my=++phSeq;
  const cached=qdCacheGet(key);
  if(cached&&cached.pcn){ qdState.data.pcn=cached.pcn; qdState.data.pcnLoading=false; renderQuickDict(); return; }
  if(aRoute()!=='api'||!aAiReady()){ qdState.data.pcn=''; qdState.data.pcnLoading=false; return; }
  qdState.data.pcn=''; qdState.data.pcnLoading=true;
  renderQuickDict();
  clearTimeout(phTimer);
  phTimer=setTimeout(()=>{
    phraseAI(p).then(r=>{
      if(my!==phSeq) return;
      const cn=String((r&&r.cn)||'').trim();
      qdState.data.pcnLoading=false;
      if(cn){ qdState.data.pcn=cn; qdCachePut(key,{pcn:cn}); }
      renderQuickDict();
    }).catch(()=>{
      if(my!==phSeq) return;
      qdState.data.pcnLoading=false; renderQuickDict();
    });
  },300);
}
/* 卡片从底下弹出来会挡住例句：把选中的那段滚到卡片上方，边扩边看得见 */
function qdKeepVisible(){
  const s=qdState.sel;
  if(!s) return;
  const sheet=$('#qdSheet');
  const card=document.querySelector('#wordModal .modal-card');
  if(!sheet||!card||!sheet.classList.contains('show')) return;
  const els=exWordEls(s.exi);
  if(!els.length) return;
  const first=els[Math.max(0,Math.min(s.from,els.length-1))];
  const last=els[Math.max(0,Math.min(s.to,els.length-1))];
  if(!first||!last) return;
  const sheetTop=sheet.getBoundingClientRect().top;
  const cardTop=card.getBoundingClientRect().top;
  const pad=16;
  const fr=first.getBoundingClientRect(), lr=last.getBoundingClientRect();
  if(lr.bottom>sheetTop-pad) card.scrollTop+=(lr.bottom-(sheetTop-pad));
  else if(fr.top<cardTop+pad) card.scrollTop-=(cardTop+pad-fr.top);
  /* 整张例句卡装得下就整张露出来，别只露半句 */
  const box=first.closest('.ex-card');
  if(box){
    const br=box.getBoundingClientRect();
    const avail=sheetTop-cardTop-2*pad;
    if(br.height<=avail){
      if(br.bottom>sheetTop-pad) card.scrollTop+=(br.bottom-(sheetTop-pad));
      else if(br.top<cardTop+pad) card.scrollTop-=(cardTop+pad-br.top);
    }
  }
}
/* 往后多吃一个词 / 退回一个词 */
function qdExtend(delta){
  const s=qdState.sel;
  if(!s) return;
  const els=exWordEls(s.exi);
  if(!els.length) return;
  const to=Math.max(s.from,Math.min(els.length-1,s.to+delta));
  if(to===s.to){ if(delta>0) toast('这句到头了','warn'); return; }
  s.to=to;
  qdSelPaint(); syncQdPhraseBar(); qdKeepVisible();
  const phrase=exPhraseText(s.exi,s.from,s.to);
  $('#qdWord').textContent=phrase||qdState.show;
  syncQdMark();
  if(s.to>s.from){
    try{ if(navigator.vibrate) navigator.vibrate(8); }catch(_){ }
    askPhraseMeaning(phrase);
  }else{
    phSeq++; qdState.data.pcn=''; qdState.data.pcnLoading=false; renderQuickDict();
  }
}
function openQuickDict(raw,ctx){
  const word=String(raw||'').replace(/[^A-Za-z'’\-]/g,'').trim();
  if(!word) return;
  const key=word.toLowerCase(), mySeq=++qdState.seq;
  qdState.word=key; qdState.show=word; qdState.data={cn:'',phon:'',en:[],mine:'',done:false};
  qdState.sel=(ctx&&typeof ctx.wi==='number'&&!isNaN(ctx.wi))?{exi:ctx.exi,from:ctx.wi,to:ctx.wi}:null;
  /* 点到已经标亮的整段里：直接把整段选回来，按钮才会显示「已标亮」 */
  if(qdState.sel){
    const ex=((wmState&&wmState.examples)||[])[ctx.exi];
    const run=(ex&&ex.en)?qmRunAt((wmState&&wmState.term)||'',ctx.exi,ex.en,ctx.wi):null;
    if(run){ qdState.sel.from=run.from; qdState.sel.to=run.to; }
  }
  phSeq++;
  const selTxt=(qdState.sel&&qdState.sel.to>qdState.sel.from)?exPhraseText(qdState.sel.exi,qdState.sel.from,qdState.sel.to):'';
  $('#qdWord').textContent=selTxt||word;
  $('#qdPhon').textContent='';
  try{ qdSelPaint(); syncQdMark(); syncQdPhraseBar(); }catch(_){ }
  $('#qdBody').innerHTML='<div class="qd-loading">查词中…</div>';
  $('#qdSheet').classList.add('show');
  $('#qdMask').classList.add('show');
  if(selTxt) askPhraseMeaning(selTxt);
  /* 卡片是滑上来的，等动画走完再滚，位置才算得准 */
  try{ qdKeepVisible(); setTimeout(()=>{ try{ qdKeepVisible(); }catch(_){ } },300); }catch(_){ }
  const paint=patch=>{
    if(mySeq!==qdState.seq) return;
    Object.keys(patch||{}).forEach(k=>{
      const v=patch[k];
      if(v===''||v==null) return;
      if(Array.isArray(v)&&!v.length) return;
      qdState.data[k]=v;
    });
    renderQuickDict();
  };
  const hasCn=()=>!!(qdState.data.cn||qdState.data.mine);
  const hasEn=()=>(qdState.data.en||[]).length>0;
  /* ① 自己的表达库 + 本地缓存：0 延迟 */
  const mine=(state.words||[]).find(x=>String(x.term||'').toLowerCase()===key);
  if(mine&&mine.definition) paint({mine:mine.definition,phon:mine.phonetic||''});
  const cached=qdCacheGet(key);
  if(cached) paint(cached);
  /* ② 免费词典（英文释义，通常 0.3 秒内回来） */
  if(!hasEn()){
    askDict(word).then(r=>{
      if(mySeq!==qdState.seq) return;
      const en=String(r.definition||'').split('\n').map(s=>s.trim()).filter(Boolean).slice(0,3);
      paint({en,phon:r.phonetic||''});
      qdCachePut(key,{en,phon:r.phonetic||''});
    }).catch(()=>{ if(mySeq===qdState.seq) paint({done:true}); });
  }
  /* ③ AI 中文释义：有 key 才发，回来就补上去（结果缓存，下次秒出） */
  if(!hasCn()&&aRoute()==='api'&&aAiReady()){
    quickAI(word).then(r=>{
      if(mySeq!==qdState.seq) return;
      paint({cn:String((r&&r.cn)||'').trim(),phon:String((r&&r.phon)||'').trim()});
      qdCachePut(key,{cn:String((r&&r.cn)||'').trim(),phon:String((r&&r.phon)||'').trim()});
    }).catch(()=>{ if(mySeq===qdState.seq) paint({done:true}); });
  }
}
function renderQuickDict(){
  const d=qdState.data||{};
  const body=$('#qdBody');
  if(!body) return;
  const phonEl=$('#qdPhon');
  if(phonEl&&d.phon&&!phonEl.textContent) phonEl.textContent=d.phon;
  let h='';
  /* 选中一段时，最上面先说这一整段的意思 */
  if(d.pcn) h+='<div class="qd-sec"><div class="qd-h">整段释义</div><div class="qd-cn">'+esc(d.pcn)+'</div></div>';
  else if(d.pcnLoading) h+='<div class="qd-sec"><div class="qd-h">整段释义</div><div class="qd-loading">想一下这个搭配…</div></div>';
  const pre=d.pcn||d.pcnLoading?'首词释义 · ':'';
  if(d.mine) h+='<div class="qd-sec"><div class="qd-h">'+pre+'我的释义</div><div class="qd-cn">'+esc(d.mine)+'</div></div>';
  if(d.cn&&d.cn!==d.mine) h+='<div class="qd-sec"><div class="qd-h">'+pre+(d.mine?'补充释义':'中文释义')+'</div><div class="qd-cn">'+esc(d.cn)+'</div></div>';
  if((d.en||[]).length) h+='<div class="qd-sec"><div class="qd-h">'+(pre?'首词英文释义':'英文释义')+'</div><div class="qd-en">'+d.en.map(x=>'<div>'+esc(x)+'</div>').join('')+'</div></div>';
  if(!h){
    h=state.settings.apiKey
      ?'<div class="qd-loading">查词中…</div>'
      :'<div class="qd-loading">没有本地释义，也没配 AI。点下方「完整词典」看详细解释，或直接在设置里填 API Key。</div>';
  }
  body.innerHTML=h;
}
function closeQuickDict(){
  $('#qdSheet').classList.remove('show');
  $('#qdMask').classList.remove('show');
  qdState.seq++;
  phSeq++;
  qdState.sel=null;
  try{ qdSelClear(); syncQdPhraseBar(); }catch(_){ }
}

/* ============ 例句跟读页 ============ */
let followState={text:'',term:'',cn:'',blob:null,url:null,rec:null,chunks:[],tracks:[],recording:false,ac:null,an:null,raf:0,
  startAt:0,dur:0,mime:'',asr:null,heard:'',asrErr:'',asrDone:false,scoring:false,best:0,score:null};
const WAVE_BARS=36;
/* 按浏览器真实支持情况挑录音容器，不再写死 audio/webm（Safari 只能出 mp4，写死会放不出来） */
const REC_MIMES=['audio/webm;codecs=opus','audio/webm','audio/mp4;codecs=mp4a.40.2','audio/mp4','audio/ogg;codecs=opus','audio/ogg'];
function recMime(){
  if(!window.MediaRecorder||!MediaRecorder.isTypeSupported) return '';
  for(let i=0;i<REC_MIMES.length;i++){ try{ if(MediaRecorder.isTypeSupported(REC_MIMES[i])) return REC_MIMES[i]; }catch(_){} }
  return '';
}
function initWave(){
  const box=$('#followWave');
  if(!box) return;
  box.classList.remove('on');
  box.innerHTML=Array.from({length:WAVE_BARS},(_,i)=>{
    const h=8+Math.round(6*Math.abs(Math.sin(i*0.55)));
    return '<i style="height:'+h+'px"></i>';
  }).join('');
}
function stopWave(){
  if(followState.raf) cancelAnimationFrame(followState.raf);
  followState.raf=0;
  $('#followWave').classList.remove('on');
  $$('#followWave i').forEach(b=>{ b.style.height='6px'; });
  try{ if(followState.ac&&followState.ac.state!=='closed') followState.ac.close(); }catch(_){}
  followState.ac=null; followState.an=null;
}
function startWave(stream){
  const AC=window.AudioContext||window.webkitAudioContext;
  if(!AC) return;
  try{
    const ac=new AC();
    const src=ac.createMediaStreamSource(stream);
    const an=ac.createAnalyser(); an.fftSize=512; an.smoothingTimeConstant=.7;
    src.connect(an);
    followState.ac=ac; followState.an=an;
    $('#followWave').classList.add('on');
    const bars=$$('#followWave i');
    const data=new Uint8Array(an.frequencyBinCount);
    const tick=()=>{
      if(!followState.recording||!followState.an) return;
      an.getByteTimeDomainData(data);
      let sum=0;
      for(let i=0;i<data.length;i++){ const v=(data[i]-128)/128; sum+=v*v; }
      const rms=Math.sqrt(sum/data.length);
      bars.forEach((b,i)=>{
        const wob=0.55+0.45*Math.abs(Math.sin(i*0.55+Date.now()/140));
        const h=6+Math.min(30,rms*260*wob);
        b.style.height=h.toFixed(1)+'px';
      });
      followState.raf=requestAnimationFrame(tick);
    };
    tick();
  }catch(_){}
}
function openFollow(text,term,cn){
  stopFollowAudio();
  if(followState.url){ URL.revokeObjectURL(followState.url); }
  followState={text:String(text||''),term:String(term||''),cn:String(cn||''),blob:null,url:null,rec:null,chunks:[],tracks:[],
    recording:false,ac:null,an:null,raf:0,startAt:0,dur:0,mime:'',asr:null,heard:'',asrErr:'',asrDone:false,scoring:false,best:0,score:null};
  try{
    const w=(state.words||[]).find(x=>String(x.term||'').toLowerCase()===followState.term.toLowerCase());
    followState.best=(w&&w.followBest)||0;
  }catch(_){}
  $('#followSentence').innerHTML=highlightTerm(followState.text,followState.term);
  const isWordFollow=!!followState.text&&followState.text.trim().toLowerCase()===followState.term.trim().toLowerCase();
  const ft=$('#followTitle');
  if(ft) ft.textContent=isWordFollow?'单词跟读':'例句跟读';
  const cnEl=$('#followCn');
  if(followState.cn){
    cnEl.innerHTML='<span class="cn-real">'+esc(followState.cn)+'</span><span class="cn-tip">点这一行看中文</span>';
    cnEl.classList.add('hided'); cnEl.classList.remove('hidden');
  }else{
    cnEl.innerHTML=''; cnEl.classList.add('hidden');
  }
  $('#followSentence').onclick=()=>{ if(followState.cn) cnEl.classList.toggle('hided'); };
  cnEl.onclick=e=>{ e.stopPropagation(); if(followState.cn) cnEl.classList.toggle('hided'); };
  $('#followOut').classList.remove('hasrec');
  const b=$('#followBest');
  if(b){ b.textContent=followState.best?'最佳 '+followState.best+' 分':''; b.classList.toggle('hidden',!followState.best); }
  const sc=$('#followScore'); if(sc){ sc.innerHTML=''; sc.classList.remove('show'); }
  initWave();
  $('#followPage').classList.add('show');
  setFollowStatus(followUsesRecognition()?'点麦克风开始跟读，读完自动评分':'点麦克风开始跟读，录完可回听并查看节奏和音量');
}
function closeFollow(){
  try{ if(followState.rec&&followState.rec.state!=='inactive') followState.rec.stop(); }catch(_){}
  followState.tracks.forEach(t=>{ try{ t.stop(); }catch(_){} });
  followState.tracks=[];
  followState.recording=false;
  try{ if(followState.asr){ followState.asr.onend=null; followState.asr.onerror=null; followState.asr.abort(); } }catch(_){}
  followState.asr=null;
  stopWave();
  stopFollowAudio();
  if(followState.url){ URL.revokeObjectURL(followState.url); followState.url=null; }
  $('#followMic').classList.remove('recording');
  $('#followPage').classList.remove('show');
}
function setFollowStatus(s){ const el=$('#followStatus'); if(el) el.textContent=s; }
/* 朗读并确保「读完」一定会回调：系统 TTS 偶尔不触发 onend，会卡住 A/B 对比 */
function speakSafe(text,lang,cb){
  let done=false,poll=0,guard=0;
  const fin=()=>{
    if(done) return; done=true;
    clearTimeout(guard); if(poll) clearInterval(poll);
    cb&&cb();
  };
  const n=String(text||'').trim().split(/\s+/).filter(Boolean).length;
  guard=setTimeout(fin,Math.max(1800,Math.round(n*380)+900));
  /* 设备没有任何 TTS 音色时不会触发 onend，1.6 秒后直接往下走，不让「对比」卡住 */
  poll=setInterval(()=>{
    if(done){ clearInterval(poll); return; }
    try{
      if(!('speechSynthesis' in window)){ fin(); return; }
      const voices=speechSynthesis.getVoices();
      if((!voices||!voices.length)&&!speechSynthesis.speaking&&!speechSynthesis.pending) fin();
    }catch(_){ fin(); }
  },400);
  try{ speak(text,lang,fin); }catch(_){ fin(); }
}
function playFollow(){ speakSafe(followState.text,'en-US'); }
/* 播放录音：复用同一个 <audio>（每次 new Audio 会被回收，且 MIME 写死会放不出来） */
function followAudioEl(){
  let a=document.getElementById('followAudio');
  if(!a){
    a=document.createElement('audio');
    a.id='followAudio'; a.preload='auto';
    a.setAttribute('playsinline','');
    a.style.display='none';
    document.body.appendChild(a);
  }
  return a;
}
function stopFollowAudio(){
  const a=document.getElementById('followAudio');
  if(a){ try{ a.pause(); }catch(_){} try{ a.currentTime=0; }catch(_){} }
}
function playFollowRec(cb){
  if(!followState.url){ setFollowStatus('还没有录音：先点麦克风录一句'); return; }
  stopFollowAudio();
  const a=followAudioEl();
  let done=false;
  const fin=()=>{ if(done) return; done=true; a.onended=null; a.onerror=null; cb&&cb(); };
  a.onended=fin;
  a.onerror=()=>{ setFollowStatus('这段录音格式无法播放，请重新录一次'); fin(); };
  try{
    if(a.getAttribute('src')!==followState.url){ a.src=followState.url; a.load(); }
  }catch(_){ try{ a.src=followState.url; }catch(__){} }
  try{ a.currentTime=0; }catch(_){}
  const p=a.play();
  if(p&&p.catch) p.catch(err=>{
    setFollowStatus('浏览器拦下了播放，请再点一次「播放录音」'+(err&&err.name?'（'+err.name+'）':''));
    fin();
  });
}
/* A/B 对比：原音 → 停顿 → 你的录音 */
function compareFollow(){
  if(!followState.url){ setFollowStatus('先录音，才能和原音对比'); return; }
  stopFollowAudio();
  setFollowStatus('正在播放原音…');
  speakSafe(followState.text,'en-US',()=>{
    setTimeout(()=>{
      if(!$('#followPage')||!$('#followPage').classList.contains('show')) return;
      setFollowStatus('接下来是你的录音…');
      playFollowRec(()=>setFollowStatus('对比结束：可以再录一次，或点「播放录音」只听自己的'));
    },450);
  });
}
function followUsesRecognition(){
  const appleMobile=/iPhone|iPad|iPod/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
  // iOS recording uses a single capture. Starting Web Speech here opens a second one.
  return !appleMobile&&!!(window.SpeechRecognition||window.webkitSpeechRecognition);
}
function toggleFollowRec(){
  const mic=$('#followMic'),session=followState;
  if(session.recording){ stopFollowRec(); return; }
  if(session.requesting) return;
  if(!navigator.mediaDevices||!navigator.mediaDevices.getUserMedia||!window.MediaRecorder){
    setFollowStatus('当前浏览器不支持录音，可以点左边的播放键跟读'); return;
  }
  if(followState.url){ URL.revokeObjectURL(followState.url); followState.url=null; followState.blob=null; }
  followState.heard=''; followState.asrErr=''; followState.asrDone=false; followState.score=null;
  const sc=$('#followScore'); if(sc){ sc.innerHTML=''; sc.classList.remove('show'); }
  $('#followOut').classList.remove('hasrec');
  stopSpeech();
  stopFollowAudio();
  session.requesting=true;
  navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true}}).then(stream=>{
    if(session!==followState||!$('#followPage').classList.contains('show')){
      stream.getTracks().forEach(track=>track.stop());
      return;
    }
    followState.tracks=stream.getTracks();
    const mime=recMime();
    let rec=null;
    try{ rec=mime?new MediaRecorder(stream,{mimeType:mime,audioBitsPerSecond:96000}):new MediaRecorder(stream); }
    catch(e){ try{ rec=new MediaRecorder(stream); }catch(e2){ rec=null; } }
    if(!rec){
      setFollowStatus('这台设备无法启动录音');
      followState.tracks.forEach(t=>{ try{ t.stop(); }catch(_){} });
      followState.tracks=[];
      return;
    }
    followState.chunks=[];
    rec.ondataavailable=e=>{ if(e.data&&e.data.size) session.chunks.push(e.data); };
    rec.onerror=e=>{ if(session===followState) setFollowStatus('录音出错：'+((e&&e.error)||'未知')); };
    rec.onstop=()=>{
      session.tracks.forEach(track=>track.stop());
      session.tracks=[];
      if(session!==followState||!$('#followPage').classList.contains('show')) return;
      followState.rec=null;
      followState.recording=false;
      stopWave();
      mic.classList.remove('recording');
      const dur=(Date.now()-followState.startAt)/1000;
      followState.dur=Math.max(0,dur);
      const type=rec.mimeType||mime||'audio/webm';
      const blob=new Blob(followState.chunks,{type:type});
      followState.mime=type;
      followState.blob=blob;
      followState.url=URL.createObjectURL(blob);
      if(!blob.size||blob.size<1200||dur<0.35){
        setFollowStatus('这段太短了（'+dur.toFixed(1)+' 秒）：把整句读完再松手');
        return;
      }
      $('#followOut').classList.add('hasrec');
      setFollowStatus('录好了 · '+dur.toFixed(1)+' 秒 · 正在评分…');
      scoreFollow();
    };
    rec.start(250);
    followState.rec=rec; followState.recording=true; followState.startAt=Date.now();
    mic.classList.add('recording');
    startWave(stream);
    if(followUsesRecognition()) startAsr();
    setFollowStatus('录音中…读完再点一次麦克风');
  }).catch(err=>{
    session.tracks.forEach(track=>track.stop());
    session.tracks=[];
    if(session!==followState||!$('#followPage').classList.contains('show')) return;
    const n=(err&&err.name)||'';
    if(n==='NotAllowedError'||n==='SecurityError') setFollowStatus('麦克风被拦住了，请检查 Sitecase 或当前浏览器的麦克风权限');
    else if(n==='NotFoundError'||n==='DevicesNotFoundError') setFollowStatus('没找到麦克风设备');
    else setFollowStatus('麦克风不可用'+(n?'（'+n+'）':'')+'，可以先点播放键跟读');
  }).finally(()=>{ session.requesting=false; });
}
function stopFollowRec(){
  try{ if(followState.rec&&followState.rec.state!=='inactive') followState.rec.stop(); }catch(_){}
  try{ if(followState.asr) followState.asr.stop(); }catch(_){}
}
/* 语音识别（Chrome / Edge）：录音同时收音，用来判断哪些词读到了 */
function startAsr(){
  const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
  if(!SR) return;
  try{
    const r=new SR();
    r.lang='en-US'; r.continuous=true; r.interimResults=true; r.maxAlternatives=1;
    r.onresult=e=>{
      let s='';
      for(let i=0;i<e.results.length;i++){ s+=e.results[i][0].transcript+' '; }
      followState.heard=s.replace(/\s+/g,' ').trim();
    };
    r.onerror=e=>{ followState.asrErr=(e&&e.error)||'error'; followState.asrDone=true; };
    r.onend=()=>{ followState.asrDone=true; };
    r.start();
    followState.asr=r;
  }catch(e){ followState.asr=null; followState.asrErr='unsupported'; }
}
function stopAsr(){
  return new Promise(resolve=>{
    const r=followState.asr;
    if(!r||followState.asrDone){ followState.asr=null; resolve(); return; }
    let done=false;
    const fin=()=>{ if(done) return; done=true; followState.asr=null; resolve(); };
    r.onend=fin; r.onerror=fin;
    try{ r.stop(); }catch(_){ fin(); }
    setTimeout(fin,1500);
  });
}
/* ---------- 跟读评分 ---------- */
function normToken(t){ return String(t||'').toLowerCase().replace(/[’‘]/g,"'").replace(/^[^a-z0-9']+|[^a-z0-9']+$/g,''); }
function followTokens(s){ return String(s||'').split(/\s+/).map(t=>({raw:t,norm:normToken(t)})).filter(t=>t.norm); }
function alignWords(tgt,got){
  const n=tgt.length,m=got.length;
  const dp=[];
  for(let i=0;i<=n;i++) dp.push(new Uint16Array(m+1));
  for(let i=1;i<=n;i++)for(let j=1;j<=m;j++){
    dp[i][j]=tgt[i-1]===got[j-1]?dp[i-1][j-1]+1:(dp[i-1][j]>=dp[i][j-1]?dp[i-1][j]:dp[i][j-1]);
  }
  const matched=new Array(n).fill(false);
  let i=n,j=m;
  while(i>0&&j>0){
    if(tgt[i-1]===got[j-1]){ matched[i-1]=true; i--; j--; }
    else if(dp[i-1][j]>=dp[i][j-1]) i--; else j--;
  }
  return {matched,hit:dp[n][m]};
}
function analyzeAudio(blob){
  const AC=window.AudioContext||window.webkitAudioContext;
  if(!AC||!blob||!blob.arrayBuffer) return Promise.resolve(null);
  return blob.arrayBuffer().then(buf=>new Promise(resolve=>{
    let ac=null,finished=false;
    try{ ac=new AC(); }catch(_){ resolve(null); return; }
    const once=cb=>{ if(finished) return; finished=true; cb(); };
    const done=audio=>{
      try{
        let sum=0,peak=0,silent=0,total=0;
        const ch=audio.getChannelData(0);
        const step=Math.max(1,Math.floor(ch.length/200000));
        for(let k=0;k<ch.length;k+=step){
          const v=ch[k]; sum+=v*v;
          const av=v<0?-v:v;
          if(av>peak) peak=av;
          if(av<0.012) silent++;
          total++;
        }
        once(()=>{
          try{ ac.close(); }catch(_){}
          resolve({dur:audio.duration||0,rms:Math.sqrt(sum/Math.max(1,total)),peak,silence:silent/Math.max(1,total)});
        });
      }catch(e){ once(()=>{ try{ ac.close(); }catch(_){} resolve(null); }); }
    };
    try{
      const p=ac.decodeAudioData(buf,done,()=>once(()=>{ try{ ac.close(); }catch(_){} resolve(null); }));
      if(p&&p.then) p.then(done,()=>once(()=>{ try{ ac.close(); }catch(_){} resolve(null); }));
    }catch(e){ try{ ac.close(); }catch(_){} resolve(null); }
  }));
}
function followGrade(total){
  if(total>=90) return ['太棒了','本次文本匹配与录音指标较好；请回听对照'];
  if(total>=80) return ['很不错','继续对照原音的重音、停顿与语调'];
  if(total>=65) return ['还行','注意标红的词，跟着原音再读两遍'];
  if(total>=50) return ['有点含糊','放慢一点，把每个词读完整'];
  return ['再来一次','先连听两遍原音，再跟着读'];
}
function scoreFollow(){
  if(followState.scoring||!followState.blob) return Promise.resolve();
  followState.scoring=true;
  const seq=followState.blob;
  return stopAsr().then(()=>analyzeAudio(followState.blob)).then(audio=>{
    if(followState.blob!==seq) return;      /* 期间又重录了，丢掉旧结果 */
    const dur=(audio&&audio.dur>0.12)?audio.dur:followState.dur;
    const tgt=followTokens(followState.text);
    const got=followTokens(followState.heard);
    const usedAsr=!!(got.length&&tgt.length);
    let acc=0,flu=0,vol=0,total=0,matched=new Array(tgt.length).fill(false);
    const tips=[];
    if(usedAsr){
      const al=alignWords(tgt.map(t=>t.norm),got.map(t=>t.norm));
      matched=al.matched;
      acc=tgt.length?al.hit/tgt.length:0;
      const miss=tgt.filter((t,i)=>!matched[i]).map(t=>t.raw.replace(/^[^A-Za-z0-9']+|[^A-Za-z0-9']+$/g,''));
      if(miss.length) tips.push('漏读 / 没听清：'+miss.slice(0,6).join('、')+(miss.length>6?' 等 '+miss.length+' 个词':''));
      else tips.push('每个词都读到了，很清楚');
    }else if(followUsesRecognition()){
      tips.push('这次没识别到英文（'+(followState.asrErr||'可能太小声或网络不通')+'），已只按节奏和音量打分');
    }else{
      tips.push('当前浏览器不支持语音识别，只按节奏和音量打分；用 Chrome / Edge 可看逐词对错');
    }
    const rms=audio?audio.rms:0;
    const db=rms>0?20*Math.log10(rms):-80;
    if(audio){
      vol=Math.max(0,Math.min(100,Math.round((db+45)/24*100)));
      if(audio.silence>0.62) vol=Math.round(vol*0.72);
      if(db<-38) tips.push('声音偏小，凑近麦克风一点');
      else if(db>-9) tips.push('离麦克风太近，有点爆音');
    }else{
      vol=55;   /* 拿不到波形时不拿音量扣分 */
    }
    const n=tgt.length||1;
    const ideal=n/2.15+0.35;
    const ratio=dur/Math.max(0.4,ideal);
    flu=Math.max(0,Math.min(100,Math.round(100-Math.abs(ratio-1)*88)));
    const wpm=Math.round(n/Math.max(0.3,dur)*60);
    if(ratio>1.45) tips.push('语速偏慢（'+wpm+' 词/分），尽量连成一句');
    else if(ratio<0.62) tips.push('语速偏快（'+wpm+' 词/分），把词尾读清楚');
    if(usedAsr) total=Math.round(acc*60+flu*0.25+vol*0.15);
    else total=Math.round(flu*0.55+vol*0.45);
    total=Math.max(1,Math.min(100,total));
    const r={acc:Math.round(acc*100),flu,vol,all:total,dur,usedAsr,matched,tgt,wpm,tips,grade:followGrade(total)};
    followState.score=r;
    renderFollowScore(r);
    setFollowStatus(r.usedAsr?'评分完成 · 点「对比」听原音和你的声音':'评分完成（未用识别）· 点「对比」听原音和你的声音');
    if(followState.term){
      try{
        const w=(state.words||[]).find(x=>String(x.term||'').toLowerCase()===followState.term.toLowerCase());
        if(w&&total>(w.followBest||0)){ w.followBest=total; w.followAt=Date.now(); w.updatedAt=Date.now(); save(); }
        const b=$('#followBest');
        if(b&&w&&w.followBest){ b.textContent='最佳 '+w.followBest+' 分'; b.classList.remove('hidden'); }
      }catch(_){}
    }
  }).catch(()=>{ setFollowStatus('评分失败，可以再录一次试试'); })
    .then(()=>{ followState.scoring=false; });
}
function renderFollowScore(r){
  const box=$('#followScore');
  if(!box) return;
  const dim=(label,v)=>'<div class="fs-dim"><span>'+label+'</span><i><b style="width:'+v+'%"></b></i><em>'+v+'</em></div>';
  const diff=r.tgt.map((t,i)=>{
    const raw=esc(t.raw);
    return r.usedAsr?(r.matched[i]?'<span class="fs-ok">'+raw+'</span>':'<span class="fs-miss">'+raw+'</span>'):raw;
  }).join(' ');
  box.innerHTML=
    '<div class="fs-head">'+
      '<div class="fs-ring" style="--p:'+r.all+'"><i>'+r.all+'</i></div>'+
      '<div class="fs-hd">'+
        '<div class="fs-grade">'+esc(r.grade[0])+'</div>'+
        '<div class="fs-sub">'+esc(r.grade[1])+'</div>'+
        '<div class="fs-tag">'+(r.usedAsr?'逐词识别比对':'节奏 + 音量估算')+' · '+r.dur.toFixed(1)+' 秒 · '+r.wpm+' 词/分</div>'+
      '</div>'+
    '</div>'+
    '<div class="fs-dims">'+(r.usedAsr?dim('准确',r.acc):'')+dim('流利',r.flu)+dim('音量',r.vol)+'</div>'+
    (r.usedAsr?'<div class="fs-diff">'+diff+'</div><div class="fs-legend"><i class="ok"></i>读到<i class="miss"></i>没读清</div>':'')+
    '<div class="fs-tips">'+r.tips.map(t=>'<div>· '+esc(t)+'</div>').join('')+'</div>';
  box.classList.add('show');
}

/* ============ AI：例句自动挑选（不用手写） ============ */
const PACK_PROMPT=term=>'你是资深英汉词典编纂者，正在为中文学习者的个人表达库挑例句。词条："'+term+'"。\n'+
  '请挑选 2-3 句最典型、最常用的英文例句（3 句最佳），并给出准确自然的中文翻译。\n'+
  '要求：\n'+
  '1) 一词多义时，按最常用的几个义项各给一句（如 address 的「处理/解决」与「地址」），sense 字段用 2-6 个中文字概括该句用到的义项；单义词 sense 留空字符串。\n'+
  '2) 例句必须是真实地道、语法正确的完整英文句子，8-18 词，来自生活/职场/新闻常见语境；不要造句腔（禁止 "The word X means…"、"This is an example of…"）。\n'+
  '3) cn 是通顺的中文，意译而非逐字直译。\n'+
  '4) 每句都要自然用到该词（允许变位，如 withdrew / grabbing）。\n'+
  '5) phonetic 给英式音标（如 /ˈwɪðdrɔː/）；definition 给「词性. 简短中文释义」，多义项用分号隔开，总长不超过 40 字。\n'+
  '只输出一个 JSON 对象，不要任何解释或代码块。格式：{"phonetic":"/.../","definition":"v. 释义；n. 释义","examples":[{"sense":"义项","en":"英文例句","cn":"中文翻译"}]}';
/* 把 AI 接口的原始报错翻译成人话 */
function aiErrText(err){
  const raw=String((err&&err.message)||err||'');
  if(/abort/i.test(raw)) return '请求超时，请检查网络后重试';
  const m=raw.match(/HTTP\s*(\d{3})/);
  if(m){
    const c=m[1];
    if(c==='401'||c==='403') return 'API Key 无效或没有权限（HTTP '+c+'）';
    if(c==='404') return '接口地址或模型名不对（HTTP 404），检查 Base URL 与模型名';
    if(c==='400') return '请求被拒绝（HTTP 400），多半是模型名已下线或写错，去服务商控制台核对';
    if(c==='429') return '调用太频繁或额度用完了（HTTP 429）';
    if(c[0]==='5') return '服务端异常（HTTP '+c+'），稍后再试';
  }
  if(/未配置/.test(raw)) return raw;
  if(/parse|无法解析/i.test(raw)) return 'AI 返回格式异常，点「换一批」再试';
  return raw.slice(0,80);
}
function parseAI(text){
  if(!text) return null;
  let t=String(text).replace(/```[a-zA-Z]*/g,'').trim();
  const s=t.indexOf('{'),e=t.lastIndexOf('}');
  if(s>=0&&e>s){
    try{ return JSON.parse(t.slice(s,e+1)); }catch(_){}
  }
  const phon=(t.match(/phonetic["':\s]+([^",}]+)/)||[])[1];
  const def=(t.match(/definition["':\s]+([^"]+)/)||[])[1];
  if(!def) return null;
  return {phonetic:(phon||'').trim(),definition:def.trim(),examples:[],suggestedTags:[]};
}
async function askAI(term){
  return aiPack(term);
}
function aiPack(term){
  return aiCall([
    {role:'system',content:'你是资深英汉词典编纂者。直接输出一个 JSON 对象本身：不要 markdown、不要 ```json 代码块、不要任何解释或前后缀文字。'},
    {role:'user',content:PACK_PROMPT(term)}
  ]);
}
async function askDict(term){
  /* 免费词典在国内经常连不上：给个 6 秒上限，别让界面一直等 */
  const ctrl=(typeof AbortController!=='undefined')?new AbortController():null;
  const timer=ctrl?setTimeout(()=>{ try{ ctrl.abort(); }catch(_){} },6000):0;
  try{
    const res=await fetch('https://api.dictionaryapi.dev/api/v2/entries/en/'+encodeURIComponent(term),ctrl?{signal:ctrl.signal}:undefined);
    if(!res.ok) throw new Error('HTTP '+res.status);
    const data=await res.json();
    const entry=data&&data[0];
    if(!entry) throw new Error('empty');
    const phon=(entry.phonetics||[]).map(p=>p.text).find(Boolean)||'';
    const defs=[],exs=[];
    for(const m of(entry.meanings||[])){
      for(const d of(m.definitions||[])){
        if(defs.length<3) defs.push({pos:m.partOfSpeech||'',def:d.definition||''});
        if(d.example&&exs.length<3) exs.push({en:d.example,cn:'',sense:''});
        if(defs.length>=3&&exs.length>=3) break;
      }
      if(defs.length>=3&&exs.length>=3) break;
    }
    if(!defs.length) throw new Error('no-def');
    return {source:'dict',phonetic:phon,definition:defs.map(x=>(x.pos?x.pos+' ':'')+x.def).join('\n'),examples:exs,suggestedTags:[]};
  }finally{ clearTimeout(timer); }
}


