
/* ===== 01_core.js · 工具函数 / 数据模型 / 间隔复习 / 迁移 / 保存 ===== */

'use strict';
/* ============ 工具函数 ============ */
const $=(s,r)=>document.querySelector(s);
const $$=(s,r)=>[...(r||document).querySelectorAll(s)];
const uid=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,7);
const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmtDate=t=>{
  const d=new Date(t), nd=new Date();
  if(d.toDateString()===nd.toDateString()) return d.toTimeString().slice(0,5);
  return (d.getMonth()+1)+'月'+d.getDate()+'日';
};
const snippet=html=>{
  const div=document.createElement('div'); div.innerHTML=html||'';
  return div.textContent.replace(/\s+/g,' ').trim().slice(0,52);
};
const SOURCE_LABEL={ai:'AI 生成',dict:'词典',manual:'手动',demo:'示例',shot:'截图'};

/* ============ 数据模型与持久化 ============ */
const LS_KEY='english-notes-app-v1';
let state=null;
let ui={sideOpen:false,mode:'today',folder:'all',note:null,tag:null,lastNote:null,selectedRange:null,empowerText:'',wordFilter:'all',prevMode:'list',search:'',wordSort:'time',wordTag:'',selMode:false,sel:[],logTerm:'',tagEdit:false,tagNewOpen:false};

function defaultState(){
  const t=Date.now();
  const f={id:'f_welcome',name:'英语学习',createdAt:t};
  const n={id:'n_welcome',folderId:'f_welcome',title:'欢迎使用英语学习笔记',
    content:'<div>这是一篇示例笔记，你可以直接删除，或留着当使用说明。</div><div><br></div><div>怎么用？选中下面这句英文里的单词 <b>pitch</b> 试试：</div><div><br></div><div>I need to pitch my idea to the client tomorrow.</div><div><br></div><div>选中单词后，屏幕下方会弹出蓝色「empower」按钮：点它，AI 会自动挑 <b>2-3 句典型例句</b>（配中文翻译，覆盖不同义项），你不用手写；释义和标签按自己的习惯填，例句也能逐句发音、跟读。</div><div><br></div><div>左侧可以新建、删除文件夹；点「标签聚合」可以按标签查看所有生词；点「表达库」可以管理全部单词。</div><div><br></div><div>提示：先在左下角「设置」里填入任意 OpenAI 兼容的 API Key（DeepSeek / 智谱 / OpenAI 等，点一下服务商按钮就会自动填好地址和模型），例句才会自动生成；不配置也能用免费词典查询，断网时可直接手动填写。</div>',
    createdAt:t,updatedAt:t};
  const words=[
    {id:'w_pitch',term:'pitch',phonetic:'/pɪtʃ/',definition:'v. 推销、陈述（想法）；n. 音高\n职场里常指「向客户或领导做提案陈述」。',
     examples:[{en:'She pitched the new campaign to the board.',cn:'她向董事会陈述了新营销方案。'},{en:'The sales team gave their pitch in a ten-minute meeting.',cn:'销售团队在十分钟的会议里做了推销陈述。'}],
     tags:['职场'],notes:[{noteId:'n_welcome',noteTitle:'欢迎使用英语学习笔记'}],source:'demo',createdAt:t,updatedAt:t},
    {id:'w_deadline',term:'deadline',phonetic:'/ˈdedlaɪn/',definition:'n. 截止日期、最后期限',
     examples:[{en:'We need to hit the deadline on Friday.',cn:'我们得在周五赶上截止日期。'}],
     tags:['职场'],notes:[],source:'demo',createdAt:t,updatedAt:t},
    {id:'w_grab',term:'grab',phonetic:'/ɡræb/',definition:'v. 抓取、迅速拿到（口语常用）',
     examples:[{en:'Let me grab a coffee first.',cn:'我先去弄杯咖啡。'},{en:'I grabbed a seat by the window.',cn:'我抢到了靠窗的座位。'}],
     tags:['日常'],notes:[],source:'demo',createdAt:t,updatedAt:t}
  ];
  return {folders:[],notes:[],words:[],aiLog:[],grave:[],tagList:['职场','日常'],meta:{backupAt:null,sync:{provider:'gist',ghToken:'',ghGistId:'',url:'',user:'',pass:'',auto:true,lastAt:0,lastBy:''}},
    settings:{baseUrl:'',apiKey:'',model:'',tone:'friend',theme:'dark',fs:'m'}};
}
/* ============ 间隔复习（Leitner 分箱） ============ */
const SRS_DAYS=[0,0,1,3,7,15,30];   // 箱位 -> 间隔天数
const SRS_LABEL=['新词','学习中','1 天后','3 天后','7 天后','15 天后','30 天后'];
const DAY=86400000;
function ensureSrs(w){
  if(!w.srs||typeof w.srs.box!=='number'||!isFinite(w.srs.due)){
    w.srs={box:w.mastered?6:1,due:Date.now(),last:0,reps:0,lapses:0};
  }
  w.srs.box=Math.max(1,Math.min(6,w.srs.box));
  return w.srs;
}
function srsDue(w){ return w.srs&&Number.isFinite(w.srs.due)?w.srs.due:0; }
function isDue(w){ return srsDue(w)<=Date.now(); }
function dueList(){ return state.words.filter(w=>!aPending(w)&&isDue(w)); }
function dueCount(){ return dueList().length; }
function srsNextLabel(w){
  const s=w.srs||{due:0};
  if(s.due<=Date.now()) return '现在到期';
  const d=Math.ceil((s.due-Date.now())/DAY);
  return d<=1?'明天':'约 '+d+' 天后';
}
/* grade: 0=忘了 1=有点难 2=记住了 */
function srsGrade(w,grade){
  const s=ensureSrs(w);
  const now=Date.now();
  s.reps=(s.reps||0)+1; s.last=now;
  if(grade===0){
    s.lapses=(s.lapses||0)+1;
    s.box=Math.max(1,s.box-1);
    s.due=now+600000;              // 10 分钟后再来一次
  }else if(grade===1){
    s.box=Math.max(1,s.box);
    s.due=now+Math.max(1,SRS_DAYS[s.box])*DAY*0.6;
  }else{
    s.box=Math.min(6,s.box+1);
    s.due=now+SRS_DAYS[s.box]*DAY;
  }
  w.mastered=s.box>=6;
  w.updatedAt=now;
  return s;
}
function srsSummary(){
  const all=state.words;
  const due=dueList().length;
  const fresh=all.filter(w=>!w.srs||!w.srs.reps).length;
  const done=all.filter(w=>w.mastered).length;
  return {all:all.length,due,fresh,done};
}

