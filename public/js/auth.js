/* js/auth.js — email/password gate. Roles: head / admin / staff. No bootstrap admin.
   Ported from name-label. Loads js/telemetry.js. Pages boot via Auth.start(fn) after approval. */
(function(){
const CFG=window.FIREBASE_CONFIG;
const t=(k,v)=>window.I18N?I18N.t(k,v):k;
const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const MARK='<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9V7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v2a2 2 0 0 0 0 6v2a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-2a2 2 0 0 0 0-6z"/><path d="M13 5v2M13 11v2M13 17v2"/></svg>';
const CLOCK='<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>';
const BAN='<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M5.6 5.6l12.8 12.8"/></svg>';
let auth=null,db=null,started=false,startFns=[],profile=null,user=null,booting=false,reqName='',state='signin',refs=[];
const gate=document.createElement('div');gate.id='gate';
function mount(){if(!gate.parentNode)document.body.appendChild(gate);}
if(document.body)mount();else document.addEventListener('DOMContentLoaded',mount);
function loadScript(src){return new Promise(r=>{const s=document.createElement('script');s.src=src;s.async=false;s.onload=()=>r(true);s.onerror=()=>r(false);document.head.appendChild(s);});}
function screen(html){
  mount();
  gate.innerHTML='<div class="gc"><div class="top"><button class="lang-toggle" type="button" id="gLang">'+esc(t('c.lang'))+'</button></div>'+html+'</div>';
  gate.style.display='flex';
  document.getElementById('gLang').onclick=()=>I18N.set(I18N.lang==='zh'?'en':'zh');
}
const errText=x=>{const c=(x&&x.code)||'',k='au.e.'+c.replace(/^auth\//,''),m=t(k);return m===k?(t('c.fail')+': '+(c||(x&&x.message)||x)):m;};
const setErr=s=>{const e=gate.querySelector('.err');if(e){e.textContent=s;e.className='err';}};
const busy=(b,label)=>{const el=document.getElementById('gB');if(!el)return;el.disabled=b;el.innerHTML=b?'<span class="spin"></span>'+esc(t('c.processing')):esc(label);};
const notice=()=>'<div class="foot">'+esc(t('au.notice'))+'</div>';
function runStartFns(){startFns.forEach(f=>{try{f(user,profile);}catch(e){console.error(e);}});}
function showSignin(msg){
  state='signin';
  screen('<div class="mk">'+MARK+'</div><h2>'+esc(t('c.signIn'))+'</h2><p class="sub">'+esc(t('au.signInSub'))+'</p>'
  +'<label>'+esc(t('c.email'))+'</label><input id="gE" type="email" autocomplete="username" placeholder="you@school.edu.hk">'
  +'<label>'+esc(t('c.password'))+'</label><input id="gP" type="password" autocomplete="current-password">'
  +'<button class="btn" id="gB">'+esc(t('c.signIn'))+'</button><p class="err'+(msg&&msg.ok?' ok':'')+'">'+esc(msg&&msg.text||'')+'</p>'
  +'<div class="links"><button class="link" id="gReq">'+esc(t('au.request'))+'</button><button class="link" id="gF">'+esc(t('au.forgot'))+'</button></div>'
  +notice());
  const go=async()=>{
    const e=document.getElementById('gE').value.trim(),p=document.getElementById('gP').value;
    if(!e||!p)return setErr(t('au.needEP'));
    busy(true,t('c.signIn'));
    try{await auth.signInWithEmailAndPassword(e,p);}
    catch(x){try{db.ref('audit').push({uid:'anonymous',ts:Date.now(),kind:'auth',d:{event:'login-failed',email:e.slice(0,120),code:String((x&&x.code)||'')}});}catch(_){}
      showSignin({text:errText(x)});}
  };
  document.getElementById('gB').onclick=go;
  document.getElementById('gReq').onclick=showRequest;
  document.getElementById('gF').onclick=()=>{
    const e=document.getElementById('gE').value.trim();if(!e)return setErr(t('au.enterEmail'));
    auth.sendPasswordResetEmail(e).then(()=>showSignin({text:t('au.resetSent')+' '+e,ok:true})).catch(x=>setErr(errText(x)));
  };
  gate.onkeydown=e=>{if(e.key==='Enter')go();};
  setTimeout(()=>{const el=document.getElementById('gE');if(el)el.focus();},40);
}
function showRequest(){
  state='request';
  screen('<div class="mk">'+MARK+'</div><h2>'+esc(t('au.request'))+'</h2><p class="sub">'+esc(t('au.requestSub'))+'</p>'
  +'<label>'+esc(t('c.name'))+'</label><input id="gN" autocomplete="name">'
  +'<label>'+esc(t('c.email'))+'</label><input id="gE" type="email" autocomplete="username">'
  +'<label>'+esc(t('c.password'))+'</label><input id="gP" type="password" autocomplete="new-password">'
  +'<button class="btn" id="gB">'+esc(t('au.submit'))+'</button><p class="err"></p>'
  +'<div class="links"><button class="link" id="gBack">'+esc(t('au.back'))+'</button></div>'+notice());
  const go=async()=>{
    const n=document.getElementById('gN').value.trim(),e=document.getElementById('gE').value.trim(),p=document.getElementById('gP').value;
    if(!n||!e||!p)return setErr(t('au.needAll'));
    if(p.length<6)return setErr(t('au.short'));
    busy(true,t('au.submit'));reqName=n;
    try{const c=await auth.createUserWithEmailAndPassword(e,p);
      await db.ref('users/'+c.user.uid).set({email:e,name:n,status:'pending',role:'staff',createdAt:Date.now()});
    }catch(x){reqName='';showRequest();setErr(errText(x));}
  };
  document.getElementById('gB').onclick=go;
  document.getElementById('gBack').onclick=()=>showSignin();
  gate.onkeydown=e=>{if(e.key==='Enter')go();};
  setTimeout(()=>{const el=document.getElementById('gN');if(el)el.focus();},40);
}
function showPending(u,p){
  state='pending';
  screen('<div class="mk w">'+CLOCK+'</div><h2>'+esc(t('au.pending'))+'</h2><p class="sub">'+esc(t('au.pendingSub'))+'</p>'
  +'<div class="info"><b>'+esc(p.name||u.email)+'</b><br>'+esc(u.email)+'<br>'+esc(t('au.pendingInfo'))+'</div>'
  +'<button class="btn" id="gCheck">'+esc(t('au.check'))+'</button>'
  +'<div class="links"><button class="link" id="gOut">'+esc(t('c.signOut'))+'</button></div>'+notice());
  document.getElementById('gCheck').onclick=async()=>{const p2=await loadProfile(u);if(p2)applyProfile(u,p2);else showNone(u);};
  document.getElementById('gOut').onclick=()=>auth.signOut();
}
function showRejected(u,p){
  state='rejected';
  screen('<div class="mk b">'+BAN+'</div><h2>'+esc(t('au.rejected'))+'</h2><p class="sub">'+esc(t('au.rejectedSub'))+'</p>'
  +'<div class="info"><b>'+esc(p.name||u.email)+'</b><br>'+esc(u.email)+'<br>'+esc(t('au.rejectedInfo'))+'</div>'
  +'<div class="links"><button class="link" id="gOut">'+esc(t('c.signOut'))+'</button></div>'+notice());
  document.getElementById('gOut').onclick=()=>auth.signOut();
}
function showNone(u){
  state='none';
  screen('<div class="mk w">'+CLOCK+'</div><h2>'+esc(t('au.none'))+'</h2><p class="sub">'+esc(t('au.noneSub'))+'</p>'
  +'<div class="info"><b>'+esc(u.email)+'</b><br>'+esc(t('au.noneInfo'))+'</div>'
  +'<button class="btn" id="gB">'+esc(t('au.request'))+'</button><p class="err"></p>'
  +'<div class="links"><button class="link" id="gOut">'+esc(t('c.signOut'))+'</button></div>'+notice());
  document.getElementById('gB').onclick=async()=>{
    busy(true,t('au.request'));
    try{await db.ref('users/'+u.uid).set({email:u.email||'',name:reqName||u.displayName||(u.email||'').split('@')[0],status:'pending',role:'staff',createdAt:Date.now()});}
    catch(x){setErr(errText(x));busy(false,t('au.request'));}
  };
  document.getElementById('gOut').onclick=()=>auth.signOut();
}
function showLoading(){state='loading';screen('<div class="mk">'+MARK+'</div><h2>'+esc(t('au.loading'))+'</h2><p class="sub">'+esc(t('au.loadingSub'))+'</p><button class="btn" disabled><span class="spin"></span>'+esc(t('au.wait'))+'</button>');}
function showFatal(m){state='fatal';screen('<div class="mk b">'+BAN+'</div><h2>'+esc(t('c.fail'))+'</h2><p class="sub">'+esc(m)+'</p>');}
async function loadProfile(u){
  const read=async p=>{try{return (await db.ref(p).once('value')).val();}catch(e){return null;}};
  const [us,ad]=await Promise.all([read('users/'+u.uid),read('admins/'+u.uid)]);
  let role=(us&&us.role)||null;
  if(ad===true)role='head';
  if(role!=='head'&&role!=='admin'&&role!=='staff')role=null;
  if(!role)return us||null;
  const status=(role==='head'||role==='admin')?'approved':((us&&us.status)||'pending');
  return Object.assign({email:u.email||'',name:(us&&us.name)||u.displayName||(u.email||'').split('@')[0],createdAt:(us&&us.createdAt)||Date.now()},us||{},{role:role,status:status});
}
function roleLabel(r){return t(r==='head'?'role.head':r==='admin'?'role.admin':'role.staff');}
function bar(u,p){
  const tb=document.querySelector('.topbar .right')||document.querySelector('.topbar')||document.querySelector('.portal-nav');
  if(!tb)return;
  let b=document.getElementById('authBar');
  if(!b){b=document.createElement('span');b.id='authBar';b.className='row';b.style.gap='8px';tb.appendChild(b);}
  b.innerHTML='<span class="role'+(p.role==='staff'?' staff':'')+'">'+esc(roleLabel(p.role))+'</span><span class="mail" title="'+esc(u.email||'')+'">'+esc(u.email||'')+'</span><button class="iconbtn" id="abOut" type="button">'+esc(t('c.signOut'))+'</button>';
  document.getElementById('abOut').onclick=()=>{try{window.TEL&&TEL.log('auth',{event:'sign-out'});window.TEL&&TEL.end();}catch(e){}auth.signOut();};
}
function applyProfile(u,p){
  user=u;profile=p;
  if(p.status==='approved'){
    gate.style.display='none';document.body.classList.remove('auth-locked');bar(u,p);
    try{document.dispatchEvent(new CustomEvent('auth-ready',{detail:{user:u,profile:p}}));}catch(e){}
    if(!started){started=true;runStartFns();}
    else document.dispatchEvent(new CustomEvent('auth-profile',{detail:{user:u,profile:p}}));
  }else if(p.status==='rejected'){document.body.classList.add('auth-locked');showRejected(u,p);}
  else{document.body.classList.add('auth-locked');showPending(u,p);}
}
function clearRefs(){refs.forEach(r=>{try{r.off();}catch(e){}});refs=[];}
function boot(){
  if(typeof firebase==='undefined'){document.body.classList.add('auth-locked');showFatal(t('au.sdk'));return;}
  try{if(!firebase.apps.length)firebase.initializeApp(CFG);auth=firebase.auth();db=firebase.database();}
  catch(e){document.body.classList.add('auth-locked');showFatal(e.message||String(e));return;}
  loadScript('js/telemetry.js');
  auth.onAuthStateChanged(async u=>{
    clearRefs();
    if(!u){user=null;profile=null;started=false;document.body.classList.add('auth-locked');
      const b=document.getElementById('authBar');if(b)b.remove();
      try{document.dispatchEvent(new CustomEvent('auth-signed-out'));}catch(e){}
      showSignin();return;}
    if(booting)return;booting=true;showLoading();
    try{
      const p=await loadProfile(u);reqName='';
      if(!p||!p.role){user=u;document.body.classList.add('auth-locked');showNone(u);}else applyProfile(u,p);
      ['users/','admins/'].forEach(pre=>{
        const r=db.ref(pre+u.uid);refs.push(r);
        r.on('value',async()=>{const p2=await loadProfile(u);if(p2&&p2.role)applyProfile(u,p2);else{document.body.classList.add('auth-locked');showNone(u);}},()=>{});
      });
    }catch(e){showSignin({text:t('au.readFail')+': '+(e.message||e)});}
    booting=false;
  });
  document.addEventListener('langchange',()=>{
    if(gate.style.display==='none'){if(user&&profile)bar(user,profile);return;}
    if(state==='signin')showSignin();else if(state==='request')showRequest();else if(state==='loading')showLoading();
    else if(user&&profile){if(state==='pending')showPending(user,profile);else if(state==='rejected')showRejected(user,profile);else showNone(user);}
    else if(user)showNone(user);
  });
}
window.Auth={
 cfg:CFG,
 get auth(){return auth;},
 get db(){return db||firebase.database();},
 root:()=>(db||firebase.database()).ref('queue'),
 user:()=>user||(auth&&auth.currentUser),
 profile:()=>profile,
 role:()=>(profile&&profile.role)||'staff',
 isHead:()=>!!profile&&profile.role==='head'&&profile.status==='approved',
 isAdmin:()=>!!profile&&(profile.role==='head'||profile.role==='admin')&&profile.status==='approved',
 isApproved:()=>!!profile&&profile.status==='approved',
 start(fn){startFns.push(fn);
   if(user&&profile&&profile.status==='approved'){
     if(!started){started=true;runStartFns();}
     else{try{fn(user,profile);}catch(e){console.error(e);}}
   }},
 signOut:()=>auth&&auth.signOut()
};
if(document.body)boot();else document.addEventListener('DOMContentLoaded',boot);
})();
