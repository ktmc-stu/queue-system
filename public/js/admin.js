/* js/admin.js — Head Admin / Admin console (name-label pattern applied to the queue) */
(function(){
const PAGES=['overview','session','announce','counters','texts','print','tickets','users','audit','settings'];
const S={user:null,profile:null,role:'staff',canManage:false,isHead:false,started:false,
  page:'overview',uFilter:'pending',tFilter:'waiting',aView:'live',
  users:{},admins:{},audit:[],sessions:{},presence:{},
  loaded:{},errors:{},counts:{},runtime:[],bannerHidden:false,refs:{},
  formLoaded:false,freeImage:null,ueUid:null,udUid:null,udBusy:false,dgScope:null,dgBusy:false};
const $=id=>document.getElementById(id);
const fmtDT=ts=>ts?new Date(ts).toLocaleString('en-GB'):'—';
const fmtD=ts=>ts?new Date(ts).toLocaleDateString('en-GB'):'—';
const dur=ms=>{ms=Math.max(0,Math.round((ms||0)/1000));const h=Math.floor(ms/3600),m=Math.floor(ms%3600/60),s=ms%60;return (h?h+'h ':'')+(m||h?m+'m ':'')+s+'s';};
const roleLabel=r=>t(r==='head'?'role.head':r==='admin'?'role.admin':'role.staff');
function guardHead(){if(!S.isHead){toast(t('ad.headOnly'));return false;}return true;}
function safe(fn,l){try{fn();}catch(e){const m=(l||'render')+': '+(e&&e.message||e);if(!S.runtime.includes(m))S.runtime.push(m);console.error(l,e);}}
function download(name,obj){const b=new Blob([typeof obj==='string'?obj:JSON.stringify(obj,null,2)],{type:'application/json'}),a=document.createElement('a');a.href=URL.createObjectURL(b);a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),2000);}
function paintTable(bodyId,cols,html,emptyText){
  const body=$(bodyId);if(!body)return;
  const table=body.closest('table');
  if(table){let head=table.querySelector('thead');if(!head){head=document.createElement('thead');table.insertBefore(head,table.firstChild);}
    head.innerHTML='<tr>'+cols.map(c=>'<th>'+esc(t(c))+'</th>').join('')+'</tr>';}
  body.innerHTML=html||'<tr><td colspan="'+cols.length+'" style="text-align:center">'+esc(emptyText||t('c.noData'))+'</td></tr>';
}
function counters(){return (STATE&&STATE.settings&&STATE.settings.counters)||[];}
function guard(){if(!STATE){toast(t('c.loading'));return false;}if(!guardAdmin())return false;return true;}

/* ---------- routing & role gates ---------- */
function showPage(p){
  if(!PAGES.includes(p))p='overview';
  if((p==='users'||p==='audit')&&!S.isHead)p='overview';
  S.page=p;
  document.querySelectorAll('#rail button').forEach(b=>b.classList.toggle('on',b.dataset.page===p));
  document.querySelectorAll('.page').forEach(s=>s.classList.toggle('on',s.id==='pg-'+p));
  if(location.hash.slice(1)!==p)history.replaceState(null,'','#'+p);
  renderEverything();
}
function applyRoleGates(){
  ['users','audit'].forEach(p=>{const b=document.querySelector('#rail button[data-page="'+p+'"]');if(b)b.style.display=S.isHead?'':'none';});
  const pc=$('ovPendCard');if(pc)pc.style.display=S.isHead?'':'none';
  const qu=$('qlUsers');if(qu)qu.style.display=S.isHead?'':'none';
}

