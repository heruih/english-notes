/* ============ 启动 ============ */
state=migrate(load());
try{aInit();}catch(e){console.error('学习模块初始化失败',e);}
try{bInit();}catch(e){console.error('同步模块初始化失败',e);}
try{aiDialogueHistoryMigrate();}catch(e){}
applyTheme();
// Preserve existing image cache on upgrade.
/* 老标亮（标了词就到处亮）搬迁成「只亮当时那一处」 */
// Preserve existing highlights on upgrade.
if(!localStorage.getItem(LS_KEY)) save();
try{bindEvents();}catch(e){console.error('界面事件绑定失败',e);}
try{bindSideSwipe();}catch(e){console.error('侧滑绑定失败',e);}
try{render();}catch(e){console.error('页面渲染失败',e);const box=document.querySelector('#noteList');if(box)box.innerHTML='<div class="empty-state"><b>页面初始化没有完成</b><br>请刷新页面；如果仍为空，请从旧文件导出完整备份后导入。</div>';}
syncKbUI();
setTimeout(backupReminder,1600);
syncOnBoot();

/* 页面被切走 / 直接关掉（没点保存）：先把 empower 草稿落盘 */
window.addEventListener('pagehide',()=>{ try{ if(wmState&&!wmState.saved) wmDraftSave(); }catch(_){ } });
document.addEventListener('visibilitychange',()=>{
  if(document.visibilityState==='hidden'){ try{ if(wmState&&!wmState.saved) wmDraftSave(); }catch(_){ } }
});


