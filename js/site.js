/* ToolBestie — shared helpers: theme, nav, toast, clipboard, escaping, hub search */
function esc(s){return String(s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}

function toast(msg,type){
  var c=document.getElementById('toasts'); if(!c) return;
  var t=document.createElement('div'); t.className='toast '+(type||''); t.textContent=String(msg);
  c.appendChild(t);
  setTimeout(function(){t.style.transition='opacity .25s';t.style.opacity='0';setTimeout(function(){t.remove();},260);},3200);
}

async function clip(t){
  var text=String(t);
  try{
    if(navigator.clipboard&&window.isSecureContext){await navigator.clipboard.writeText(text);}
    else{
      var ta=document.createElement('textarea'); ta.value=text; ta.setAttribute('readonly','');
      ta.style.cssText='position:fixed;opacity:0'; document.body.appendChild(ta); ta.select();
      var ok=document.execCommand('copy'); ta.remove(); if(!ok) throw new Error('blocked');
    }
    toast('Copied to clipboard','ok'); return true;
  }catch(e){toast('Copy failed. Check browser clipboard permissions.','err'); return false;}
}

function setTheme(t){
  document.documentElement.dataset.theme=t;
  try{localStorage.setItem('tb-theme',t);}catch(e){}
  syncThemeBtn();
}
function toggleTheme(){
  setTheme(document.documentElement.dataset.theme==='light'?'dark':'light');
}
function syncThemeBtn(){
  var b=document.getElementById('themeBtn'); if(!b) return;
  var light=document.documentElement.dataset.theme==='light';
  b.setAttribute('aria-label',light?'Switch to dark theme':'Switch to light theme');
  b.title=light?'Switch to dark theme':'Switch to light theme';
}

document.addEventListener('DOMContentLoaded',function(){
  syncThemeBtn();
  var tb=document.getElementById('themeBtn'); if(tb) tb.addEventListener('click',toggleTheme);
  document.querySelectorAll('[data-year]').forEach(function(el){el.textContent=new Date().getFullYear();});

  var nt=document.querySelector('.nav-toggle'), nav=document.getElementById('site-nav');
  if(nt&&nav) nt.addEventListener('click',function(){
    var open=nav.classList.toggle('open'); nt.setAttribute('aria-expanded',open?'true':'false');
  });

  // Hub: filter tool cards
  var q=document.getElementById('toolFilter');
  if(q){
    var cards=[].slice.call(document.querySelectorAll('.tool-card'));
    var groups=[].slice.call(document.querySelectorAll('.group'));
    var none=document.getElementById('noMatch');
    q.addEventListener('input',function(){
      var s=q.value.toLowerCase().trim(), shown=0;
      cards.forEach(function(c){
        var hit=!s||(c.dataset.keywords||'').toLowerCase().indexOf(s)>-1||c.textContent.toLowerCase().indexOf(s)>-1;
        c.style.display=hit?'':'none'; if(hit) shown++;
      });
      groups.forEach(function(g){
        var any=[].some.call(g.querySelectorAll('.tool-card'),function(c){return c.style.display!=='none';});
        g.style.display=any?'':'none';
      });
      if(none) none.style.display=shown?'none':'block';
    });
  }
});
