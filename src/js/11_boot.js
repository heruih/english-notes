/* ============ 启动 ============ */
state=migrate(load());
aInit();
bInit();
applyTheme();
// Preserve existing image cache on upgrade.
/* 老标亮（标了词就到处亮）搬迁成「只亮当时那一处」 */
// Preserve existing highlights on upgrade.
if(!localStorage.getItem(LS_KEY)) save();
bindEvents();
bindSideSwipe();
render();
syncKbUI();
setTimeout(backupReminder,1600);
syncOnBoot();

/* 页面被切走 / 直接关掉（没点保存）：先把 empower 草稿落盘 */
window.addEventListener('pagehide',()=>{ try{ if(wmState&&!wmState.saved) wmDraftSave(); }catch(_){ } });
document.addEventListener('visibilitychange',()=>{
  if(document.visibilityState==='hidden'){ try{ if(wmState&&!wmState.saved) wmDraftSave(); }catch(_){ } }
});


