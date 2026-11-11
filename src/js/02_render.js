/* ===== 02_render.js · 朗读与单词操作 / 视图渲染 / 标签 / 表达库 / 搜索 ===== */
/* ============ 单词操作 ============ */
function voiceQuality(voice){
  const name=voice.name+' '+(voice.voiceURI||'');
  if(/\bpremium\b/i.test(name)) return 3;
  if(/\b(natural|neural|enhanced)\b/i.test(name)) return 2;
  return 0;
}
function pickVoice(voices,lang){
  const locale=(lang||'en-US').toLowerCase();
  const base=locale.split('-')[0];
  const candidates=(voices||[]).filter(v=>v.lang?.toLowerCase().split('-')[0]===base);
  const exact=candidates.filter(v=>v.lang.toLowerCase()===locale);
  const matching=exact.length?exact:candidates;
  const local=matching.filter(v=>v.localService);
  const available=local.length?local:matching;
  const preferred=base==='zh'?/xiaoxiao|tingting|meijia|sinji|female/i:/ava|allison|samantha|karen|moira|zira|aria|joanna|female/i;
  const score=v=>voiceQuality(v)*10+(preferred.test(v.name)?2:0)+(v.default?1:0);
  return available.sort((a,b)=>score(b)-score(a))[0]||null;
}
let cancelDictionarySpeech=null;
function stopSpeech(){
  if(cancelDictionarySpeech)cancelDictionarySpeech();
  try{window.speechSynthesis?.cancel();}catch(_){}
}
function speakRaw(text,lang,onend,voice){
  if(!text) return;
  stopSpeech();
  if(!window.speechSynthesis){toast('当前浏览器不支持语音朗读','warn');onend?.();return;}
  const utterance=new SpeechSynthesisUtterance(text);
  utterance.lang=lang;
  utterance.rate=lang.toLowerCase().startsWith('en')?0.96:0.95;
  try{utterance.voice=voice||pickVoice(speechSynthesis.getVoices(),lang);}catch(_){}
  if(onend){
    utterance.onend=onend;
    utterance.onerror=e=>{if(e.error!=='canceled'&&e.error!=='interrupted')onend();};
  }
  speechSynthesis.speak(utterance);
}
function playYoudaoAudio(text,lang,onend){
  stopSpeech();
  const audio=new Audio('https://dict.youdao.com/dictvoice?audio='+encodeURIComponent(text)+'&type=2');
  let done=false;
  const finish=()=>{
    if(done)return false;
    done=true;
    clearTimeout(timer);
    cancelDictionarySpeech=null;
    return true;
  };
  const cancel=()=>{if(finish())audio.pause();};
  const fallback=()=>{if(finish()){audio.pause();speakRaw(text,lang,onend);}};
  const timer=setTimeout(fallback,3000);
  cancelDictionarySpeech=cancel;
  audio.addEventListener('playing',()=>clearTimeout(timer),{once:true});
  audio.addEventListener('error',fallback,{once:true});
  audio.addEventListener('ended',()=>{if(finish())onend?.();},{once:true});
  audio.play().catch(fallback);
}
function speak(text,lang,onend){
  const value=String(text||'').trim(),locale=lang||'en-US';
  if(!value)return;
  let voice;
  try{voice=pickVoice(window.speechSynthesis?.getVoices(),locale);}catch(_){}
  const usWord=locale.toLowerCase()==='en-us'&&!/\s/.test(value);
  if(usWord&&(!voice||voiceQuality(voice)===0)&&navigator.onLine!==false){
    playYoudaoAudio(value,locale,onend);
    return;
  }
  speakRaw(value,locale,onend,voice);
}
function speakWord(term){speak(term,'en-US');}
if('speechSynthesis' in window){
  const warm=()=>{ try{ speechSynthesis.getVoices(); }catch(e){} };
  try{ speechSynthesis.addEventListener('voiceschanged',warm); }catch(e){}
  warm();
}
function speakBtn(text,lang,kind){
  return '<button class="speak-btn" data-play="'+esc(text)+'"'+(lang?' data-play-lang="'+lang+'"':'')+(kind?' data-play-kind="'+kind+'"':'')+' aria-label="朗读"><svg class="icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5 6 9H2v6h4l5 4V5z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18.5 5.5a9 9 0 0 1 0 13"/></svg></button>';
}
function upsertWord(w){
  const key=w.term.trim().toLowerCase();
  const ex=state.words.find(x=>x.term.toLowerCase()===key);
  const t=Date.now();
  if(ex){
    if(w.phonetic) ex.phonetic=w.phonetic;
    if(w.definition) ex.definition=w.definition;
    if(w.examples&&w.examples.length) ex.examples=w.examples;
    if(Array.isArray(w.collocations)) ex.collocations=w.collocations.slice();
    ex.tags=[...new Set([...(ex.tags||[]),...(w.tags||[])])];
    ex.notes=mergeNotes(ex.notes||[],w.notes||[]);
    if(w.mastered!==undefined) ex.mastered=!!w.mastered;
    ex.updatedAt=t;
    return ex;
  }
  const nw={id:uid(),term:w.term.trim(),phonetic:w.phonetic||'',definition:w.definition||'',examples:w.examples||[],collocations:Array.isArray(w.collocations)?w.collocations.slice():[],tags:[...(w.tags||[])],notes:w.notes||[],source:w.source||'manual',mastered:!!w.mastered,createdAt:t,updatedAt:t};
  state.words.push(nw);
  return nw;
}
function mergeNotes(a,b){
  const map=new Map();
  a.concat(b).forEach(n=>{ if(n&&n.noteId) map.set(n.noteId,n); });
  return [...map.values()];
}

