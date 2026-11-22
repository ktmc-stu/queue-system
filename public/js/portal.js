/* js/portal.js — live portal: stats, now-calling preview, counter board, printer batch file */
(function(){
const $=id=>document.getElementById(id);
const S={terminals:{},connected:false};
const tick=()=>{$('clock').textContent=new Date().toLocaleTimeString('en-GB');};
tick();setInterval(tick,1000);
const nav=$('nav');
addEventListener('scroll',()=>nav.classList.toggle('scrolled',scrollY>10),{passive:true});
const links=[...document.querySelectorAll('.navlinks a')];
const io=new IntersectionObserver(es=>es.forEach(e=>{if(e.isIntersecting)links.forEach(l=>l.classList.toggle('on',l.getAttribute('href')==='#'+e.target.id));}),{rootMargin:'-40% 0px -55% 0px'});
links.forEach(a=>{const s=document.querySelector(a.getAttribute('href'));if(s)io.observe(s);});
const rio=new IntersectionObserver(es=>es.forEach(e=>{if(e.isIntersecting){e.target.classList.add('in');rio.unobserve(e.target);}}),{threshold:.12});
document.querySelectorAll('.reveal').forEach(el=>rio.observe(el));

function renderHealth(){
  const h=$('health');h.className='health '+(S.connected?'ok':'bad');
  h.querySelector('span').textContent=t(S.connected?'po.connected':'po.disconnected');
}
function counterOnline(id){
  return Object.values(S.terminals).some(x=>x&&x.kind==='counter'&&String(x.counter)===String(id)&&termOnline(x));
}
function render(){
  if(!STATE){renderHealth();return;}
  const w=waiting(),all=ticketsArr();
  $('stWait').textContent=w.length;
  $('stServ').textContent=all.filter(x=>x.status==='called').length;
  $('stIssued').textContent=all.length;
  const terms=Object.values(S.terminals),on=terms.filter(termOnline).length;
  $('stOn').textContent=on+'/'+terms.length;
  $('sessChip').textContent=t('se.session')+' '+((STATE.session&&STATE.session.prefix)||'A');
  const lc=STATE.lastCall;
  if(lc){const c=counterById(lc.counter);$('cpNum').textContent=lc.ticket.label;$('cpCounter').textContent=c.name+' · '+c.nameZh;}
  else{$('cpNum').textContent='—';$('cpCounter').textContent=t('po.noCall');}
  $('wchips').innerHTML=w.slice(0,10).map(x=>'<span>'+esc(x.label)+'</span>').join('')+(w.length>10?'<span>+'+(w.length-10)+'</span>':'')||'<span class="muted">'+esc(t('po.noCall'))+'</span>';
  const cs=STATE.settings.counters||[],b=$('board');
  if(!cs.length){b.innerHTML='<div class="empty">'+esc(t('po.none'))+'</div>';return;}
  b.innerHTML=cs.map(c=>{
    const cur=currentOf(c.id),paused=isCounterPaused(c.id),online=counterOnline(c.id);
    return '<div class="station"><div class="st-top"><span class="dot'+(online?' on':'')+'"></span><span class="st-name">'+esc(c.name)+'</span><span class="st-token">'+esc(c.nameZh)+'</span></div>'
      +'<div class="st-meta"><span class="meta">'+esc(t('s.serving'))+' '+esc(cur?cur.label:'—')+'</span>'+(paused?'<span class="ust rejected">'+esc(t('ct.paused'))+'</span>':'')+'</div>'
      +'<div class="st-foot"><span class="'+(online?'mono':'faint')+'">'+esc(t(online?'c.online':'c.offline'))+'</span><a class="btn ghost mini" href="counter.html?id='+encodeURIComponent(c.id)+'">'+esc(t('c.open'))+'</a></div></div>';
  }).join('');
  renderHealth();
}
function batText(){
  const url=location.href.replace(/[^/]*$/,'')+'printer.html';
  return ['@echo off','start "" "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe" --kiosk --kiosk-printing --user-data-dir="C:\\queue-profile" --app="'+url+'" --disable-features=IntensiveWakeUpThrottling --disable-background-timer-throttling --disable-backgrounding-occluded-windows --disable-renderer-backgrounding --no-first-run --no-default-browser-check --disable-infobars',''].join('\r\n');
}
function dl(){const b=new Blob([batText()],{type:'application/octet-stream'}),a=document.createElement('a');a.href=URL.createObjectURL(b);a.download='StartQueuePrinter.bat';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1500);toast(t('po.downloaded'));}
I18N.apply();I18N.mountToggle();
$('batCode').textContent=batText();
$('dlBat').onclick=dl;
$('cpBat').onclick=async()=>{try{await navigator.clipboard.writeText(batText());toast(t('po.copied'));}catch(e){toast(t('po.copyFail'));}};
onState(()=>render());
document.addEventListener('langchange',()=>{I18N.apply();render();});
Auth.start(()=>{
  stateRef.child('terminals').on('value',s=>{S.terminals=s.val()||{};render();},()=>{});
  db.ref('.info/connected').on('value',s=>{S.connected=s.val()===true;renderHealth();});
  setInterval(render,15000);
});
renderHealth();
})();
