firebase.initializeApp(firebaseConfig);
const db = firebase.database();
const stateRef = db.ref('queue');

const DEFAULTS = {
  settings: {
    title: 'Queue Up', subtitle: '請排隊取號',
    note: 'Please keep your ticket and watch for the display announcement. 請保留籌號並留意顯示屏廣播。',
    counters: [
      { id: 1, name: 'Counter 1', nameZh: '一號櫃位' },
      { id: 2, name: 'Counter 2', nameZh: '二號櫃位' }
    ],
    tts: { languages: ['en','yue','zh'], rate: 1, volume: 1, repeat: 1 },
    adminPw: 'ktmc881485', // 預設管理員密碼 Default admin password
    userPw: 'ktmc2026'     // 預設操作密碼 Default operation password
  },
  session: { prefix: 'A', next: 1 }, tickets: {}, lastCall: null
};

let STATE = null; const listeners = [];

/* ===== 雙重密碼保護 Dual Password Protection ===== */
let KTMC_ADMIN_AUTHED = sessionStorage.getItem('ktmcAdminOk') === '1';
let KTMC_USER_AUTHED = sessionStorage.getItem('ktmcUserOk') === '1';
let KTMC_AUTHED = KTMC_ADMIN_AUTHED || KTMC_USER_AUTHED;

let dbStarted = false;
function startDb(){
  if (dbStarted || !KTMC_AUTHED) return;
  dbStarted = true;
  stateRef.on('value', s => { STATE = s.val() || JSON.parse(JSON.stringify(DEFAULTS)); listeners.forEach(f => f(STATE)); });
  stateRef.once('value').then(s => { if (!s.exists()) stateRef.set(DEFAULTS); });
}
if (KTMC_AUTHED) startDb();

function checkAdminPw(inputPw, onResult){
  stateRef.child('settings/adminPw').once('value').then(snap => {
    const stored = snap.val() || 'ktmc881485';
    if (inputPw === stored){
      KTMC_ADMIN_AUTHED = true; KTMC_AUTHED = true;
      sessionStorage.setItem('ktmcAdminOk', '1');
      startDb(); onResult(true);
    } else onResult(false);
  }).catch(() => {
    if (inputPw === 'ktmc881485'){
      KTMC_ADMIN_AUTHED = true; KTMC_AUTHED = true;
      sessionStorage.setItem('ktmcAdminOk', '1');
      startDb(); onResult(true);
    } else onResult(false);
  });
}

function checkUserPw(inputPw, onResult){
  stateRef.child('settings/userPw').once('value').then(snap => {
    const stored = snap.val() || 'ktmc2026';
    if (inputPw === stored){
      KTMC_USER_AUTHED = true; KTMC_AUTHED = true;
      sessionStorage.setItem('ktmcUserOk', '1');
      startDb(); onResult(true);
    } else onResult(false);
  }).catch(() => {
    if (inputPw === 'ktmc2026'){
      KTMC_USER_AUTHED = true; KTMC_AUTHED = true;
      sessionStorage.setItem('ktmcUserOk', '1');
      startDb(); onResult(true);
    } else onResult(false);
  });
}

function changeUserPw(newPw, onDone){ stateRef.child('settings/userPw').set(newPw).then(onDone).catch(onDone); }
function changeAdminPw(newPw, onDone){ stateRef.child('settings/adminPw').set(newPw).then(onDone).catch(onDone); }