/* ============ 视图渲染 ============ */
function render(){
  renderSidebar();
  renderPane();
  renderEditor();
  const gs=$('#globalSearch');
  if(gs&&gs.value&&ui.mode!=='search'){ gs.value=''; ui.search=''; $('#searchClear').classList.add('hidden'); }
  /* 重绘时保留底部浮条相关的 class，否则它们的定位会瞬间掉回去 */
  const keepBar=(document.body.classList.contains('mv-bar')?' mv-bar':'')+(document.body.classList.contains('undo-bar')?' undo-bar':'');
  document.body.className=(ui.sideOpen?'side-open ':'')+'mode-'+ui.mode+keepBar;
  syncKbUI();
  syncTabbar();
}

/* 底部导航的高亮与小红点 */
function syncTabbar(){
  const cur=ui.mode==='today'?'today':(ui.mode==='words'?'words':(ui.mode==='flash'?'flash':(ui.mode==='tags'||ui.mode==='speak'?'more':'list')));
  $$('#tabbar .tab-item').forEach(el=>el.classList.toggle('on',el.dataset.tab===cur));
  const d=$('#tabFlashDot');
  if(d){ const n=typeof dueCount==='function'?dueCount():0; d.classList.toggle('hidden',!(n>0)); }
}

function renderSidebar(){
  const sum=srsSummary();
  $('#navAllCount').textContent=state.notes.length;
  const tc=$('#navTodayCount'); if(tc) tc.textContent=todayNewWords().length;
  $('#navWordCount').textContent=state.words.length;
  $('#navTagCount').textContent=new Set(state.words.flatMap(w=>w.tags)).size;
  $('#navFlashCount').textContent=sum.due;
  const dot=$('#navFlashDot');
  if(dot) dot.classList.toggle('hidden',sum.due===0);
  const sc=$('#navSpeakCount');
  if(sc) sc.textContent=state.aiLog.length;
  $('#statWords').textContent='收录 '+sum.all+' 词 · 待复习 '+sum.due+(sum.done?' · 已掌握 '+sum.done:'');
  $$('#sideNav .nav-item').forEach(el=>{
    const k=el.dataset.nav;
    el.classList.toggle('active',(k==='today'&&ui.mode==='today')||(k==='all'&&ui.mode==='list'&&ui.folder==='all')||(k==='words'&&ui.mode==='words')||(k==='tags'&&ui.mode==='tags')||(k==='flash'&&ui.mode==='flash')||(k==='speak'&&ui.mode==='speak'));
  });
  const fl=$('#folderList');
  fl.innerHTML=state.folders.map(f=>{
    const cnt=state.notes.filter(n=>n.folderId===f.id).length;
    return '<div class="nav-item folder-item'+(ui.folder===f.id?' active':'')+'" data-folder="'+f.id+'">'+
      '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>'+
      '<span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+esc(f.name)+'</span>'+
      '<span class="count">'+cnt+'</span>'+
      '<button class="fd-more" data-fmore="'+f.id+'" aria-label="文件夹 '+esc(f.name)+' 的更多操作"><svg class="icon-sm" viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="1.9"/><circle cx="12" cy="12" r="1.9"/><circle cx="19" cy="12" r="1.9"/></svg></button>'+
      '</div>';
  }).join('');
}

