import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getDatabase, ref, get, set, update, onValue } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

const app  = initializeApp(window.FIREBASE_CONFIG);
const auth = getAuth(app);
const db   = getDatabase(app);
const CFG  = window.APP_CONFIG;

const QS = window.QS = { db, CFG, ready: false };
const readyCbs = [];
QS.onReady = fn => QS.ready ? fn() : readyCbs.push(fn);

onAuthStateChanged(auth, user => {
  if (!user) signInAnonymously(auth).catch(e => console.error(e));
  else { QS.ready = true; readyCbs.splice(0).forEach(f => f()); }
});

/* ---- DB helpers ---- */
QS.get = p => get(ref(db, p)).then(s => s.val());
QS.set = (p, v) => set(ref(db, p), v);
QS.update = obj => update(ref(db), obj);
QS.on = (p, cb) => onValue(ref(db, p), s => cb(s.val()));

/* ---- 排隊邏輯 ---- */
const padNo = (prefix, n) => prefix + String(n).padStart(CFG.session.pad, '0');

QS.waitingList = tickets => Object.entries(tickets || {})
  .filter(([, t]) => t.status === 'waiting')
  .sort((a, b) => ((b[1].front ? 1 : 0) - (a[1].front ? 1 : 0)) || (a[1].time - b[1].time))
  .map(([no]) => no);

QS.take = async () => {
  const sess  = (await QS.get('session')) || { prefix: CFG.session.startFrom, seq: 0 };
  const ahead = QS.waitingList(await QS.get('tickets')).length;
  const seq   = (sess.seq || 0) + 1;
  const no    = padNo(sess.prefix, seq);
  await QS.update({
    [`tickets/${no}`]: { status: 'waiting', time: Date.now(), session: sess.prefix },
    'session/seq': seq
  });
  return { no, session: sess.prefix, ahead, time: Date.now() };
};

QS.callNext = async cid => {
  const tickets = (await QS.get('tickets')) || {};
  const cur = await QS.get(`counters/${cid}/current`);
  const patch = {};
  if (cur) patch[`tickets/${cur}/status`] = 'done';      // 自動完成當前號
  const waiting = QS.waitingList(tickets);
  if (!waiting.length) throw new Error('目前冇人排隊');
  const no = waiting[0];
  patch[`tickets/${no}/status`]  = 'called';
  patch[`tickets/${no}/counter`] = String(cid);
  patch[`counters/${cid}/current`] = no;
  patch['lastCall'] = { no, counter: String(cid), time: Date.now(), recall: false };
  await QS.update(patch);
  return no;
};

QS.recall = async cid => {
  const cur = await QS.get(`counters/${cid}/current`);
  if (!cur) throw new Error('而家冇號可以重呼');
  await QS.set('lastCall', { no: cur, counter: String(cid), time: Date.now(), recall: true });
  return cur;
};

QS.done = async cid => {
  const cur = await QS.get(`counters/${cid}/current`);
  if (!cur) throw new Error('而家冇號');
  await QS.update({ [`tickets/${cur}/status`]: 'done', [`counters/${cid}/current`]: null });
};

QS.skip = async cid => {
  const cur = await QS.get(`counters/${cid}/current`);
  if (!cur) throw new Error('而家冇號');
  await QS.update({ [`tickets/${cur}/status`]: 'skipped', [`counters/${cid}/current`]: null });
  return cur;
};

QS.requeue = async no => QS.update({
  [`tickets/${no}/status`]: 'waiting', [`tickets/${no}/front`]: true, [`tickets/${no}/counter`]: null
});

QS.cancel = async no => QS.set(`tickets/${no}/status`, 'cancelled');

QS.transfer = async (cid, to) => {
  const cur = await QS.get(`counters/${cid}/current`);
  if (!cur) throw new Error('而家冇號可以轉');
  const patch = { [`counters/${cid}/current`]: null };
  if (to === 'queue') {
    patch[`tickets/${cur}/status`] = 'waiting';
    patch[`tickets/${cur}/front`]  = true;
    patch[`tickets/${cur}/counter`] = null;
  } else {
    const busy = await QS.get(`counters/${to}/current`);
    if (busy) throw new Error(`${to} 號櫃位服務緊 ${busy}`);
    patch[`tickets/${cur}/counter`] = String(to);
    patch[`counters/${to}/current`] = cur;
    patch['lastCall'] = { no: cur, counter: String(to), time: Date.now(), recall: false };
  }
  await QS.update(patch);
};

QS.nextSession = async to => {
  const sess = (await QS.get('session')) || { prefix: CFG.session.startFrom, seq: 0 };
  const cur = sess.prefix;
  let next;
  if (to) next = String(to).trim().toUpperCase().slice(0, 4);
  else {
    const L = CFG.session.letters, i = L.indexOf(cur);
    next = (i !== -1 && i + 1 < L.length) ? L[i + 1]
         : (/^[A-Z]$/.test(cur) && cur !== 'Z' ? String.fromCharCode(cur.charCodeAt(0) + 1) : null);
    if (!next) throw new Error('已經係最後時段，請手動輸入代號');
  }
  if (next === cur) throw new Error('已經係時段 ' + cur);
  const tickets = (await QS.get('tickets')) || {};
  const patch = { 'session/prefix': next, 'session/seq': 0, 'lastCall': null };
  for (const [no, t] of Object.entries(tickets)) {          // 舊時段：未叫作廢、叫緊當完成
    if (t.status === 'waiting') patch[`tickets/${no}/status`] = 'expired';
    else if (t.status === 'called') patch[`tickets/${no}/status`] = 'done';
  }
  for (let i = 1; i <= CFG.counters; i++) patch[`counters/${i}/current`] = null;
  await QS.update(patch);
  return next;
};

QS.resetDay = async () => {
  await QS.set('tickets', null);
  await QS.set('counters', null);
  await QS.set('lastCall', null);
  await QS.set('session', { prefix: CFG.session.startFrom, seq: 0, startedAt: Date.now() });
};

/* ---- UI helpers ---- */
QS.esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
QS.fmtTime = ts => { const d = new Date(ts); return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`; };
QS.toast = (msg, ms = 2200) => {
  let el = document.getElementById('toast');
  if (!el) { el = document.createElement('div'); el.id = 'toast'; el.className = 'toast'; document.body.appendChild(el); }
  el.textContent = msg; el.classList.add('show');
  clearTimeout(el._t); el._t = setTimeout(() => el.classList.remove('show'), ms);
};