/* ---------- renders ---------- */
function mergedUsers(){
  const m={};
  Object.entries(S.users).forEach(([k,u])=>m[k]=Object.assign({_id:k},u));
  Object.keys(S.admins).forEach(k=>{if(S.admins[k]===true)m[k]=Object.assign({_id:k},m[k]||{},{role:'head',status:'approved',legacy:!S.users[k]});});
  return m;
}
function renderOverview(){
  if(!STATE)return;
  const all=ticketsArr(),w=waiting();
  $('ovWait').textContent=w.length;
  $('ovServ').textContent=all.filter(x=>x.status==='called').length;
  $('ovIssued').textContent=all.length;
  const terms=Object.values(STATE.terminals||{}),on=terms.filter(termOnline).length;
  $('ovOn').textContent=on+'/'+terms.length;
  $('ovPrint').textContent=Object.keys(STATE.printQueue||{}).length;
  const mu=mergedUsers(),pend=Object.values(mu).filter(u=>u.status==='pending').length;
  $('ovPend').textContent=S.isHead?pend:'—';
  const ub=$('userBdg');if(ub){ub.textContent=pend;ub.hidden=!pend||!S.isHead;}
  const np=STATE.nowPlaying;
  $('npDot').className='dot'+(np?' on':'');
  const txt=np?t('an.nowPlaying',{l:np.label,c:counterById(np.counter).name}):t('an.notPlaying');
  $('ovNow').textContent=txt;$('nowPlaying').textContent=txt;
  $('sessChip').textContent=t('se.session')+' '+((STATE.session&&STATE.session.prefix)||'A')+' · '+t('se.next')+' '+((STATE.session&&STATE.session.prefix)||'A')+String((STATE.session&&STATE.session.next)||1).padStart(3,'0');
}
function renderForms(){
  if(!STATE||S.formLoaded)return;
  S.formLoaded=true;
  const s=STATE.settings,tt=s.tts||{languages:['en','yue','zh'],repeat:1};
  $('langEn').checked=tt.languages.includes('en');
  $('langYue').checked=tt.languages.includes('yue');
  $('langZh').checked=tt.languages.includes('zh');
  $('ttsRepeat').value=tt.repeat||1;
  $('setTitle').value=s.title||'';$('setSubtitle').value=s.subtitle||'';
  $('setNote').value=s.note||'';$('setTicketNote').value=s.ticketNote||'';
  $('avgMinutes').value=s.avgMinutes||3;
  $('paper58').checked=s.paper==='58';$('paper80').checked=s.paper!=='58';
  $('prefixInput').placeholder=(STATE.session&&STATE.session.prefix)||'A';
}
function renderCounters(){
  const cs=counters();
  const sel=$('manCounter');
  sel.innerHTML=cs.map(c=>'<option value="'+esc(c.id)+'">'+esc(c.name)+' '+esc(c.nameZh)+'</option>').join('');
  paintTable('counterList',['c.name','co.nameZh','c.actions'],cs.map(c=>
    '<tr><td><b>'+esc(c.name)+'</b></td><td>'+esc(c.nameZh)+'</td><td><div class="row" style="margin:0">'
    +'<a class="btn gray mini" href="counter.html?id='+encodeURIComponent(c.id)+'" target="_blank" rel="noopener">'+esc(t('c.open'))+'</a>'
    +'<button class="btn bad mini" data-act="delcounter" data-k="'+esc(c.id)+'">'+esc(t('c.remove'))+'</button></div></td></tr>').join(''),t('co.none'));
}
function renderTickets(){
  const all=ticketsArr().sort((a,b)=>b.no-a.no);
  const rows=S.tFilter==='all'?all:all.filter(x=>x.status===S.tFilter);
  $('tCount').textContent=t('tk.count',{n:rows.length});
  paintTable('tBody',['tk.label','c.time','c.status','tk.counter','tk.calledAt'],rows.slice(0,300).map(x=>{
    const st='<span class="ust '+(x.status==='waiting'?'pending':x.status==='called'?'approved':'rejected')+'">'+esc(t('tk.'+x.status)||x.status)+'</span>';
    return '<tr><td class="mono"><b>'+esc(x.label)+'</b></td><td class="mono">'+esc(x.time||'')+'</td><td>'+st+'</td><td>'+(x.counter!=null?esc(counterById(x.counter).name):'—')+'</td><td class="mono">'+fmtDT(x.calledAt)+'</td></tr>';
  }).join(''));
}
function renderUsers(){
  if(!S.isHead)return;
  const mu=mergedUsers();
  const rows=Object.values(mu).filter(u=>S.uFilter==='all'||u.status===S.uFilter)
    .sort((a,b)=>(b.createdAt||0)-(a.createdAt||0));
  $('uCount').textContent=rows.length+' '+t('c.users');
  paintTable('uBody',['c.name','c.email','c.role','c.status','c.requested','c.actions'],rows.map(u=>{
    const self=S.user&&u._id===S.user.uid;
    const ust='<span class="ust '+esc(u.status)+'">'+esc(t('c.'+u.status)||u.status)+'</span>';
    let acts='<div class="row" style="margin:0">';
    if(!u.legacy&&!self){
      if(u.status!=='approved')acts+='<button class="btn ok mini" data-act="approve" data-k="'+esc(u._id)+'">'+esc(t('u.approve'))+'</button>';
      if(u.status==='pending')acts+='<button class="btn bad mini" data-act="reject" data-k="'+esc(u._id)+'">'+esc(t('u.reject'))+'</button>';
      if(u.status==='approved')acts+='<button class="btn warn mini" data-act="reject" data-k="'+esc(u._id)+'">'+esc(t('u.revoke'))+'</button>';
      acts+='<button class="btn gray mini" data-act="edituser" data-k="'+esc(u._id)+'">'+esc(t('u.edit'))+'</button>';
    }
    if(!self)acts+='<button class="btn bad mini" data-act="deluser" data-k="'+esc(u._id)+'">'+esc(t('c.delete'))+'</button>';
    acts+='</div>';
    return '<tr><td><b>'+esc(u.name||'—')+'</b>'+(u.legacy?'<span class="legacy">'+esc(t('u.legacy'))+'</span>':'')+(self?' <span class="muted">'+esc(t('c.you'))+'</span>':'')+'</td>'
      +'<td>'+esc(u.email||'—')+'<div class="uid">'+esc(u._id)+'</div></td>'
      +'<td>'+esc(roleLabel(u.role))+'</td><td>'+ust+'</td><td class="mono">'+fmtD(u.createdAt)+'</td><td>'+acts+'</td></tr>';
  }).join(''),t('u.none'));
}
async function userSet(uid,patch){
  if(!guardHead())return;
  if(S.user&&uid===S.user.uid)return toast(t('u.noSelf'));
  try{await db.ref('users/'+uid).update(patch);toast(t('u.updated'));}catch(e){werr(e);}
}
function renderAudit(){
  if(!S.isHead)return;
  const q=($('adQ').value||'').trim().toLowerCase(),kind=$('adKind').value;
  $('adLiveWrap').style.display=S.aView==='live'?'':'none';
  $('adSesWrap').style.display=S.aView==='sessions'?'':'none';
  if(S.aView==='live'){
    const rows=S.audit.filter(a=>(!kind||a.kind===kind)&&(!q||JSON.stringify(a).toLowerCase().includes(q))).sort((a,b)=>(b.ts||0)-(a.ts||0)).slice(0,400);
    $('adCount').textContent=t('tk.count',{n:rows.length});
    paintTable('adLiveBody',['c.time','ad.user','ad.kind','ad.page','ad.detail'],rows.map(a=>
      '<tr><td class="mono">'+fmtDT(a.ts)+'</td><td>'+esc(a.email||a.uid||'')+'</td><td><span class="chip">'+esc(a.kind||'')+'</span></td><td class="mono">'+esc(a.page||'')+'</td><td class="uid">'+esc(JSON.stringify(a.d||{}).slice(0,220))+'</td></tr>').join(''),t('ad.noData'));
  }else{
    const rows=Object.entries(S.sessions).filter(([k,s])=>!q||JSON.stringify(s).toLowerCase().includes(q)).sort((a,b)=>(b[1].start||0)-(a[1].start||0)).slice(0,300);
    $('adCount').textContent=t('tk.count',{n:rows.length});
    paintTable('adSesBody',['ad.user','c.role','ad.start','ad.end','ad.active','ad.total','ad.views','ad.acts','ad.ip','ad.page'],rows.map(([k,s])=>
      '<tr><td>'+esc(s.email||s.uid||'')+(s.online?' <span class="dot on"></span>':'')+'</td><td>'+esc(roleLabel(s.role))+'</td><td class="mono">'+fmtDT(s.start)+'</td><td class="mono">'+(s.end?fmtDT(s.end):'—')+'</td><td class="mono">'+dur(s.activeMs)+'</td><td class="mono">'+dur(s.totalMs)+'</td><td class="mono">'+(s.views||0)+'</td><td class="mono">'+(s.acts||0)+'</td><td class="mono">'+esc(s.ip||'')+'</td><td class="mono">'+esc(s.page||'')+'</td></tr>').join(''),t('ad.noData'));
  }
}
function renderDiag(){
  const paths=['queue'].concat(S.isHead?['users','admins','audit','sessions','presence']:[]);
  paintTable('diBody',['st.path','st.state','st.rows'],paths.map(p=>{
    const err=S.errors[p],ok=S.loaded[p];
    const st=err?'<span class="ust rejected">'+esc(err)+'</span>':ok?'<span class="ust approved">'+esc(t('st.ok'))+'</span>':'<span class="ust pending">'+esc(t('st.wait'))+'</span>';
    return '<tr><td class="mono">'+esc(p)+'</td><td>'+st+'</td><td class="mono">'+(S.counts[p]!=null?S.counts[p]:'—')+'</td></tr>';
  }).join(''));
  const total=paths.length,ok=paths.filter(p=>S.loaded[p]).length,er=Object.keys(S.errors).length,chip=$('dataChip');
  chip.className='chip'+(er?' err':'');
  chip.textContent=!S.started?t('dt.idle'):er?t('dt.err',{n:er}):ok<total?t('dt.wait'):t('dt.ok',{n:ok,total});
}
function renderBanner(){
  const b=$('banner'),errs=Object.keys(S.errors),rt=S.runtime;
  if(S.bannerHidden||(!errs.length&&!rt.length)){b.innerHTML='';return;}
  let h='<div class="banner"><h4>'+esc(t('bn.title'))+'</h4><ul>';
  errs.forEach(k=>h+='<li><span class="mono">'+esc(k)+'</span> — '+esc(S.errors[k])+'</li>');
  rt.slice(0,4).forEach(m=>h+='<li>'+esc(t('bn.runtime'))+': '+esc(m)+'</li>');
  h+='</ul><p class="note">'+esc(t('bn.hint'))+'</p><div class="row"><button class="btn bad sm" id="bnRetry">'+esc(t('c.retry'))+'</button><button class="btn ghost sm" id="bnHide">'+esc(t('bn.dismiss'))+'</button></div></div>';
  b.innerHTML=h;
  $('bnRetry').onclick=()=>{S.bannerHidden=false;S.runtime=[];attachHead();renderEverything();};
  $('bnHide').onclick=()=>{S.bannerHidden=true;renderBanner();};
}
function renderEverything(){
  safe(renderForms,'forms');safe(renderOverview,'overview');safe(renderCounters,'counters');
  safe(renderTickets,'tickets');safe(renderUsers,'users');safe(renderAudit,'audit');
  safe(renderDiag,'diag');safe(renderBanner,'banner');
}