function renderPane(){
  if(ui.mode==='today'){ renderToday(); return; }
  if(ui.mode==='edit'){ renderNoteList(); return; }
  if(ui.mode==='tags'){ renderTagsPane(); return; }
  if(ui.mode==='words'){ renderWordsPane(); return; }
  if(ui.mode==='flash'){ renderFlash(); return; }
  if(ui.mode==='speak'){ renderSpeakLog(); return; }
  if(ui.mode==='search'){ renderSearch(); return; }
  renderNoteList();
}

function folderName(){
  if(ui.folder==='all') return '全部笔记';
  const f=state.folders.find(x=>x.id===ui.folder);
  return f?f.name:'全部笔记';
}
function notesForFolder(){
  const notes=ui.folder==='all'?state.notes.slice():state.notes.filter(n=>n.folderId===ui.folder);
  return notes.sort((a,b)=>b.updatedAt-a.updatedAt);
}

function renderNoteList(){
  $('#paneTitle').textContent=folderName();
  $('#btnNewNote').style.display='inline-flex';
  const notes=notesForFolder();
  const box=$('#noteList');
  if(!notes.length){
    box.innerHTML='<div class="empty-state">'+
      '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3h9l5 5v13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z"/><path d="M14 3v5h5"/></svg>'+
      '<div><b>'+(ui.folder==='all'?'还没有笔记':'这个文件夹还没有笔记')+'</b><br>点右上角 ＋ 新建一篇笔记，开始积累你的英语表达。</div></div>';
    return;
  }
  box.innerHTML=notes.map(n=>{
    const fb=ui.folder==='all'?(state.folders.find(f=>f.id===n.folderId)?.name||''):'';
    return '<div class="note-item'+(ui.note===n.id?' active':'')+'" data-note="'+n.id+'">'+
      '<div class="ni-main">'+
        '<div class="ni-title">'+esc(n.title||'无标题')+'</div>'+
        '<div class="ni-snippet">'+esc(snippet(n.content))+'</div>'+
        '<div class="ni-meta">'+(fb?'<span class="folder-badge">'+esc(fb)+'</span>':'')+'<span>'+fmtDate(n.updatedAt)+'</span></div>'+
      '</div>'+
      '<button class="ni-del" data-ndel="'+n.id+'" aria-label="删除笔记 '+esc(n.title||'')+'"><svg class="icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M10 11v6M14 11v6"/></svg></button>'+
    '</div>';
  }).join('');
}

