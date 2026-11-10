/* ============ 写作练习（选词 → 出题 → 写作 → AI 批改 → 存成笔记） ============ */
const WRITE_KEY='english-notes-writing-v1';
const WRITE_DRAFT_KEY='english-notes-write-draft-v1';
let writeState={step:'pick',seq:0,words:[],picked:[],topic:'',promptCn:'',minWords:80,attempt:'',review:null};
let writeDraftTimer=null;
/* 半篇作文草稿：独立 key，不碰正式写作记录 */
function writeDraftSave(){
  try{
    if(!writeState||(writeState.step!=='topic'&&writeState.step!=='review')) return;
    const attempt=String(($('#writeArea')&&$('#writeArea').value)||writeState.attempt||'').trim();
    if(!attempt&&!writeState.topic){ try{ localStorage.removeItem(WRITE_DRAFT_KEY); }catch(_){ } return; }
    localStorage.setItem(WRITE_DRAFT_KEY,JSON.stringify({topic:writeState.topic||'',promptCn:writeState.promptCn||'',minWords:parseInt(writeState.minWords,10)||80,picked:writeState.picked||[],attempt,at:Date.now()}));
  }catch(_){ }
}
function writeDraftGet(){
  try{ const d=JSON.parse(localStorage.getItem(WRITE_DRAFT_KEY)||'null'); return (d&&typeof d==='object')?d:null; }catch(_){ return null; }
}
function writeDraftDel(){ try{ localStorage.removeItem(WRITE_DRAFT_KEY); }catch(_){ } }
function scheduleWriteDraft(){ clearTimeout(writeDraftTimer); writeDraftTimer=setTimeout(writeDraftSave,700); }
function writeLogAll(){
  try{ const o=JSON.parse(localStorage.getItem(WRITE_KEY)||'[]'); return Array.isArray(o)?o:[]; }catch(_){ return []; }
}
function writeLogFlush(arr){
  if(!aStore(WRITE_KEY,JSON.stringify(arr))) throw new Error('写作记录没有保存成功');
}
function writeLogAdd(rec){
  const arr=writeLogAll(); arr.unshift(rec); writeLogFlush(arr);
}
function writeLogCountToday(){ return writeLogAll().filter(x=>isToday(x.createdAt)).length; }
function writeWordPool(){
  const set=new Map();
  todayNewWords().forEach(w=>set.set(w.id,w));
  (state.words||[]).filter(w=>!w.mastered&&isDue(w)&&((w.srs&&w.srs.lapses)||0)>0).forEach(w=>set.set(w.id,w));
  weakSpeakLogs().slice(0,20).forEach(l=>{
    const w=state.words.find(x=>String(x.term).toLowerCase()===String(l.term).toLowerCase());
    if(w) set.set(w.id,w);
  });
  if(set.size<3){ (state.words||[]).filter(w=>!w.mastered).slice(0,8).forEach(w=>set.set(w.id,w)); }
  return [...set.values()].slice(0,8);
}
function openWriteModal(){
  const pool=writeWordPool();
  writeState={step:'pick',seq:0,words:pool,picked:pool.map(w=>w.id).slice(0,6),topic:'',promptCn:'',minWords:80,attempt:'',review:null};
  $('#writeTitle').textContent='写作练习';
  $('#writeSub').textContent='选词 → 出题 → 写作 → AI 批改 → 存成笔记';
  $('#writeModal').classList.add('show');
  /* 有没写完的草稿：接上题目和作文，词沿用今天能用的 */
  const dr=writeDraftGet();
  if(dr&&(dr.attempt||dr.topic)){
    writeState.topic=dr.topic||'';
    writeState.promptCn=dr.promptCn||'';
    writeState.minWords=parseInt(dr.minWords,10)||80;
    writeState.attempt=String(dr.attempt||'');
    const keep=((dr.picked||[]).filter(id=>pool.some(w=>w.id===id)));
    writeState.picked=keep.concat(writeState.picked).filter((v,i,a)=>a.indexOf(v)===i);
    if(writeState.topic) writeState.step='topic';
    toast('已恢复上次没写完的作文','ok');
  }
  writeRender();
}
function writeRender(){
  $('#writeLoading').classList.add('hidden');
  $('#writeBody').classList.remove('hidden');
  if(writeState.step==='pick') writeRenderPick();
  else if(writeState.step==='topic') writeRenderTopic();
  else if(writeState.step==='review') writeRenderReview();
}
function writeRenderPick(){
  const pool=writeState.words||[];
  const picked=writeState.picked||[];
  const chips=pool.length?pool.map(w=>{
    const on=picked.includes(w.id);
    return '<button class="wj-chip'+(on?' on':'')+'" data-wpick="'+w.id+'">'+esc(w.term)+'<small>'+esc((w.definition||'').split('\n')[0]||'暂无释义')+'</small></button>';
  }).join(''):'<div class="wj-empty">还没有可写的词，先攒几个生词再来。</div>';
  $('#writeContent').innerHTML=
    '<div class="wj-step-t">① 选词（勾 3-8 个今天想练的词）</div>'+
    '<div class="wj-chips">'+chips+'</div>'+
    (pool.length?'<div class="wj-hint">默认已挑好今天的新词和难词，可自由增删。</div>':'');
  $('#writeNext').textContent='出题 →';
  $('#writeBack').classList.add('hidden');
  $$('#writeContent [data-wpick]').forEach(b=>b.addEventListener('click',()=>{
    const id=b.dataset.wpick;
    const sel=(writeState.picked||[]).slice();
    const i=sel.indexOf(id);
    if(i>=0) sel.splice(i,1); else sel.push(id);
    writeState.picked=sel;
    writeRenderPick();
  }));
}
function writeRenderTopic(){
  const ws=writeState;
  const words=ws.words.filter(w=>(ws.picked||[]).includes(w.id));
  $('#writeNext').textContent='提交批改';
  $('#writeBack').classList.remove('hidden');
  $('#writeContent').innerHTML=
    '<div class="wj-step-t">② 写作（尽量用上：'+words.map(w=>esc(w.term)).join('、')+'）</div>'+
    '<div class="wj-topic"><div class="wj-topic-t">'+esc(ws.topic||'')+'</div><div class="wj-topic-d">'+esc(ws.promptCn||'')+'</div></div>'+
    '<textarea id="writeArea" class="wj-textarea" placeholder="在这里写你的英文段落…" autocomplete="off">'+esc(ws.attempt||'')+'</textarea>'+
    '<div class="wj-count" id="writeCount">0 词 · 建议 '+ws.minWords+' 词左右</div>';
  const area=$('#writeArea');
  if(area){
    area.focus();
    area.addEventListener('input',()=>{
      ws.attempt=area.value;
      const c=$('#writeCount');
      if(c) c.textContent=(area.value.trim().split(/\s+/).filter(Boolean).length)+' 词 · 建议 '+ws.minWords+' 词左右';
      scheduleWriteDraft();
    });
  }
}
function writeRenderReview(){
  const r=writeState.review||{};
  const score=Math.max(0,Math.min(100,parseInt(r.score,10)||0));
  const issues=(r.issues||[]).filter(x=>x&&x.en);
  $('#writeNext').textContent='存成笔记';
  $('#writeBack').classList.remove('hidden');
  $('#writeContent').innerHTML=
    '<div class="wj-step-t">③ 批改结果</div>'+
    '<div class="ai-fb">'+
      '<div class="ai-fb-top"><span class="ai-score big">'+score+' 分</span>'+(r.verdict?'<span class="ai-verdict">'+esc(String(r.verdict))+'</span>':'')+'</div>'+
      (r.comment?'<div class="ai-comment">'+esc(String(r.comment))+'</div>':'')+
    '</div>'+
    (issues.length?'<div class="wj-issues"><div class="wj-sec-t">逐句修改</div>'+
      issues.map(x=>'<div class="wj-issue"><div class="wj-i-en">'+esc(x.en)+'</div><div class="wj-i-fix">→ '+esc(x.fix||'')+'</div>'+(x.note?'<div class="wj-i-note">'+esc(x.note)+'</div>':'')+'</div>').join('')+'</div>':'')+
    (r.standard?'<div class="wj-standard"><div class="wj-sec-t">范文参考</div><div class="wj-standard-txt">'+esc(String(r.standard))+'</div></div>':'');
}
function writeGenTopic(){
  const words=writeState.words.filter(w=>(writeState.picked||[]).includes(w.id));
  const ctx=words.map(w=>'"'+w.term+'"（'+((w.definition||'').split('\n')[0]||'暂无释义')+'）').join('、');
  return aiCall([{role:'system',content:'你是英语写作教练。直接输出一个 JSON 对象本身：不要 markdown、不要 ```json 代码块、不要任何解释或前后缀文字。'},
    {role:'user',content:'学习者本周学了这些词：'+ctx+'。请出一道适合用这些词写作的题目。严格输出 JSON：{"topic":"英文主题，一句话，10 词以内","promptCn":"中文写作要求：写明场景与体裁（如 给朋友写一封邮件 / 写一篇球赛观后感 / 记录一天），要求写 80-120 词，必须自然用上这些词（尽量都用），并提醒注意什么","minWords":80}'}],{timeout:60000});
}
function writeJudge(){
  const words=writeState.words.filter(w=>(writeState.picked||[]).includes(w.id));
  const ctx=words.map(w=>'"'+w.term+'"').join('、');
  return aiCall([{role:'system',content:'你是严格的英语写作批改老师。'+toneSystem()+'直接输出一个 JSON 对象本身：不要 markdown、不要 ```json 代码块、不要任何解释或前后缀文字。'},
    {role:'user',content:'题目："'+(writeState.topic||'')+'"\n写作要求：'+(writeState.promptCn||'')+'\n要求用到的词：'+ctx+'\n学习者作文：\n'+(writeState.attempt||'')+'\n请批改。严格输出 JSON：{"score":0-100,"verdict":"很好/不错/需要改进/问题较多","comment":"中文总评：先肯定亮点再指出主要问题，150字内","issues":[{"en":"原文有问题的句子","fix":"修改后的地道表达","note":"中文说明为什么"},{"en":"","fix":"","note":""}],"standard":"一篇更好的完整范文（120词左右，自然用上这些词）"}'}],{timeout:60000});
}
function writeGenAndShow(){
  const picked=writeState.picked||[];
  const words=writeState.words.filter(w=>picked.includes(w.id));
  if(words.length<1){ toast('至少选 1 个词','warn'); return; }
  writeState.words=words;
  const mySeq=++writeState.seq;
  $('#writeBody').classList.add('hidden'); $('#writeLoading').classList.remove('hidden');
  $('#writeLoadStatus').textContent='正在出题…';
  writeGenTopic().then(r=>{
    if(mySeq!==writeState.seq) return;
    writeState.topic=String(r.topic||'自由写作').trim();
    writeState.promptCn=String(r.promptCn||'').trim();
    writeState.minWords=parseInt(r.minWords,10)||80;
    writeState.step='topic';
    writeRender();
  }).catch(err=>{
    if(mySeq!==writeState.seq) return;
    $('#writeLoading').classList.add('hidden'); $('#writeBody').classList.remove('hidden');
    toast(String(err&&err.message||'出题失败，请重试'),'warn');
  });
}
function writeSubmit(){
  const attempt=String(($('#writeArea')&&$('#writeArea').value)||writeState.attempt||'').trim();
  if(!attempt){ toast('先写一段再提交','warn'); return; }
  writeState.attempt=attempt;
  const mySeq=++writeState.seq;
  $('#writeBody').classList.add('hidden'); $('#writeLoading').classList.remove('hidden');
  $('#writeLoadStatus').textContent='正在批改…';
  writeJudge().then(r=>{
    if(mySeq!==writeState.seq) return;
    writeState.review=r||{};
    writeState.step='review';
    writeRender();
  }).catch(err=>{
    if(mySeq!==writeState.seq) return;
    $('#writeLoading').classList.add('hidden'); $('#writeBody').classList.remove('hidden');
    toast(String(err&&err.message||'批改失败，请重试'),'warn');
  });
}
function writeSaveNote(){
  const folderId=(ui.folder&&ui.folder!=='all')?ui.folder:((state.folders&&state.folders[0])?state.folders[0].id:'');
  const n={id:uid(),folderId:folderId,title:'写作 · '+(writeState.topic||'自由写作'),
    content:'<div><b>题目：</b>'+esc(writeState.topic||'')+'</div>'+
      '<div><b>要求：</b>'+esc(writeState.promptCn||'')+'</div><div><br></div>'+
      '<div class="nh">我的作文</div><div>'+esc(writeState.attempt||'').replace(/\n/g,'</div><div>')+'</div><div><br></div>'+
      '<div class="nh">AI 批改</div><div>'+esc((writeState.review&&writeState.review.comment)||'')+'</div>'+
      (writeState.review&&writeState.review.standard?'<div><b>范文：</b>'+esc(writeState.review.standard).replace(/\n/g,'</div><div>')+'</div>':''),
    createdAt:Date.now(),updatedAt:Date.now()};
  state.notes.unshift(n);
  save();
  writeLogAdd({id:uid(),createdAt:Date.now(),words:(writeState.words||[]).map(w=>w.term),topic:writeState.topic||'',attempt:writeState.attempt||'',score:writeState.review?Math.max(0,Math.min(100,parseInt(writeState.review.score,10)||0)):0});
  writeDraftDel();
  closeWriteModal();
  toast('已存成笔记，改好的版本可以直接用','ok');
  render();
}
function closeWriteModal(){
  if(writeState&&(writeState.step==='topic'||writeState.step==='review')) writeDraftSave();
  $('#writeModal').classList.remove('show');
  writeState.seq++;
  try{ if('speechSynthesis' in window) speechSynthesis.cancel(); }catch(e){}
}
/* ============ 原句自动入库 ============ */
function extractOrigSentence(range){
  try{
    if(!range) return '';
    const node=range.commonAncestorContainer;
    let host=node.nodeType===1?node:node.parentElement;
    if(!host||!editorWrap||!editorWrap.contains(host)) return '';
    while(host&&host!==bodyEl&&host.parentNode!==bodyEl) host=host.parentNode;
    if(!host||host===bodyEl||!host.parentNode||host.parentNode!==bodyEl) return '';
    const t=(host.textContent||'').replace(/\s+/g,' ').trim();
    if(t.length>240) return '';
    return t;
  }catch(_){ return ''; }
}
/* 把原文句放到例句第 1 条（标「原文」），已在列表里就不重复加 */
function ensureOrigFirst(){
  const os=wmState&&wmState.origSentence;
  if(!os) return;
  const list=wmState.examples||[];
  const hit=list.some(x=>String(x.en||'').trim().toLowerCase()===os.toLowerCase());
  if(hit) return;
  list.unshift({en:os,cn:'',sense:'原文'});
  wmState.examples=list;
}
/* ============ 核心搭配编辑 ============ */
function renderWmColls(){
  const box=$('#wmColls'); if(!box) return;
  const list=(wmState&&Array.isArray(wmState.collocations))?wmState.collocations:[];
  if(!list.length){
    box.innerHTML='<div class="coll-empty">还没有搭配。记「核心搭配」比单记单词更牢，如 pitch an idea（提方案）、grab a bite（随便吃点）。</div>';
    return;
  }
  box.innerHTML=list.map((c,i)=>'<span class="coll-chip" data-coll="'+i+'">'+esc(c)+'<i class="coll-x">✕</i></span>').join('');
}
function addWmColl(){
  const inp=$('#wmCollInput'); if(!inp) return;
  const v=String(inp.value||'').trim();
  if(!v){ toast('先输入一个搭配，如 pitch an idea','warn'); inp.focus(); return; }
  if(!Array.isArray(wmState.collocations)) wmState.collocations=[];
  if(wmState.collocations.indexOf(v)<0) wmState.collocations.push(v);
  inp.value=''; renderWmColls(); scheduleWmDraft(200);
}
function removeWmColl(i){
  if(!Array.isArray(wmState.collocations)) return;
  wmState.collocations.splice(i,1); renderWmColls(); scheduleWmDraft(200);
}

