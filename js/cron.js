/* Cron Validator — parser, describer, next-run calculator (+ UI when a DOM exists) */
(function(root,factory){
  if(typeof module==='object'&&module.exports) module.exports=factory(); else root.Cron=factory();
})(typeof self!=='undefined'?self:this,function(){
  'use strict';
  var MONTHS=['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
  var DAYS=['SUN','MON','TUE','WED','THU','FRI','SAT'];
  var MONTH_N=['January','February','March','April','May','June','July','August','September','October','November','December'];
  var DAY_N=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  var DEFS={
    second:{key:'second',label:'Second',min:0,max:59,unit:'second'},
    minute:{key:'minute',label:'Minute',min:0,max:59,unit:'minute'},
    hour:{key:'hour',label:'Hour',min:0,max:23,unit:'hour'},
    dom:{key:'dom',label:'Day of month',min:1,max:31,unit:'day'},
    month:{key:'month',label:'Month',min:1,max:12,names:MONTHS,unit:'month'},
    dow:{key:'dow',label:'Day of week',min:0,max:7,names:DAYS,unit:'weekday'}
  };
  var MACROS={'@yearly':'0 0 1 1 *','@annually':'0 0 1 1 *','@monthly':'0 0 1 * *','@weekly':'0 0 * * 0','@daily':'0 0 * * *','@midnight':'0 0 * * *','@hourly':'0 * * * *'};

  function parseValue(tok,def){
    if(/^\d+$/.test(tok)){var n=parseInt(tok,10);return n;}
    if(def.names){var i=def.names.indexOf(tok.toUpperCase());if(i>=0)return def.key==='month'?i+1:i;}
    return NaN;
  }
  function parseField(raw,def){
    if(/[?LW#]/i.test(raw)&&!(def.names&&/^[A-Za-z,\-\/*0-9]+$/.test(raw)&&raw.split(/[,\-\/]/).every(function(x){return x==='*'||/^\d+$/.test(x)||(def.names&&def.names.indexOf(x.toUpperCase())>=0);})))
      return {raw:raw,def:def,error:'Quartz-style characters (? L W #) are not supported here'};
    var parts=[],set={},star=raw.charAt(0)==='*',note=null;
    var items=raw.split(',');
    for(var p=0;p<items.length;p++){
      var it=items[p]; if(it==='') return {raw:raw,def:def,error:'Empty value in list'};
      var sl=it.split('/'); if(sl.length>2) return {raw:raw,def:def,error:'Only one "/" step is allowed per value'};
      var base=sl[0],step=null;
      if(sl.length===2){
        if(!/^\d+$/.test(sl[1])||parseInt(sl[1],10)<1) return {raw:raw,def:def,error:'Step after "/" must be a whole number of 1 or more'};
        step=parseInt(sl[1],10);
      }
      var a,b,type;
      if(base==='*'){a=def.min;b=def.max;type=step?'step':'all';}
      else if(base.indexOf('-')>0){
        var r=base.split('-'); if(r.length!==2) return {raw:raw,def:def,error:'Invalid range "'+base+'"'};
        a=parseValue(r[0],def);b=parseValue(r[1],def);type=step?'step':'range';
        if(isNaN(a)||isNaN(b)) return {raw:raw,def:def,error:'"'+base+'" is not a valid '+def.unit+' range'};
        if(a>b) return {raw:raw,def:def,error:'Range start '+r[0]+' is greater than end '+r[1]};
      }else{
        a=parseValue(base,def); if(isNaN(a)) return {raw:raw,def:def,error:'"'+base+'" is not a valid value for '+def.label.toLowerCase()};
        if(step){b=def.max;type='step';note='"'+it+'" starts at '+base+'; some cron versions require a range such as '+base+'-'+def.max+'/'+step+'.';}
        else{b=a;type='single';}
      }
      if(a<def.min||a>def.max||b<def.min||b>def.max) return {raw:raw,def:def,error:'value must be between '+def.min+' and '+def.max};
      for(var v=a;v<=b;v+=(step||1)){var vv=(def.key==='dow'&&v===7)?0:v;set[vv]=1;}
      parts.push({type:type,a:a,b:b,step:step});
    }
    var values=Object.keys(set).map(Number).sort(function(x,y){return x-y;});
    var full=def.key==='dow'?7:(def.max-def.min+1);
    return {raw:raw,def:def,parts:parts,values:values,set:set,star:star,isAll:values.length===full,note:note};
  }

  function parse(expr,format){
    var seconds=format==='seconds';
    expr=(expr||'').trim().replace(/\s+/g,' ');
    if(!expr) return {empty:true,errors:[]};
    var macro=null;
    if(expr.charAt(0)==='@'){
      var m=expr.toLowerCase();
      if(m==='@reboot') return {errors:[],reboot:true,expr:expr};
      if(!MACROS[m]) return {errors:['Unknown shortcut "'+expr+'". Supported: @yearly, @annually, @monthly, @weekly, @daily, @midnight, @hourly, @reboot']};
      macro=expr;expr=(seconds?'0 ':'')+MACROS[m];
    }
    var tok=expr.split(' '),want=seconds?6:5;
    if(tok.length!==want){
      var hint=tok.length===6&&!seconds?' Switch the format to “6 fields (with seconds)” if your scheduler has a seconds field.':tok.length===5&&seconds?' Switch the format to “5 fields” for standard crontab.':'';
      return {errors:['Expected '+want+' fields ('+(seconds?'second ':'')+'minute hour day-of-month month day-of-week) but found '+tok.length+'.'+hint],tokens:tok};
    }
    var order=(seconds?['second']:[]).concat(['minute','hour','dom','month','dow']);
    var fields=[],errors=[],s={};
    order.forEach(function(k,i){
      var f=parseField(tok[i],DEFS[k]); fields.push(f); s[k]=f;
      if(f.error) errors.push(f.def.label+': '+f.error);
    });
    return {errors:errors,fields:fields,sched:s,seconds:seconds,macro:macro,expr:expr};
  }

  function dayMatches(s,dd,wd){
    var d=!!s.dom.set[dd],w=!!s.dow.set[wd];
    return (s.dom.star||s.dow.star)?(d&&w):(d||w);
  }

  function nextRuns(p,from,count,utc){
    var s=p.sched,res=[],start=from.getTime();
    var secs=p.seconds?s.second.values:[0],mins=s.minute.values,hrs=s.hour.values;
    var y=utc?from.getUTCFullYear():from.getFullYear(),mo=utc?from.getUTCMonth():from.getMonth(),d0=utc?from.getUTCDate():from.getDate();
    for(var k=0;k<366*8&&res.length<count;k++){
      var day=utc?new Date(Date.UTC(y,mo,d0+k,12)):new Date(y,mo,d0+k,12);
      var yy=utc?day.getUTCFullYear():day.getFullYear(),mm=utc?day.getUTCMonth():day.getMonth(),dd=utc?day.getUTCDate():day.getDate(),wd=utc?day.getUTCDay():day.getDay();
      if(!s.month.set[mm+1]||!dayMatches(s,dd,wd)) continue;
      for(var hi=0;hi<hrs.length;hi++)for(var mi=0;mi<mins.length;mi++)for(var si=0;si<secs.length;si++){
        var h=hrs[hi],m=mins[mi],sc=secs[si],t;
        if(utc) t=Date.UTC(yy,mm,dd,h,m,sc);
        else{var dt=new Date(yy,mm,dd,h,m,sc);if(dt.getHours()!==h||dt.getMinutes()!==m)continue;t=dt.getTime();}
        if(t>start){res.push(new Date(t));if(res.length>=count)return res;}
      }
    }
    return res;
  }

  // ── Plain-English description ──
  function pad(n){return (n<10?'0':'')+n;}
  function list(a){return a.length<2?a.join(''):a.slice(0,-1).join(', ')+' and '+a[a.length-1];}
  function ord(n){var s=['th','st','nd','rd'],v=n%100;return n+(s[(v-20)%10]||s[v]||s[0]);}
  function single(f){return f.parts.length===1&&f.parts[0].type==='single';}
  function stepOnly(f){return f.parts.length===1&&f.parts[0].type==='step'&&f.parts[0].a===f.def.min&&f.parts[0].b===f.def.max?f.parts[0].step:0;}
  function rangeOnly(f){return f.parts.length===1&&f.parts[0].type==='range'?f.parts[0]:null;}
  function plural(n,w){return n+' '+w+(n===1?'':'s');}

  function describeTime(s,seconds){
    var m=s.minute,h=s.hour,lead='';
    if(seconds){
      var sec=s.second;
      if(!(single(sec)&&sec.values[0]===0)){
        if(sec.isAll) lead='every second';
        else if(stepOnly(sec)) lead='every '+plural(stepOnly(sec),'second');
        else lead='at second'+(sec.values.length>1?'s':'')+' '+list(sec.values);
        if(m.isAll&&h.isAll) return lead;
        return lead+', '+describeTime(s,false);
      }
    }
    var mStep=stepOnly(m),hStep=stepOnly(h),hr=rangeOnly(h);
    function hourWindow(){
      if(hr) return 'from '+pad(hr.a)+':00 through '+pad(hr.b)+':59';
      if(single(h)) return 'from '+pad(h.values[0])+':00 through '+pad(h.values[0])+':59';
      return 'during '+(h.values.length>1?'hours ':'hour ')+list(h.values);
    }
    if(m.isAll&&h.isAll) return 'every minute';
    if(m.isAll) return hStep?'every minute, every '+plural(hStep,'hour'):'every minute '+hourWindow();
    if(mStep||(m.parts.length===1&&m.parts[0].type==='step')){
      var mp=m.parts[0],base=mStep?'every '+plural(mp.step,'minute'):'every '+plural(mp.step,'minute')+' from minute '+mp.a+(mp.b===59?'':' through '+mp.b);
      if(h.isAll) return base;
      return base+', '+(hStep?'every '+plural(hStep,'hour'):hourWindow());
    }
    var simpleMin=m.parts.every(function(x){return x.type==='single';});
    if(h.isAll){
      if(single(m)&&m.values[0]===0) return 'every hour, on the hour';
      return (simpleMin?'at minute'+(m.values.length>1?'s ':' ')+list(m.values):'at minutes '+m.values.join(', '))+' past every hour';
    }
    var simpleHr=h.parts.every(function(x){return x.type==='single';});
    if(simpleMin&&simpleHr&&m.values.length*h.values.length<=6){
      var t=[];h.values.forEach(function(hh){m.values.forEach(function(mm){t.push(pad(hh)+':'+pad(mm));});});
      return 'at '+list(t);
    }
    if(hStep) return 'every '+plural(hStep,'hour')+(single(m)&&m.values[0]===0?'':', at minute'+(m.values.length>1?'s ':' ')+list(m.values));
    if(hr&&single(m)) return (m.values[0]===0?'every hour':'at minute '+m.values[0]+' past every hour')+' from '+pad(hr.a)+':00 through '+pad(hr.b)+':'+(m.values[0]===0?'00':'59');
    return 'at minute'+(m.values.length>1?'s ':' ')+list(m.values)+', '+hourWindow();
  }

  function describeDate(s){
    var out=[],dom=s.dom,mon=s.month,dow=s.dow;
    var dPhrase='',wPhrase='';
    if(!dom.isAll){
      var st=stepOnly(dom),rg=rangeOnly(dom);
      if(st) dPhrase='every '+plural(st,'day')+' of the month';
      else if(rg) dPhrase='from the '+ord(rg.a)+' through the '+ord(rg.b);
      else dPhrase='on the '+list(dom.values.map(ord));
    }
    if(!dow.isAll){
      var v=dow.values.join(',');
      if(v==='1,2,3,4,5') wPhrase='on weekdays (Monday through Friday)';
      else if(v==='0,6') wPhrase='on weekends';
      else{
        var r2=rangeOnly(dow),st2=stepOnly(dow);
        if(r2&&r2.a!==r2.b) wPhrase='on '+DAY_N[r2.a%7]+' through '+DAY_N[r2.b%7];
        else if(st2) wPhrase='every '+plural(st2,'day')+' of the week';
        else wPhrase='on '+list(dow.values.map(function(x){return DAY_N[x];}));
      }
    }
    if(dPhrase&&wPhrase) out.push(dPhrase+' or '+wPhrase);
    else if(dPhrase||wPhrase) out.push(dPhrase||wPhrase);
    if(!mon.isAll){
      var st3=stepOnly(mon),r3=rangeOnly(mon);
      if(st3) out.push('every '+plural(st3,'month'));
      else if(r3&&r3.a!==r3.b) out.push('from '+MONTH_N[r3.a-1]+' through '+MONTH_N[r3.b-1]);
      else out.push('in '+list(mon.values.map(function(x){return MONTH_N[x-1];})));
    }
    return out.join(', ');
  }

  function describe(p){
    if(p.reboot) return 'Once, when the system starts up (not a time-based schedule)';
    var s=p.sched,t=describeTime(s,p.seconds),d=describeDate(s);
    var txt=t+(d?', '+d:(s.dom.isAll&&s.dow.isAll&&s.month.isAll&&!/^every |past every hour/.test(t)?', every day':''));
    return txt.charAt(0).toUpperCase()+txt.slice(1);
  }

  function warnings(p){
    var w=[];if(!p.sched)return w;
    var s=p.sched;
    if(!s.dom.star&&!s.dow.star&&!s.dom.isAll&&!s.dow.isAll)
      w.push('Day of month and day of week are both set. In standard cron the job runs when EITHER matches, not only when both do.');
    ['dom','month','dow','minute','hour'].concat(p.seconds?['second']:[]).forEach(function(k){if(s[k].note)w.push(s[k].note);});
    var m=stepOnly(s.minute);if(m&&60%m!==0) w.push('*/'+m+' restarts every hour, so runs are not evenly spaced (e.g. at :00 then :'+pad(m)+', then the next hour starts again at :00).');
    return w;
  }

  function fieldMeaning(f){
    if(f.error) return f.error;
    var d=f.def;
    if(f.isAll&&!stepOnly(f)) return 'every '+d.unit;
    var st=stepOnly(f);if(st) return 'every '+plural(st,d.unit);
    var show=f.values.map(function(v){return d.key==='month'?MONTH_N[v-1].slice(0,3):d.key==='dow'?DAY_N[v].slice(0,3):(d.key==='hour'?pad(v):v);});
    return show.length>8?show.length+' values':show.join(', ');
  }

  return {parse:parse,nextRuns:nextRuns,describe:describe,warnings:warnings,fieldMeaning:fieldMeaning,MACROS:MACROS,pad:pad};
});

/* ── UI ── */
if(typeof document!=='undefined'&&document.getElementById('cronInput')){
(function(){
  var $=function(id){return document.getElementById(id);};
  var PRESETS=[['Every minute','* * * * *'],['Every 5 minutes','*/5 * * * *'],['Every hour','0 * * * *'],['Daily at midnight','0 0 * * *'],['Weekdays at 9:00','0 9 * * 1-5'],['Every Sunday at 03:30','30 3 * * 0'],['1st of the month','0 0 1 * *'],['Every year, 1 January','0 0 1 1 *']];
  var tzName='local';try{tzName=Intl.DateTimeFormat().resolvedOptions().timeZone||'local';}catch(e){}
  $('tzLocal').textContent='Local time ('+tzName+')';
  var box=$('presets');
  PRESETS.forEach(function(p){
    var b=document.createElement('button');b.type='button';b.className='btn';b.textContent=p[0];
    b.onclick=function(){$('cronInput').value=($('fmt').value==='seconds'?'0 ':'')+p[1];run();$('cronInput').focus();};
    box.appendChild(b);
  });
  function fmtDate(d,utc,sec){
    try{return new Intl.DateTimeFormat(undefined,{weekday:'short',year:'numeric',month:'short',day:'numeric',hour:'2-digit',minute:'2-digit',second:sec?'2-digit':undefined,timeZone:utc?'UTC':undefined,timeZoneName:'short'}).format(d);}
    catch(e){return d.toString();}
  }
  function rel(ms){
    var s=Math.round(ms/1000);if(s<60)return 'in '+s+' sec';
    var m=Math.round(s/60);if(m<60)return 'in '+m+' min';
    var h=Math.floor(m/60),mm=m%60;if(h<48)return 'in '+h+' h'+(mm?' '+mm+' min':'');
    return 'in '+Math.round(h/24)+' days';
  }
  var esc2=function(s){return String(s).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];});};
  function run(){
    var expr=$('cronInput').value,fmt=$('fmt').value,utc=$('tz').value==='utc';
    var p=Cron.parse(expr,fmt),st=$('status'),res=$('result'),fl=$('fields'),nr=$('nextRuns'),wr=$('warns');
    wr.innerHTML='';fl.innerHTML='';nr.innerHTML='';
    $('cronInput').setAttribute('aria-invalid',p.errors&&p.errors.length?'true':'false');
    if(p.empty){st.className='cstatus';st.textContent='Enter an expression to validate it';res.textContent='';$('nextWrap').style.display='none';return;}
    if(p.errors.length){
      st.className='cstatus bad';st.textContent='Invalid cron expression';
      res.innerHTML='<ul class="errs">'+p.errors.map(function(e){return '<li>'+esc2(e)+'</li>';}).join('')+'</ul>';
      if(p.fields) fl.innerHTML=p.fields.map(function(f){return '<div class="fbox'+(f.error?' bad':'')+'"><div class="fl">'+f.def.label+'</div><code>'+esc2(f.raw)+'</code><div class="fm">'+esc2(Cron.fieldMeaning(f))+'</div></div>';}).join('');
      $('nextWrap').style.display='none';return;
    }
    st.className='cstatus good';st.textContent='Valid cron expression';
    res.textContent=Cron.describe(p);
    if(p.macro) res.innerHTML+=' <span class="muted">('+esc2(p.macro)+' = <code>'+esc2(p.expr)+'</code>)</span>';
    if(p.reboot){$('nextWrap').style.display='none';return;}
    fl.innerHTML=p.fields.map(function(f){return '<div class="fbox"><div class="fl">'+f.def.label+'</div><code>'+esc2(f.raw)+'</code><div class="fm">'+esc2(Cron.fieldMeaning(f))+'</div></div>';}).join('');
    var now=new Date(),runs=Cron.nextRuns(p,now,10,utc);
    $('nextWrap').style.display='block';
    if(!runs.length){nr.innerHTML='<li class="never">This schedule never runs (for example, 31 February). Check the day-of-month and month fields.</li>';}
    else nr.innerHTML=runs.map(function(d){return '<li><span>'+esc2(fmtDate(d,utc,p.seconds))+'</span><span class="muted">'+rel(d-now)+'</span></li>';}).join('');
    var w=Cron.warnings(p);
    wr.innerHTML=w.map(function(x){return '<p class="warn">'+esc2(x)+'</p>';}).join('');
  }
  $('cronInput').addEventListener('input',run);$('fmt').addEventListener('change',run);$('tz').addEventListener('change',run);
  $('copyBtn').addEventListener('click',function(){if($('cronInput').value.trim())clip($('cronInput').value.trim());});
  $('cronInput').value='*/15 9-17 * * 1-5';run();
})();
}