function srsPill(w){
  const s=w.srs||{box:1,due:0};
  if(w.mastered) return '<span class="srs-pill done">已掌握</span>';
  if(s.due<=Date.now()) return '<span class="srs-pill due">待复习</span>';
  return '<span class="srs-pill">'+esc(srsNextLabel(w))+'</span>';
}
function wordCardHTML(w){
  const ex0=(w.examples&&w.examples[0])?w.examples[0]:null;
  const exHtml=ex0?'<div class="wc-ex-row"><span class="wc-ex">“'+esc(ex0.en)+'”</span>'+speakBtn(ex0.en)+'</div>'+
    ((w.examples.length>1)?'<div class="wc-ex-more">共 '+w.examples.length+' 句例句 · 点卡片查看全部</div>':''):
    '<div class="wc-ex-more missing">还没有例句 · <button class="wc-fixex" data-fixex="'+w.id+'">补例句</button></div>';
  const sel=ui.selMode?'<span class="wc-check"'+(ui.sel.includes(w.id)?' data-on="1"':'')+'>'+(ui.sel.includes(w.id)?'<svg class="icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 13l4 4L19 7"/></svg>':'')+'</span>':'';
  return '<div class="word-card'+(ui.sel.includes(w.id)?' sel':'')+'" data-wid="'+w.id+'">'+
    sel+
    '<div class="wc-head"><span class="wc-term-row"><span class="wc-term">'+esc(w.term)+'</span>'+speakBtn(w.term,'','word')+'</span>'+
    (w.phonetic?'<span class="wc-phon">'+esc(w.phonetic)+'</span>':'')+
    '<span class="badge badge-'+esc(w.source||'manual')+'">'+SOURCE_LABEL[w.source||'manual']+'</span></div>'+
    '<div class="wc-def">'+esc(w.definition||'（暂无释义）')+'</div>'+
    (w.collocations&&w.collocations.length?'<div class="wc-coll">'+w.collocations.map(c=>'<span class="coll-chip">'+esc(c)+'</span>').join('')+'</div>':'')+
    shotsHTML(w)+
    exHtml+
    (w.tags&&w.tags.length?'<div class="wc-tags">'+w.tags.map(t=>'<span class="chip" data-chip="'+esc(t)+'"># '+esc(t)+'</span>').join('')+'</div>':'')+
    '<div class="wc-meta">'+
      srsPill(w)+
      '<span>'+(w.notes&&w.notes[0]?'来自：<button class="wc-link" data-wlink="'+w.notes[0].noteId+'">'+esc(w.notes[0].noteTitle)+'</button>':'未关联笔记')+'</span>'+
    '</div>'+
  '</div>';
}