/* ---------- head-only listeners ---------- */
function detachHead(){['users','admins','audit','sessions','presence'].forEach(p=>{try{S.refs[p]&&S.refs[p].off();}catch(e){}delete S.refs[p];});}
function attachHead(){
  detachHead();
  if(!S.isHead)return;
  const bind=(p,ref,fn)=>{
    S.refs[p]=ref;
    ref.on('value',s=>{S.loaded[p]=true;delete S.errors[p];fn(s);S.counts[p]=p==='audit'?S.audit.length:Object.keys(s.val()||{}).length;safe(renderEverything,'head');},
      e=>{S.errors[p]=e.code||String(e.message||e);safe(renderDiag,'diag');safe(renderBanner,'banner');});
  };
  bind('users',db.ref('users'),s=>{S.users=s.val()||{};});
  bind('admins',db.ref('admins'),s=>{S.admins=s.val()||{};});
  bind('audit',db.ref('audit').limitToLast(1200),s=>{S.audit=Object.entries(s.val()||{}).map(([k,a])=>Object.assign({_id:k},a));});
  bind('sessions',db.ref('sessions').limitToLast(400),s=>{S.sessions=s.val()||{};});
  bind('presence',db.ref('presence'),s=>{S.presence=s.val()||{};});
}

/* ---------- user edit / delete modals ---------- */
function openUe(uid){
  const u=mergedUsers()[uid];if(!u||u.legacy)return;
  S.ueUid=uid;
  $('ueWho').textContent=(u.name||'')+' · '+(u.email||'');
  $('ueRole').value=u.role==='admin'?'admin':'staff';
  $('ueStatus').value=u.status||'pending';
  $('ueMsg').textContent='';$('ueMsg').className='status';
  $('ueModal').classList.add('on');
}
function closeUe(){$('ueModal').classList.remove('on');S.ueUid=null;}
function udRec(){return mergedUsers()[S.udUid];}
function openUd(uid){
  if(!guardHead())return;
  if(S.user&&uid===S.user.uid)return toast(t('u.noSelf'));
  S.udUid=uid;S.udBusy=false;
  const u=udRec();if(!u)return;
  $('udSum').innerHTML='<div><span>'+esc(t('c.name'))+'</span><b>'+esc(u.name||'—')+'</b></div><div><span>'+esc(t('c.email'))+'</span><b>'+esc(u.email||'—')+'</b></div><div><span>'+esc(t('c.role'))+'</span><b>'+esc(roleLabel(u.role))+'</b></div>';
  $('udConsole').href='https://console.firebase.google.com/project/'+(window.FIREBASE_CONFIG.projectId)+'/authentication/users';
  $('udLabel').textContent=t('u.deleteType',{email:u.email||uid});
  $('udInput').value='';$('udInput').disabled=false;$('udInput').placeholder=u.email||uid;
  $('udOk').disabled=true;$('udCancel').disabled=false;
  $('udStatus').textContent='';$('udStatus').className='status';
  $('udModal').classList.add('on');setTimeout(()=>$('udInput').focus(),30);
}
function closeUd(){if(S.udBusy)return;$('udModal').classList.remove('on');S.udUid=null;}
function validateUd(){const u=udRec();$('udOk').disabled=!u||$('udInput').value.trim().toLowerCase()!==String(u.email||'').toLowerCase();}

