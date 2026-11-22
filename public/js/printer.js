/* js/printer.js — remote thermal printer station (anti-sleep kept) */
(function(){
const code='setInterval(()=>postMessage(1),500);';
const w=new Worker(URL.createObjectURL(new Blob([code],{type:'application/javascript'})));
w.onmessage=()=>{};
})();
const $=id=>document.getElementById(id);
const jobs=[],seen={};
let printing=false;
function log(msg){const d=document.createElement('div');d.textContent='['+new Date().toLocaleTimeString('en-GB')+'] '+msg;$('log').prepend(d);}
function updateCount(){$('countChip').textContent=t('pr.queue')+': '+jobs.length;}

onState(s=>{
  $('dot').classList.add('on');
  $('statusText').textContent=t('pr.online');
  $('sessChip').textContent=t('k.session')+' '+((s.session&&s.session.prefix)||'A');
  $('paperChip').textContent=t('pr.paper')+': '+((s.settings.paper==='58')?'58mm':'80mm');
});

function enqueue(key,j){
  if(seen[key])return;
  seen[key]=1;jobs.push(Object.assign({key:key},j));
  updateCount();
  const name=j.type==='free'?t('pr.free'):(j.type==='waitlist'?t('pr.waitlist'):j.label);
  log(t('pr.job',{x:name+(j.reprint?' ('+t('pr.reprint')+')':'')}));
  processJobs();
}
stateRef.child('printQueue').on('child_added',snap=>{const j=snap.val();if(!j||j.done)return;enqueue(snap.key,j);});
setInterval(()=>{
  stateRef.child('printQueue').once('value').then(snap=>{
    const all=snap.val()||{};
    Object.keys(all).forEach(k=>{const j=all[k];if(j&&!j.done&&!seen[k])enqueue(k,j);});
  }).catch(()=>{});
},3000);

async function processJobs(){
  if(printing)return;
  printing=true;
  while(jobs.length){
    const j=jobs.shift();
    updateCount();
    await stateRef.child('printQueue/'+j.key).remove().catch(()=>{});
    printJob(j);
    await new Promise(r=>setTimeout(r,900));
  }
  printing=false;
}
const DEFAULT_TICKET_NOTE='請妥善保管此籌號，並留意顯示屏及廣播。\nPlease keep this ticket and wait for your turn.\n若連續叫號3次後仍未到場，籌號將作廢。\nYour ticket will be canceled after three missed calls.\n如不慎過號，請重新取號輪候。\nPlease get a new ticket if you missed your turn.';
function noteHTML(){
  const txt=(STATE&&STATE.settings&&STATE.settings.ticketNote)?STATE.settings.ticketNote:DEFAULT_TICKET_NOTE;
  return esc(txt).replace(/\n/g,'<br>');
}
function ticketHTML(j){
  return (j.reprint?'<div class="t-reprint">Reprinted 重新列印</div>':'')
  +'<div class="t-head"><img src="img/logo.png" alt="logo"><div><div class="t-school-zh">觀塘瑪利諾書院</div><div class="t-school-en">KWUN TONG MARYKNOLL COLLEGE</div></div></div>'
  +'<div class="t-center"><div class="t-title">號碼票</div><div class="t-title-en">QUEUE TICKET</div>'
  +'<div class="t-num">'+esc(j.label)+'</div>'
  +'<div class="t-row">發行時間 Issuing Time: '+esc(j.time)+'</div>'
  +(j.reprint?'<div class="t-row">重印時間 Reprint Time: '+nowLabel()+'</div>':'')
  +'<div class="t-row">時段 Session: '+esc(j.session)+'</div></div>'
  +'<div class="t-note">'+noteHTML()+'</div>';
}
function freeHTML(j){
  let h='<div class="f-wrap">';
  if(j.image)h+='<img class="f-img" src="'+j.image+'">';
  if(j.text)h+='<div class="f-text">'+esc(j.text).replace(/\n/g,'<br>')+'</div>';
  return h+'</div>';
}
function listHTML(j){
  const cols=4,items=j.items||[];
  let rows='';
  for(let i=0;i<items.length;i+=cols){
    rows+='<tr>'+items.slice(i,i+cols).map(x=>{
      if(typeof x==='string')return '<td>'+esc(x)+'</td>';
      return '<td>'+esc(x.l)+(x.t?'<div class="wt">'+esc(x.t)+'</div>':'')+'</td>';
    }).join('')+'</tr>';
  }
  return '<div class="f-wrap"><div class="f-title">等候名單 Waiting List</div>'
    +'<div class="f-sub">時段 Session '+esc(j.session||'')+' ・ 共 '+items.length+' 位 Total<br>列印時間 Print Time：'+nowLabel()+'</div>'
    +'<table class="w-table">'+rows+'</table></div>';
}
function printJob(j){
  const pa=$('printArea');
  const isFree=(j.type==='free'||j.type==='waitlist');
  pa.className=isFree?'f-free':((STATE&&STATE.settings.paper==='58')?'p58':'');
  pa.innerHTML=isFree?((j.type==='waitlist')?listHTML(j):freeHTML(j)):ticketHTML(j);
  const copies=Math.max(1,j.copies||1);
  setTimeout(()=>{
    for(let i=0;i<copies;i++)window.print();
    log(t('pr.sent',{x:j.label||t('pr.free'),n:copies}));
  },250);
}
$('btnTest').onclick=()=>printJob({type:'free',text:'TEST 測試列印\n'+nowLabel(),copies:1});
$('btnClearQueue').onclick=async()=>{
  if(!confirm(t('pr.clearQ')))return;
  try{await stateRef.child('printQueue').remove();jobs.length=0;updateCount();log(t('pr.cleared'));}catch(e){werr(e);}
};
document.addEventListener('langchange',()=>{I18N.apply();updateCount();});
updateCount();
log(t('pr.ready'));