function renderTagsPane(){
  $('#paneTitle').textContent='标签聚合';
  $('#btnNewNote').style.display='none';
  const names=tagNames();
  const editing=!!ui.tagEdit;
  let head='<div class="tg-head">'+
    '<button class="btn" id="tagNewBtn">＋ 新建标签</button>'+
    (names.length?'<button class="btn'+(editing?' primary':'')+'" id="tagEditBtn">'+(editing?'完成':'管理')+'</button>':'')+
  '</div>';
  if(ui.tagNewOpen){
    head+='<div class="tg-new"><input id="tagNameInput" placeholder="标签名，如 职场 / 考研" autocomplete="off" enterkeyhint="done"><button class="btn primary" id="tagNameOk">添加</button></div>';
  }
  const chips=names.map(t=>{
    const n=tagCount(t);
    const ops=editing?('<span class="tg-ops"><i data-tg-edit="'+esc(t)+'">✎</i><i data-tg-del="'+esc(t)+'">✕</i></span>'):'';
    return '<button class="tag-chip'+(ui.tag===t?' active':'')+'" data-tag="'+esc(t)+'"># '+esc(t)+'<span class="tag-n">'+n+'</span>'+ops+'</button>';
  }).join('');
  const sel=ui.tag?'<div class="tg-sel"><span>当前标签：# '+esc(ui.tag)+'</span><button class="wc-link" id="tagClear">清除筛选</button></div>':'';
  let wordsHtml='';
  if(ui.tag){
    const words=state.words.filter(w=>(w.tags||[]).includes(ui.tag)).sort((a,b)=>b.updatedAt-a.updatedAt);
    wordsHtml=words.length?'<div class="words-grid">'+words.map(wordCardHTML).join('')+'</div>':'<div class="empty-state" style="padding:40px 24px">该标签下暂无单词</div>';
  }else if(names.length){
    wordsHtml='<div class="empty-state" style="padding:40px 24px">点击上方标签，查看该标签下的所有单词</div>';
  }else{
    wordsHtml='<div class="empty-state" style="padding:40px 24px"><b>还没有标签类别</b><br>点上面「＋ 新建标签」建一个，之后在单词卡里直接勾选就行。</div>';
  }
  $('#noteList').innerHTML=head+(chips?('<div class="toolbar tg-chips">'+chips+'</div>'):'')+sel+wordsHtml;
  const inp=$('#tagNameInput');
  if(inp) setTimeout(()=>inp.focus(),50);
}
function tagNames(){
  if(!Array.isArray(state.tagList)) state.tagList=[];
  const list=state.tagList.slice();
  state.words.forEach(w=>(w.tags||[]).forEach(t=>{ if(t&&list.indexOf(t)<0) list.push(t); }));
  return list;
}
function tagCount(name){ return state.words.filter(w=>(w.tags||[]).includes(name)).length; }
/* 把标签收进类别表（单词里用到的标签一定能在类别表里找到） */
function putTag(name){
  const t=String(name||'').replace(/^#/,'').trim();
  if(!t) return '';
  if(!Array.isArray(state.tagList)) state.tagList=[];
  if(state.tagList.indexOf(t)<0) state.tagList.push(t);
  return t;
}
function renameTag(from,to){
  from=String(from||'').replace(/^#/,'').trim();
  to=String(to||'').replace(/^#/,'').trim();
  if(!from||!to||from===to) return false;
  if(!Array.isArray(state.tagList)) state.tagList=[];
  const i=state.tagList.indexOf(from), exist=state.tagList.indexOf(to)>=0;
  if(i>=0){ if(exist) state.tagList.splice(i,1); else state.tagList[i]=to; }
  else if(!exist) state.tagList.push(to);
  state.words.forEach(w=>{
    const tags=w.tags||[];
    if(tags.indexOf(from)>=0){
      w.tags=[...new Set(tags.map(t=>t===from?to:t))];
      w.updatedAt=Date.now();
    }
  });
  addGrave('tag',from);
  if(ui.tag===from) ui.tag=to;
  if(ui.wordTag===from) ui.wordTag=to;
  return true;
}
function deleteTag(name){
  const t=String(name||'').replace(/^#/,'').trim();
  if(!t) return 0;
  const n=tagCount(t);
  state.tagList=(state.tagList||[]).filter(x=>x!==t);
  state.words.forEach(w=>{
    if((w.tags||[]).indexOf(t)>=0){ w.tags=w.tags.filter(x=>x!==t); w.updatedAt=Date.now(); }
  });
  addGrave('tag',t);
  if(ui.tag===t) ui.tag=null;
  if(ui.wordTag===t) ui.wordTag='';
  return n;
}
function addTagFromPane(){
  const inp=$('#tagNameInput');
  const t=String(inp?inp.value:'').replace(/^#/,'').trim();
  if(!t){ toast('先输入标签名','warn'); if(inp) inp.focus(); return; }
  if(tagNames().indexOf(t)>=0){ toast('已经有这个标签了','warn'); if(inp){ inp.value=''; inp.focus(); } return; }
  putTag(t); save();
  ui.tagNewOpen=false;
  render();
  toast('已新建标签 #'+t);
  /* 从单词卡点「新建类别」过来的：建完自动回到那个词，已填内容都在 */
  resumeWmDraft(t);
}
function renameTagDialog(oldName){
  showConfirm({title:'重命名标签',msg:'',okText:'保存'});
  const msg=$('#cfMsg');
  msg.innerHTML='<input id="cfInput" value="'+esc(oldName)+'" style="width:100%;border:1px solid var(--s5);border-radius:10px;padding:11px 12px;font-size:16px;background:var(--s0);color:var(--text);box-sizing:border-box">';
  msg.style.padding='12px 20px 0';
  const inp=msg.querySelector('#cfInput');
  setTimeout(()=>{ inp.focus(); inp.select(); },60);
  confirmCb=()=>{
    const v=inp.value.replace(/^#/,'').trim();
    if(!v){ toast('标签名不能为空','warn'); return; }
    if(v===oldName) return;
    if(tagNames().indexOf(v)>=0){ toast('已经有同名标签了','warn'); return; }
    renameTag(oldName,v); save(); render(); toast('已改为 #'+v);
  };
  inp.addEventListener('keydown',e=>{ if(e.key==='Enter'){ e.preventDefault(); $('#cfOk').click(); } });
}
function deleteTagDialog(name){
  const n=tagCount(name);
  showConfirm({
    title:'删除标签',
    msg:n?('「# '+name+'」下还有 '+n+' 个单词。删掉标签不会动这些单词本身，只是它们会变成无标签。'):
         ('「# '+name+'」下没有单词，删除不会影响任何内容。'),
    okText:'删除',danger:true,
    onOk:()=>{ deleteTag(name); save(); render(); toast('已删除标签 #'+name); }
  });
}
function allTags(){
  const m=new Map();
  state.words.forEach(w=>(w.tags||[]).forEach(t=>m.set(t,(m.get(t)||0)+1)));
  return [...m.entries()].sort((a,b)=>b[1]-a[1]);
}
function filteredWords(){
  let list=state.words.slice();
  if(ui.wordFilter==='due') list=list.filter(w=>!aPending(w)&&isDue(w));
  else if(ui.wordFilter==='today') list=list.filter(w=>isToday(w.createdAt));
  else if(ui.wordFilter==='todo') list=list.filter(w=>!w.mastered);
  else if(ui.wordFilter==='done') list=list.filter(w=>w.mastered);
  else if(ui.wordFilter==='noex') list=list.filter(w=>!(w.examples&&w.examples.length));
  if(ui.wordFilter==='pending') list=list.filter(aPending);
  if(ui.wordDate) list=list.filter(w=>aDate(w.createdAt)===ui.wordDate);
  if(ui.wordTag) list=list.filter(w=>(w.tags||[]).includes(ui.wordTag));
  const sort=ui.wordSort||'time';
  list.sort((a,b)=>{
    if(sort==='alpha') return a.term.toLowerCase().localeCompare(b.term.toLowerCase());
    if(sort==='due') return srsDue(a)-srsDue(b);
    if(sort==='created') return (b.createdAt||0)-(a.createdAt||0);
    return (b.updatedAt||0)-(a.updatedAt||0);
  });
  return list;
}
function renderWordsPane(){
  $('#paneTitle').textContent='表达库';
  $('#btnNewNote').style.display='none';
  const box=$('#noteList');
  if(!state.words.length){
    box.innerHTML='<div class="empty-state">'+
      '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5v14z"/><path d="M4 19.5A2.5 2.5 0 0 0 6.5 22H20v-5"/></svg>'+
      '<div><b>表达库还是空的</b><br>回到笔记，选中英文单词点「empower」，单词就会出现在这里。</div></div>';
    return;
  }
  const nAll=state.words.length;
  const nDue=dueCount();
  const nTodo=state.words.filter(w=>!w.mastered).length;
  const nDone=nAll-nTodo;
  const nNoEx=state.words.filter(w=>!(w.examples&&w.examples.length)).length;
  const chip=(k,label,n)=>'<button class="tag-chip'+(ui.wordFilter===k?' active':'')+'" data-wfilter="'+k+'">'+label+(n!=null?' <span class="tag-n">'+n+'</span>':'')+'</button>';
  const chips=chip('all','全部',nAll)+chip('due','待复习',nDue)+chip('today','今日新增',todayNewWords().length)+chip('todo','未掌握',nTodo)+chip('done','已掌握',nDone)+chip('noex','缺例句',nNoEx);
  const tagOpts=['<option value="">全部标签</option>'].concat(allTags().map(([t,n])=>'<option value="'+esc(t)+'"'+(ui.wordTag===t?' selected':'')+'># '+esc(t)+' ('+n+')</option>')).join('');
  const sortOpts=[['time','最近更新'],['created','最近添加'],['alpha','字母顺序'],['due','到期时间']]
    .map(([v,l])=>'<option value="'+v+'"'+(ui.wordSort===v?' selected':'')+'>'+l+'</option>').join('');
  let words=filteredWords();
  const grid=words.length?'<div class="words-grid">'+words.map(wordCardHTML).join('')+'</div>'
    :'<div class="empty-state" style="padding:40px 24px">这里没有符合条件的单词</div>';
  const batch=ui.selMode?'<div class="batch-bar">'+
      '<span class="batch-info">已选 <b>'+(ui.sel.length)+'</b> / '+words.length+'</span>'+
      '<button class="btn" data-batch="all">全选</button>'+
      '<button class="btn" data-batch="tag">打标签</button>'+
      '<button class="btn" data-batch="ex">补例句</button>'+
      '<button class="btn" data-batch="master">标记已掌握</button>'+
      '<button class="btn danger" data-batch="del">删除</button>'+
      '<button class="btn" data-batch="exit">完成</button>'+
    '</div>':'';
  box.innerHTML='<div class="word-filter">'+chips+'</div>'+
    '<div class="wb-bar">'+
      '<select class="wb-sel" id="wbSort">'+sortOpts+'</select>'+
      '<select class="wb-sel" id="wbTag">'+tagOpts+'</select>'+
      '<span class="wb-spacer"></span>'+
      '<span class="wb-count">'+words.length+' 个</span>'+
      '<button class="mini-btn" id="wbSelMode">'+(ui.selMode?'退出多选':'多选')+'</button>'+
    '</div>'+
    grid+batch;
}
/* 批量补例句：限速串行，避免一次打爆 API */
let batchState=null;
async function batchGenExamples(list){
  if(batchState) { toast('还有一批在生成中，请稍候','warn'); return; }
  if(!aAiReady()){ toast('请先选择 AI 使用方式','warn'); openSettings(); return; }
  const queue=list.filter(w=>w&&w.term);
  if(!queue.length){ toast('没有需要补例句的单词','warn'); return; }
  batchState={done:0,total:queue.length,stop:false};
  const bar=document.createElement('div');
  bar.className='batch-bar';
  bar.id='batchProgress';
  bar.innerHTML='<span class="batch-info">正在补例句 <b>0</b> / '+queue.length+'</span>'+
    '<div class="rv-bar" style="flex:1;margin:0;min-width:80px"><i style="width:0%"></i></div>'+
    '<button class="btn" id="batchStop">停止</button>';
  $('#noteList').appendChild(bar);
  bar.querySelector('#batchStop').addEventListener('click',()=>{ batchState.stop=true; });
  for(const w of queue){
    if(batchState.stop) break;
    try{
      const r=await aiPack(w.term);
      const ex=(r.examples||[]).filter(x=>x&&String(x.en).trim()).slice(0,3)
        .map(x=>({en:String(x.en).trim(),cn:String(x.cn||'').trim(),sense:String(x.sense||'').trim()}));
      if(ex.length) w.examples=ex;
      if(!w.phonetic&&r.phonetic) w.phonetic=String(r.phonetic).trim();
      if(!w.definition&&r.definition) w.definition=String(r.definition).trim();
      w.updatedAt=Date.now();
    }catch(e){ /* 单个失败继续下一个 */ }
    batchState.done++;
    const info=bar.querySelector('.batch-info');
    if(info) info.innerHTML='正在补例句 <b>'+batchState.done+'</b> / '+batchState.total;
    const fill=bar.querySelector('.rv-bar i');
    if(fill) fill.style.width=Math.round(batchState.done/batchState.total*100)+'%';
    save();
    await new Promise(r=>setTimeout(r,350));
  }
  const stopped=batchState.stop, done=batchState.done, total=batchState.total;
  batchState=null;
  if(bar&&bar.parentNode) bar.parentNode.removeChild(bar);
  save(); render();
  toast((stopped?'已停止，':'')+'为 '+done+' 个单词补好例句');
}

/* ============ 全局模糊搜索 ============ */
function fuzzyScore(q,text){
  text=String(text||'').toLowerCase();
  q=String(q||'').toLowerCase();
  if(!q||!text) return 0;
  const si=text.indexOf(q);
  if(si>=0) return 100-si*0.5;
  let pos=0,sum=0;
  for(const ch of q){
    const idx=text.indexOf(ch,pos);
    if(idx<0) return 0;
    sum+=idx; pos=idx+1;
  }
  return Math.max(1,50-sum/q.length);
}
function noteText(n){
  const d=document.createElement('div'); d.innerHTML=n.content||'';
  return d.textContent.replace(/\s+/g,' ').trim();
}
function markHit(text,q){
  const t=esc(text);
  const s=String(q||'').trim();
  if(!s) return t;
  const qs=s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  try{ return t.replace(new RegExp('('+qs+')','ig'),'<mark>$1</mark>'); }catch(_){ return t; }
}
function searchNotes(q){
  const out=[];
  state.notes.forEach(n=>{
    const title=n.title||'';
    const text=noteText(n);
    let best=fuzzyScore(q,title)*1.2;
    const idx=text.toLowerCase().indexOf(q.toLowerCase());
    if(idx>=0) best=Math.max(best,90-idx*0.05);
    else{
      const m=fuzzyScore(q,text)*0.55;
      best=Math.max(best,m);
    }
    if(best>0) out.push({n,best,text});
  });
  out.sort((a,b)=>b.best-a.best);
  return out.slice(0,20);
}
function renderSearch(){
  $('#paneTitle').textContent='搜索';
  $('#btnNewNote').style.display='none';
  const box=$('#noteList');
  const q=(ui.search||'').trim();
  if(!q){
    box.innerHTML='<div class="empty-state">搜索单词或笔记内容<br>单词支持模糊匹配：dl → deadline，pi → pitch</div>';
    return;
  }
  const hits=[];
  state.words.forEach(w=>{
    const fields=[{t:w.term,w:10},{t:w.phonetic||'',w:6},{t:w.definition||'',w:5}];
    (w.examples||[]).forEach(x=>{ fields.push({t:x.en,w:4},{t:x.cn||'',w:3}); });
    (w.collocations||[]).forEach(c=>fields.push({t:c,w:5}));
    (w.tags||[]).forEach(t=>fields.push({t:t,w:4}));
    let best=0;
    fields.forEach(f=>{ const s=fuzzyScore(q,f.t)*f.w/10; if(s>best) best=s; });
    if(best>0) hits.push({w,best});
  });
  hits.sort((a,b)=>b.best-a.best);
  const notes=searchNotes(q);
  let h='';
  if(notes.length){
    h+='<div class="sr-group"><div class="sr-group-title">笔记 <span>'+notes.length+'</span></div><div class="sr-notes">'+
      notes.map(r=>{
        const text=r.text;
        const i=text.toLowerCase().indexOf(q.toLowerCase());
        const s=i>=0?text.slice(Math.max(0,i-24),i+56):text.slice(0,72);
        return '<div class="sr-note" data-srnote="'+r.n.id+'">'+
          '<div class="t">'+markHit(r.n.title||'无标题',q)+'</div>'+
          '<div class="s">'+markHit((i>24?'…':'')+s,q)+'</div>'+
        '</div>';
      }).join('')+'</div></div>';
  }
  h+='<div class="sr-group"><div class="sr-group-title">单词 <span>'+hits.length+'</span></div>'+
    (hits.length?'<div class="words-grid" style="padding:0 0 14px">'+hits.map(x=>wordCardHTML(x.w)).join('')+'</div>'
      :'<div class="empty-state" style="padding:20px 0 40px;font-size:13px">没有匹配「'+esc(q)+'」的单词</div>')+'</div>';
  box.innerHTML=h;
}