function migrate(d){
  d.aiLog=Array.isArray(d.aiLog)?d.aiLog:[];
  d.grave=Array.isArray(d.grave)?d.grave:[];
  d.meta=(d.meta&&typeof d.meta==='object')?d.meta:{backupAt:null};
  d.meta.sync=Object.assign({provider:'gist',ghToken:'',ghGistId:'',url:'',user:'',pass:'',auto:true,lastAt:0,lastBy:''},d.meta.sync||{});
  if(!d.meta.sync.provider) d.meta.sync.provider='gist';
  if(!d.meta.device) d.meta.device=uid();
  d.settings=Object.assign({baseUrl:'',apiKey:'',model:'',tone:'friend',theme:'dark',fs:'m'},d.settings||{});
  if(!Array.isArray(d.folders)) d.folders=[];
  if(!Array.isArray(d.notes)) d.notes=[];
  if(!Array.isArray(d.words)) d.words=[];
  /* 标签类别表：老数据没有这个字段时，从已有单词的标签里补齐（一个都不丢） */
  const tl=Array.isArray(d.tagList)?d.tagList.filter(t=>typeof t==='string'&&t.trim()):[];
  d.tagList=tl;
  d.words.forEach(w=>{
    (Array.isArray(w.tags)?w.tags:[]).forEach(t=>{ if(t&&d.tagList.indexOf(t)<0) d.tagList.push(t); });
    // Existing vocabulary records are not normalized on upgrade.
  });
  return d;
}
function load(){
  try{
    const d=JSON.parse(localStorage.getItem(LS_KEY));
    if(d&&Array.isArray(d.folders)&&Array.isArray(d.notes)&&Array.isArray(d.words)) return migrate(d);
  }catch(e){}
  return defaultState();
}
/* 主题 / 字号 */
function applyTheme(){
  const st=state&&state.settings||{};
  document.documentElement.setAttribute('data-theme',st.theme==='light'?'light':'dark');
  document.documentElement.setAttribute('data-fs',st.fs||'m');
  const mt=document.querySelector('meta[name="theme-color"]');
  if(mt) mt.setAttribute('content',st.theme==='light'?'#ffffff':'#000000');
}
function save(skipSync){
  if(!aStore(LS_KEY,JSON.stringify(state))) throw new Error('保存失败：请先导出完整备份并释放浏览器空间');
  if(!skipSync) scheduleSync();
}


