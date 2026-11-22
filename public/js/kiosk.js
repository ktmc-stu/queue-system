/* js/kiosk.js — public ticketing; reprint & paper are admin-role gated (no shared password) */
const $=id=>document.getElementById(id);
let busy=false,backTimer=null,takenNo=null,shownAt=0,rpTicket=null;

document.addEventListener('pointerdown',()=>{ if(takenNo!=null && Date.now()-shownAt>1500) goHome(); });

onState(s=>{
  $('sessChip').textContent=t('k.session')+' '+((s.session&&s.session.prefix)||'A');
  $('heroTitle').textContent=s.settings.title;
  $('heroSub').textContent=s.settings.subtitle;
  $('note').textContent=s.settings.note;
  $('ppCur').textContent=(s.settings.paper==='58')?'58mm':'80mm';
  const w=waiting(),counters=(s.settings.counters||[]).length||1,avg=s.settings.avgMinutes||3;
  $('statWait').textContent=w.length;
  $('statEst').textContent=Math.ceil(w.length*avg/counters);
  if(takenNo!=null){
    const ahead=w.filter(x=>x.no<takenNo).length;
    $('tvAhead').textContent=ahead;
    $('tvEst').textContent=Math.ceil(ahead*avg/counters);
  }
});

$('takeBtn').onclick=async()=>{
  if(busy)return;
  if(!STATE||!STATE.session||!STATE.session.prefix)return toast(t('k.notReady'));
  busy=true;
  try{
    const x=await takeTicket();
    takenNo=x.no;shownAt=Date.now();
    $('tvNum').textContent=x.label;
    $('tvMeta').textContent=t('k.session')+' '+STATE.session.prefix+' · '+x.time;
    $('homeView').style.display='none';$('ticketView').style.display='flex';
    remotePrint(x,false).then(()=>toast(t('k.sent'))).catch(()=>toast(t('k.sentFail')));
    let sec=10;
    $('backCount').textContent=t('k.tapReturn',{s:sec});
    clearInterval(backTimer);
    backTimer=setInterval(()=>{sec--;$('backCount').textContent=t('k.tapReturn',{s:sec});if(sec<=0)goHome();},1000);
  }catch(e){werr(e);}
  busy=false;
};
function goHome(){
  clearInterval(backTimer);takenNo=null;
  ['ticketView','reprintView','paperView'].forEach(id=>$(id).style.display='none');
  $('homeView').style.display='flex';
}

/* ===== Paper (admin only) ===== */
$('btnPaper').onclick=()=>{
  $('homeView').style.display='none';$('paperView').style.display='flex';
  const ok=Auth.isAdmin();
  $('ppDenied').style.display=ok?'none':'block';
  $('ppChoose').style.display=ok?'block':'none';
};
$('ppBack1').onclick=goHome;
$('pp80').onclick=async()=>{if(!guardAdmin())return;try{await saveSettings({paper:'80'});toast(t('k.paperSaved'));}catch(e){werr(e);}};
$('pp58').onclick=async()=>{if(!guardAdmin())return;try{await saveSettings({paper:'58'});toast(t('k.paperSaved'));}catch(e){werr(e);}};

/* ===== Reprint (admin only) ===== */
$('btnReprint').onclick=()=>{
  $('homeView').style.display='none';$('reprintView').style.display='flex';
  $('rpPreview').style.display='none';
  const ok=Auth.isAdmin();
  $('rpDenied').style.display=ok?'none':'block';
  $('rpList').style.display=ok?'block':'none';
  if(ok)renderRpList();
};
$('rpBack1').onclick=goHome;
$('rpBack3').onclick=()=>{$('rpPreview').style.display='none';$('rpList').style.display='block';};
function renderRpList(){
  const ts=ticketsArr().sort((a,b)=>b.no-a.no).slice(0,60);
  $('rpItems').innerHTML=ts.map(x=>'<button class="rp-chip" data-k="'+esc(x.key)+'">'+esc(x.label)+'</button>').join('')||'<p class="muted">'+esc(t('k.noTickets'))+'</p>';
}
$('rpItems').onclick=e=>{
  const k=e.target.dataset.k;if(!k)return;
  const x=ticketsArr().find(y=>y.key===k);if(!x)return;
  rpTicket=x;
  $('rpPrevBody').innerHTML=
    '<div class="rp-ticket"><div class="badge">Reprinted 重新列印</div>'
    +'<div class="center b">觀塘瑪利諾書院</div><div class="center" style="font-size:11px">KWUN TONG MARYKNOLL COLLEGE</div>'
    +'<div class="center" style="margin-top:6px">號碼票 QUEUE TICKET</div>'
    +'<div class="num">'+esc(x.label)+'</div>'
    +'<div>發行時間 Issuing Time: '+esc(x.time)+'</div>'
    +'<div>重印時間 Reprint Time: '+nowLabel()+'</div>'
    +'<div>時段 Session: '+esc(STATE.session.prefix)+'</div></div>';
  $('rpList').style.display='none';$('rpPreview').style.display='block';
};
$('rpPrint').onclick=async()=>{
  if(!rpTicket||!guardAdmin())return;
  if(!confirm(t('k.reprintQ',{l:rpTicket.label})))return;
  try{await remotePrint(rpTicket,true);toast(t('k.sent'));}catch(e){werr(e);}
  $('rpPreview').style.display='none';$('rpList').style.display='block';
};
document.addEventListener('langchange',()=>I18N.apply());
