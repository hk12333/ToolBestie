/* JsonCore — string-aware JSON utilities (format, minify, repair, inspect).
   Works on the *text*, so numbers, key order and escapes are preserved exactly. */
(function(root,factory){
  if(typeof module==='object'&&module.exports) module.exports=factory(); else root.JsonCore=factory();
})(typeof self!=='undefined'?self:this,function(){
  'use strict';
  var WS=/\s+/y, NUM=/-?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/y, ID=/[A-Za-z_$][\w$]*/y;

  /* Lenient tokenizer. Concatenating every token's text reproduces the input. */
  function scan(text){
    var toks=[],n=text.length,i=0,m;
    while(i<n){
      var c=text[i];
      WS.lastIndex=i; if(WS.test(text)){var e=WS.lastIndex;toks.push({t:'ws',v:text.slice(i,e),i:i});i=e;continue;}
      if(c==='"'||c==="'"){
        var j=i+1,closed=false;
        while(j<n){var d=text[j]; if(d==='\\'){j+=2;continue;} if(d===c){j++;closed=true;break;} j++;}
        if(j>n) j=n;
        toks.push({t:'str',v:text.slice(i,j),i:i,q:c,closed:closed});i=j;continue;
      }
      if(c==='/'&&text[i+1]==='/'){var k=text.indexOf('\n',i); if(k<0)k=n; toks.push({t:'lc',v:text.slice(i,k),i:i});i=k;continue;}
      if(c==='/'&&text[i+1]==='*'){var k2=text.indexOf('*/',i+2); k2=k2<0?n:k2+2; toks.push({t:'bc',v:text.slice(i,k2),i:i});i=k2;continue;}
      if('{}[],:'.indexOf(c)>-1){toks.push({t:'p',v:c,i:i});i++;continue;}
      NUM.lastIndex=i; if(NUM.test(text)){toks.push({t:'num',v:text.slice(i,NUM.lastIndex),i:i});i=NUM.lastIndex;continue;}
      ID.lastIndex=i; if(ID.test(text)){toks.push({t:'id',v:text.slice(i,ID.lastIndex),i:i});i=ID.lastIndex;continue;}
      toks.push({t:'other',v:c,i:i});i++;
    }
    return toks;
  }
  function isAtom(t){return t&&(t.t==='str'||t.t==='num'||t.t==='id'||t.t==='other');}
  function isTrivia(t){return t.t==='ws'||t.t==='lc'||t.t==='bc';}
  function nextSig(toks,k){for(var j=k+1;j<toks.length;j++) if(!isTrivia(toks[j])) return j; return -1;}

  /* Pretty-print. Exact for valid JSON; best-effort (keeps comments) otherwise. */
  function format(text,indent){
    var ind=indent===undefined?'  ':indent;
    var toks=scan(text).filter(function(t){return t.t!=='ws';});
    var parts=[],depth=0,prevAtom=false,nlIdx=-1;
    function nl(){parts.push('\n'+ind.repeat(depth));nlIdx=parts.length-1;}
    function put(s){parts.push(s);}
    for(var k=0;k<toks.length;k++){
      var t=toks[k], atom=isAtom(t);
      if(atom&&prevAtom) put(' ');
      prevAtom=atom;
      if(t.t==='p'){
        if(t.v==='{'||t.v==='['){
          var nx=toks[k+1], cl=t.v==='{'?'}':']';
          if(nx&&nx.t==='p'&&nx.v===cl){put(t.v+cl);k++;continue;}
          depth++; put(t.v); nl();
        }else if(t.v==='}'||t.v===']'){
          depth=Math.max(0,depth-1);
          if(nlIdx===parts.length-1) parts.pop();
          nl(); put(t.v);
        }else if(t.v===','){put(',');nl();}
        else put(': ');
      }else if(t.t==='lc'){put(t.v.replace(/\s+$/,''));nl();}
      else if(t.t==='bc'){put(t.v+' ');}
      else put(t.v);
    }
    return parts.join('').trim();
  }

  function minify(text){
    var toks=scan(text),out=[],prevAtom=false;
    for(var k=0;k<toks.length;k++){
      var t=toks[k]; if(isTrivia(t)) continue;
      var atom=isAtom(t); if(atom&&prevAtom) out.push(' '); prevAtom=atom; out.push(t.v);
    }
    return out.join('');
  }

  function singleToDouble(v,closed){
    var inner=v.slice(1,closed?-1:undefined),r='"';
    for(var i=0;i<inner.length;i++){
      var c=inner[i];
      if(c==='\\'&&i+1<inner.length){var d=inner[i+1]; r+=(d==="'")?"'":'\\'+d; i++;}
      else if(c==='"') r+='\\"'; else r+=c;
    }
    return r+'"';
  }

  /* Repair common mistakes — only ever edits text OUTSIDE of string values. */
  function repair(text){
    var toks=scan(text.replace(/^\uFEFF/,'')),out=[],stack=[],fixes={};
    function note(s){fixes[s]=1;}
    function dropMinus(){
      for(var i=out.length-1;i>=0;i--){ if(/^\s*$/.test(out[i])) continue; if(out[i]==='-') out.splice(i,1); return; }
    }
    for(var k=0;k<toks.length;k++){
      var t=toks[k];
      if(t.t==='ws'){out.push(t.v);continue;}
      if(t.t==='lc'||t.t==='bc'){note('removed comments');continue;}
      if(t.t==='str'){
        if(t.q==="'"){note('converted single quotes to double quotes');out.push(singleToDouble(t.v,t.closed));}
        else{out.push(t.v); if(!t.closed){out.push('"');note('closed an unterminated string');}}
        continue;
      }
      if(t.t==='p'){
        if(t.v==='{'||t.v==='['){stack.push(t.v);out.push(t.v);}
        else if(t.v==='}'||t.v===']'){stack.pop();out.push(t.v);}
        else if(t.v===','){
          var j=nextSig(toks,k);
          if(j<0||(toks[j].t==='p'&&(toks[j].v==='}'||toks[j].v===']'))){note('removed trailing commas');}
          else out.push(',');
        }else out.push(t.v);
        continue;
      }
      if(t.t==='id'||t.t==='num'){
        var nj=nextSig(toks,k), isKey=nj>=0&&toks[nj].t==='p'&&toks[nj].v===':';
        if(isKey&&(t.t==='id'||stack[stack.length-1]==='{')){out.push('"'+t.v+'"');note('quoted unquoted keys');continue;}
        if(t.t==='id'){
          var v=t.v;
          if(v==='undefined'||v==='NaN'||v==='Infinity'){dropMinus();out.push('null');note('replaced undefined / NaN / Infinity with null');}
          else if(v==='True'){out.push('true');note('converted Python literals');}
          else if(v==='False'){out.push('false');note('converted Python literals');}
          else if(v==='None'){out.push('null');note('converted Python literals');}
          else out.push(v);
          continue;
        }
      }
      out.push(t.v);
    }
    if(stack.length){
      var s=out.join('').replace(/\s+$/,'').replace(/,$/,'');
      out=[s]; while(stack.length) out.push(stack.pop()==='{'?'}':']');
      note('added missing closing brackets');
    }
    var joined=out.join(''), repairs=Object.keys(fixes);
    if(!repairs.length) return null;
    try{JSON.parse(joined);return {json:format(joined),repairs:repairs,valid:true};}
    catch(e){return {json:joined,repairs:repairs,valid:false};}
  }

  /* Inspect text for the Validate tab. Ignores anything inside string values. */
  function inspect(text){
    var toks=scan(text),r={comments:false,singleQuotes:false,unquotedKeys:[],badLiterals:[],trailingCommas:false,unsafeNumbers:0,duplicates:[]};
    var stack=[],dup={};
    for(var k=0;k<toks.length;k++){
      var t=toks[k],top=stack[stack.length-1];
      if(t.t==='lc'||t.t==='bc') r.comments=true;
      else if(t.t==='str'){
        if(t.q==="'") r.singleQuotes=true;
        var nj=nextSig(toks,k);
        if(top&&top.obj&&top.expect&&nj>=0&&toks[nj].v===':'&&toks[nj].t==='p'){
          var key; try{key=t.q==='"'?JSON.parse(t.v):t.v.slice(1,-1);}catch(e){key=t.v.slice(1,-1);}
          if(top.keys.hasOwnProperty('$'+key)) dup[key]=1; else top.keys['$'+key]=1;
        }
      }else if(t.t==='id'||t.t==='num'){
        var n2=nextSig(toks,k), isKey=n2>=0&&toks[n2].t==='p'&&toks[n2].v===':';
        if(isKey&&top&&top.obj) r.unquotedKeys.push(t.v);
        else if(t.t==='id'&&['true','false','null'].indexOf(t.v)<0) r.badLiterals.push(t.v);
        else if(t.t==='num'&&/^-?\d+$/.test(t.v)&&!Number.isSafeInteger(Number(t.v))) r.unsafeNumbers++;
      }else if(t.t==='p'){
        if(t.v==='{') stack.push({obj:true,expect:true,keys:{}});
        else if(t.v==='[') stack.push({obj:false});
        else if(t.v==='}'||t.v===']') stack.pop();
        else if(t.v===','){
          if(top&&top.obj) top.expect=true;
          var j=nextSig(toks,k); if(j>=0&&toks[j].t==='p'&&(toks[j].v==='}'||toks[j].v===']')) r.trailingCommas=true;
        }else if(t.v===':'&&top&&top.obj) top.expect=false;
      }
    }
    r.duplicates=Object.keys(dup);
    return r;
  }

  return {scan:scan,format:format,minify:minify,repair:repair,inspect:inspect};
});
