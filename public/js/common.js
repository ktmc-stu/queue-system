/* 密碼驗證通過且 Firebase 登入就緒後才連接資料庫
   Connect to the database only after password verification and Firebase sign-in are ready */
let dbStarted = false;
async function startDb(){
  if (dbStarted || !KTMC_AUTHED) return;
  dbStarted = true;
  
  const authOk = await whenAuthReady();
  if (!authOk) {
    console.error('Firebase Auth 未就緒，資料庫讀取可能會被拒絕 Firebase Auth not ready.');
  }

  // 加入錯誤捕捉，如果權限被拒會直接彈出提示
  stateRef.on('value', 
    s => { 
      STATE = s.val() || JSON.parse(JSON.stringify(DEFAULTS)); 
      listeners.forEach(f => f(STATE)); 
    },
    err => {
      console.error('Firebase 讀取錯誤 Read error:', err.code, err.message);
      toast('⚠️ 資料載入失敗：' + (err.code || 'Permission denied') + '。請檢查授權域名設定。 Data load failed.');
    }
  );
  
  stateRef.once('value')
    .then(s => { if (!s.exists()) stateRef.set(DEFAULTS); })
    .catch(e => console.error('Firebase 初始化錯誤 Init error:', e));
}
if (KTMC_AUTHED) startDb();
