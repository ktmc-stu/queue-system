/* js/display.js — big board: flash, trilingual announcements, undo/stop signals, auto-scroll */
const $=id=>document.getElementById(id);
let lastSeq=0,lastUndoSeq=0,lastStopSeq=0;
let pending=[],announcing=false,flashId=null,flashUntil=0,annLabel=null,annCounter=null;

onState(s=>{
  $('dpTitle').innerHTML=esc(s.settings.title)+' <span class="hk">'+esc(s.settings.subtitle)+'</span>';
  $('sessChip').textContent='Session 時段 '+((s.session&&s.session.prefix)||'A');
  const w=waiting();
  $('queueItems').innerHTML=w.map(x=>'<span>'+esc(x.label)+'</span>').join('')||'<span class="muted">No one waiting 暫無等候</span>';
  renderGrid(s);
  const lc=s.lastCall;
  if(lc){
    const c=counterById(lc.counter);
    $('ticker').textContent='Now Calling 現正呼叫 '+lc.ticket.label+' → '+c.name+' '+c.nameZh+' · 請 '+lc.ticket.label+' 到'+c.nameZh;
  }
  const lu=s.lastUndo;
  if(lu&&lu.seq!==lastUndoSeq){
    lastUndoSeq=lu.seq;
    pending=pending.filter(x=>!(x.ticket.label===lu.label&&Number(x.counter)===Number(lu.counter)));
    if(annLabel===lu.label&&Number(annCounter)===Number(lu.counter)){stopAudio();annLabel=null;}
    if(flashId!=null&&Number(flashId)===Number(lu.counter)){flashId=null;flashUntil=0;renderGrid(STATE);}
  }
  const ls=s.lastStop;
  if(ls&&ls.seq!==lastStopSeq){
    lastStopSeq=ls.seq;
    const all=ls.counter==='*';
    pending=all?[]:pending.filter(x=>Number(x.counter)!==Number(ls.counter));
    if(all||(annCounter!=null&&Number(annCounter)===Number(ls.counter))){stopAudio();annLabel=null;}
    if(all||(flashId!=null&&Number(flashId)===Number(ls.counter))){flashId=null;flashUntil=0;renderGrid(STATE);}
  }
  if(lc&&lc.seq!==lastSeq){lastSeq=lc.seq;pending.push(lc);processQueue();}
});

function renderGrid(s){
  const byCounter={};
  ticketsArr().forEach(x=>{
    if(x.status!=='called')return;
    const cur=byCounter[x.counter];
    if(!cur||(x.calledAt||0)>=(cur.calledAt||0))byCounter[x.counter]=x;
  });
  const ids=(s.settings.counters||[]).map(c=>c.id);
  Object.keys(byCounter).forEach(id=>{if(!ids.includes(Number(id)))ids.push(Number(id));});
  const now=Date.now();
  $('callGrid').innerHTML=ids.map(id=>{
    const x=byCounter[id],c=counterById(id);
    const active=flashId!=null&&Number(id)===Number(flashId)&&now<flashUntil;
    const num=String(c.name||'').replace(/\D/g,'')||String(id);
    const paused=s.counters&&s.counters[id]&&s.counters[id].paused;
    const numHtml=paused?'<span class="paused-txt">Suspended<small>暫停服務</small></span>':(x?esc(x.label):'—');
    return '<div class="call-item'+(active?' active':'')+'"><div class="ci-en">Counter</div><div class="ci-zh">櫃位</div><div class="ci-id">'+esc(num)+'</div><div class="ci-num">'+numHtml+'</div></div>';
  }).join('')||'<div class="call-item"><div class="ci-en muted">Counter</div><div class="ci-zh muted">櫃位</div><div class="ci-id">—</div><div class="ci-num">—</div></div>';
}

async function processQueue(){
  if(announcing)return;
  announcing=true;
  while(pending.length){
    const lc=pending.shift(),c=counterById(lc.counter);
    flashId=lc.counter;flashUntil=Date.now()+8000;
    renderGrid(STATE);
    setTimeout(()=>renderGrid(STATE),8100);
    annLabel=lc.ticket.label;annCounter=lc.counter;
    stateRef.child('nowPlaying').set({label:lc.ticket.label,counter:lc.counter,at:Date.now()}).catch(()=>{});
    const tts=STATE.settings.tts||{languages:['en','yue','zh'],repeat:1};
    await announce(tts.languages,{...tts,phrases:{
      en:buildPhrase('en',lc.ticket.label,c),
      yue:buildPhrase('yue',lc.ticket.label,c),
      zh:buildPhrase('zh',lc.ticket.label,c)
    }},false);
    annLabel=null;
  }
  announcing=false;
  stateRef.child('nowPlaying').set(null).catch(()=>{});
}

$('startTts').onclick=()=>{chime();$('startTts').style.display='none';};

function autoScrollV(el,step,interval,holdMs){
  step=step||2;interval=interval||40;holdMs=holdMs||2000;
  if(!el)return;let holding=false;
  setInterval(()=>{
    if(el.scrollHeight<=el.clientHeight+4){if(el.scrollTop)el.scrollTop=0;return;}
    if(holding)return;
    if(el.scrollTop+el.clientHeight>=el.scrollHeight-2){
      holding=true;
      setTimeout(()=>{el.scrollTo({top:0,behavior:'smooth'});setTimeout(()=>{holding=false;},900);},holdMs);
    }else el.scrollTop+=step;
  },interval);
}
function autoScrollH(el,step,interval,holdMs){
  step=step||2;interval=interval||40;holdMs=holdMs||2000;
  if(!el)return;let holding=false;
  setInterval(()=>{
    if(el.scrollWidth<=el.clientWidth+4){if(el.scrollLeft)el.scrollLeft=0;return;}
    if(holding)return;
    if(el.scrollLeft+el.clientWidth>=el.scrollWidth-2){
      holding=true;
      setTimeout(()=>{el.scrollTo({left:0,behavior:'smooth'});setTimeout(()=>{holding=false;},900);},holdMs);
    }else el.scrollLeft+=step;
  },interval);
}
autoScrollV($('callGrid'));
autoScrollH($('queueItems'));
document.addEventListener('langchange',()=>I18N.apply());
