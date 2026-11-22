/* ===== KTMC 排隊系統核心邏輯 Queue core — boots only after Auth approval ===== */
try{ if(!firebase.apps.length) firebase.initializeApp(window.FIREBASE_CONFIG); }catch(e){}
const db = firebase.database();
const stateRef = db.ref('queue');

const DEFAULTS = {
  settings: {
    title: 'Queue Up', subtitle: '請排隊取號',
    note: 'Please keep your ticket and watch for the display announcement. 請保留籌號並留意顯示屏廣播。',
    ticketNote: '請妥善保管此籌號，並留意顯示屏及廣播。\nPlease keep this ticket and wait for your turn.\n若連續叫號3次後仍未到場，籌號將作廢。\nYour ticket will be canceled after three missed calls.\n如不慎過號，請重新取號輪候。\nPlease get a new ticket if you missed your turn.',
    counters: [ { id: 1, name: 'Counter 1', nameZh: '一號櫃位' }, { id: 2, name: 'Counter 2', nameZh: '二號櫃位' } ],
    tts: { languages: ['en','yue','zh'], rate: 1, volume: 1, repeat: 1 },
    avgMinutes: 3, paper: '80'
  },
  session: { prefix: 'A', next: 1 }, tickets: {}, lastCall: null
};

let STATE = null; const listeners = [];
function onState(f){ listeners.push(f); if (STATE) f(STATE); }
const t = (k,v) => window.I18N ? I18N.t(k,v) : k;
const esc = s => String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function toast(m,ms=2600){ const el=document.getElementById('toast'); if(!el)return; el.textContent=m; el.classList.add('on'); clearTimeout(el._h); el._h=setTimeout(()=>el.classList.remove('on'),ms); }
function guardAdmin(){ if(!Auth.isAdmin()){ toast(t('c.needAdmin')); return false; } return true; }
function werr(e){ const c=(e&&e.code)||''; toast(/PERMISSION_DENIED/i.test(c+e)?t('c.denied'):t('c.fail')+': '+(e&&e.message||e)); }
function nowLabel(){ const d=new Date(),p=n=>String(n).padStart(2,'0'); return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`; }
function ticketsArr(){ return STATE ? Object.entries(STATE.tickets||{}).map(([key,x])=>({key,...x})) : []; }
function waiting(){ return ticketsArr().filter(x=>x.status==='waiting').sort((a,b)=>a.no-b.no); }
function currentOf(id){ return ticketsArr().filter(x=>x.status==='called' && String(x.counter)===String(id)).sort((a,b)=>(b.calledAt||0)-(a.calledAt||0))[0]; }
function counterById(id){ return STATE ? ((STATE.settings.counters||[]).find(c=>String(c.id)===String(id))||{id:id,name:'Counter '+id,nameZh:'櫃位 '+id}) : {id:id,name:'Counter '+id,nameZh:'櫃位 '+id}; }
async function nextSeq(path){ let v; await stateRef.child(path).transaction(c => { v=(c||0)+1; return v; }); return v; }

async function takeTicket(){
  if(!STATE) return null;
  let no; const pre=(STATE.session&&STATE.session.prefix)||'A';
  await stateRef.child('session/next').transaction(c => { no=c||1; return no+1; });
  const x={ no, label:pre+String(no).padStart(3,'0'), time:nowLabel(), status:'waiting', counter:null };
  await stateRef.child('tickets').push(x);
  await stateRef.child('lastCall').set(null);
  return x;
}
async function callNext(id){
  const updates={}; const cur=currentOf(id); if(cur) updates['tickets/'+cur.key+'/status']='done';
  const w=waiting()[0]; if(!w){ if(Object.keys(updates).length>0) await stateRef.update(updates); return null; }
  const seq=await nextSeq('callSeq');
  updates['tickets/'+w.key+'/status']='called'; updates['tickets/'+w.key+'/counter']=Number(id); updates['tickets/'+w.key+'/calledAt']=Date.now();
  updates['lastCall']={ ticket:{label:w.label,no:w.no}, counter:Number(id), at:Date.now(), seq };
  await stateRef.update(updates); return w;
}
async function recall(id){
  const x=currentOf(id); if(!x) return; const seq=await nextSeq('callSeq');
  await stateRef.update({ ['tickets/'+x.key+'/calledAt']:Date.now(), lastCall:{ ticket:{label:x.label,no:x.no}, counter:Number(id), at:Date.now(), seq } });
}
async function callNumber(id,raw){
  const num=Number(String(raw).toUpperCase().replace(/^[A-Z]+/,''));
  const x=ticketsArr().find(y=>y.no===num && y.status!=='done'); if(!x) return null;
  const updates={}; const cur=currentOf(id); if(cur) updates['tickets/'+cur.key+'/status']='done';
  const seq=await nextSeq('callSeq');
  updates['tickets/'+x.key+'/status']='called'; updates['tickets/'+x.key+'/counter']=Number(id); updates['tickets/'+x.key+'/calledAt']=Date.now();
  updates['lastCall']={ ticket:{label:x.label,no:x.no}, counter:Number(id), at:Date.now(), seq };
  await stateRef.update(updates); return x;
}
async function completeTicket(key){ await stateRef.child('tickets/'+key+'/status').set('done'); }
async function complete(id){ const x=currentOf(id); if(x) await completeTicket(x.key); }
async function undoCall(id){
  const x=currentOf(id); if(!x) return null; const seq=await nextSeq('undoSeq');
  await stateRef.update({ ['tickets/'+x.key+'/status']:'waiting', ['tickets/'+x.key+'/counter']:null, ['tickets/'+x.key+'/calledAt']:null, lastUndo:{ label:x.label, counter:Number(id), at:Date.now(), seq } });
  return x;
}
async function stopCall(id){ const seq=await nextSeq('stopSeq'); await stateRef.child('lastStop').set({ counter:Number(id), at:Date.now(), seq }); }
async function stopAll(){ const seq=await nextSeq('stopSeq'); await stateRef.child('lastStop').set({ counter:'*', at:Date.now(), seq }); }
async function setPrefix(p){
  const ups={}; ticketsArr().forEach(x=>{ if(x.status==='waiting') ups['tickets/'+x.key+'/status']='expired'; });
  ups['session']={ prefix:p, next:1 }; ups['lastCall']=null; await stateRef.update(ups);
}
async function advance(){ if(!STATE) return; const c=STATE.session.prefix; await setPrefix(c.length===1 ? String.fromCharCode(c.charCodeAt(0)+1) : c+'A'); }
async function saveSettings(s){ await stateRef.child('settings').update(s); }
async function clearTickets(){ await stateRef.update({ tickets:null, lastCall:null, lastUndo:null, lastStop:null, nowPlaying:null, 'session/next':1 }); }
async function pauseCounter(id){ await stateRef.child('counters/'+id+'/paused').set(true); }
async function resumeCounter(id){ await stateRef.child('counters/'+id+'/paused').set(false); }
function isCounterPaused(id){ return !!(STATE && STATE.counters && STATE.counters[id] && STATE.counters[id].paused); }
function remotePrint(x,reprint){
  return stateRef.child('printQueue').push({ label:x.label, no:x.no, time:x.time||nowLabel(), session:(STATE.session&&STATE.session.prefix)||'A', reprint:!!reprint, createdAt:Date.now(), done:false });
}
const termOnline = x => !!(x && x.lastSeen && Date.now()-x.lastSeen < 60000);

/* ===== Terminal presence heartbeat (kiosk / counter / display / printer) ===== */
let termUser=null, termTimer=null, termRef=null;
function startTerminal(user){
  const kind=document.body.dataset.terminal; if(!kind) return;
  termUser=user;
  let tid=null; try{ tid=localStorage.getItem('qsTid'); if(!tid){ tid=Date.now().toString(36)+Math.random().toString(36).slice(2,8); localStorage.setItem('qsTid',tid);} }catch(e){ tid='t'+Math.random().toString(36).slice(2,10); }
  const cid=new URLSearchParams(location.search).get('id');
  termRef=stateRef.child('terminals/'+kind+(cid?'-'+cid:'')+'-'+tid);
  const beat=()=>{ if(!termUser) return;
    const name=(kind==='counter'&&cid)?counterById(cid).name:kind;
    termRef.update({ kind, name, counter:cid?Number(cid):null, uid:termUser.uid, email:termUser.email||'', lastSeen:Date.now() }).catch(()=>{});
  };
  if(termTimer){ beat(); return; }
  termRef.onDisconnect().update({ lastSeen:0 });
  beat(); termTimer=setInterval(beat,20000);
}

/* ===== Boot after approval; detach on sign-out ===== */
let attached=false;
Auth.start((user,profile)=>{
  if(!attached){
    attached=true;
    stateRef.on('value',s=>{
      STATE=s.val()||JSON.parse(JSON.stringify(DEFAULTS));
      listeners.forEach(f=>{ try{f(STATE);}catch(e){console.error(e);} });
    },err=>toast('⚠️ DB: '+(err.code||err.message)));
  }
  if(Auth.isAdmin()) stateRef.once('value').then(s=>{ if(!s.exists()) return stateRef.set(DEFAULTS); }).catch(()=>{});
  startTerminal(user);
});
document.addEventListener('auth-signed-out',()=>{
  try{ stateRef.off(); }catch(e){}
  attached=false; STATE=null; termUser=null;
});