function bindLoginForm(isAdmin) {
  const overlay = document.getElementById('ktmcLogin');
  if (!overlay) return;
  const btn = document.getElementById('ktmcLoginBtn');
  const input = document.getElementById('ktmcLoginPw');
  const err = document.getElementById('ktmcLoginErr');
  const title = document.getElementById('ktmcLoginTitle');
  const desc = document.getElementById('ktmcLoginDesc');
  const descEn = document.getElementById('ktmcLoginDescEn');

  if (isAdmin) {
    title.innerHTML = '🔒 Admin Login 管理員登入';
    desc.textContent = '請輸入管理員密碼';
    descEn.textContent = 'Enter the admin password to continue';
  } else {
    title.innerHTML = '🔒 Operation Login 操作登入';
    desc.textContent = '請輸入操作密碼';
    descEn.textContent = 'Enter the operation password to continue';
  }

  const isAuthed = isAdmin ? KTMC_ADMIN_AUTHED : KTMC_USER_AUTHED;
  if (isAuthed) { overlay.style.display = 'none'; return; }

  const tryLogin = () => {
    const v = input.value; if (!v) return;
    const checkFn = isAdmin ? checkAdminPw : checkUserPw;
    checkFn(v, ok => {
      if (ok) {
        overlay.style.display = 'none';
        if (typeof window.onAfterLogin === 'function') window.onAfterLogin();
        else location.reload();
      } else {
        err.textContent = '密碼錯誤 Wrong password';
        input.value = ''; input.focus();
      }
    });
  };
  btn.onclick = tryLogin;
  input.addEventListener('keydown', e => { if (e.key === 'Enter') tryLogin(); });
  input.focus();
}
/* ================================================ */

function onState(f){ listeners.push(f); if (STATE) f(STATE); }
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

async function nextSeq(path){
  let v;
  await stateRef.child(path).transaction(c => { v = (c||0)+1; return v; });
  return v;
}

async function takeTicket(){
  let no; const pre = STATE.session.prefix;
  await stateRef.child('session/next').transaction(c => { no = c||1; return no+1; });
  const t = { no, label: pre+String(no).padStart(3,'0'), time: nowLabel(), status:'waiting', counter:null };
  await stateRef.child('tickets').push(t);
  await stateRef.child('lastCall').set(null);
  return t;
}

/* 呼叫下一位（自動完成當前號碼） Call next (auto-complete the current ticket) */
async function callNext(id){
  const updates = {};
  const cur = currentOf(id);
  if (cur) updates['tickets/' + cur.key + '/status'] = 'done';

  const w = waiting()[0]; 
  if (!w) {
    if (Object.keys(updates).length > 0) await stateRef.update(updates);
    return null;
  }
  const seq = await nextSeq('callSeq');
  updates['tickets/' + w.key + '/status'] = 'called';
  updates['tickets/' + w.key + '/counter'] = Number(id);
  updates['tickets/' + w.key + '/calledAt'] = Date.now();
  updates['lastCall'] = { ticket:{label:w.label,no:w.no}, counter:Number(id), at:Date.now(), seq };
  await stateRef.update(updates);
  return w;
}

async function recall(id){
  const t = currentOf(id); if (!t) return;
  const seq = await nextSeq('callSeq');
  await stateRef.update({
    ['tickets/'+t.key+'/calledAt']: Date.now(),
    lastCall: { ticket:{label:t.label,no:t.no}, counter:Number(id), at:Date.now(), seq }
  });
}

/* 指定號碼呼叫（自動完成當前號碼） Call a specified number (auto-complete the current ticket) */
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

async function completeTicket(key){ await stateRef.child('tickets/'+key+'/status').set('done'); }
async function complete(id){ const t = currentOf(id); if (t) await completeTicket(t.key); }

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

async function stopCall(id){
  const seq = await nextSeq('stopSeq');
  await stateRef.child('lastStop').set({ counter: Number(id), at: Date.now(), seq });
}

async function stopAll(){
  const seq = await nextSeq('stopSeq');
  await stateRef.child('lastStop').set({ counter: '*', at: Date.now(), seq });
}

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
async function saveSettings(s){ await stateRef.child('settings').set(s); }

async function clearTickets(){
  await stateRef.update({
    tickets: null, lastCall: null, lastUndo: null, lastStop: null, nowPlaying: null, 'session/next': 1
  });
}

async function pauseCounter(id){ await stateRef.child('counters/' + id + '/paused').set(true); }
async function resumeCounter(id){ await stateRef.child('counters/' + id + '/paused').set(false); }
function isCounterPaused(id){ return !!(STATE && STATE.counters && STATE.counters[id] && STATE.counters[id].paused); }
