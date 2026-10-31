/* JSON Viewer & Formatter — UI. Depends on json-core.js and site.js */
var parsed=null,parsedOk=false,view='raw',srchQ='',selRow=null,ctxData={};
var lastErr=null,lastErrPos=-1,errLineIdx=-1,forceTree=false,inputTimer=null;
var TREE_LIMIT=40000;
var IC={wrench:'<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.8-3.8a6 6 0 0 1-7.9 7.9l-6.9 6.9a2.1 2.1 0 0 1-3-3l6.9-6.9a6 6 0 0 1 7.9-7.9z"/>',
 locate:'<circle cx="12" cy="12" r="3"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/>',
 tree:'<path d="M3 5h4M3 12h4M3 19h4"/><path d="M7 5v14"/><path d="M7 12h6M7 19h6M7 5h6"/><path d="M17 5h4M17 12h4M17 19h4"/>',
 code:'<path d="m16 18 6-6-6-6"/><path d="m8 6-6 6 6 6"/>'};
function ico(n){return '<svg class="ico" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+IC[n]+'</svg>';}
function $(id){return document.getElementById(id);}

// ─── Input ───────────────────────────────────────────────────
function onInputSoon(){
  var len=$('inp').value.length;
  clearTimeout(inputTimer);
  if(len>100000){inputTimer=setTimeout(onInput,250);} else onInput();
}
function onInput(){
  var raw=$('inp').value,fromRaw=rawSrc;rawSrc=false;
  syncOutClass();
  updateLines(raw); renderLineNums(raw); clearErrGutter(); forceTree=false;
  if(!raw.trim()){
    parsed=null;parsedOk=false;lastErr=null;lastErrPos=-1;
    setStatus('idle');clearStats();if(view==='raw'){if(fromRaw)rawMeta();else renderRawEditor();}else showEmpty();
    $('fixBtn').style.display='none';$('sbarLoc').style.display='none';return;
  }
  try{
    parsed=JSON.parse(raw);parsedOk=true;lastErr=null;lastErrPos=-1;
    setStatus('ok','Valid JSON');calcStats(parsed);
    $('fixBtn').style.display='none';$('sbarLoc').style.display='none';
    if(view==='validate') showValidate(raw); else if(view==='raw'){if(fromRaw)rawMeta();else renderRawEditor();} else render();
  }catch(e){
    parsed=null;parsedOk=false;lastErr=e;
    lastErrPos=extractErrPos(raw,e);
    setStatus('err','Invalid JSON');clearStats();
    $('fixBtn').style.display='inline-flex';
    showErrLoc(lastErrPos,raw);showErrGutter(raw,lastErrPos);
    if(view==='validate') showValidate(raw); else if(view==='raw'){if(fromRaw)rawMeta();else renderRawEditor();} else showRichError(raw,e,lastErrPos);
  }
}

function onKey(e){
  var c=e.ctrlKey||e.metaKey,k=e.key.toLowerCase();
  if(c&&!e.shiftKey&&k==='enter'){e.preventDefault();doFormat();}
  else if(c&&!e.shiftKey&&k==='m'){e.preventDefault();doMinify();}
  else if(c&&e.shiftKey&&k==='f'){e.preventDefault();doFix();}
}
document.addEventListener('keydown',function(e){
  var c=e.ctrlKey||e.metaKey,k=e.key.toLowerCase();
  if(k==='escape'){
    var layer=$('modal').classList.contains('on')||$('ctx').classList.contains('on');
    closeModal();closeCtx();
    if(!layer&&fsOn)setFullscreen(false);
    return;
  }
  if(c&&e.shiftKey&&k==='enter'){e.preventDefault();toggleFullscreen();return;}
  if(c&&k==='k'){e.preventDefault();if(layMode==='in')setLayout('split');if(view!=='tree'&&view!=='raw')setView('raw');$('srch').focus();}
  else if(c&&!e.shiftKey&&k==='o'){e.preventDefault();openFile();}
  else if(c&&!e.shiftKey&&k==='s'){e.preventDefault();exportFile();}
  else if(c&&k===']'){e.preventDefault();expandAll();}
  else if(c&&k==='['){e.preventDefault();collapseAll();}
  else if(document.activeElement!==$('inp')&&c&&e.shiftKey&&k==='f'){e.preventDefault();doFix();}
});

// ─── Line numbers & error gutter ─────────────────────────────
function renderLineNums(raw){
  var n=raw?raw.split('\n').length:1,a=new Array(n);
  for(var i=0;i<n;i++)a[i]=i+1;
  $('lineNums').textContent=a.join('\n');
  syncScroll();
}
function syncScroll(){
  var ta=$('inp');$('lineNums').scrollTop=ta.scrollTop;
  if(errLineIdx>=0) placeGutter();
}
function placeGutter(){
  var ta=$('inp'),g=$('errGutter'),cs=getComputedStyle(ta);
  var lh=parseFloat(cs.lineHeight)||21.45,pt=parseFloat(cs.paddingTop)||14;
  g.style.top=(pt+errLineIdx*lh-ta.scrollTop)+'px';g.style.height=lh+'px';g.style.display='block';
}
function showErrGutter(raw,pos){
  if(pos<0){errLineIdx=-1;return;}
  errLineIdx=raw.substring(0,pos).split('\n').length-1;placeGutter();
}
function clearErrGutter(){errLineIdx=-1;$('errGutter').style.display='none';}

// ─── Error position ──────────────────────────────────────────
function extractErrPos(text,err){
  var msg=err.message,m1=msg.match(/at position (\d+)/i);
  if(m1) return Math.min(parseInt(m1[1],10),text.length);
  var m2=msg.match(/line (\d+) column (\d+)/i);
  if(m2) return lineColToPos(text,parseInt(m2[1],10),parseInt(m2[2],10));
  if(/end of (the )?(json )?(input|data)|unexpected end/i.test(msg)) return Math.max(0,text.replace(/\s+$/,'').length);
  return scanForErrorPos(text);
}
function lineColToPos(text,line,col){
  var lines=text.split('\n'),pos=0;
  for(var i=0;i<line-1&&i<lines.length;i++)pos+=lines[i].length+1;
  return pos+col-1;
}
function posToLineCol(text,pos){
  var lines=text.substring(0,Math.max(0,pos)).split('\n');
  return {line:lines.length,col:lines[lines.length-1].length+1};
}
function scanForErrorPos(text){
  var inStr=false,esc2=false,depth=0;
  for(var i=0;i<text.length;i++){
    var c=text[i];
    if(esc2){esc2=false;continue;}
    if(inStr){if(c==='\\')esc2=true;else if(c==='"')inStr=false;continue;}
    if(c==='"'){inStr=true;continue;}
    if(c==='{'||c==='['){depth++;continue;}
    if(c==='}'||c===']'){if(--depth<0)return i;continue;}
    if(c===','){var j=i+1;while(j<text.length&&/\s/.test(text[j]))j++;if(text[j]==='}'||text[j]===']')return i;}
  }
  return -1;
}
function showErrLoc(pos,raw){
  var el=$('sbarLoc');
  if(pos<0){el.style.display='none';return;}
  var lc=posToLineCol(raw,pos);
  el.textContent='Line '+lc.line+', column '+lc.col+' (jump)';el.style.display='inline';
}
function gotoErrPos(){
  var ta=$('inp');if(lastErrPos<0)return;
  ta.focus();ta.setSelectionRange(lastErrPos,Math.min(lastErrPos+1,ta.value.length));
}

// ─── Rich error card ─────────────────────────────────────────
function showRichError(raw,err,pos){
  var locText='',lineNum=-1,colNum=-1;
  if(pos>=0){var lc=posToLineCol(raw,pos);lineNum=lc.line;colNum=lc.col;locText='Line '+lineNum+', column '+colNum+' (position '+pos+')';}
  var ctxHtml='';
  if(lineNum>0){
    var lines=raw.split('\n'),from=Math.max(0,lineNum-3),to=Math.min(lines.length-1,lineNum+1);
    ctxHtml='<div class="ectx"><div class="ectx-lbl">Error context</div><div class="ectx-box">';
    for(var i=from;i<=to;i++){
      var active=i===lineNum-1,lt=lines[i].replace(/\t/g,'  ');
      if(lt.length>300) lt=lt.slice(0,300)+'…';
      ctxHtml+='<div class="ecl'+(active?' active':'')+'"><span class="ecl-num">'+(i+1)+'</span><span class="ecl-bar">'+(active?'▶':'')+'</span><span class="ecl-code">'+esc(lt)+'</span></div>';
      if(active&&colNum>0&&colNum<300){
        var dc=0;for(var ci=0;ci<Math.min(colNum-1,lines[i].length);ci++)dc+=lines[i][ci]==='\t'?2:1;
        ctxHtml+='<div class="ecptr"><span class="ecptr-pad"></span><span class="ecptr-bar"></span><span class="ecptr-arrow">'+' '.repeat(dc)+'^</span></div>';
      }
    }
    ctxHtml+='</div></div>';
  }
  var causes=diagnoseCommonIssues(raw);
  $('output').innerHTML='<div class="ecard"><div class="ecard-hdr"><div class="ecard-icon">✕</div><div class="ecard-info"><div class="ecard-title">Invalid JSON</div>'+
    (locText?'<div class="ecard-loc">'+locText+'</div>':'')+'</div>'+
    (pos>=0?'<button class="btn" onclick="gotoErrPos()" style="margin-left:auto;flex-shrink:0">'+ico('locate')+'Go to error</button>':'')+'</div>'+
    '<div class="ecard-msg">'+esc(err.message)+'</div>'+ctxHtml+
    (causes?'<div style="padding:0 16px 12px"><div class="ectx-lbl" style="margin-bottom:8px">Likely causes</div>'+causes+'</div>':'')+
    '<div class="ecard-foot"><button class="btn danger" onclick="doFix()">'+ico('wrench')+'Try auto-fix</button><span class="ecard-hint">Fixes trailing commas, single quotes, unquoted keys, comments, undefined and unclosed brackets</span></div></div>';
}
function diagnoseCommonIssues(raw){
  var r=JsonCore.inspect(raw),is=[];
  if(r.trailingCommas) is.push(['Trailing comma','Remove the comma before } or ]']);
  if(r.singleQuotes) is.push(['Single quotes','Use double quotes for strings and keys']);
  if(r.unquotedKeys.length) is.push(['Unquoted key','Wrap property names in double quotes: '+r.unquotedKeys.slice(0,3).join(', ')]);
  if(r.comments) is.push(['Comments','JSON does not allow // or /* */ comments']);
  if(r.badLiterals.length) is.push(['Non-JSON value','Replace '+r.badLiterals.slice(0,3).join(', ')+' with null, a string or a number']);
  return is.map(function(x){return '<div class="vcheck warn" style="margin-bottom:4px"><span class="vchk-ico">⚠</span><span class="vchk-lbl"><strong>'+x[0]+'</strong> — '+esc(x[1])+'</span></div>';}).join('');
}

// ─── Actions: fix / format / minify / clear ──────────────────
function isValidJson(s){try{JSON.parse(s);return true;}catch(e){return false;}}
function doFix(){
  var inp=$('inp');if(!inp.value.trim())return;
  var r=JsonCore.repair(inp.value);
  if(!r){toast('Nothing could be fixed automatically. Check the error location.','err');return;}
  inp.value=r.json;resetScroll();onInput();
  if(r.valid) toast('Fixed: '+r.repairs.join('; '),'ok');
  else toast('Applied some repairs ('+r.repairs.join('; ')+') but the JSON is still invalid.','warn');
}
function doFormat(){
  var inp=$('inp');if(!inp.value.trim())return;
  var ok=isValidJson(inp.value);
  inp.value=JsonCore.format(inp.value);resetScroll();onInput();
  toast(ok?'Formatted':'Invalid JSON — only spacing was adjusted',ok?'ok':'warn');
}
function doMinify(){
  var inp=$('inp');if(!inp.value.trim())return;
  var ok=isValidJson(inp.value);
  inp.value=JsonCore.minify(inp.value);resetScroll();onInput();
  toast(ok?'Minified':'Invalid JSON — whitespace and comments were removed',ok?'ok':'warn');
}
function doClear(){$('inp').value='';onInput();(view==='raw'&&$('rawEd')?$('rawEd'):$('inp')).focus();}

// ─── Status & stats ──────────────────────────────────────────
function setStatus(state,msg){
  $('sdot').className='sdot'+(state==='ok'?' ok':state==='err'?' err':'');
  var t=$('smsg');t.className='sbar-msg'+(state==='ok'?' ok':state==='err'?' err':'');
  t.textContent=msg||'Ready';
}
function calcStats(d){
  $('stats').style.display='flex';
  $('skeys').textContent=countNodes(d).toLocaleString();
  $('ssize').textContent=fmtBytes($('inp').value.length);
  $('sdepth').textContent=getDepth(d);
}
function clearStats(){$('stats').style.display='none';}
function countNodes(v){
  if(v===null||typeof v!=='object')return 1;
  var n=Array.isArray(v)?v.length:Object.keys(v).length;
  for(var k in v)n+=countNodes(v[k]);return n;
}
function getDepth(v){
  if(v===null||typeof v!=='object')return 0;
  var m=0;for(var k in v)m=Math.max(m,getDepth(v[k]));return m+1;
}
function fmtBytes(n){return n<1024?n+' B':n<1048576?(n/1024).toFixed(1)+' KB':(n/1048576).toFixed(1)+' MB';}
function updateLines(v){
  var el=$('slines');if(!v.trim()){el.textContent='';return;}
  el.textContent=v.split('\n').length.toLocaleString()+' lines · '+fmtBytes(v.length);
}

// ─── Views ───────────────────────────────────────────────────
function setView(v){
  view=v;
  ['tree','raw','min','validate'].forEach(function(t){
    var el=$('tab-'+t);el.classList.toggle('on',t===v);el.setAttribute('aria-selected',t===v?'true':'false');
  });
  document.querySelector('.pane-right').setAttribute('data-view',v);syncOutClass();if(v!=='raw')$('srchCnt').textContent='';
  var raw=$('inp').value;
  if(v==='raw'){renderRawEditor();return;}
  if(v==='validate')showValidate(raw);
  else if(!parsedOk){if(lastErr)showRichError(raw,lastErr,lastErrPos);else showEmpty();}
  else render();
}
function render(){
  if(!parsedOk){showEmpty();return;}
  if(view==='tree'){
    if(!forceTree&&countNodes(parsed)>TREE_LIMIT){showTreeLimit();return;}
    renderTree(parsed);
  }else if(view==='raw')renderRawEditor();
  else if(view==='min')renderRaw(true);
}
function showTreeLimit(){
  $('output').innerHTML='<div class="big-note"><strong>Large document ('+countNodes(parsed).toLocaleString()+' nodes)</strong><p>The tree view is paused above '+TREE_LIMIT.toLocaleString()+' nodes to keep your browser responsive. Raw and Minified views work at any size.</p><div><button class="btn primary" onclick="forceTree=true;render()">'+ico('tree')+'Render tree anyway</button> <button class="btn" onclick="setView(\'raw\')">'+ico('code')+'Open Raw view</button></div></div>';
}
function showEmpty(){
  $('output').innerHTML='<div class="empty"><div class="empty-ico">{ }</div><div class="empty-txt">No JSON to display</div><div class="empty-sub">Paste JSON in the editor, or load the sample</div></div>';
}

// ─── Validate view ───────────────────────────────────────────
function showValidate(raw){
  raw=raw||$('inp').value;
  if(!raw.trim()){showEmpty();return;}
  var r=JsonCore.inspect(raw),checks=[];
  checks.push(parsedOk?{type:'pass',ico:'✓',lbl:'Valid JSON syntax',detail:''}:{type:'fail',ico:'✕',lbl:'Invalid JSON syntax',detail:lastErr?lastErr.message.substring(0,90):'Parse error'});
  checks.push(r.trailingCommas?{type:'fail',ico:'✕',lbl:'Trailing commas',detail:'Comma before } or ]'}:{type:'pass',ico:'✓',lbl:'No trailing commas',detail:''});
  checks.push(r.comments?{type:'fail',ico:'✕',lbl:'Comments found',detail:'// and /* */ are not valid JSON'}:{type:'pass',ico:'✓',lbl:'No comments',detail:''});
  checks.push(r.singleQuotes?{type:'fail',ico:'✕',lbl:'Single-quoted strings',detail:'JSON requires double quotes'}:{type:'pass',ico:'✓',lbl:'Strings use double quotes',detail:''});
  checks.push(r.unquotedKeys.length?{type:'fail',ico:'✕',lbl:'Unquoted property keys',detail:r.unquotedKeys.slice(0,4).join(', ')}:{type:'pass',ico:'✓',lbl:'All keys are quoted',detail:''});
  checks.push(r.badLiterals.length?{type:'fail',ico:'✕',lbl:'Non-JSON values',detail:r.badLiterals.slice(0,4).join(', ')}:{type:'pass',ico:'✓',lbl:'Only valid JSON value types',detail:''});
  checks.push(r.duplicates.length?{type:'warn',ico:'⚠',lbl:'Duplicate keys in the same object',detail:r.duplicates.slice(0,4).join(', ')}:{type:'pass',ico:'✓',lbl:'No duplicate keys',detail:''});
  if(r.unsafeNumbers) checks.push({type:'warn',ico:'⚠',lbl:r.unsafeNumbers+' integer'+(r.unsafeNumbers>1?'s':'')+' beyond JavaScript’s safe range',detail:'Format and Minify keep exact digits; the tree rounds them'});
  var pass=checks.filter(function(c){return c.type==='pass';}).length,fail=checks.filter(function(c){return c.type==='fail';}).length,warn=checks.filter(function(c){return c.type==='warn';}).length;
  var status,info='';
  if(parsedOk){
    var rt=Array.isArray(parsed)?'Array':(parsed!==null&&typeof parsed==='object'?'Object':parsed===null?'null':typeof parsed);
    status='<div class="vstatus ok"><div class="vstatus-ico">✅</div><div><div class="vstatus-title">Valid JSON</div><div class="vstatus-sub">'+pass+' checks passed'+(warn?', '+warn+' warning'+(warn>1?'s':''):'')+'</div></div></div>';
    info='<div><div class="vsec-title" style="margin-bottom:8px">Statistics</div><div class="vinfo-grid">'+
      '<div class="vinfo-item"><div class="vinfo-lbl">Root type</div><div class="vinfo-val" style="font-size:16px">'+rt+'</div></div>'+
      '<div class="vinfo-item"><div class="vinfo-lbl">Depth</div><div class="vinfo-val">'+getDepth(parsed)+'</div></div>'+
      '<div class="vinfo-item"><div class="vinfo-lbl">Total nodes</div><div class="vinfo-val">'+countNodes(parsed).toLocaleString()+'</div></div>'+
      '<div class="vinfo-item"><div class="vinfo-lbl">Size</div><div class="vinfo-val" style="font-size:16px">'+fmtBytes(raw.length)+'</div></div></div></div>';
  }else{
    var lc=lastErrPos>=0?posToLineCol(raw,lastErrPos):null;
    status='<div class="vstatus err"><div class="vstatus-ico">❌</div><div><div class="vstatus-title">Invalid JSON</div><div class="vstatus-sub">'+(lc?'Error at line '+lc.line+', column '+lc.col:'Parse error')+'</div></div>'+(lastErrPos>=0?'<button class="btn danger" style="margin-left:auto;flex-shrink:0" onclick="gotoErrPos()">'+ico('locate')+'Go to error</button>':'')+'</div>';
  }
  var ch=checks.map(function(c){return '<div class="vcheck '+c.type+'"><span class="vchk-ico">'+c.ico+'</span><span class="vchk-lbl">'+c.lbl+'</span>'+(c.detail?'<span class="vchk-detail">'+esc(c.detail)+'</span>':'')+'</div>';}).join('');
  $('output').innerHTML='<div class="vcard">'+status+'<div><div class="vsec-title" style="margin-bottom:8px">Checks ('+pass+'/'+checks.length+' passed)</div><div class="vchecks">'+ch+'</div></div>'+info+(!parsedOk?'<div><button class="btn danger" onclick="doFix()">'+ico('wrench')+'Try auto-fix</button></div>':'')+'</div>';
}

// ─── Raw / minified ──────────────────────────────────────────
function renderRaw(mini){
  var text=mini?JsonCore.minify($('inp').value):JsonCore.format($('inp').value);
  var div=document.createElement('div');div.className='raw'+(mini?' wrap':'');
  div.innerHTML=highlight(text);
  var out=$('output');out.innerHTML='';out.appendChild(div);
}
function highlight(json){
  return json.replace(/("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g,function(m){
    var c='jnum';
    if(m.charAt(0)==='"')c=/:$/.test(m)?'jkey':'jstr';
    else if(m==='true'||m==='false')c='jbool';else if(m==='null')c='jnull';
    return '<span class="'+c+'">'+esc(m)+'</span>';
  });
}

// ─── Tree ────────────────────────────────────────────────────
var bd=0;
function renderTree(data){
  bd=0;var wrap=document.createElement('div');wrap.className='tree';
  buildNode(wrap,data,null,'$',true);
  var out=$('output');out.innerHTML='';out.appendChild(wrap);
  if(srchQ)applySearch();
}
function keyHtml(key){return (typeof key==='number'?'<span class="jnum">'+key+'</span>':'<span class="jkey">"'+esc(key)+'"</span>')+'<span class="jcolon">: </span>';}
function pathFor(path,k,arr){
  if(arr)return path+'['+k+']';
  return /^[A-Za-z_$][\w$]*$/.test(k)?path+'.'+k:path+'['+JSON.stringify(k)+']';
}
function buildNode(parent,val,key,path,isLast){
  if(val!==null&&typeof val==='object'){
    var arr=Array.isArray(val),entries=arr?val.map(function(v,i){return [i,v];}):Object.entries(val);
    var cnt=entries.length,ob=arr?'[':'{',cb=arr?']':'}';
    var nd=document.createElement('div');nd.className='tnode';var bcls='jbrk b'+(bd%4);
    var row=mkRow(path),tog=mkToggle(cnt?'▼':' ');
    row.appendChild(tog);
    if(key!==null)row.insertAdjacentHTML('beforeend',keyHtml(key));
    var sumEl=document.createElement('span');sumEl.className='jsummary';sumEl.style.display='none';
    sumEl.innerHTML='<span class="'+bcls+'">'+ob+'</span> '+cnt+' '+(arr?'items':'keys')+' <span class="'+bcls+'">…'+cb+'</span>';
    var openEl=document.createElement('span');openEl.innerHTML='<span class="'+bcls+'">'+ob+'</span>';
    row.appendChild(sumEl);row.appendChild(openEl);row.appendChild(mkCpBtn(path));
    var ch=document.createElement('div');ch.className='children';
    if(cnt){
      bd++;entries.forEach(function(e,i){buildNode(ch,e[1],e[0],pathFor(path,e[0],arr),i===cnt-1);});bd--;
      var cr=document.createElement('div');cr.className='trow';cr.style.cursor='default';
      var sp=mkToggle(' ');sp.style.visibility='hidden';cr.appendChild(sp);
      cr.insertAdjacentHTML('beforeend','<span class="'+bcls+'">'+cb+(isLast?'':',')+'</span>');ch.appendChild(cr);
      tog.onclick=function(e){
        e.stopPropagation();
        var hidden=ch.classList.toggle('hide');tog.textContent=hidden?'▶':'▼';
        sumEl.style.display=hidden?'inline':'none';openEl.style.display=hidden?'none':'inline';
      };
    }else openEl.innerHTML='<span class="'+bcls+'">'+ob+cb+(isLast?'':',')+'</span>';
    row.onclick=function(e){if(e.target===tog)return;selNode(row,path);};
    row.oncontextmenu=function(e){e.preventDefault();showCtx(e,path,key,val,nd);};
    nd.appendChild(row);if(cnt)nd.appendChild(ch);parent.appendChild(nd);
  }else{
    var r=mkRow(path),s=mkToggle(' ');s.style.visibility='hidden';
    r.appendChild(s);
    if(key!==null)r.insertAdjacentHTML('beforeend',keyHtml(key));
    r.insertAdjacentHTML('beforeend',fmtVal(val)+(isLast?'':'<span class="jcolon">,</span>'));
    r.appendChild(mkCpBtn(path));
    r.onclick=function(){selNode(r,path);};
    r.oncontextmenu=function(e){e.preventDefault();showCtx(e,path,key,val,r.parentElement);};
    parent.appendChild(r);
  }
}
function mkRow(path){var r=document.createElement('div');r.className='trow';r.dataset.path=path;return r;}
function mkToggle(t){var s=document.createElement('span');s.className='toggle';s.textContent=t;return s;}
function mkCpBtn(path){var b=document.createElement('button');b.className='cpbtn';b.textContent='copy path';b.onclick=function(e){e.stopPropagation();clip(path);};return b;}
function fmtVal(v){
  if(v===null)return '<span class="jnull">null</span>';
  if(typeof v==='string')return '<span class="jstr">"'+esc(v)+'"</span>';
  if(typeof v==='number')return '<span class="jnum">'+v+'</span>';
  if(typeof v==='boolean')return '<span class="jbool">'+v+'</span>';
  return esc(String(v));
}
function selNode(row,path){
  if(selRow)selRow.classList.remove('sel');
  row.classList.add('sel');selRow=row;
  var pv=$('pathVal');pv.textContent='';
  var s=document.createElement('span');s.className='pval';s.title='Click to copy';s.textContent=path;s.onclick=function(){clip(path);};
  pv.appendChild(s);
}
function setOpen(ch,open){
  ch.classList.toggle('hide',!open);
  var row=ch.previousElementSibling;if(!row)return;
  var t=row.querySelector('.toggle');if(t)t.textContent=open?'▼':'▶';
  var sum=row.querySelector('.jsummary');
  if(sum){sum.style.display=open?'none':'inline';var o=sum.nextElementSibling;if(o&&o.tagName!=='BUTTON')o.style.display=open?'inline':'none';}
}
function expandAll(){document.querySelectorAll('.tnode > .children').forEach(function(c){setOpen(c,true);});}
function collapseAll(){document.querySelectorAll('.tnode > .children').forEach(function(c){setOpen(c,false);});}

// ─── Search ──────────────────────────────────────────────────
function onSearch(){srchQ=$('srch').value.toLowerCase().trim();rawMi=-1;if(view==='tree'&&parsedOk)render();else if(view==='raw')rawSearch(true);}
function applySearch(){
  if(!srchQ)return;
  document.querySelectorAll('.trow').forEach(function(row){
    if(row.textContent.toLowerCase().indexOf(srchQ)>-1){
      row.classList.remove('dim');
      row.querySelectorAll('span').forEach(function(s){if(!s.children.length&&s.textContent.toLowerCase().indexOf(srchQ)>-1)s.classList.add('hl');});
      var p=row.parentElement;
      while(p){if(p.classList&&p.classList.contains('children')&&p.classList.contains('hide'))setOpen(p,true);p=p.parentElement;}
    }else row.classList.add('dim');
  });
}

// ─── Context menu ────────────────────────────────────────────
function showCtx(e,path,key,val,nd){
  ctxData={path:path,key:key,val:val,nd:nd};var m=$('ctx');
  m.style.left=Math.min(e.clientX,innerWidth-180)+'px';m.style.top=Math.min(e.clientY,innerHeight-170)+'px';m.classList.add('on');
}
function closeCtx(){var m=$('ctx');if(m)m.classList.remove('on');}
document.addEventListener('click',closeCtx);
function ctxAction(a){
  var d=ctxData;
  if(a==='path')clip(d.path);
  else if(a==='value')clip(typeof d.val==='string'?d.val:JSON.stringify(d.val));
  else if(a==='key')clip(String(d.key===null?'$':d.key));
  else if(a==='expand')d.nd.querySelectorAll('.children').forEach(function(c){setOpen(c,true);});
  else if(a==='collapse')d.nd.querySelectorAll('.children').forEach(function(c){setOpen(c,false);});
  closeCtx();
}

// ─── Copy / file / export / sample ───────────────────────────
function copyOut(){
  if(view==='raw'){var rt=$('rawEd');if(!rt||!rt.value.trim()){toast('Nothing to copy','err');return;}clip(rt.value);return;}
  if(!parsedOk){toast('Nothing to copy — fix the JSON first','err');return;}
  clip(view==='min'?JsonCore.minify($('inp').value):JsonCore.format($('inp').value));
}
function openFile(){$('filePick').click();}
function loadText(f){
  var r=new FileReader();
  r.onload=function(ev){$('inp').value=String(ev.target.result||'');resetScroll();onInput();toast('Loaded '+f.name,'ok');};
  r.onerror=function(){toast('Could not read that file','err');};
  r.readAsText(f);
}
function handleFile(e){var f=e.target.files[0];if(!f)return;loadText(f);e.target.value='';}
document.addEventListener('dragover',function(e){
  if(e.dataTransfer&&Array.prototype.indexOf.call(e.dataTransfer.types||[],'Files')>-1){e.preventDefault();$('dropOverlay').classList.add('on');}
});
document.addEventListener('dragleave',function(e){if(!e.relatedTarget)$('dropOverlay').classList.remove('on');});
document.addEventListener('drop',function(e){
  $('dropOverlay').classList.remove('on');
  var f=e.dataTransfer&&e.dataTransfer.files&&e.dataTransfer.files[0];
  if(!f)return; // plain text drops go to the textarea normally
  e.preventDefault();
  if(!/\.(json|txt)$/i.test(f.name)&&f.type!=='application/json'&&f.type!=='text/plain'){toast('Please drop a .json or .txt file','err');return;}
  loadText(f);
});
function exportFile(){
  if(!parsedOk){toast('No valid JSON to export','err');return;}
  var blob=new Blob([JsonCore.format($('inp').value)],{type:'application/json'});
  var a=document.createElement('a'),url=URL.createObjectURL(blob);
  a.href=url;a.download='data.json';a.style.display='none';document.body.appendChild(a);a.click();a.remove();
  setTimeout(function(){URL.revokeObjectURL(url);},1000);toast('Exported data.json','ok');
}
function loadSample(){
  var s={store:"Corner Books",open:true,rating:4.7,address:{street:"12 Elm Street",city:"Springfield",geo:{lat:39.78,lng:-89.65}},
    inventory:[{isbn:"978-0-14-312774-1",title:"Penguin Classics: Emma",price:9.99,tags:["fiction","classic"],inStock:true},
    {isbn:"978-0-06-112008-4",title:"To Kill a Mockingbird",price:8.5,tags:["fiction"],inStock:false}],
    website:"https://example.com/books",closedOn:null};
  $('inp').value=JSON.stringify(s,null,2);resetScroll();onInput();toast('Sample loaded','ok');
}

// ─── Full screen, layout, levels, text size ──────────────────
// Full screen = the tool fills the browser window and the site header/footer are hidden (not the browser's own full screen).
var fsOn=false,FS_INERT='.site-footer,main > :not(.tool):not(.ctx):not(.modal-bg)';
function toggleFullscreen(){setFullscreen(!fsOn);}
function setFullscreen(on){
  var tool=document.querySelector('.app-tool'),btn=$('fsBtn'),de=document.documentElement;
  if(!tool||on===fsOn)return;
  fsOn=on;closeCtx();
  if(on)window.scrollTo(0,0);
  tool.classList.toggle('is-fs',on);de.classList.toggle('fs-open',on);
  btn.setAttribute('aria-pressed',on?'true':'false');
  btn.title=on?'Exit full screen (Esc)':'Full screen (Ctrl+Shift+Enter)';
  document.querySelectorAll(FS_INERT).forEach(function(el){if(on)el.setAttribute('inert','');else el.removeAttribute('inert');});
}
var layMode='split';
function setLayout(m){
  layMode=m;var L=$('layout');
  L.classList.toggle('lay-out',m==='out');L.classList.toggle('lay-in',m==='in');
  ['split','out','in'].forEach(function(t){var b=$('lay-'+t);b.classList.toggle('on',t===m);b.setAttribute('aria-pressed',t===m?'true':'false');});
  if(m==='in')$('inp').focus();
}
function expandToLevel(v){
  var sel=$('lvl');if(!v)return;
  var n=v==='all'?1e9:parseInt(v,10);
  document.querySelectorAll('.tnode > .children').forEach(function(c){
    var d=0,p=c.parentElement;
    while(p&&p.id!=='output'){if(p.classList&&p.classList.contains('children'))d++;p=p.parentElement;}
    setOpen(c,d<n);
  });
  sel.value='';
}
var vfs=13; // kept in memory only, nothing is stored
function fontStep(d){vfs=Math.max(10,Math.min(22,vfs+d));document.documentElement.style.setProperty('--vfs',vfs+'px');if($('rawEd'))rawSync();}
function resetScroll(){var t=$('inp');t.scrollTop=0;t.scrollLeft=0;syncScroll();}

// ─── Raw editor (editable, syntax coloured) ───────────────────
// The textarea sits on top of a coloured <pre> with identical metrics. The Input box stays the single source of truth.
var rawSrc=false,rawErrLine=-1;
function syncOutClass(){$('output').classList.toggle('is-raw',view==='raw');}
function rawText(){var v=$('inp').value;if(!v.trim())return '';return isValidJson(v)?JsonCore.format(v):v;}
function hlEdit(t){
  var re=/("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g,out='',last=0,m,depth=0;
  function gap(s){   // brackets get a colour per nesting level, commas and colons are muted
    return s.replace(/[^{}\[\],:]+|[{}\[\],:]/g,function(x){
      if(x==='{'||x==='['){var o='<span class="jbrk b'+(depth%4)+'">'+x+'</span>';depth++;return o;}
      if(x==='}'||x===']'){depth=Math.max(0,depth-1);return '<span class="jbrk b'+(depth%4)+'">'+x+'</span>';}
      if(x===','||x===':')return '<span class="jp">'+x+'</span>';
      return esc(x);
    });
  }
  while((m=re.exec(t))){
    out+=gap(t.slice(last,m.index));
    var tok=m[0],c='jnum';
    if(tok.charAt(0)==='"'){
      if(/:$/.test(tok)){var k=tok.replace(/\s*:$/,'');out+='<span class="jkey">'+esc(k)+'</span><span class="jp">'+esc(tok.slice(k.length))+'</span>';last=re.lastIndex;continue;}
      c='jstr';
    }else if(tok==='true'||tok==='false')c='jbool';else if(tok==='null')c='jnull';
    out+='<span class="'+c+'">'+esc(tok)+'</span>';last=re.lastIndex;
  }
  return out+gap(t.slice(last));
}
function buildRawEd(){
  var w=document.createElement('div');w.id='rawWrap';w.className='rawed';
  w.innerHTML='<div class="rawed-err" id="rawErr" role="alert" style="display:none"></div>'+
    '<div class="rawed-body"><div class="rawed-bar" id="rawBar"></div>'+
    '<div class="rawed-gut" aria-hidden="true"><div class="rawed-gutin" id="rawGut"></div></div>'+
    '<div class="rawed-stack"><pre class="rawed-mk" id="rawMk" aria-hidden="true"></pre><pre class="rawed-hl" id="rawHl" aria-hidden="true"></pre>'+
    '<textarea id="rawEd" class="rawed-ta" aria-label="Raw JSON, editable" wrap="off" spellcheck="false" autocomplete="off" autocapitalize="off" placeholder="Paste or type JSON here"></textarea></div></div>';
  var ta=w.querySelector('#rawEd');
  ta.addEventListener('input',onRawInput);ta.addEventListener('scroll',rawSync);
  ta.addEventListener('keydown',onKey);ta.addEventListener('paste',onRawPaste);
  return w;
}
function renderRawEditor(){
  var out=$('output'),w=$('rawWrap');
  if(!w){out.innerHTML='';w=buildRawEd();out.appendChild(w);}
  var ta=$('rawEd'),st=ta.scrollTop,sl=ta.scrollLeft,t=rawText();
  if(ta.value!==t)ta.value=t;
  ta.scrollTop=st;ta.scrollLeft=sl;
  rawRefresh();rawMeta();
}
function onRawInput(){
  var ta=$('rawEd');$('inp').value=ta.value;rawSrc=true;
  rawRefresh();onInputSoon();
}
function onRawPaste(){
  var ta=this,all=!ta.value.trim()||(ta.selectionStart===0&&ta.selectionEnd===ta.value.length);
  if(!all)return;
  setTimeout(function(){
    var v=ta.value;
    if(v.length<2000000&&v.indexOf('\n')<0&&isValidJson(v)){ta.value=JsonCore.format(v);onRawInput();toast('Formatted on paste','ok');}
  },0);
}
function rawRefresh(){
  var ta=$('rawEd');if(!ta)return;
  var t=ta.value,big=t.length>150000,n=t?t.split('\n').length:1,g=new Array(n);
  $('rawWrap').classList.toggle('plain',big);   // very large text: skip colouring to stay responsive
  $('rawHl').innerHTML=big?'':hlEdit(t)+'\n';
  for(var i=0;i<n;i++)g[i]=i+1;
  $('rawGut').textContent=g.join('\n');
  $('rawWrap').style.setProperty('--gd',Math.max(2,String(n).length));
  rawSearch(false);rawSync();
}
function rawSync(){
  var ta=$('rawEd'),bar=$('rawBar');if(!ta)return;
  var pre=$('rawHl'),mk=$('rawMk');pre.scrollTop=mk.scrollTop=ta.scrollTop;pre.scrollLeft=mk.scrollLeft=ta.scrollLeft;
  $('rawGut').style.transform='translateY('+(-ta.scrollTop)+'px)';
  if(rawErrLine>=0){
    var lh=parseFloat(getComputedStyle(ta).lineHeight)||21;
    bar.style.display='block';bar.style.height=lh+'px';bar.style.transform='translateY('+(12+rawErrLine*lh-ta.scrollTop)+'px)';
  }else bar.style.display='none';
}
function rawMeta(){
  var s=$('rawErr'),ta=$('rawEd');if(!s||!ta)return;
  rawErrLine=-1;
  if(!parsedOk&&lastErr&&ta.value.trim()){
    var lc=lastErrPos>=0?posToLineCol($('inp').value,lastErrPos):null;
    if(lc)rawErrLine=lc.line-1;
    s.style.display='flex';
    s.innerHTML='<span class="rawed-err-t">'+(lc?'Invalid JSON · line '+lc.line+', col '+lc.col:'Invalid JSON')+'</span>'+
      '<span class="rawed-err-m" title="'+esc(lastErr.message)+'">'+esc(lastErr.message)+'</span>'+
      (lc?'<button class="btn" type="button" onclick="rawGoto()">'+ico('locate')+'Go to error</button>':'')+
      '<button class="btn danger" type="button" onclick="doFix()">'+ico('wrench')+'Auto-fix</button>';
  }else s.style.display='none';
  rawSync();
}
function rawGoto(){
  var ta=$('rawEd');if(!ta||lastErrPos<0)return;
  var lc=posToLineCol(ta.value,lastErrPos),lh=parseFloat(getComputedStyle(ta).lineHeight)||21;
  ta.focus();ta.setSelectionRange(lastErrPos,Math.min(lastErrPos+1,ta.value.length));
  ta.scrollTop=Math.max(0,(lc.line-4)*lh);rawSync();
}

// ─── Search inside the Raw editor ─────────────────────────────
var rawMatches=[],rawMi=-1,rawCW=0,rawCWkey='';
function rawSearch(jump){
  var ta=$('rawEd'),mk=$('rawMk'),cnt=$('srchCnt');if(!ta||!mk)return;
  rawMatches=[];
  if(!srchQ){mk.innerHTML='';cnt.textContent='';rawMi=-1;return;}
  var t=ta.value,re=new RegExp(srchQ.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'gi'),m;
  while((m=re.exec(t))&&rawMatches.length<5000)rawMatches.push(m.index);
  if(rawMi<0||rawMi>=rawMatches.length)rawMi=rawMatches.length?0:-1;
  rawPaintMarks();
  if(jump&&rawMi>=0)rawShow(rawMi);
}
function rawPaintMarks(){
  var ta=$('rawEd'),t=ta.value,n=srchQ.length,h='',last=0;
  rawMatches.forEach(function(s,k){
    h+=esc(t.slice(last,s))+'<mark class="m'+(k===rawMi?' cur':'')+'">'+esc(t.slice(s,s+n))+'</mark>';last=s+n;
  });
  $('rawMk').innerHTML=h+esc(t.slice(last))+'\n';
  $('srchCnt').textContent=rawMatches.length?(rawMi+1)+'/'+rawMatches.length+(rawMatches.length>=5000?'+':''):'No results';
  rawSync();
}
function rawStep(d){
  if(view!=='raw'||!rawMatches.length)return;
  rawMi=(rawMi+d+rawMatches.length)%rawMatches.length;rawPaintMarks();rawShow(rawMi);
}
function rawCharW(ta){
  var cs=getComputedStyle(ta),key=cs.fontSize+cs.fontFamily;
  if(key!==rawCWkey){var c=document.createElement('canvas').getContext('2d');c.font=cs.fontSize+' '+cs.fontFamily;rawCW=c.measureText('0').width||8;rawCWkey=key;}
  return rawCW;
}
function rawShow(k){
  var ta=$('rawEd'),pos=rawMatches[k];if(!ta||pos==null)return;
  var before=ta.value.slice(0,pos),line=before.split('\n').length-1,col=pos-before.lastIndexOf('\n')-1;
  var lh=parseFloat(getComputedStyle(ta).lineHeight)||21,x=col*rawCharW(ta);
  ta.scrollTop=Math.max(0,line*lh-ta.clientHeight/2);
  if(x<ta.scrollLeft||x>ta.scrollLeft+ta.clientWidth-120)ta.scrollLeft=Math.max(0,x-ta.clientWidth/3);
  try{ta.setSelectionRange(pos,pos+srchQ.length);}catch(e){}
  rawSync();
}
$('srch').addEventListener('keydown',function(e){
  if(e.key==='Enter'&&view==='raw'){e.preventDefault();rawStep(e.shiftKey?-1:1);}
});

// ─── Modal ───────────────────────────────────────────────────
var lastFocus=null;
function showShortcuts(){lastFocus=document.activeElement;$('modal').classList.add('on');$('modalClose').focus();}
function closeModal(){var m=$('modal');if(m&&m.classList.contains('on')){m.classList.remove('on');if(lastFocus)lastFocus.focus();}}

// ─── Resizer ─────────────────────────────────────────────────
(function(){
  var rz=$('resizer'),pl=$('paneLeft');if(!rz||!pl)return;
  var drag=false,sx=0,sw=0;
  rz.addEventListener('mousedown',function(e){drag=true;sx=e.clientX;sw=pl.offsetWidth;rz.classList.add('drag');document.body.style.userSelect='none';document.body.style.cursor='col-resize';});
  document.addEventListener('mousemove',function(e){if(drag)pl.style.width=Math.max(240,Math.min(sw+e.clientX-sx,innerWidth*.7))+'px';});
  document.addEventListener('mouseup',function(){if(!drag)return;drag=false;rz.classList.remove('drag');document.body.style.userSelect='';document.body.style.cursor='';});
})();

// Auto-format pasted minified JSON (only when the whole editor is being replaced)
$('inp').addEventListener('paste',function(){
  var ta=this,all=!ta.value.trim()||(ta.selectionStart===0&&ta.selectionEnd===ta.value.length);
  if(!all)return;
  setTimeout(function(){
    var v=ta.value;
    if(v.length<2000000&&v.indexOf('\n')<0&&isValidJson(v)){ta.value=JsonCore.format(v);resetScroll();onInput();toast('Formatted on paste','ok');}
  },0);
});
renderLineNums('');
syncOutClass();renderRawEditor();
