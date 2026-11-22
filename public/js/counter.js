/* js/counter.js — counter operations */
const $=id=>document.getElementById(id);
const cid=new URLSearchParams(location.search).get('id')||1;

onState(s=>{
  const c=counterById(cid);
  $('title').innerHTML=esc(c.name)+' <span class="hk">'+esc(c.nameZh)+'</span>';
  $('sessChip').textContent=t('k.session')+' '+((s.session&&s.session.prefix)||'A');
  const cur=currentOf(cid);
  $('curNum').textContent=cur?cur.label:'—';
  $('curInfo').textContent=cur?'Serving 服務中':'No active ticket 目前無服務中籌號';
  const w=waiting(),called=ticketsArr().filter(x=>x.status==='called');
  $('waitList').innerHTML=
    w.map(x=>'<span>'+esc(x.label)+'</span>').join('')
    +called.map(x=>'<span class="called-chip'+(String(x.counter)===String(cid)?' cur':'')+'">'+esc(x.label)+'</span>').join('')
    ||'<span class="muted">No one 暫無</span>';
  const paused=isCounterPaused(cid),btnP=$('btnPause');
  btnP.className=paused?'btn ok':'btn gray';
  btnP.innerHTML=paused?'RESUME<span class="hk">恢復服務</span>':'PAUSE<span class="hk">暫停服務</span>';
});

$('btnNext').onclick=async()=>{try{const x=await callNext(cid);toast(x?t('ct.called',{l:x.label}):t('ct.noWaiting'));}catch(e){werr(e);}};
$('btnRecall').onclick=async()=>{const x=currentOf(cid);if(!x)return toast(t('ct.nothingRecall'));try{await recall(cid);toast(t('ct.called',{l:x.label}));}catch(e){werr(e);}};
$('btnComplete').onclick=async()=>{const x=currentOf(cid);if(!x)return toast(t('ct.noActive'));try{await completeTicket(x.key);toast(t('ct.completed',{l:x.label}));}catch(e){werr(e);}};
$('btnUndo').onclick=async()=>{try{const x=await undoCall(cid);toast(x?t('ct.undone',{l:x.label}):t('ct.nothingUndo'));}catch(e){werr(e);}};
$('btnStop').onclick=async()=>{try{await stopCall(cid);toast(t('ct.stopped'));}catch(e){werr(e);}};
$('btnPause').onclick=async()=>{
  try{
    if(isCounterPaused(cid)){await resumeCounter(cid);toast(t('ct.resumed'));}
    else{await pauseCounter(cid);toast(t('ct.paused'));}
  }catch(e){werr(e);}
};
$('btnCallNum').onclick=()=>{$('keypadCard').style.display=$('keypadCard').style.display==='none'?'block':'none';};
$('btnCloseKeypad').onclick=()=>{$('keypadCard').style.display='none';};
const kp=['1','2','3','4','5','6','7','8','9','⌫','0','⌦'];
$('keypad').innerHTML=kp.map(k=>'<button data-k="'+k+'">'+k+'</button>').join('');
$('keypad').onclick=e=>{
  const k=e.target.dataset.k;if(!k)return;
  const inp=$('numInput');
  if(k==='⌫')inp.value=inp.value.slice(0,-1);
  else if(k==='⌦')inp.value='';
  else inp.value+=k;
};
$('btnGo').onclick=async()=>{
  const v=$('numInput').value.trim();if(!v)return;
  try{
    const x=await callNumber(cid,v);
    toast(x?t('ct.called',{l:x.label}):t('ct.notFound'));
    if(x){$('numInput').value='';$('keypadCard').style.display='none';}
  }catch(e){werr(e);}
};
document.addEventListener('langchange',()=>I18N.apply());