/* ---------- danger modal ---------- */
const DG={tickets:{title:'dg.clearTickets',desc:'dg.clearTicketsD',phrase:'CLEAR TICKETS',btn:'dg.ticketsBtn'},
          all:{title:'dg.resetAll',desc:'dg.resetAllD',phrase:'RESET ALL',btn:'dg.resetBtn'}};
function openDg(sc){
  if(!guard())return;
  S.dgScope=sc;S.dgBusy=false;const c=DG[sc];
  $('dgTitle').textContent=t(c.title);$('dgDesc').textContent=t(c.desc);
  $('dgLabel').textContent=t('dg.type',{phrase:c.phrase});
  $('dgInput').value='';$('dgInput').placeholder=c.phrase;$('dgInput').disabled=false;
  $('dgBackup').checked=true;$('dgOk').textContent=t(c.btn);$('dgOk').disabled=true;$('dgCancel').disabled=false;
  $('dgStatus').textContent='';$('dgStatus').className='status';
  $('dgSum').innerHTML='<div><span>'+esc(t('dg.sumTickets'))+'</span><b>'+ticketsArr().length+'</b></div>'+(sc==='all'?'<div><span>'+esc(t('dg.sumCounters'))+'</span><b>'+counters().length+'</b></div>':'');
  $('dgModal').classList.add('on');setTimeout(()=>$('dgInput').focus(),30);
}
function closeDg(){if(S.dgBusy)return;$('dgModal').classList.remove('on');S.dgScope=null;}

