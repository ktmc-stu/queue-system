/* ===== KTMC 排隊系統核心邏輯 KTMC Queue System Core Logic ===== */

/* ===== Firebase 設定（已內嵌，無需 config.js）
   Firebase configuration (inlined; config.js no longer required) ===== */
const firebaseConfig = {
  apiKey: "AIzaSyDMBiSM4oGSDE3khRISIxtxDCJJTLaxm0",
  authDomain: "ktmc-queue-system.firebaseapp.com",
  databaseURL: "https://ktmc-queue-system-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "ktmc-queue-system",
  storageBucket: "ktmc-queue-system.firebasestorage.app",
  messagingSenderId: "1098822703041",
  appId: "1:1098822703041:web:c010a95bf5c71c478a0140"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.database();
const stateRef = db.ref('queue');

/* ===== 靜默匿名登入：僅為滿足 Rules 的 auth != null，非人類登入
   Silent anonymous sign-in: satisfies the Rules' auth != null requirement only; not a human login ===== */
function authAvailable(){ return typeof firebase !== 'undefined' && typeof firebase.auth === 'function'; }
function silentSignIn(){
  if (!authAvailable()) return;
  firebase.auth().signInAnonymously().catch(e => console.error('Anonymous sign-in failed 匿名登入失敗：', e.code || e.message));
}
function whenAuthReady(){
  return new Promise(res => {
    if (!authAvailable()) return res(false);
    let done = false;
    const finish = v => { if (!done){ done = true; res(v); } };
    const un = firebase.auth().onAuthStateChanged(u => { if (u){ try{ un(); }catch(e){} finish(true); } });
    silentSignIn();
    setTimeout(() => finish(false), 5000);   // 超時降級 Timeout fallback
  });
}
silentSignIn();
if (!authAvailable()) console.error('firebase-auth-compat.js 未載入 not loaded');

const DEFAULTS = {
  settings: {
    title: 'Queue Up', subtitle: '請排隊取號',
    note: 'Please keep your ticket and watch for the display announcement. 請保留籌號並留意顯示屏廣播。',
    counters: [
      { id: 1, name: 'Counter 1', nameZh: '一號櫃位' },
      { id: 2, name: 'Counter 2', nameZh: '二號櫃位' }
    ],
    tts: { languages: ['en','yue','zh'], rate: 1, volume: 1, repeat: 1 },
    adminPw: 'ktmc881485',   // 預設管理員密碼 Default administrator password
    userPw: 'ktmc2026'       // 預設操作密碼 Default operation password
  },
  session: { prefix: 'A', next: 1 }, tickets: {}, lastCall: null
};

let STATE = null; const listeners = [];

/* ===== 雙重密碼保護 Dual Password Protection ===== */
const DEFAULT_ADMIN_PW = 'ktmc881485';
const DEFAULT_USER_PW = 'ktmc2026';

let KTMC_ADMIN_AUTHED = sessionStorage.getItem('ktmcAdminOk') === '1';
let KTMC_USER_AUTHED  = sessionStorage.getItem('ktmcUserOk') === '1';
let KTMC_AUTHED = KTMC_ADMIN_AUTHED || KTMC_USER_AUTHED;

/* 密碼驗證通過且 Firebase 登入就緒後才連接資料庫
   Connect to the database only after password verification and Firebase sign-in are ready */
let dbStarted = false;
async function startDb(){
  if (dbStarted || !KTMC_AUTHED) return;
  dbStarted = true;
  await whenAuthReady();
  stateRef.on('value', s => { STATE = s.val() || JSON.parse(JSON.stringify(DEFAULTS)); listeners.forEach(f => f(STATE)); });
  stateRef.once('value').then(s => { if (!s.exists()) stateRef.set(DEFAULTS); });
}
if (KTMC_AUTHED) startDb();

/* 驗證管理員密碼 Verify administrator password */
function checkAdminPw(inputPw, onResult){
  whenAuthReady().then(() => {
    stateRef.child('settings/adminPw').once('value').then(snap => {
      const stored = snap.val() || DEFAULT_ADMIN_PW;
      if (inputPw === stored){
        KTMC_ADMIN_AUTHED = true; KTMC_AUTHED = true;
        sessionStorage.setItem('ktmcAdminOk', '1');
        startDb(); onResult(true);
      } else onResult(false);
    }).catch(() => {
      /* 資料庫未能連線時使用預設密碼 Fallback to default password when database is unreachable */
      if (inputPw === DEFAULT_ADMIN_PW){
        KTMC_ADMIN_AUTHED = true; KTMC_AUTHED = true;
        sessionStorage.setItem('ktmcAdminOk', '1');
        startDb(); onResult(true);
      } else onResult(false);
    });
  });
}

/* 驗證操作密碼 Verify operation password */
function checkUserPw(inputPw, onResult){
  whenAuthReady().then(() => {
    stateRef.child('settings/userPw').once('value').then(snap => {
      const stored = snap.val() || DEFAULT_USER_PW;
      if (inputPw === stored){
        KTMC_USER_AUTHED = true; KTMC_AUTHED = true;
        sessionStorage.setItem('ktmcUserOk', '1');
        startDb(); onResult(true);
      } else onResult(false);
    }).catch(() => {
      if (inputPw === DEFAULT_USER_PW){
        KTMC_USER_AUTHED = true; KTMC_AUTHED = true;
        sessionStorage.setItem('ktmcUserOk', '1');
        startDb(); onResult(true);
      } else onResult(false);
    });
  });
}

/* 更改操作密碼（管理專用） Change operation password (admin only) */
function changeUserPw(newPw, onDone){ stateRef.child('settings/userPw').set(newPw).then(onDone).catch(onDone); }
/* 更改管理員密碼 Change administrator password */
function changeAdminPw(newPw, onDone){ stateRef.child('settings/adminPw').set(newPw).then(onDone).catch(onDone); }

/* 登出（清除本瀏覽器登入狀態） Logout (clear login state of this browser) */
function logout(){
  sessionStorage.removeItem('ktmcAdminOk');
  sessionStorage.removeItem('ktmcUserOk');
  location.reload();
}

/* 綁定登入遮罩；isAdmin 決定使用哪套密碼
   Bind the login overlay; isAdmin selects which password set to verify */
function bindLoginForm(isAdmin){
  const overlay = document.getElementById('ktmcLogin');
  if (!overlay) return;
  const btn    = document.getElementById('ktmcLoginBtn');
  const input  = document.getElementById('ktmcLoginPw');
  const err    = document.getElementById('ktmcLoginErr');
  const title  = document.getElementById('ktmcLoginTitle');
  const desc   = document.getElementById('ktmcLoginDesc');
  const descEn = document.getElementById('ktmcLoginDescEn');
  if (!btn || !input) return;

  if (isAdmin){
    if (title)  title.innerHTML = '🔒 Admin Login 管理員登入';
    if (desc)   desc.textContent = '請輸入管理員密碼';
    if (descEn) descEn.textContent = 'Enter the administrator password to continue';
  } else {
    if (title)  title.innerHTML = '🔒 Operation Login 操作登入';
    if (desc)   desc.textContent = '請輸入操作密碼';
    if (descEn) descEn.textContent = 'Enter the operation password to continue';
  }

  const authed = isAdmin ? KTMC_ADMIN_AUTHED : KTMC_USER_AUTHED;
  if (authed){ overlay.style.display = 'none'; return; }

  const tryLogin = () => {
    const v = input.value;
    if (!v) return;
    if (err){ err.style.color = '#64748b'; err.textContent = '驗證中… Verifying…'; }
    (isAdmin ? checkAdminPw : checkUserPw)(v, ok => {
      if (ok){
        overlay.style.display = 'none';
        if (typeof window.onAfterLogin === 'function') window.onAfterLogin();
        else location.reload();
      } else {
        if (err){ err.style.color = '#dc2626'; err.textContent = '密碼錯誤 Wrong password'; }
        input.value = '';
        input.focus();
      }
    });
  };
  btn.onclick = tryLogin;
  input.addEventListener('keydown', e => { if (e.key === 'Enter') tryLogin(); });
  input.focus();
}
/* ================================================ */

/* ===== 狀態訂閱 State subscription ===== */
function onState(f){ listeners.push(f); if (STATE) f(STATE); }

/* ===== 工具函數 Utility functions ===== */
function nowLabel(){
  const d=new Date(), p=n=>String(n).padStart(2,'0');
  return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}
function ticketsArr(){ return Object.entries(STATE.tickets||{}).map(([key,t])=>({key,...t})); }
function waiting(){ return ticketsArr().filter(t=>t.status==='waiting').sort((a,b)=>a.no-b.no); }
function currentOf(id){
  return ticketsArr()
    .filter(t=>t.status==='called' && String(t.counter)===String(id))
    .sort((a,b)=>(b.calledAt||0)-(a.calledAt||0))[0];
}
function counterById(id){ return (STATE.settings.counters||[]).find(c=>String(c.id)===String(id))||{id:id,name:'Counter '+id,nameZh:'櫃位 '+id}; }
function toast(m,ms=2500){ const t=document.getElementById('toast'); if(!t)return; t.textContent=m; t.classList.add('show'); clearTimeout(t._h); t._h=setTimeout(()=>t.classList.remove('show'),ms); }

/* 原子遞增序號：確保並發操作時序號唯一
   Atomic sequence increment: ensures unique seq under concurrency */
async function nextSeq(path){
  let v;
  await stateRef.child(path).transaction(c => { v = (c||0)+1; return v; });
  return v;
}

/* ===== 取號 Take a ticket ===== */
async function takeTicket(){
  let no; const pre = STATE.session.prefix;
  await stateRef.child('session/next').transaction(c => { no = c||1; return no+1; });
  const t = { no, label: pre+String(no).padStart(3,'0'), time: nowLabel(), status:'waiting', counter:null };
  await stateRef.child('tickets').push(t);
  await stateRef.child('lastCall').set(null);
  return t;
}

/* 呼叫下一位（自動完成當前號碼）
   Call next (auto-complete the current ticket) */
async function callNext(id){
  const updates = {};

  // 自動完成當前正在服務的號碼 Auto-complete the ticket currently being served
  const cur = currentOf(id);
  if (cur) updates['tickets/' + cur.key + '/status'] = 'done';

  // 檢查等候隊列 Check the waiting queue
  const w = waiting()[0];
  if (!w) {
    // 若無人排隊但已完成當前號碼，仍然更新資料庫
    // If no one is waiting but a ticket was completed, still update the database
    if (Object.keys(updates).length > 0) await stateRef.update(updates);
    return null;
  }

  // 呼叫下一位 Call the next ticket
  const seq = await nextSeq('callSeq');
  updates['tickets/' + w.key + '/status'] = 'called';
  updates['tickets/' + w.key + '/counter'] = Number(id);
  updates['tickets/' + w.key + '/calledAt'] = Date.now();
  updates['lastCall'] = { ticket:{label:w.label,no:w.no}, counter:Number(id), at:Date.now(), seq };

  await stateRef.update(updates);
  return w;
}

/* 重新呼叫 Recall */
async function recall(id){
  const t = currentOf(id); if (!t) return;
  const seq = await nextSeq('callSeq');
  await stateRef.update({
    ['tickets/'+t.key+'/calledAt']: Date.now(),
    lastCall: { ticket:{label:t.label,no:t.no}, counter:Number(id), at:Date.now(), seq }
  });
}

/* 指定號碼呼叫（自動完成當前號碼）
   Call a specified number (auto-complete the current ticket) */
async function callNumber(id, raw){
  const num = Number(String(raw).toUpperCase().replace(/^[A-Z]+/,''));
  const t = ticketsArr().find(t=>t.no===num && t.status!=='done'); if (!t) return null;

  const updates = {};
  const cur = currentOf(id);
  if (cur) updates['tickets/' + cur.key + '/status'] = 'done';

  const seq = await nextSeq('callSeq');
  updates['tickets/' + t.key + '/status'] = 'called';
  updates['tickets/' + t.key + '/counter'] = Number(id);
  updates['tickets/' + t.key + '/calledAt'] = Date.now();
  updates['lastCall'] = { ticket:{label:t.label,no:t.no}, counter:Number(id), at:Date.now(), seq };

  await stateRef.update(updates);
  return t;
}

/* 完成 Complete */
async function completeTicket(key){ await stateRef.child('tickets/'+key+'/status').set('done'); }
async function complete(id){ const t = currentOf(id); if (t) await completeTicket(t.key); }

/* 撤回：僅限自己櫃位；籌號返回等候隊列
   Undo: own counter only; the ticket returns to the waiting queue */
async function undoCall(id){
  const t = currentOf(id); if (!t) return null;
  const seq = await nextSeq('undoSeq');
  await stateRef.update({
    ['tickets/'+t.key+'/status']: 'waiting',
    ['tickets/'+t.key+'/counter']: null,
    ['tickets/'+t.key+'/calledAt']: null,
    lastUndo: { label: t.label, counter: Number(id), at: Date.now(), seq }
  });
  return t;
}

/* 停止播報：僅限自己櫃位 Stop announcement: own counter only */
async function stopCall(id){
  const seq = await nextSeq('stopSeq');
  await stateRef.child('lastStop').set({ counter: Number(id), at: Date.now(), seq });
}

/* 全部停止（管理專用） Stop all (admin only) */
async function stopAll(){
  const seq = await nextSeq('stopSeq');
  await stateRef.child('lastStop').set({ counter: '*', at: Date.now(), seq });
}

/* ===== 時段管理 Session management ===== */
async function setPrefix(p){
  const ups = {};
  ticketsArr().forEach(t => { if (t.status==='waiting') ups['tickets/'+t.key+'/status'] = 'expired'; });
  ups['session'] = { prefix: p, next: 1 }; ups['lastCall'] = null;
  await stateRef.update(ups);
}
async function advance(){
  const c = STATE.session.prefix;
  await setPrefix(c.length===1 ? String.fromCharCode(c.charCodeAt(0)+1) : c+'A');
}

/* 儲存設定（改用 update，避免覆蓋密碼欄位）
   Save settings (update is used so the password fields are not overwritten) */
async function saveSettings(s){ await stateRef.child('settings').update(s); }

/* 清除所有籌號數據 Clear all ticket data */
async function clearTickets(){
  await stateRef.update({
    tickets: null,
    lastCall: null,
    lastUndo: null,
    lastStop: null,
    nowPlaying: null,
    'session/next': 1
  });
}

/* ===== 櫃位暫停／恢復服務 Pause / resume counter service ===== */
async function pauseCounter(id){ await stateRef.child('counters/' + id + '/paused').set(true); }
async function resumeCounter(id){ await stateRef.child('counters/' + id + '/paused').set(false); }
function isCounterPaused(id){ return !!(STATE && STATE.counters && STATE.counters[id] && STATE.counters[id].paused); }
