/* Word Counter — counting logic (testable in Node) + UI */
(function(root,factory){
  if(typeof module==='object'&&module.exports) module.exports=factory(); else root.WordCount=factory();
})(typeof self!=='undefined'?self:this,function(){
  'use strict';
  var HAS_SEG=typeof Intl!=='undefined'&&typeof Intl.Segmenter==='function';
  var NOSPACE=/[\u0E00-\u0E7F\u3040-\u30FF\u3400-\u4DBF\u4E00-\u9FFF]/; // Thai, Kana, Han: no spaces between words
  var ALNUM=/[\p{L}\p{N}]/u;
  var STOP=('a about after all also am an and any are as at be because been but by can could did do does for from had has have he her his how i if in into is it its just me more my no not of on or our out she so some than that the their them then there these they this to up us was we were what when which who will with would you your').split(' ');
  var seg={};
  function segmenter(g){if(!HAS_SEG)return null;return seg[g]||(seg[g]=new Intl.Segmenter(undefined,{granularity:g}));}

  function countWords(text){
    var toks=text.split(/\s+/),n=0,sg=segmenter('word');
    for(var i=0;i<toks.length;i++){
      var t=toks[i]; if(!t||!ALNUM.test(t)) continue;
      if(sg&&NOSPACE.test(t)){var c=0;for(var s of sg.segment(t)) if(s.isWordLike) c++; n+=c||1;}
      else n++;
    }
    return n;
  }
  function countChars(text){
    if(!text) return 0;
    var sg=segmenter('grapheme');
    if(sg&&text.length<400000){var n=0;for(var x of sg.segment(text)) n++;return n;}
    var c=0;for(var i=0;i<text.length;i++){var k=text.charCodeAt(i);if(k>=0xD800&&k<=0xDBFF)i++;c++;}return c;
  }
  function countSentences(text){
    if(!text.trim()) return 0;
    var sg=segmenter('sentence'),n=0;
    if(sg){for(var s of sg.segment(text)) if(ALNUM.test(s.segment)) n++;return n;}
    var m=text.match(/[^.!?…]+[.!?…]+|[^.!?…]+$/g)||[];return m.filter(function(x){return ALNUM.test(x);}).length;
  }
  function countParagraphs(text){return text.split(/\r?\n/).filter(function(l){return ALNUM.test(l);}).length;}
  function countLines(text){return text?text.split(/\r?\n/).length:0;}

  function keywords(text,ignoreCommon,limit){
    var words=text.toLowerCase().match(/[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu)||[],map={},total=words.length;
    words.forEach(function(w){if(w.length<2&&!/\d/.test(w))return;if(ignoreCommon&&STOP.indexOf(w)>-1)return;map[w]=(map[w]||0)+1;});
    return Object.keys(map).filter(function(w){return map[w]>1;}).sort(function(a,b){return map[b]-map[a]||(a<b?-1:1);}).slice(0,limit||8).map(function(w){return {word:w,count:map[w],pct:total?map[w]/total*100:0};});
  }
  function fmtTime(sec){
    if(sec<1) return '0 sec';
    if(sec<60) return Math.max(1,Math.round(sec))+' sec';
    var m=Math.floor(sec/60),s=Math.round(sec%60);
    if(s===60){m++;s=0;}
    if(m>=10) return m+' min';
    return m+' min'+(s?' '+s+' sec':'');
  }
  function analyze(text){
    var words=countWords(text);
    return {words:words,chars:countChars(text),charsNoSpace:countChars(text.replace(/\s+/g,'')),sentences:countSentences(text),paragraphs:countParagraphs(text),lines:countLines(text),
      reading:fmtTime(words/238*60),speaking:fmtTime(words/130*60)};
  }
  function titleCase(t){return t.toLowerCase().replace(/(^|[^\p{L}\p{N}'’])(\p{L})/gu,function(m,a,b){return a+b.toUpperCase();});}
  function sentenceCase(t){return t.toLowerCase().replace(/(^\s*|[.!?]\s+|\n\s*)(\p{L})/gu,function(m,a,b){return a+b.toUpperCase();});}
  function squeeze(t){return t.replace(/[ \t]+/g,' ').replace(/ *\n */g,'\n').replace(/^ +| +$/g,'');}
  return {analyze:analyze,countWords:countWords,keywords:keywords,titleCase:titleCase,sentenceCase:sentenceCase,squeeze:squeeze,fmtTime:fmtTime};
});

if(typeof document!=='undefined'&&document.getElementById('wcText')){
(function(){
  var $=function(id){return document.getElementById(id);};
  var LIMITS=[['none','No limit',0,'characters'],['x','X (Twitter) post',280,'characters'],['sms','SMS (single message)',160,'characters'],['title','SEO page title',60,'characters'],['meta','Meta description',160,'characters'],['yt','YouTube title',100,'characters'],['ig','Instagram caption',2200,'characters'],['li','LinkedIn post',3000,'characters'],['custom','Custom limit…',0,'characters']];
  var sel=$('limitSel');
  LIMITS.forEach(function(l){var o=document.createElement('option');o.value=l[0];o.textContent=l[1]+(l[2]?' — '+l[2].toLocaleString():'');sel.appendChild(o);});
  var prev=null,timer=null;
  function f(n){return n.toLocaleString();}
  function update(){
    var t=$('wcText').value,a=WordCount.analyze(t);
    $('sWords').textContent=f(a.words);$('sChars').textContent=f(a.chars);$('sCharsNS').textContent=f(a.charsNoSpace);
    $('sSent').textContent=f(a.sentences);$('sPara').textContent=f(a.paragraphs);$('sLines').textContent=f(a.lines);
    $('sRead').textContent=a.reading;$('sSpeak').textContent=a.speaking;
    var kw=WordCount.keywords(t,$('ignoreCommon').checked,8),ul=$('kw');
    ul.innerHTML=kw.length?kw.map(function(k){return '<li><span>'+k.word.replace(/[&<>]/g,'')+'</span><span class="muted">'+k.count+'× · '+k.pct.toFixed(1)+'%</span></li>';}).join(''):'<li class="muted">No repeated words yet.</li>';
    var v=sel.value,lim=0,unit='characters';
    if(v==='custom'){lim=parseInt($('customLimit').value,10)||0;unit=$('customUnit').value;}
    else{LIMITS.forEach(function(l){if(l[0]===v){lim=l[2];unit=l[3];}});}
    $('customRow').style.display=v==='custom'?'flex':'none';
    var bar=$('meterBar'),msg=$('meterMsg');
    if(!lim){bar.style.width='0';bar.className='';msg.textContent=v==='none'?'Pick a limit to see how much room is left.':'Enter a limit above.';return;}
    var used=unit==='words'?a.words:a.chars,left=lim-used;
    bar.style.width=Math.min(100,used/lim*100)+'%';bar.className=used>lim?'over':used>lim*.9?'near':'';
    msg.textContent=left>=0?f(left)+' '+unit+' left of '+f(lim):f(-left)+' '+unit+' over the limit of '+f(lim);
  }
  function soon(){clearTimeout(timer);if($('wcText').value.length>100000)timer=setTimeout(update,200);else update();}
  function transform(fn,label){
    var ta=$('wcText');if(!ta.value.trim())return;
    prev=ta.value;ta.value=fn(ta.value);$('undoBtn').style.display='inline-flex';update();toast(label,'ok');
  }
  $('wcText').addEventListener('input',soon);
  ['limitSel','customLimit','customUnit','ignoreCommon'].forEach(function(id){$(id).addEventListener('input',update);$(id).addEventListener('change',update);});
  $('btnUpper').onclick=function(){transform(function(t){return t.toUpperCase();},'Converted to uppercase');};
  $('btnLower').onclick=function(){transform(function(t){return t.toLowerCase();},'Converted to lowercase');};
  $('btnTitle').onclick=function(){transform(WordCount.titleCase,'Converted to title case');};
  $('btnSent').onclick=function(){transform(WordCount.sentenceCase,'Converted to sentence case');};
  $('btnSpaces').onclick=function(){transform(WordCount.squeeze,'Extra spaces removed');};
  $('undoBtn').onclick=function(){if(prev!==null){$('wcText').value=prev;prev=null;$('undoBtn').style.display='none';update();}};
  $('btnCopy').onclick=function(){if($('wcText').value)clip($('wcText').value);else toast('Nothing to copy','err');};
  $('btnClear').onclick=function(){$('wcText').value='';prev=null;$('undoBtn').style.display='none';update();$('wcText').focus();};
  update();
})();
}