/* ---------- free print helpers ---------- */
function resizeImage(file,maxW,cb){
  const reader=new FileReader();
  reader.onload=e=>{
    const img=new Image();
    img.onload=()=>{
      let w=img.width,h=img.height;
      if(w>maxW){h=Math.round(h*maxW/w);w=maxW;}
      const c=document.createElement('canvas');c.width=w;c.height=h;
      const ctx=c.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,w,h);
      ctx.drawImage(img,0,0,w,h);
      cb(c.toDataURL('image/jpeg',0.85));
    };
    img.src=e.target.result;
  };
  reader.readAsDataURL(file);
}

/* ---------- wiring ---------- */
function wire(){
  document.querySelectorAll('#rail button').forEach(b=>b.onclick=()=>showPage(b.dataset.page));
  document.querySelectorAll('[data-goto]').forEach(b=>b.onclick=()=>showPage(b.dataset.goto));
  addEventListener('hashchange',()=>showPage(location.hash.slice(1)));

  /* session */
  $('btnSetPrefix').onclick=async()=>{
    if(!guard())return;
    const p=$('prefixInput').value.trim().toUpperCase();
    if(!p)return toast(t('se.needPrefix'));
    if(!confirm(t('se.prefixQ',{p:p})))return;
    try{await setPrefix(p);$('prefixInput').value='';toast(t('se.updated'));}catch(e){werr(e);}
  };
  $('btnAdvance').onclick=async()=>{
    if(!guard())return;
    const cur=STATE.session.prefix,np=cur.length===1?String.fromCharCode(cur.charCodeAt(0)+1):cur+'A';
    if(!confirm(t('se.advanceQ',{p:np})))return;
    try{await advance();toast(t('se.advanced'));}catch(e){werr(e);}
  };
  $('avgMinutes').addEventListener('change',async function(){
    if(!guard())return;
    try{await saveSettings({avgMinutes:+this.value||3});toast(t('se.avgSaved'));}catch(e){werr(e);}
  });

  /* announce */
  $('btnManPlay').onclick=async()=>{
    if(!guard())return;
    const label=$('manLabel').value.trim().toUpperCase(),cid=$('manCounter').value;
    if(!label||!cid)return toast(t('an.needFields'));
    try{
      const seq=await nextSeq('callSeq');
      await stateRef.child('lastCall').set({ticket:{label,no:Number(label.replace(/\D/g,''))||0},counter:Number(cid),at:Date.now(),seq,manual:true});
      toast(t('an.queued',{l:label}));$('manLabel').value='';
    }catch(e){werr(e);}
  };
  $('btnStopCur').onclick=async()=>{
    if(!guard())return;
    const np=STATE.nowPlaying;
    if(!np)return toast(t('an.notPlaying'));
    try{await stopCall(np.counter);toast(t('an.stopped',{l:np.label}));}catch(e){werr(e);}
  };
  $('btnStopAll').onclick=async()=>{if(!guard())return;try{await stopAll();toast(t('an.allStopped'));}catch(e){werr(e);}};
  const getLangs=()=>['en','yue','zh'].filter(l=>({en:$('langEn'),yue:$('langYue'),zh:$('langZh')})[l].checked);
  $('btnTtsSave').onclick=async()=>{
    if(!guard())return;
    try{await saveSettings({tts:{languages:getLangs(),repeat:+$('ttsRepeat').value||1}});toast(t('an.saved'));}catch(e){werr(e);}
  };
  $('btnTest').onclick=()=>{
    if(!STATE)return;
    const c=counters()[0]||{name:'Counter 1',nameZh:'一號櫃位'};
    announce(getLangs(),{repeat:+$('ttsRepeat').value||1,phrases:{
      en:buildPhrase('en','A001',c),yue:buildPhrase('yue','A001',c),zh:buildPhrase('zh','A001',c)}},true);
  };

  /* counters */
  $('btnAddCounter').onclick=async()=>{
    if(!guard())return;
    const cs=counters();
    const name=$('newCounterName').value.trim()||'Counter '+(cs.length+1);
    const nameZh=$('newCounterZh').value.trim()||name;
    try{await saveSettings({counters:[...cs,{id:Date.now()%100000,name,nameZh}]});
      $('newCounterName').value='';$('newCounterZh').value='';toast(t('co.added'));}catch(e){werr(e);}
  };
  $('counterList').onclick=async e=>{
    const b=e.target.closest('button[data-act="delcounter"]');if(!b||!guard())return;
    const id=Number(b.dataset.k),c=counters().find(x=>x.id===id);
    if(!confirm(t('co.removeQ',{n:c?c.name+' '+c.nameZh:id})))return;
    try{await saveSettings({counters:counters().filter(x=>x.id!==id)});toast(t('co.removed'));}catch(e){werr(e);}
  };

  /* texts & paper */
  $('btnSave').onclick=async()=>{
    if(!guard())return;
    if(!confirm(t('tx.saveQ')))return;
    try{
      await saveSettings({title:$('setTitle').value,subtitle:$('setSubtitle').value,note:$('setNote').value,
        ticketNote:$('setTicketNote').value,paper:$('paper58').checked?'58':'80'});
      toast(t('c.saved'));
    }catch(e){werr(e);}
  };

  /* free print */
  $('freeImage').addEventListener('change',function(){
    const f=this.files[0];if(!f)return;
    const maxW=(STATE&&STATE.settings.paper==='58')?384:576;
    resizeImage(f,maxW,data=>{S.freeImage=data;const pv=$('freeImgPreview');pv.src=data;pv.style.display='block';toast(t('fp.imgLoaded'));});
  });
  $('btnClearImg').onclick=()=>{S.freeImage=null;$('freeImage').value='';$('freeImgPreview').style.display='none';};
  $('btnFreePrint').onclick=async()=>{
    if(!guard())return;
    const text=$('freeText').value.trim();
    if(!text&&!S.freeImage)return toast(t('fp.needContent'));
    if(!confirm(t('fp.sendQ')))return;
    const copies=Math.max(1,Math.min(10,+$('freeCopies').value||1));
    try{await stateRef.child('printQueue').push({type:'free',text,image:S.freeImage,copies,createdAt:Date.now(),done:false});toast(t('k.sent'));}catch(e){werr(e);}
  };
  $('btnQTest').onclick=async()=>{
    if(!guard())return;
    if(!confirm(t('fp.qTestQ')))return;
    try{await stateRef.child('printQueue').push({type:'free',text:'TEST 測試列印\n'+nowLabel(),image:null,copies:1,createdAt:Date.now(),done:false});toast(t('fp.testSent'));}catch(e){werr(e);}
  };
  $('btnQLast').onclick=async()=>{
    if(!guard())return;
    const ts=ticketsArr().sort((a,b)=>b.no-a.no);
    if(!ts.length)return toast(t('fp.noTickets'));
    const x=ts[0];
    if(!confirm(t('fp.qLastQ',{l:x.label})))return;
    try{await remotePrint(x,true);toast(t('fp.reprintSent',{l:x.label}));}catch(e){werr(e);}
  };
  $('btnQList').onclick=async()=>{
    if(!guard())return;
    const w=waiting();
    if(!w.length)return toast(t('fp.noWaiting'));
    if(!confirm(t('fp.qListQ')))return;
    try{await stateRef.child('printQueue').push({type:'waitlist',items:w.map(x=>({l:x.label,t:(x.time||'').slice(11,16)})),session:STATE.session.prefix,createdAt:Date.now(),done:false});toast(t('fp.listSent'));}catch(e){werr(e);}
  };

  /* tickets filter */
  document.querySelectorAll('#tSeg button').forEach(b=>b.onclick=()=>{S.tFilter=b.dataset.f;document.querySelectorAll('#tSeg button').forEach(x=>x.classList.toggle('on',x===b));safe(renderTickets,'tickets');});

  /* users */
  document.querySelectorAll('#uSeg button').forEach(b=>b.onclick=()=>{S.uFilter=b.dataset.f;document.querySelectorAll('#uSeg button').forEach(x=>x.classList.toggle('on',x===b));safe(renderUsers,'users');});
  $('uBody').onclick=e=>{
    const b=e.target.closest('button[data-act]');if(!b)return;
    const uid=b.dataset.k,a=b.dataset.act;
    if(a==='approve')userSet(uid,{status:'approved'});
    if(a==='reject'){if(!confirm(t('u.rejectQ')))return;userSet(uid,{status:'rejected'});}
    if(a==='edituser')openUe(uid);
    if(a==='deluser')openUd(uid);
  };
  $('ueCancel').onclick=closeUe;
  $('ueModal').addEventListener('click',e=>{if(e.target===$('ueModal'))closeUe();});
  $('ueSave').onclick=async()=>{
    if(!S.ueUid)return;
    await userSet(S.ueUid,{role:$('ueRole').value,status:$('ueStatus').value});
    closeUe();
  };
  $('udCancel').onclick=closeUd;
  $('udModal').addEventListener('click',e=>{if(e.target===$('udModal'))closeUd();});
  $('udInput').addEventListener('input',validateUd);
  $('udInput').addEventListener('keydown',e=>{if(e.key==='Enter'&&!$('udOk').disabled)$('udOk').click();});
  $('udOk').onclick=async()=>{
    const u=udRec();if(!u||S.udBusy||!guardHead())return;
    if(S.user&&S.udUid===S.user.uid)return toast(t('u.noSelf'));
    if($('udInput').value.trim().toLowerCase()!==String(u.email||'').toLowerCase())return;
    S.udBusy=true;$('udOk').disabled=true;$('udCancel').disabled=true;$('udInput').disabled=true;
    $('udStatus').textContent=t('c.processing');$('udStatus').className='status';
    const uid=S.udUid;let authDeleted=false;
    try{
      const ep=(window.APP_CONFIG&&APP_CONFIG.deleteEndpoint)||'';
      if(ep){
        const token=await S.user.getIdToken();
        const res=await fetch(ep,{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+token},body:JSON.stringify({data:{uid}})});
        const j=await res.json().catch(()=>({}));
        if(!res.ok||j.error)throw new Error((j.error&&j.error.message)||('HTTP '+res.status));
        authDeleted=true;
      }
      await db.ref('admins/'+uid).remove();
      await db.ref('users/'+uid).remove();
      S.udBusy=false;closeUd();toast(authDeleted?t('u.allDone'):t('u.done'));
    }catch(x){S.udBusy=false;$('udCancel').disabled=false;$('udInput').disabled=false;validateUd();
      $('udStatus').textContent=t('u.fail')+': '+(x.message||x);$('udStatus').className='status err';}
  };

  /* audit */
  document.querySelectorAll('#aSeg button').forEach(b=>b.onclick=()=>{S.aView=b.dataset.v;document.querySelectorAll('#aSeg button').forEach(x=>x.classList.toggle('on',x===b));safe(renderAudit,'audit');});
  $('adKind').onchange=()=>safe(renderAudit,'audit');
  $('adQ').addEventListener('input',()=>safe(renderAudit,'audit'));
  $('btnAdExport').onclick=()=>{if(!guardHead())return;download('queue-audit-'+Date.now()+'.json',{sessions:S.sessions,audit:S.audit});toast(t('c.exported'));};
  $('btnAdPurge').onclick=async()=>{
    if(!guardHead())return;
    const before=$('adFrom').value;
    if(!before)return toast(t('ad.from'));
    if(!confirm(t('ad.purgeQ')))return;
    const cut=new Date(before+'T00:00:00').getTime();
    const old=S.audit.filter(a=>(a.ts||0)<cut);
    if(!old.length)return toast(t('ad.noData'));
    const upd={};old.forEach(a=>{if(a._id)upd[a._id]=null;});
    try{await db.ref('audit').update(upd);toast(t('ad.purged',{n:old.length}));}catch(e){werr(e);}
  };

  /* settings */
  $('backup').onclick=async()=>{
    if(!guardAdmin())return;
    try{const s=await stateRef.once('value');download('queue-backup-'+Date.now()+'.json',{exportedAt:new Date().toISOString(),data:s.val()||{}});toast(t('st.backupOk'));}catch(e){werr(e);}
  };
  $('retry').onclick=()=>{S.runtime=[];attachHead();renderEverything();toast(t('c.retry'));};
  $('copyDiag').onclick=async()=>{
    const txt=JSON.stringify({at:new Date().toISOString(),uid:S.user&&S.user.uid,role:S.role,loaded:S.loaded,errors:S.errors,counts:S.counts,runtime:S.runtime},null,2);
    try{await navigator.clipboard.writeText(txt);toast(t('st.copied'));}catch(e){download('diagnostics.json',txt);toast(t('c.exported'));}
  };
  $('delTickets').onclick=()=>openDg('tickets');
  $('delAll').onclick=()=>openDg('all');
  $('dgCancel').onclick=closeDg;
  $('dgModal').addEventListener('click',e=>{if(e.target===$('dgModal'))closeDg();});
  $('dgInput').addEventListener('input',()=>{const c=DG[S.dgScope];if(c)$('dgOk').disabled=$('dgInput').value.trim().toUpperCase()!==c.phrase;});
  $('dgOk').onclick=async()=>{
    const sc=S.dgScope,c=DG[sc];if(!c||S.dgBusy||!guard())return;
    if($('dgInput').value.trim().toUpperCase()!==c.phrase)return;
    S.dgBusy=true;$('dgOk').disabled=true;$('dgCancel').disabled=true;$('dgInput').disabled=true;
    try{
      if($('dgBackup').checked){
        const snap=await (sc==='all'?stateRef:stateRef.child('tickets')).once('value');
        download('backup-'+sc+'-'+Date.now()+'.json',{scope:sc,exportedAt:new Date().toISOString(),data:snap.val()||{}});
      }
      if(sc==='all')await stateRef.set(DEFAULTS);
      else await clearTickets();
      S.dgBusy=false;closeDg();toast(sc==='all'?t('c.deleted'):t('c.cleared'));
    }catch(x){S.dgBusy=false;$('dgCancel').disabled=false;$('dgInput').disabled=false;
      $('dgStatus').textContent=t('c.fail')+': '+(x.message||x);$('dgStatus').className='status err';}
  };
  document.addEventListener('keydown',e=>{
    if(e.key!=='Escape')return;
    closeUe();closeUd();closeDg();
  });
  document.addEventListener('langchange',()=>{I18N.apply();renderEverything();if(S.profile)$('acRole').value=roleLabel(S.profile.role);applyRoleGates();});
  setInterval(()=>{safe(renderOverview,'overview');if(S.page==='audit')safe(renderAudit,'audit');},15000);
}

/* ---------- boot ---------- */
function start(user,profile){
  S.user=user;S.profile=profile;S.role=profile.role||'staff';
  S.isHead=S.role==='head';S.canManage=S.role==='head'||S.role==='admin';
  $('acEmail').value=user.email||'';$('acRole').value=roleLabel(S.role);$('acUid').value=user.uid;
  applyRoleGates();
  if(!S.canManage){$('console').style.display='none';$('denied').style.display='block';return;}
  $('console').style.display='';$('denied').style.display='none';
  S.started=true;
  attachHead();
  renderEverything();
}
I18N.apply();I18N.mountToggle();
onState(s=>{S.loaded.queue=true;delete S.errors.queue;S.counts.queue=Object.keys(s.tickets||{}).length;safe(renderEverything,'state');});
Auth.start(start);
document.addEventListener('auth-profile',e=>{
  const p=e.detail.profile;
  S.user=e.detail.user;S.profile=p;S.role=p.role||'staff';S.isHead=S.role==='head';S.canManage=S.role==='head'||S.role==='admin';
  $('acRole').value=roleLabel(S.role);
  applyRoleGates();
  if(!S.canManage){$('console').style.display='none';$('denied').style.display='block';detachHead();}
  else{$('console').style.display='';$('denied').style.display='none';if(!S.started)start(S.user,p);else attachHead();}
});
wire();
applyRoleGates();
showPage(location.hash.slice(1)||'overview');
})();
