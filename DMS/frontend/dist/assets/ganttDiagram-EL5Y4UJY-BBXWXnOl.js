import{g as Oe,s as We,p as Ne,o as Pe,a as Re,b as Ve,_ as l,c as ht,d as ze,aR as U,l as lt,j as He,n as Be,q as qe,y as Ge}from"./mermaid.core-Xm_VjEdU.js";import{g as Yt}from"./file-viewer-preset-all-Cl1PwI6y.js";import{R as ye,y as je,z as pe,A as ge,C as ve,B as Lt,D as Xe,k as bt}from"./transform-Dmxhnzuu.js";import{t as Ue,a as Ze,b as ie,c as se,d as Qe,e as Ke,f as Je,g as ti,h as ei,i as ii,j as si,k as re,l as ne,m as ae,s as oe,n as ce,o as ri}from"./axis-Bp3ntUxk.js";import{l as ni}from"./linear-DC7IJrID.js";import"./file-viewer-archive-BNgibNeG.js";import"./file-viewer-text-CfAGdp0C.js";import"./rough.esm-BCKZ66Jd.js";import"./file-viewer-cad-mr4_pmlp.js";import"./file-viewer-chm-DETzARma.js";import"./file-viewer-data-AglbBccc.js";import"./file-viewer-drawing-Br0NmXK1.js";import"./file-viewer-mindmap-Dpc-Sop9.js";import"./file-viewer-ebook-o2Izh2d1.js";import"./file-viewer-eda-D-8BY2oe.js";import"./file-viewer-email-CdS9T_YU.js";import"./file-viewer-geo-vvf--s11.js";import"./file-viewer-hangul-Bvlxm7Wr.js";import"./file-viewer-iwork-BQQaTJdo.js";import"./file-viewer-image-DfzIJ9zN.js";import"./file-viewer-media-Co8PeII2.js";import"./file-viewer-ofd-DCdfU1ui.js";import"./file-viewer-pdf-Bz9M4O-K.js";import"./file-viewer-presentation-LgYe2HR5.js";import"./file-viewer-presentation-ppt-3JdzpMCk.js";import"./file-viewer-presentation-pptx-CjY1hOlO.js";import"./file-viewer-spreadsheet-Dl87g74_.js";import"./file-viewer-typst-CxfYiUql.js";import"./file-viewer-word-BOkcjdNh.js";import"./file-viewer-wordperfect-D_yJLHb7.js";import"./init-Gi6I4Gst.js";import"./defaultLocale-Cw5pbRzx.js";import"./index-C0UdrJPs.js";function ai(t,e){let s;if(e===void 0)for(const i of t)i!=null&&(s<i||s===void 0&&i>=i)&&(s=i);else{let i=-1;for(let r of t)(r=e(r,++i,t))!=null&&(s<r||s===void 0&&r>=r)&&(s=r)}return s}function oi(t,e){let s;if(e===void 0)for(const i of t)i!=null&&(s>i||s===void 0&&i>=i)&&(s=i);else{let i=-1;for(let r of t)(r=e(r,++i,t))!=null&&(s>r||s===void 0&&r>=r)&&(s=r)}return s}const ci=Math.PI/180,li=180/Math.PI,Et=18,xe=.96422,Te=1,be=.82521,we=4/29,mt=6/29,_e=3*mt*mt,ui=mt*mt*mt;function De(t){if(t instanceof it)return new it(t.l,t.a,t.b,t.opacity);if(t instanceof rt)return Se(t);t instanceof ye||(t=je(t));var e=Nt(t.r),s=Nt(t.g),i=Nt(t.b),r=At((.2225045*e+.7168786*s+.0606169*i)/Te),y,p;return e===s&&s===i?y=p=r:(y=At((.4360747*e+.3850649*s+.1430804*i)/xe),p=At((.0139322*e+.0971045*s+.7141733*i)/be)),new it(116*r-16,500*(y-r),200*(r-p),t.opacity)}function di(t,e,s,i){return arguments.length===1?De(t):new it(t,e,s,i??1)}function it(t,e,s,i){this.l=+t,this.a=+e,this.b=+s,this.opacity=+i}pe(it,di,ge(ve,{brighter(t){return new it(this.l+Et*(t??1),this.a,this.b,this.opacity)},darker(t){return new it(this.l-Et*(t??1),this.a,this.b,this.opacity)},rgb(){var t=(this.l+16)/116,e=isNaN(this.a)?t:t+this.a/500,s=isNaN(this.b)?t:t-this.b/200;return e=xe*Ot(e),t=Te*Ot(t),s=be*Ot(s),new ye(Wt(3.1338561*e-1.6168667*t-.4906146*s),Wt(-.9787684*e+1.9161415*t+.033454*s),Wt(.0719453*e-.2289914*t+1.4052427*s),this.opacity)}}));function At(t){return t>ui?Math.pow(t,1/3):t/_e+we}function Ot(t){return t>mt?t*t*t:_e*(t-we)}function Wt(t){return 255*(t<=.0031308?12.92*t:1.055*Math.pow(t,1/2.4)-.055)}function Nt(t){return(t/=255)<=.04045?t/12.92:Math.pow((t+.055)/1.055,2.4)}function fi(t){if(t instanceof rt)return new rt(t.h,t.c,t.l,t.opacity);if(t instanceof it||(t=De(t)),t.a===0&&t.b===0)return new rt(NaN,0<t.l&&t.l<100?0:NaN,t.l,t.opacity);var e=Math.atan2(t.b,t.a)*li;return new rt(e<0?e+360:e,Math.sqrt(t.a*t.a+t.b*t.b),t.l,t.opacity)}function Rt(t,e,s,i){return arguments.length===1?fi(t):new rt(t,e,s,i??1)}function rt(t,e,s,i){this.h=+t,this.c=+e,this.l=+s,this.opacity=+i}function Se(t){if(isNaN(t.h))return new it(t.l,0,0,t.opacity);var e=t.h*ci;return new it(t.l,Math.cos(e)*t.c,Math.sin(e)*t.c,t.opacity)}pe(rt,Rt,ge(ve,{brighter(t){return new rt(this.h,this.c,this.l+Et*(t??1),this.opacity)},darker(t){return new rt(this.h,this.c,this.l-Et*(t??1),this.opacity)},rgb(){return Se(this).rgb()}}));function hi(t){return function(e,s){var i=t((e=Rt(e)).h,(s=Rt(s)).h),r=Lt(e.c,s.c),y=Lt(e.l,s.l),p=Lt(e.opacity,s.opacity);return function(T){return e.h=i(T),e.c=r(T),e.l=y(T),e.opacity=p(T),e+""}}}const mi=hi(Xe);var wt={exports:{}},ki=wt.exports,le;function yi(){return le||(le=1,(function(t,e){(function(s,i){t.exports=i()})(ki,(function(){var s="day";return function(i,r,y){var p=function(L){return L.add(4-L.isoWeekday(),s)},T=r.prototype;T.isoWeekYear=function(){return p(this).year()},T.isoWeek=function(L){if(!this.$utils().u(L))return this.add(7*(L-this.isoWeek()),s);var w,N,A,R,j=p(this),z=(w=this.isoWeekYear(),N=this.$u,A=(N?y.utc:y)().year(w).startOf("year"),R=4-A.isoWeekday(),A.isoWeekday()>4&&(R+=7),A.add(R,s));return j.diff(z,"week")+1},T.isoWeekday=function(L){return this.$utils().u(L)?this.day()||7:this.day(this.day()%7?L:L-7)};var F=T.startOf;T.startOf=function(L,w){var N=this.$utils(),A=!!N.u(w)||w;return N.p(L)==="isoweek"?A?this.date(this.date()-(this.isoWeekday()-1)).startOf("day"):this.date(this.date()-1-(this.isoWeekday()-1)+7).endOf("day"):F.bind(this)(L,w)}}}))})(wt)),wt.exports}var pi=yi();const gi=Yt(pi);var _t={exports:{}},vi=_t.exports,ue;function xi(){return ue||(ue=1,(function(t,e){(function(s,i){t.exports=i()})(vi,(function(){var s={LTS:"h:mm:ss A",LT:"h:mm A",L:"MM/DD/YYYY",LL:"MMMM D, YYYY",LLL:"MMMM D, YYYY h:mm A",LLLL:"dddd, MMMM D, YYYY h:mm A"},i=/(\[[^[]*\])|([-_:/.,()\s]+)|(A|a|Q|YYYY|YY?|ww?|MM?M?M?|Do|DD?|hh?|HH?|mm?|ss?|S{1,3}|z|ZZ?)/g,r=/\d/,y=/\d\d/,p=/\d\d?/,T=/\d*[^-_:/,()\s\d]+/,F={},L=function(k){return(k=+k)+(k>68?1900:2e3)},w=function(k){return function(E){this[k]=+E}},N=[/[+-]\d\d:?(\d\d)?|Z/,function(k){(this.zone||(this.zone={})).offset=(function(E){if(!E||E==="Z")return 0;var O=E.match(/([+-]|\d\d)/g),Y=60*O[1]+(+O[2]||0);return Y===0?0:O[0]==="+"?-Y:Y})(k)}],A=function(k){var E=F[k];return E&&(E.indexOf?E:E.s.concat(E.f))},R=function(k,E){var O,Y=F.meridiem;if(Y){for(var X=1;X<=24;X+=1)if(k.indexOf(Y(X,0,E))>-1){O=X>12;break}}else O=k===(E?"pm":"PM");return O},j={A:[T,function(k){this.afternoon=R(k,!1)}],a:[T,function(k){this.afternoon=R(k,!0)}],Q:[r,function(k){this.month=3*(k-1)+1}],S:[r,function(k){this.milliseconds=100*+k}],SS:[y,function(k){this.milliseconds=10*+k}],SSS:[/\d{3}/,function(k){this.milliseconds=+k}],s:[p,w("seconds")],ss:[p,w("seconds")],m:[p,w("minutes")],mm:[p,w("minutes")],H:[p,w("hours")],h:[p,w("hours")],HH:[p,w("hours")],hh:[p,w("hours")],D:[p,w("day")],DD:[y,w("day")],Do:[T,function(k){var E=F.ordinal,O=k.match(/\d+/);if(this.day=O[0],E)for(var Y=1;Y<=31;Y+=1)E(Y).replace(/\[|\]/g,"")===k&&(this.day=Y)}],w:[p,w("week")],ww:[y,w("week")],M:[p,w("month")],MM:[y,w("month")],MMM:[T,function(k){var E=A("months"),O=(A("monthsShort")||E.map((function(Y){return Y.slice(0,3)}))).indexOf(k)+1;if(O<1)throw new Error;this.month=O%12||O}],MMMM:[T,function(k){var E=A("months").indexOf(k)+1;if(E<1)throw new Error;this.month=E%12||E}],Y:[/[+-]?\d+/,w("year")],YY:[y,function(k){this.year=L(k)}],YYYY:[/\d{4}/,w("year")],Z:N,ZZ:N};function z(k){var E,O;E=k,O=F&&F.formats;for(var Y=(k=E.replace(/(\[[^\]]+])|(LTS?|l{1,4}|L{1,4})/g,(function(m,x,v){var g=v&&v.toUpperCase();return x||O[v]||s[v]||O[g].replace(/(\[[^\]]+])|(MMMM|MM|DD|dddd)/g,(function(a,d,f){return d||f.slice(1)}))}))).match(i),X=Y.length,B=0;B<X;B+=1){var $=Y[B],b=j[$],h=b&&b[0],I=b&&b[1];Y[B]=I?{regex:h,parser:I}:$.replace(/^\[|\]$/g,"")}return function(m){for(var x={},v=0,g=0;v<X;v+=1){var a=Y[v];if(typeof a=="string")g+=a.length;else{var d=a.regex,f=a.parser,u=m.slice(g),_=d.exec(u)[0];f.call(x,_),m=m.replace(_,"")}}return(function(n){var D=n.afternoon;if(D!==void 0){var o=n.hours;D?o<12&&(n.hours+=12):o===12&&(n.hours=0),delete n.afternoon}})(x),x}}return function(k,E,O){O.p.customParseFormat=!0,k&&k.parseTwoDigitYear&&(L=k.parseTwoDigitYear);var Y=E.prototype,X=Y.parse;Y.parse=function(B){var $=B.date,b=B.utc,h=B.args;this.$u=b;var I=h[1];if(typeof I=="string"){var m=h[2]===!0,x=h[3]===!0,v=m||x,g=h[2];x&&(g=h[2]),F=this.$locale(),!m&&g&&(F=O.Ls[g]),this.$d=(function(u,_,n,D){try{if(["x","X"].indexOf(_)>-1)return new Date((_==="X"?1e3:1)*u);var o=z(_)(u),H=o.year,c=o.month,S=o.day,C=o.hours,P=o.minutes,M=o.seconds,V=o.milliseconds,W=o.zone,nt=o.week,ot=new Date,vt=S||(H||c?1:ot.getDate()),dt=H||ot.getFullYear(),q=0;H&&!c||(q=c>0?c-1:ot.getMonth());var K,Z=C||0,ct=P||0,J=M||0,at=V||0;return W?new Date(Date.UTC(dt,q,vt,Z,ct,J,at+60*W.offset*1e3)):n?new Date(Date.UTC(dt,q,vt,Z,ct,J,at)):(K=new Date(dt,q,vt,Z,ct,J,at),nt&&(K=D(K).week(nt).toDate()),K)}catch{return new Date("")}})($,I,b,O),this.init(),g&&g!==!0&&(this.$L=this.locale(g).$L),v&&$!=this.format(I)&&(this.$d=new Date("")),F={}}else if(I instanceof Array)for(var a=I.length,d=1;d<=a;d+=1){h[1]=I[d-1];var f=O.apply(this,h);if(f.isValid()){this.$d=f.$d,this.$L=f.$L,this.init();break}d===a&&(this.$d=new Date(""))}else X.call(this,B)}}}))})(_t)),_t.exports}var Ti=xi();const bi=Yt(Ti);var Dt={exports:{}},wi=Dt.exports,de;function _i(){return de||(de=1,(function(t,e){(function(s,i){t.exports=i()})(wi,(function(){return function(s,i){var r=i.prototype,y=r.format;r.format=function(p){var T=this,F=this.$locale();if(!this.isValid())return y.bind(this)(p);var L=this.$utils(),w=(p||"YYYY-MM-DDTHH:mm:ssZ").replace(/\[([^\]]+)]|Q|wo|ww|w|WW|W|zzz|z|gggg|GGGG|Do|X|x|k{1,2}|S/g,(function(N){switch(N){case"Q":return Math.ceil((T.$M+1)/3);case"Do":return F.ordinal(T.$D);case"gggg":return T.weekYear();case"GGGG":return T.isoWeekYear();case"wo":return F.ordinal(T.week(),"W");case"w":case"ww":return L.s(T.week(),N==="w"?1:2,"0");case"W":case"WW":return L.s(T.isoWeek(),N==="W"?1:2,"0");case"k":case"kk":return L.s(String(T.$H===0?24:T.$H),N==="k"?1:2,"0");case"X":return Math.floor(T.$d.getTime()/1e3);case"x":return T.$d.getTime();case"z":return"["+T.offsetName()+"]";case"zzz":return"["+T.offsetName("long")+"]";default:return N}}));return y.bind(this)(w)}}}))})(Dt)),Dt.exports}var Di=_i();const Si=Yt(Di);var St={exports:{}},Ci=St.exports,fe;function Mi(){return fe||(fe=1,(function(t,e){(function(s,i){t.exports=i()})(Ci,(function(){var s,i,r=1e3,y=6e4,p=36e5,T=864e5,F=31536e6,L=2628e6,w=/^(-|\+)?P(?:([-+]?[0-9,.]*)Y)?(?:([-+]?[0-9,.]*)M)?(?:([-+]?[0-9,.]*)W)?(?:([-+]?[0-9,.]*)D)?(?:T(?:([-+]?[0-9,.]*)H)?(?:([-+]?[0-9,.]*)M)?(?:([-+]?[0-9,.]*)S)?)?$/,N=/\[([^\]]+)]|YYYY|YY|Y|M{1,2}|D{1,2}|H{1,2}|m{1,2}|s{1,2}|SSS/g,A={years:F,months:L,days:T,hours:p,minutes:y,seconds:r,milliseconds:1,weeks:6048e5},R=function($){return $ instanceof X},j=function($,b,h){return new X($,h,b.$l)},z=function($){return i.p($)+"s"},k=function($){return $<0},E=function($){return k($)?Math.ceil($):Math.floor($)},O=function($){return Math.abs($)},Y=function($,b){return $?k($)?{negative:!0,format:""+O($)+b}:{negative:!1,format:""+$+b}:{negative:!1,format:""}},X=(function(){function $(h,I,m){var x=this;if(this.$d={},this.$l=m,h===void 0&&(this.$ms=0,this.parseFromMilliseconds()),I)return j(h*A[z(I)],this);if(typeof h=="number")return this.$ms=h,this.parseFromMilliseconds(),this;if(typeof h=="object")return Object.keys(h).forEach((function(a){x.$d[z(a)]=h[a]})),this.calMilliseconds(),this;if(typeof h=="string"){var v=h.match(w);if(v){var g=v.slice(2).map((function(a){return a!=null?Number(a):0}));return this.$d.years=g[0],this.$d.months=g[1],this.$d.weeks=g[2],this.$d.days=g[3],this.$d.hours=g[4],this.$d.minutes=g[5],this.$d.seconds=g[6],this.calMilliseconds(),this}}return this}var b=$.prototype;return b.calMilliseconds=function(){var h=this;this.$ms=Object.keys(this.$d).reduce((function(I,m){return I+(h.$d[m]||0)*A[m]}),0)},b.parseFromMilliseconds=function(){var h=this.$ms;this.$d.years=E(h/F),h%=F,this.$d.months=E(h/L),h%=L,this.$d.days=E(h/T),h%=T,this.$d.hours=E(h/p),h%=p,this.$d.minutes=E(h/y),h%=y,this.$d.seconds=E(h/r),h%=r,this.$d.milliseconds=h},b.toISOString=function(){var h=Y(this.$d.years,"Y"),I=Y(this.$d.months,"M"),m=+this.$d.days||0;this.$d.weeks&&(m+=7*this.$d.weeks);var x=Y(m,"D"),v=Y(this.$d.hours,"H"),g=Y(this.$d.minutes,"M"),a=this.$d.seconds||0;this.$d.milliseconds&&(a+=this.$d.milliseconds/1e3,a=Math.round(1e3*a)/1e3);var d=Y(a,"S"),f=h.negative||I.negative||x.negative||v.negative||g.negative||d.negative,u=v.format||g.format||d.format?"T":"",_=(f?"-":"")+"P"+h.format+I.format+x.format+u+v.format+g.format+d.format;return _==="P"||_==="-P"?"P0D":_},b.toJSON=function(){return this.toISOString()},b.format=function(h){var I=h||"YYYY-MM-DDTHH:mm:ss",m={Y:this.$d.years,YY:i.s(this.$d.years,2,"0"),YYYY:i.s(this.$d.years,4,"0"),M:this.$d.months,MM:i.s(this.$d.months,2,"0"),D:this.$d.days,DD:i.s(this.$d.days,2,"0"),H:this.$d.hours,HH:i.s(this.$d.hours,2,"0"),m:this.$d.minutes,mm:i.s(this.$d.minutes,2,"0"),s:this.$d.seconds,ss:i.s(this.$d.seconds,2,"0"),SSS:i.s(this.$d.milliseconds,3,"0")};return I.replace(N,(function(x,v){return v||String(m[x])}))},b.as=function(h){return this.$ms/A[z(h)]},b.get=function(h){var I=this.$ms,m=z(h);return m==="milliseconds"?I%=1e3:I=m==="weeks"?E(I/A[m]):this.$d[m],I||0},b.add=function(h,I,m){var x;return x=I?h*A[z(I)]:R(h)?h.$ms:j(h,this).$ms,j(this.$ms+x*(m?-1:1),this)},b.subtract=function(h,I){return this.add(h,I,!0)},b.locale=function(h){var I=this.clone();return I.$l=h,I},b.clone=function(){return j(this.$ms,this)},b.humanize=function(h){return s().add(this.$ms,"ms").locale(this.$l).fromNow(!h)},b.valueOf=function(){return this.asMilliseconds()},b.milliseconds=function(){return this.get("milliseconds")},b.asMilliseconds=function(){return this.as("milliseconds")},b.seconds=function(){return this.get("seconds")},b.asSeconds=function(){return this.as("seconds")},b.minutes=function(){return this.get("minutes")},b.asMinutes=function(){return this.as("minutes")},b.hours=function(){return this.get("hours")},b.asHours=function(){return this.as("hours")},b.days=function(){return this.get("days")},b.asDays=function(){return this.as("days")},b.weeks=function(){return this.get("weeks")},b.asWeeks=function(){return this.as("weeks")},b.months=function(){return this.get("months")},b.asMonths=function(){return this.as("months")},b.years=function(){return this.get("years")},b.asYears=function(){return this.as("years")},$})(),B=function($,b,h){return $.add(b.years()*h,"y").add(b.months()*h,"M").add(b.days()*h,"d").add(b.hours()*h,"h").add(b.minutes()*h,"m").add(b.seconds()*h,"s").add(b.milliseconds()*h,"ms")};return function($,b,h){s=h,i=h().$utils(),h.duration=function(x,v){var g=h.locale();return j(x,{$l:g},v)},h.isDuration=R;var I=b.prototype.add,m=b.prototype.subtract;b.prototype.add=function(x,v){return R(x)?B(this,x,1):I.bind(this)(x,v)},b.prototype.subtract=function(x,v){return R(x)?B(this,x,-1):m.bind(this)(x,v)}}}))})(St)),St.exports}var Ei=Mi();const Ii=Yt(Ei);var Vt=(function(){var t=l(function(g,a,d,f){for(d=d||{},f=g.length;f--;d[g[f]]=a);return d},"o"),e=[6,8,10,12,13,14,15,16,17,18,20,21,22,23,24,25,26,27,28,29,30,31,33,35,36,38,40],s=[1,26],i=[1,27],r=[1,28],y=[1,29],p=[1,30],T=[1,31],F=[1,32],L=[1,33],w=[1,34],N=[1,9],A=[1,10],R=[1,11],j=[1,12],z=[1,13],k=[1,14],E=[1,15],O=[1,16],Y=[1,19],X=[1,20],B=[1,21],$=[1,22],b=[1,23],h=[1,25],I=[1,35],m={trace:l(function(){},"trace"),yy:{},symbols_:{error:2,start:3,gantt:4,document:5,EOF:6,line:7,SPACE:8,statement:9,NL:10,weekday:11,weekday_monday:12,weekday_tuesday:13,weekday_wednesday:14,weekday_thursday:15,weekday_friday:16,weekday_saturday:17,weekday_sunday:18,weekend:19,weekend_friday:20,weekend_saturday:21,dateFormat:22,inclusiveEndDates:23,topAxis:24,axisFormat:25,tickInterval:26,excludes:27,includes:28,todayMarker:29,title:30,acc_title:31,acc_title_value:32,acc_descr:33,acc_descr_value:34,acc_descr_multiline_value:35,section:36,clickStatement:37,taskTxt:38,taskData:39,click:40,callbackname:41,callbackargs:42,href:43,clickStatementDebug:44,$accept:0,$end:1},terminals_:{2:"error",4:"gantt",6:"EOF",8:"SPACE",10:"NL",12:"weekday_monday",13:"weekday_tuesday",14:"weekday_wednesday",15:"weekday_thursday",16:"weekday_friday",17:"weekday_saturday",18:"weekday_sunday",20:"weekend_friday",21:"weekend_saturday",22:"dateFormat",23:"inclusiveEndDates",24:"topAxis",25:"axisFormat",26:"tickInterval",27:"excludes",28:"includes",29:"todayMarker",30:"title",31:"acc_title",32:"acc_title_value",33:"acc_descr",34:"acc_descr_value",35:"acc_descr_multiline_value",36:"section",38:"taskTxt",39:"taskData",40:"click",41:"callbackname",42:"callbackargs",43:"href"},productions_:[0,[3,3],[5,0],[5,2],[7,2],[7,1],[7,1],[7,1],[11,1],[11,1],[11,1],[11,1],[11,1],[11,1],[11,1],[19,1],[19,1],[9,1],[9,1],[9,1],[9,1],[9,1],[9,1],[9,1],[9,1],[9,1],[9,1],[9,1],[9,2],[9,2],[9,1],[9,1],[9,1],[9,2],[37,2],[37,3],[37,3],[37,4],[37,3],[37,4],[37,2],[44,2],[44,3],[44,3],[44,4],[44,3],[44,4],[44,2]],performAction:l(function(a,d,f,u,_,n,D){var o=n.length-1;switch(_){case 1:return n[o-1];case 2:this.$=[];break;case 3:n[o-1].push(n[o]),this.$=n[o-1];break;case 4:case 5:this.$=n[o];break;case 6:case 7:this.$=[];break;case 8:u.setWeekday("monday");break;case 9:u.setWeekday("tuesday");break;case 10:u.setWeekday("wednesday");break;case 11:u.setWeekday("thursday");break;case 12:u.setWeekday("friday");break;case 13:u.setWeekday("saturday");break;case 14:u.setWeekday("sunday");break;case 15:u.setWeekend("friday");break;case 16:u.setWeekend("saturday");break;case 17:u.setDateFormat(n[o].substr(11)),this.$=n[o].substr(11);break;case 18:u.enableInclusiveEndDates(),this.$=n[o].substr(18);break;case 19:u.TopAxis(),this.$=n[o].substr(8);break;case 20:u.setAxisFormat(n[o].substr(11)),this.$=n[o].substr(11);break;case 21:u.setTickInterval(n[o].substr(13)),this.$=n[o].substr(13);break;case 22:u.setExcludes(n[o].substr(9)),this.$=n[o].substr(9);break;case 23:u.setIncludes(n[o].substr(9)),this.$=n[o].substr(9);break;case 24:u.setTodayMarker(n[o].substr(12)),this.$=n[o].substr(12);break;case 27:u.setDiagramTitle(n[o].substr(6)),this.$=n[o].substr(6);break;case 28:this.$=n[o].trim(),u.setAccTitle(this.$);break;case 29:case 30:this.$=n[o].trim(),u.setAccDescription(this.$);break;case 31:u.addSection(n[o].substr(8)),this.$=n[o].substr(8);break;case 33:u.addTask(n[o-1],n[o]),this.$="task";break;case 34:this.$=n[o-1],u.setClickEvent(n[o-1],n[o],null);break;case 35:this.$=n[o-2],u.setClickEvent(n[o-2],n[o-1],n[o]);break;case 36:this.$=n[o-2],u.setClickEvent(n[o-2],n[o-1],null),u.setLink(n[o-2],n[o]);break;case 37:this.$=n[o-3],u.setClickEvent(n[o-3],n[o-2],n[o-1]),u.setLink(n[o-3],n[o]);break;case 38:this.$=n[o-2],u.setClickEvent(n[o-2],n[o],null),u.setLink(n[o-2],n[o-1]);break;case 39:this.$=n[o-3],u.setClickEvent(n[o-3],n[o-1],n[o]),u.setLink(n[o-3],n[o-2]);break;case 40:this.$=n[o-1],u.setLink(n[o-1],n[o]);break;case 41:case 47:this.$=n[o-1]+" "+n[o];break;case 42:case 43:case 45:this.$=n[o-2]+" "+n[o-1]+" "+n[o];break;case 44:case 46:this.$=n[o-3]+" "+n[o-2]+" "+n[o-1]+" "+n[o];break}},"anonymous"),table:[{3:1,4:[1,2]},{1:[3]},t(e,[2,2],{5:3}),{6:[1,4],7:5,8:[1,6],9:7,10:[1,8],11:17,12:s,13:i,14:r,15:y,16:p,17:T,18:F,19:18,20:L,21:w,22:N,23:A,24:R,25:j,26:z,27:k,28:E,29:O,30:Y,31:X,33:B,35:$,36:b,37:24,38:h,40:I},t(e,[2,7],{1:[2,1]}),t(e,[2,3]),{9:36,11:17,12:s,13:i,14:r,15:y,16:p,17:T,18:F,19:18,20:L,21:w,22:N,23:A,24:R,25:j,26:z,27:k,28:E,29:O,30:Y,31:X,33:B,35:$,36:b,37:24,38:h,40:I},t(e,[2,5]),t(e,[2,6]),t(e,[2,17]),t(e,[2,18]),t(e,[2,19]),t(e,[2,20]),t(e,[2,21]),t(e,[2,22]),t(e,[2,23]),t(e,[2,24]),t(e,[2,25]),t(e,[2,26]),t(e,[2,27]),{32:[1,37]},{34:[1,38]},t(e,[2,30]),t(e,[2,31]),t(e,[2,32]),{39:[1,39]},t(e,[2,8]),t(e,[2,9]),t(e,[2,10]),t(e,[2,11]),t(e,[2,12]),t(e,[2,13]),t(e,[2,14]),t(e,[2,15]),t(e,[2,16]),{41:[1,40],43:[1,41]},t(e,[2,4]),t(e,[2,28]),t(e,[2,29]),t(e,[2,33]),t(e,[2,34],{42:[1,42],43:[1,43]}),t(e,[2,40],{41:[1,44]}),t(e,[2,35],{43:[1,45]}),t(e,[2,36]),t(e,[2,38],{42:[1,46]}),t(e,[2,37]),t(e,[2,39])],defaultActions:{},parseError:l(function(a,d){if(d.recoverable)this.trace(a);else{var f=new Error(a);throw f.hash=d,f}},"parseError"),parse:l(function(a){var d=this,f=[0],u=[],_=[null],n=[],D=this.table,o="",H=0,c=0,S=2,C=1,P=n.slice.call(arguments,1),M=Object.create(this.lexer),V={yy:{}};for(var W in this.yy)Object.prototype.hasOwnProperty.call(this.yy,W)&&(V.yy[W]=this.yy[W]);M.setInput(a,V.yy),V.yy.lexer=M,V.yy.parser=this,typeof M.yylloc>"u"&&(M.yylloc={});var nt=M.yylloc;n.push(nt);var ot=M.options&&M.options.ranges;typeof V.yy.parseError=="function"?this.parseError=V.yy.parseError:this.parseError=Object.getPrototypeOf(this).parseError;function vt(Q){f.length=f.length-2*Q,_.length=_.length-Q,n.length=n.length-Q}l(vt,"popStack");function dt(){var Q;return Q=u.pop()||M.lex()||C,typeof Q!="number"&&(Q instanceof Array&&(u=Q,Q=u.pop()),Q=d.symbols_[Q]||Q),Q}l(dt,"lex");for(var q,K,Z,ct,J={},at,tt,ee,Tt;;){if(K=f[f.length-1],this.defaultActions[K]?Z=this.defaultActions[K]:((q===null||typeof q>"u")&&(q=dt()),Z=D[K]&&D[K][q]),typeof Z>"u"||!Z.length||!Z[0]){var Ft="";Tt=[];for(at in D[K])this.terminals_[at]&&at>S&&Tt.push("'"+this.terminals_[at]+"'");M.showPosition?Ft="Parse error on line "+(H+1)+`:
`+M.showPosition()+`
Expecting `+Tt.join(", ")+", got '"+(this.terminals_[q]||q)+"'":Ft="Parse error on line "+(H+1)+": Unexpected "+(q==C?"end of input":"'"+(this.terminals_[q]||q)+"'"),this.parseError(Ft,{text:M.match,token:this.terminals_[q]||q,line:M.yylineno,loc:nt,expected:Tt})}if(Z[0]instanceof Array&&Z.length>1)throw new Error("Parse Error: multiple actions possible at state: "+K+", token: "+q);switch(Z[0]){case 1:f.push(q),_.push(M.yytext),n.push(M.yylloc),f.push(Z[1]),q=null,c=M.yyleng,o=M.yytext,H=M.yylineno,nt=M.yylloc;break;case 2:if(tt=this.productions_[Z[1]][1],J.$=_[_.length-tt],J._$={first_line:n[n.length-(tt||1)].first_line,last_line:n[n.length-1].last_line,first_column:n[n.length-(tt||1)].first_column,last_column:n[n.length-1].last_column},ot&&(J._$.range=[n[n.length-(tt||1)].range[0],n[n.length-1].range[1]]),ct=this.performAction.apply(J,[o,c,H,V.yy,Z[1],_,n].concat(P)),typeof ct<"u")return ct;tt&&(f=f.slice(0,-1*tt*2),_=_.slice(0,-1*tt),n=n.slice(0,-1*tt)),f.push(this.productions_[Z[1]][0]),_.push(J.$),n.push(J._$),ee=D[f[f.length-2]][f[f.length-1]],f.push(ee);break;case 3:return!0}}return!0},"parse")},x=(function(){var g={EOF:1,parseError:l(function(d,f){if(this.yy.parser)this.yy.parser.parseError(d,f);else throw new Error(d)},"parseError"),setInput:l(function(a,d){return this.yy=d||this.yy||{},this._input=a,this._more=this._backtrack=this.done=!1,this.yylineno=this.yyleng=0,this.yytext=this.matched=this.match="",this.conditionStack=["INITIAL"],this.yylloc={first_line:1,first_column:0,last_line:1,last_column:0},this.options.ranges&&(this.yylloc.range=[0,0]),this.offset=0,this},"setInput"),input:l(function(){var a=this._input[0];this.yytext+=a,this.yyleng++,this.offset++,this.match+=a,this.matched+=a;var d=a.match(/(?:\r\n?|\n).*/g);return d?(this.yylineno++,this.yylloc.last_line++):this.yylloc.last_column++,this.options.ranges&&this.yylloc.range[1]++,this._input=this._input.slice(1),a},"input"),unput:l(function(a){var d=a.length,f=a.split(/(?:\r\n?|\n)/g);this._input=a+this._input,this.yytext=this.yytext.substr(0,this.yytext.length-d),this.offset-=d;var u=this.match.split(/(?:\r\n?|\n)/g);this.match=this.match.substr(0,this.match.length-1),this.matched=this.matched.substr(0,this.matched.length-1),f.length-1&&(this.yylineno-=f.length-1);var _=this.yylloc.range;return this.yylloc={first_line:this.yylloc.first_line,last_line:this.yylineno+1,first_column:this.yylloc.first_column,last_column:f?(f.length===u.length?this.yylloc.first_column:0)+u[u.length-f.length].length-f[0].length:this.yylloc.first_column-d},this.options.ranges&&(this.yylloc.range=[_[0],_[0]+this.yyleng-d]),this.yyleng=this.yytext.length,this},"unput"),more:l(function(){return this._more=!0,this},"more"),reject:l(function(){if(this.options.backtrack_lexer)this._backtrack=!0;else return this.parseError("Lexical error on line "+(this.yylineno+1)+`. You can only invoke reject() in the lexer when the lexer is of the backtracking persuasion (options.backtrack_lexer = true).
`+this.showPosition(),{text:"",token:null,line:this.yylineno});return this},"reject"),less:l(function(a){this.unput(this.match.slice(a))},"less"),pastInput:l(function(){var a=this.matched.substr(0,this.matched.length-this.match.length);return(a.length>20?"...":"")+a.substr(-20).replace(/\n/g,"")},"pastInput"),upcomingInput:l(function(){var a=this.match;return a.length<20&&(a+=this._input.substr(0,20-a.length)),(a.substr(0,20)+(a.length>20?"...":"")).replace(/\n/g,"")},"upcomingInput"),showPosition:l(function(){var a=this.pastInput(),d=new Array(a.length+1).join("-");return a+this.upcomingInput()+`
`+d+"^"},"showPosition"),test_match:l(function(a,d){var f,u,_;if(this.options.backtrack_lexer&&(_={yylineno:this.yylineno,yylloc:{first_line:this.yylloc.first_line,last_line:this.last_line,first_column:this.yylloc.first_column,last_column:this.yylloc.last_column},yytext:this.yytext,match:this.match,matches:this.matches,matched:this.matched,yyleng:this.yyleng,offset:this.offset,_more:this._more,_input:this._input,yy:this.yy,conditionStack:this.conditionStack.slice(0),done:this.done},this.options.ranges&&(_.yylloc.range=this.yylloc.range.slice(0))),u=a[0].match(/(?:\r\n?|\n).*/g),u&&(this.yylineno+=u.length),this.yylloc={first_line:this.yylloc.last_line,last_line:this.yylineno+1,first_column:this.yylloc.last_column,last_column:u?u[u.length-1].length-u[u.length-1].match(/\r?\n?/)[0].length:this.yylloc.last_column+a[0].length},this.yytext+=a[0],this.match+=a[0],this.matches=a,this.yyleng=this.yytext.length,this.options.ranges&&(this.yylloc.range=[this.offset,this.offset+=this.yyleng]),this._more=!1,this._backtrack=!1,this._input=this._input.slice(a[0].length),this.matched+=a[0],f=this.performAction.call(this,this.yy,this,d,this.conditionStack[this.conditionStack.length-1]),this.done&&this._input&&(this.done=!1),f)return f;if(this._backtrack){for(var n in _)this[n]=_[n];return!1}return!1},"test_match"),next:l(function(){if(this.done)return this.EOF;this._input||(this.done=!0);var a,d,f,u;this._more||(this.yytext="",this.match="");for(var _=this._currentRules(),n=0;n<_.length;n++)if(f=this._input.match(this.rules[_[n]]),f&&(!d||f[0].length>d[0].length)){if(d=f,u=n,this.options.backtrack_lexer){if(a=this.test_match(f,_[n]),a!==!1)return a;if(this._backtrack){d=!1;continue}else return!1}else if(!this.options.flex)break}return d?(a=this.test_match(d,_[u]),a!==!1?a:!1):this._input===""?this.EOF:this.parseError("Lexical error on line "+(this.yylineno+1)+`. Unrecognized text.
`+this.showPosition(),{text:"",token:null,line:this.yylineno})},"next"),lex:l(function(){var d=this.next();return d||this.lex()},"lex"),begin:l(function(d){this.conditionStack.push(d)},"begin"),popState:l(function(){var d=this.conditionStack.length-1;return d>0?this.conditionStack.pop():this.conditionStack[0]},"popState"),_currentRules:l(function(){return this.conditionStack.length&&this.conditionStack[this.conditionStack.length-1]?this.conditions[this.conditionStack[this.conditionStack.length-1]].rules:this.conditions.INITIAL.rules},"_currentRules"),topState:l(function(d){return d=this.conditionStack.length-1-Math.abs(d||0),d>=0?this.conditionStack[d]:"INITIAL"},"topState"),pushState:l(function(d){this.begin(d)},"pushState"),stateStackSize:l(function(){return this.conditionStack.length},"stateStackSize"),options:{"case-insensitive":!0},performAction:l(function(d,f,u,_){switch(u){case 0:return this.begin("open_directive"),"open_directive";case 1:return this.begin("acc_title"),31;case 2:return this.popState(),"acc_title_value";case 3:return this.begin("acc_descr"),33;case 4:return this.popState(),"acc_descr_value";case 5:this.begin("acc_descr_multiline");break;case 6:this.popState();break;case 7:return"acc_descr_multiline_value";case 8:break;case 9:break;case 10:break;case 11:return 10;case 12:break;case 13:break;case 14:this.begin("href");break;case 15:this.popState();break;case 16:return 43;case 17:this.begin("callbackname");break;case 18:this.popState();break;case 19:this.popState(),this.begin("callbackargs");break;case 20:return 41;case 21:this.popState();break;case 22:return 42;case 23:this.begin("click");break;case 24:this.popState();break;case 25:return 40;case 26:return 4;case 27:return 22;case 28:return 23;case 29:return 24;case 30:return 25;case 31:return 26;case 32:return 28;case 33:return 27;case 34:return 29;case 35:return 12;case 36:return 13;case 37:return 14;case 38:return 15;case 39:return 16;case 40:return 17;case 41:return 18;case 42:return 20;case 43:return 21;case 44:return"date";case 45:return 30;case 46:return"accDescription";case 47:return 36;case 48:return 38;case 49:return 39;case 50:return":";case 51:return 6;case 52:return"INVALID"}},"anonymous"),rules:[/^(?:%%\{)/i,/^(?:accTitle\s*:\s*)/i,/^(?:(?!\n||)*[^\n]*)/i,/^(?:accDescr\s*:\s*)/i,/^(?:(?!\n||)*[^\n]*)/i,/^(?:accDescr\s*\{\s*)/i,/^(?:[\}])/i,/^(?:[^\}]*)/i,/^(?:%%(?!\{)*[^\n]*)/i,/^(?:[^\}]%%*[^\n]*)/i,/^(?:%%*[^\n]*[\n]*)/i,/^(?:[\n]+)/i,/^(?:\s+)/i,/^(?:%[^\n]*)/i,/^(?:href[\s]+["])/i,/^(?:["])/i,/^(?:[^"]*)/i,/^(?:call[\s]+)/i,/^(?:\([\s]*\))/i,/^(?:\()/i,/^(?:[^(]*)/i,/^(?:\))/i,/^(?:[^)]*)/i,/^(?:click[\s]+)/i,/^(?:[\s\n])/i,/^(?:[^\s\n]*)/i,/^(?:gantt\b)/i,/^(?:dateFormat\s[^#\n;]+)/i,/^(?:inclusiveEndDates\b)/i,/^(?:topAxis\b)/i,/^(?:axisFormat\s[^#\n;]+)/i,/^(?:tickInterval\s[^#\n;]+)/i,/^(?:includes\s[^#\n;]+)/i,/^(?:excludes\s[^#\n;]+)/i,/^(?:todayMarker\s[^\n;]+)/i,/^(?:weekday\s+monday\b)/i,/^(?:weekday\s+tuesday\b)/i,/^(?:weekday\s+wednesday\b)/i,/^(?:weekday\s+thursday\b)/i,/^(?:weekday\s+friday\b)/i,/^(?:weekday\s+saturday\b)/i,/^(?:weekday\s+sunday\b)/i,/^(?:weekend\s+friday\b)/i,/^(?:weekend\s+saturday\b)/i,/^(?:\d\d\d\d-\d\d-\d\d\b)/i,/^(?:title\s[^\n]+)/i,/^(?:accDescription\s[^#\n;]+)/i,/^(?:section\s[^\n]+)/i,/^(?:[^:\n]+)/i,/^(?::[^#\n;]+)/i,/^(?::)/i,/^(?:$)/i,/^(?:.)/i],conditions:{acc_descr_multiline:{rules:[6,7],inclusive:!1},acc_descr:{rules:[4],inclusive:!1},acc_title:{rules:[2],inclusive:!1},callbackargs:{rules:[21,22],inclusive:!1},callbackname:{rules:[18,19,20],inclusive:!1},href:{rules:[15,16],inclusive:!1},click:{rules:[24,25],inclusive:!1},INITIAL:{rules:[0,1,3,5,8,9,10,11,12,13,14,17,23,26,27,28,29,30,31,32,33,34,35,36,37,38,39,40,41,42,43,44,45,46,47,48,49,50,51,52],inclusive:!0}}};return g})();m.lexer=x;function v(){this.yy={}}return l(v,"Parser"),v.prototype=m,m.Parser=v,new v})();Vt.parser=Vt;var $i=Vt;U.extend(gi);U.extend(bi);U.extend(Si);var he={friday:5,saturday:6},et="",qt="",Gt=void 0,jt="",yt=[],pt=[],Xt=new Map,Ut=[],It=[],gt="",Zt="",Ce=["active","done","crit","milestone","vert"],Qt=[],ft="",xt=!1,Kt=!1,Jt="sunday",$t="saturday",zt=0,Yi=l(function(){Ut=[],It=[],gt="",Qt=[],Ct=0,Bt=void 0,Mt=void 0,G=[],et="",qt="",Zt="",Gt=void 0,jt="",yt=[],pt=[],xt=!1,Kt=!1,zt=0,Xt=new Map,ft="",qe(),Jt="sunday",$t="saturday"},"clear"),Fi=l(function(t){ft=t},"setDiagramId"),Li=l(function(t){qt=t},"setAxisFormat"),Ai=l(function(){return qt},"getAxisFormat"),Oi=l(function(t){Gt=t},"setTickInterval"),Wi=l(function(){return Gt},"getTickInterval"),Ni=l(function(t){jt=t},"setTodayMarker"),Pi=l(function(){return jt},"getTodayMarker"),Ri=l(function(t){et=t},"setDateFormat"),Vi=l(function(){xt=!0},"enableInclusiveEndDates"),zi=l(function(){return xt},"endDatesAreInclusive"),Hi=l(function(){Kt=!0},"enableTopAxis"),Bi=l(function(){return Kt},"topAxisEnabled"),qi=l(function(t){Zt=t},"setDisplayMode"),Gi=l(function(){return Zt},"getDisplayMode"),ji=l(function(){return et},"getDateFormat"),Me=l((t,e)=>{const s=e.toLowerCase().split(/[\s,]+/).filter(i=>i!=="");return[...new Set([...t,...s])]},"mergeTokens"),Xi=l(function(t){yt=Me(yt,t)},"setIncludes"),Ui=l(function(){return yt},"getIncludes"),Zi=l(function(t){pt=Me(pt,t)},"setExcludes"),Qi=l(function(){return pt},"getExcludes"),Ki=l(function(){return Xt},"getLinks"),Ji=l(function(t){gt=t,Ut.push(t)},"addSection"),ts=l(function(){return Ut},"getSections"),es=l(function(){let t=me();const e=10;let s=0;for(;!t&&s<e;)t=me(),s++;return It=G,It},"getTasks"),Ee=l(function(t,e,s,i){const r=t.format(e.trim()),y=t.format("YYYY-MM-DD");return i.includes(r)||i.includes(y)?!1:s.includes("weekends")&&(t.isoWeekday()===he[$t]||t.isoWeekday()===he[$t]+1)||s.includes(t.format("dddd").toLowerCase())?!0:s.includes(r)||s.includes(y)},"isInvalidDate"),is=l(function(t){Jt=t},"setWeekday"),ss=l(function(){return Jt},"getWeekday"),rs=l(function(t){$t=t},"setWeekend"),Ie=l(function(t,e,s,i){if(!s.length||t.manualEndTime)return;let r;t.startTime instanceof Date?r=U(t.startTime):r=U(t.startTime,e,!0),r=r.add(1,"d");let y;t.endTime instanceof Date?y=U(t.endTime):y=U(t.endTime,e,!0);const[p,T]=ns(r,y,e,s,i);t.endTime=p.toDate(),t.renderEndTime=T},"checkTaskDates"),ns=l(function(t,e,s,i,r){let y=!1,p=null;const T=e.add(1e4,"d");for(;t<=e;){if(y||(p=e.toDate()),y=Ee(t,s,i,r),y&&(e=e.add(1,"d"),e>T))throw new Error("Failed to find a valid date that was not excluded by `excludes` after 10,000 iterations.");t=t.add(1,"d")}return[e,p]},"fixTaskDates"),Ht=l(function(t,e,s){if(s=s.trim(),l(T=>{const F=T.trim();return F==="x"||F==="X"},"isTimestampFormat")(e)&&/^\d+$/.test(s))return new Date(Number(s));const y=/^after\s+(?<ids>[\d\w- ]+)/.exec(s);if(y!==null){let T=null;for(const L of y.groups.ids.split(" ")){let w=ut(L);w!==void 0&&(!T||w.endTime>T.endTime)&&(T=w)}if(T)return T.endTime;const F=new Date;return F.setHours(0,0,0,0),F}let p=U(s,e.trim(),!0);if(p.isValid())return p.toDate();{lt.debug("Invalid date:"+s),lt.debug("With date format:"+e.trim());const T=new Date(s);if(T===void 0||isNaN(T.getTime())||T.getFullYear()<-1e4||T.getFullYear()>1e4)throw new Error("Invalid date:"+s);return T}},"getStartDate"),$e=l(function(t){const e=/^(\d+(?:\.\d+)?)([Mdhmswy]|ms)$/.exec(t.trim());return e!==null?[Number.parseFloat(e[1]),e[2]]:[NaN,"ms"]},"parseDuration"),Ye=l(function(t,e,s,i=!1){s=s.trim();const y=/^until\s+(?<ids>[\d\w- ]+)/.exec(s);if(y!==null){let w=null;for(const A of y.groups.ids.split(" ")){let R=ut(A);R!==void 0&&(!w||R.startTime<w.startTime)&&(w=R)}if(w)return w.startTime;const N=new Date;return N.setHours(0,0,0,0),N}let p=U(s,e.trim(),!0);if(p.isValid())return i&&(p=p.add(1,"d")),p.toDate();let T=U(t);const[F,L]=$e(s);if(!Number.isNaN(F)){const w=T.add(F,L);w.isValid()&&(T=w)}return T.toDate()},"getEndDate"),Ct=0,kt=l(function(t){return t===void 0?(Ct=Ct+1,"task"+Ct):t},"parseId"),as=l(function(t,e){let s;e.substr(0,1)===":"?s=e.substr(1,e.length):s=e;const i=s.split(","),r={};te(i,r,Ce);for(let p=0;p<i.length;p++)i[p]=i[p].trim();let y="";switch(i.length){case 1:r.id=kt(),r.startTime=t.endTime,y=i[0];break;case 2:r.id=kt(),r.startTime=Ht(void 0,et,i[0]),y=i[1];break;case 3:r.id=kt(i[0]),r.startTime=Ht(void 0,et,i[1]),y=i[2];break}return y&&(r.endTime=Ye(r.startTime,et,y,xt),r.manualEndTime=U(y,"YYYY-MM-DD",!0).isValid(),Ie(r,et,pt,yt)),r},"compileData"),os=l(function(t,e){let s;e.substr(0,1)===":"?s=e.substr(1,e.length):s=e;const i=s.split(","),r={};te(i,r,Ce);for(let y=0;y<i.length;y++)i[y]=i[y].trim();switch(i.length){case 1:r.id=kt(),r.startTime={type:"prevTaskEnd",id:t},r.endTime={data:i[0]};break;case 2:r.id=kt(),r.startTime={type:"getStartDate",startData:i[0]},r.endTime={data:i[1]};break;case 3:r.id=kt(i[0]),r.startTime={type:"getStartDate",startData:i[1]},r.endTime={data:i[2]};break}return r},"parseData"),Bt,Mt,G=[],Fe={},cs=l(function(t,e){const s={section:gt,type:gt,processed:!1,manualEndTime:!1,renderEndTime:null,raw:{data:e},task:t,classes:[]},i=os(Mt,e);s.raw.startTime=i.startTime,s.raw.endTime=i.endTime,s.id=i.id,s.prevTaskId=Mt,s.active=i.active,s.done=i.done,s.crit=i.crit,s.milestone=i.milestone,s.vert=i.vert,s.vert?s.order=-1:(s.order=zt,zt++);const r=G.push(s);Mt=s.id,Fe[s.id]=r-1},"addTask"),ut=l(function(t){const e=Fe[t];return G[e]},"findTaskById"),ls=l(function(t,e){const s={section:gt,type:gt,description:t,task:t,classes:[]},i=as(Bt,e);s.startTime=i.startTime,s.endTime=i.endTime,s.id=i.id,s.active=i.active,s.done=i.done,s.crit=i.crit,s.milestone=i.milestone,s.vert=i.vert,Bt=s,It.push(s)},"addTaskOrg"),me=l(function(){const t=l(function(s){const i=G[s];let r="";switch(G[s].raw.startTime.type){case"prevTaskEnd":{const y=ut(i.prevTaskId);i.startTime=y.endTime;break}case"getStartDate":r=Ht(void 0,et,G[s].raw.startTime.startData),r&&(G[s].startTime=r);break}return G[s].startTime&&(G[s].endTime=Ye(G[s].startTime,et,G[s].raw.endTime.data,xt),G[s].endTime&&(G[s].processed=!0,G[s].manualEndTime=U(G[s].raw.endTime.data,"YYYY-MM-DD",!0).isValid(),Ie(G[s],et,pt,yt))),G[s].processed},"compileTask");let e=!0;for(const[s,i]of G.entries())t(s),e=e&&i.processed;return e},"compileTasks"),us=l(function(t,e){let s=e;ht().securityLevel!=="loose"&&(s=Be.sanitizeUrl(e)),t.split(",").forEach(function(i){ut(i)!==void 0&&(Ae(i,()=>{window.open(s,"_self")}),Xt.set(i,s))}),Le(t,"clickable")},"setLink"),Le=l(function(t,e){t.split(",").forEach(function(s){let i=ut(s);i!==void 0&&i.classes.push(e)})},"setClass"),ds=l(function(t,e,s){if(ht().securityLevel!=="loose"||e===void 0)return;let i=[];if(typeof s=="string"){i=s.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/);for(let y=0;y<i.length;y++){let p=i[y].trim();p.startsWith('"')&&p.endsWith('"')&&(p=p.substr(1,p.length-2)),i[y]=p}}i.length===0&&i.push(t),ut(t)!==void 0&&Ae(t,()=>{Ge.runFunc(e,...i)})},"setClickFun"),Ae=l(function(t,e){Qt.push(function(){const s=ft?`${ft}-${t}`:t,i=document.querySelector(`[id="${s}"]`);i!==null&&i.addEventListener("click",function(){e()})},function(){const s=ft?`${ft}-${t}`:t,i=document.querySelector(`[id="${s}-text"]`);i!==null&&i.addEventListener("click",function(){e()})})},"pushFun"),fs=l(function(t,e,s){t.split(",").forEach(function(i){ds(i,e,s)}),Le(t,"clickable")},"setClickEvent"),hs=l(function(t){Qt.forEach(function(e){e(t)})},"bindFunctions"),ms={getConfig:l(()=>ht().gantt,"getConfig"),clear:Yi,setDateFormat:Ri,getDateFormat:ji,enableInclusiveEndDates:Vi,endDatesAreInclusive:zi,enableTopAxis:Hi,topAxisEnabled:Bi,setAxisFormat:Li,getAxisFormat:Ai,setTickInterval:Oi,getTickInterval:Wi,setTodayMarker:Ni,getTodayMarker:Pi,setAccTitle:Ve,getAccTitle:Re,setDiagramTitle:Pe,getDiagramTitle:Ne,setDiagramId:Fi,setDisplayMode:qi,getDisplayMode:Gi,setAccDescription:We,getAccDescription:Oe,addSection:Ji,getSections:ts,getTasks:es,addTask:cs,findTaskById:ut,addTaskOrg:ls,setIncludes:Xi,getIncludes:Ui,setExcludes:Zi,getExcludes:Qi,setClickEvent:fs,setLink:us,getLinks:Ki,bindFunctions:hs,parseDuration:$e,isInvalidDate:Ee,setWeekday:is,getWeekday:ss,setWeekend:rs};function te(t,e,s){let i=!0;for(;i;)i=!1,s.forEach(function(r){const y="^\\s*"+r+"\\s*$",p=new RegExp(y);t[0].match(p)&&(e[r]=!0,t.shift(1),i=!0)})}l(te,"getTaskTags");U.extend(Ii);var ks=l(function(){lt.debug("Something is calling, setConf, remove the call")},"setConf"),ke={monday:si,tuesday:ii,wednesday:ei,thursday:ti,friday:Je,saturday:Ke,sunday:Qe},ys=l((t,e)=>{let s=[...t].map(()=>-1/0),i=[...t].sort((y,p)=>y.startTime-p.startTime||y.order-p.order),r=0;for(const y of i)for(let p=0;p<s.length;p++)if(y.startTime>=s[p]){s[p]=y.endTime,y.order=p+e,p>r&&(r=p);break}return r},"getMaxIntersections"),st,Pt=1e4,ps=l(function(t,e,s,i){const r=ht().gantt;i.db.setDiagramId(e);const y=ht().securityLevel;let p;y==="sandbox"&&(p=bt("#i"+e));const T=y==="sandbox"?bt(p.nodes()[0].contentDocument.body):bt("body"),F=y==="sandbox"?p.nodes()[0].contentDocument:document,L=F.getElementById(e);st=L.parentElement.offsetWidth,st===void 0&&(st=1200),r.useWidth!==void 0&&(st=r.useWidth);const w=i.db.getTasks(),N=w.filter(m=>!m.vert);let A=[];for(const m of N)A.push(m.type);A=I(A);const R={};let j=2*r.topPadding;if(i.db.getDisplayMode()==="compact"||r.displayMode==="compact"){const m={};for(const v of N)m[v.section]===void 0?m[v.section]=[v]:m[v.section].push(v);let x=0;for(const v of Object.keys(m)){const g=ys(m[v],x)+1;x+=g,j+=g*(r.barHeight+r.barGap),R[v]=g}}else{j+=N.length*(r.barHeight+r.barGap);for(const m of A)R[m]=N.filter(x=>x.type===m).length}L.setAttribute("viewBox","0 0 "+st+" "+j);const z=T.select(`[id="${e}"]`),k=Ue().domain([oi(w,function(m){return m.startTime}),ai(w,function(m){return m.endTime})]).rangeRound([0,st-r.leftPadding-r.rightPadding]);function E(m,x){const v=m.startTime,g=x.startTime;let a=0;return v>g?a=1:v<g&&(a=-1),a}l(E,"taskCompare"),w.sort(E),O(w,st,j),ze(z,j,st,r.useMaxWidth),z.append("text").text(i.db.getDiagramTitle()).attr("x",st/2).attr("y",r.titleTopMargin).attr("class","titleText");function O(m,x,v){const g=r.barHeight,a=g+r.barGap,d=r.topPadding,f=r.leftPadding,u=ni().domain([0,A.length]).range(["#00B9FA","#F95002"]).interpolate(mi);X(a,d,f,x,v,m,i.db.getExcludes(),i.db.getIncludes()),$(f,d,x,v),Y(m,a,d,f,g,u,x),b(a,d),h(f,d,x,v)}l(O,"makeGantt");function Y(m,x,v,g,a,d,f){m.sort((c,S)=>c.vert===S.vert?0:c.vert?1:-1);const u=m.filter(c=>!c.vert),n=[...new Set(u.map(c=>c.order))].map(c=>u.find(S=>S.order===c));z.append("g").selectAll("rect").data(n).enter().append("rect").attr("x",0).attr("y",function(c,S){return S=c.order,S*x+v-2}).attr("width",function(){return f-r.rightPadding/2}).attr("height",x).attr("class",function(c){for(const[S,C]of A.entries())if(c.type===C)return"section section"+S%r.numberSectionStyles;return"section section0"}).enter();const D=z.append("g").selectAll("rect").data(m).enter(),o=i.db.getLinks();if(D.append("rect").attr("id",function(c){return e+"-"+c.id}).attr("rx",3).attr("ry",3).attr("x",function(c){return c.milestone?k(c.startTime)+g+.5*(k(c.endTime)-k(c.startTime))-.5*a:k(c.startTime)+g}).attr("y",function(c,S){return S=c.order,c.vert?r.gridLineStartPadding:S*x+v}).attr("width",function(c){return c.milestone?a:c.vert?.08*a:k(c.renderEndTime||c.endTime)-k(c.startTime)}).attr("height",function(c){return c.vert?u.length*(r.barHeight+r.barGap)+r.barHeight*2:a}).attr("transform-origin",function(c,S){return S=c.order,(k(c.startTime)+g+.5*(k(c.endTime)-k(c.startTime))).toString()+"px "+(S*x+v+.5*a).toString()+"px"}).attr("class",function(c){const S="task";let C="";c.classes.length>0&&(C=c.classes.join(" "));let P=0;for(const[V,W]of A.entries())c.type===W&&(P=V%r.numberSectionStyles);let M="";return c.active?c.crit?M+=" activeCrit":M=" active":c.done?c.crit?M=" doneCrit":M=" done":c.crit&&(M+=" crit"),M.length===0&&(M=" task"),c.milestone&&(M=" milestone "+M),c.vert&&(M=" vert "+M),M+=P,M+=" "+C,S+M}),D.append("text").attr("id",function(c){return e+"-"+c.id+"-text"}).text(function(c){return c.task}).attr("font-size",r.fontSize).attr("x",function(c){let S=k(c.startTime),C=k(c.renderEndTime||c.endTime);if(c.milestone&&(S+=.5*(k(c.endTime)-k(c.startTime))-.5*a,C=S+a),c.vert)return k(c.startTime)+g;const P=this.getBBox().width;return P>C-S?C+P+1.5*r.leftPadding>f?S+g-5:C+g+5:(C-S)/2+S+g}).attr("y",function(c,S){return c.vert?r.gridLineStartPadding+u.length*(r.barHeight+r.barGap)+60:(S=c.order,S*x+r.barHeight/2+(r.fontSize/2-2)+v)}).attr("text-height",a).attr("class",function(c){const S=k(c.startTime);let C=k(c.endTime);c.milestone&&(C=S+a);const P=this.getBBox().width;let M="";c.classes.length>0&&(M=c.classes.join(" "));let V=0;for(const[nt,ot]of A.entries())c.type===ot&&(V=nt%r.numberSectionStyles);let W="";return c.active&&(c.crit?W="activeCritText"+V:W="activeText"+V),c.done?c.crit?W=W+" doneCritText"+V:W=W+" doneText"+V:c.crit&&(W=W+" critText"+V),c.milestone&&(W+=" milestoneText"),c.vert&&(W+=" vertText"),P>C-S?C+P+1.5*r.leftPadding>f?M+" taskTextOutsideLeft taskTextOutside"+V+" "+W:M+" taskTextOutsideRight taskTextOutside"+V+" "+W+" width-"+P:M+" taskText taskText"+V+" "+W+" width-"+P}),ht().securityLevel==="sandbox"){let c;c=bt("#i"+e);const S=c.nodes()[0].contentDocument;D.filter(function(C){return o.has(C.id)}).each(function(C){var P=S.querySelector("#"+CSS.escape(e+"-"+C.id)),M=S.querySelector("#"+CSS.escape(e+"-"+C.id+"-text"));const V=P.parentNode;var W=S.createElement("a");W.setAttribute("xlink:href",o.get(C.id)),W.setAttribute("target","_top"),V.appendChild(W),W.appendChild(P),W.appendChild(M)})}}l(Y,"drawRects");function X(m,x,v,g,a,d,f,u){if(f.length===0&&u.length===0)return;let _,n;for(const{startTime:C,endTime:P}of d)(_===void 0||C<_)&&(_=C),(n===void 0||P>n)&&(n=P);if(!_||!n)return;if(U(n).diff(U(_),"year")>5){lt.warn("The difference between the min and max time is more than 5 years. This will cause performance issues. Skipping drawing exclude days.");return}const D=i.db.getDateFormat(),o=[];let H=null,c=U(_);for(;c.valueOf()<=n;)i.db.isInvalidDate(c,D,f,u)?H?H.end=c:H={start:c,end:c}:H&&(o.push(H),H=null),c=c.add(1,"d");z.append("g").selectAll("rect").data(o).enter().append("rect").attr("id",C=>e+"-exclude-"+C.start.format("YYYY-MM-DD")).attr("x",C=>k(C.start.startOf("day"))+v).attr("y",r.gridLineStartPadding).attr("width",C=>k(C.end.endOf("day"))-k(C.start.startOf("day"))).attr("height",a-x-r.gridLineStartPadding).attr("transform-origin",function(C,P){return(k(C.start)+v+.5*(k(C.end)-k(C.start))).toString()+"px "+(P*m+.5*a).toString()+"px"}).attr("class","exclude-range")}l(X,"drawExcludeDays");function B(m,x,v,g){if(v<=0||m>x)return 1/0;const a=x-m,d=U.duration({[g??"day"]:v}).asMilliseconds();return d<=0?1/0:Math.ceil(a/d)}l(B,"getEstimatedTickCount");function $(m,x,v,g){const a=i.db.getDateFormat(),d=i.db.getAxisFormat();let f;d?f=d:a==="D"?f="%d":f=r.axisFormat??"%Y-%m-%d";let u=Ze(k).tickSize(-g+x+r.gridLineStartPadding).tickFormat(ie(f));const n=/^([1-9]\d*)(millisecond|second|minute|hour|day|week|month)$/.exec(i.db.getTickInterval()||r.tickInterval);if(n!==null){const D=parseInt(n[1],10);if(isNaN(D)||D<=0)lt.warn(`Invalid tick interval value: "${n[1]}". Skipping custom tick interval.`);else{const o=n[2],H=i.db.getWeekday()||r.weekday,c=k.domain(),S=c[0],C=c[1],P=B(S,C,D,o);if(P>Pt)lt.warn(`The tick interval "${D}${o}" would generate ${P} ticks, which exceeds the maximum allowed (${Pt}). This may indicate an invalid date or time range. Skipping custom tick interval.`);else switch(o){case"millisecond":u.ticks(ce.every(D));break;case"second":u.ticks(oe.every(D));break;case"minute":u.ticks(ae.every(D));break;case"hour":u.ticks(ne.every(D));break;case"day":u.ticks(re.every(D));break;case"week":u.ticks(ke[H].every(D));break;case"month":u.ticks(se.every(D));break}}}if(z.append("g").attr("class","grid").attr("transform","translate("+m+", "+(g-50)+")").call(u).selectAll("text").style("text-anchor","middle").attr("fill","#000").attr("stroke","none").attr("font-size",10).attr("dy","1em"),i.db.topAxisEnabled()||r.topAxis){let D=ri(k).tickSize(-g+x+r.gridLineStartPadding).tickFormat(ie(f));if(n!==null){const o=parseInt(n[1],10);if(isNaN(o)||o<=0)lt.warn(`Invalid tick interval value: "${n[1]}". Skipping custom tick interval.`);else{const H=n[2],c=i.db.getWeekday()||r.weekday,S=k.domain(),C=S[0],P=S[1];if(B(C,P,o,H)<=Pt)switch(H){case"millisecond":D.ticks(ce.every(o));break;case"second":D.ticks(oe.every(o));break;case"minute":D.ticks(ae.every(o));break;case"hour":D.ticks(ne.every(o));break;case"day":D.ticks(re.every(o));break;case"week":D.ticks(ke[c].every(o));break;case"month":D.ticks(se.every(o));break}}}z.append("g").attr("class","grid").attr("transform","translate("+m+", "+x+")").call(D).selectAll("text").style("text-anchor","middle").attr("fill","#000").attr("stroke","none").attr("font-size",10)}}l($,"makeGrid");function b(m,x){let v=0;const g=Object.keys(R).map(a=>[a,R[a]]);z.append("g").selectAll("text").data(g).enter().append(function(a){const d=a[0].split(He.lineBreakRegex),f=-(d.length-1)/2,u=F.createElementNS("http://www.w3.org/2000/svg","text");u.setAttribute("dy",f+"em");for(const[_,n]of d.entries()){const D=F.createElementNS("http://www.w3.org/2000/svg","tspan");D.setAttribute("alignment-baseline","central"),D.setAttribute("x","10"),_>0&&D.setAttribute("dy","1em"),D.textContent=n,u.appendChild(D)}return u}).attr("x",10).attr("y",function(a,d){if(d>0)for(let f=0;f<d;f++)return v+=g[d-1][1],a[1]*m/2+v*m+x;else return a[1]*m/2+x}).attr("font-size",r.sectionFontSize).attr("class",function(a){for(const[d,f]of A.entries())if(a[0]===f)return"sectionTitle sectionTitle"+d%r.numberSectionStyles;return"sectionTitle"})}l(b,"vertLabels");function h(m,x,v,g){const a=i.db.getTodayMarker();if(a==="off")return;const d=z.append("g").attr("class","today"),f=new Date,u=d.append("line");u.attr("x1",k(f)+m).attr("x2",k(f)+m).attr("y1",r.titleTopMargin).attr("y2",g-r.titleTopMargin).attr("class","today"),a!==""&&u.attr("style",a.replace(/,/g,";"))}l(h,"drawToday");function I(m){const x={},v=[];for(let g=0,a=m.length;g<a;++g)Object.prototype.hasOwnProperty.call(x,m[g])||(x[m[g]]=!0,v.push(m[g]));return v}l(I,"checkUnique")},"draw"),gs={setConf:ks,draw:ps},vs=l(t=>`
  .mermaid-main-font {
        font-family: ${t.fontFamily};
  }

  .exclude-range {
    fill: ${t.excludeBkgColor};
  }

  .section {
    stroke: none;
    opacity: 0.2;
  }

  .section0 {
    fill: ${t.sectionBkgColor};
  }

  .section2 {
    fill: ${t.sectionBkgColor2};
  }

  .section1,
  .section3 {
    fill: ${t.altSectionBkgColor};
    opacity: 0.2;
  }

  .sectionTitle0 {
    fill: ${t.titleColor};
  }

  .sectionTitle1 {
    fill: ${t.titleColor};
  }

  .sectionTitle2 {
    fill: ${t.titleColor};
  }

  .sectionTitle3 {
    fill: ${t.titleColor};
  }

  .sectionTitle {
    text-anchor: start;
    font-family: ${t.fontFamily};
  }


  /* Grid and axis */

  .grid .tick {
    stroke: ${t.gridColor};
    opacity: 0.8;
    shape-rendering: crispEdges;
  }

  .grid .tick text {
    font-family: ${t.fontFamily};
    fill: ${t.textColor};
  }

  .grid path {
    stroke-width: 0;
  }


  /* Today line */

  .today {
    fill: none;
    stroke: ${t.todayLineColor};
    stroke-width: 2px;
  }


  /* Task styling */

  /* Default task */

  .task {
    stroke-width: 2;
  }

  .taskText {
    text-anchor: middle;
    font-family: ${t.fontFamily};
  }

  .taskTextOutsideRight {
    fill: ${t.taskTextDarkColor};
    text-anchor: start;
    font-family: ${t.fontFamily};
  }

  .taskTextOutsideLeft {
    fill: ${t.taskTextDarkColor};
    text-anchor: end;
  }


  /* Special case clickable */

  .task.clickable {
    cursor: pointer;
  }

  .taskText.clickable {
    cursor: pointer;
    fill: ${t.taskTextClickableColor} !important;
    font-weight: bold;
  }

  .taskTextOutsideLeft.clickable {
    cursor: pointer;
    fill: ${t.taskTextClickableColor} !important;
    font-weight: bold;
  }

  .taskTextOutsideRight.clickable {
    cursor: pointer;
    fill: ${t.taskTextClickableColor} !important;
    font-weight: bold;
  }


  /* Specific task settings for the sections*/

  .taskText0,
  .taskText1,
  .taskText2,
  .taskText3 {
    fill: ${t.taskTextColor};
  }

  .task0,
  .task1,
  .task2,
  .task3 {
    fill: ${t.taskBkgColor};
    stroke: ${t.taskBorderColor};
  }

  .taskTextOutside0,
  .taskTextOutside2
  {
    fill: ${t.taskTextOutsideColor};
  }

  .taskTextOutside1,
  .taskTextOutside3 {
    fill: ${t.taskTextOutsideColor};
  }


  /* Active task */

  .active0,
  .active1,
  .active2,
  .active3 {
    fill: ${t.activeTaskBkgColor};
    stroke: ${t.activeTaskBorderColor};
  }

  .activeText0,
  .activeText1,
  .activeText2,
  .activeText3 {
    fill: ${t.taskTextDarkColor} !important;
  }


  /* Completed task */

  .done0,
  .done1,
  .done2,
  .done3 {
    stroke: ${t.doneTaskBorderColor};
    fill: ${t.doneTaskBkgColor};
    stroke-width: 2;
  }

  .doneText0,
  .doneText1,
  .doneText2,
  .doneText3 {
    fill: ${t.taskTextDarkColor} !important;
  }

  /* Done task text displayed outside the bar sits against the diagram background,
     not against the done-task bar, so it must use the outside/contrast color. */
  .doneText0.taskTextOutsideLeft,
  .doneText0.taskTextOutsideRight,
  .doneText1.taskTextOutsideLeft,
  .doneText1.taskTextOutsideRight,
  .doneText2.taskTextOutsideLeft,
  .doneText2.taskTextOutsideRight,
  .doneText3.taskTextOutsideLeft,
  .doneText3.taskTextOutsideRight {
    fill: ${t.taskTextOutsideColor} !important;
  }


  /* Tasks on the critical line */

  .crit0,
  .crit1,
  .crit2,
  .crit3 {
    stroke: ${t.critBorderColor};
    fill: ${t.critBkgColor};
    stroke-width: 2;
  }

  .activeCrit0,
  .activeCrit1,
  .activeCrit2,
  .activeCrit3 {
    stroke: ${t.critBorderColor};
    fill: ${t.activeTaskBkgColor};
    stroke-width: 2;
  }

  .doneCrit0,
  .doneCrit1,
  .doneCrit2,
  .doneCrit3 {
    stroke: ${t.critBorderColor};
    fill: ${t.doneTaskBkgColor};
    stroke-width: 2;
    cursor: pointer;
    shape-rendering: crispEdges;
  }

  .milestone {
    transform: rotate(45deg) scale(0.8,0.8);
  }

  .milestoneText {
    font-style: italic;
  }
  .doneCritText0,
  .doneCritText1,
  .doneCritText2,
  .doneCritText3 {
    fill: ${t.taskTextDarkColor} !important;
  }

  /* Done-crit task text outside the bar — same reasoning as doneText above. */
  .doneCritText0.taskTextOutsideLeft,
  .doneCritText0.taskTextOutsideRight,
  .doneCritText1.taskTextOutsideLeft,
  .doneCritText1.taskTextOutsideRight,
  .doneCritText2.taskTextOutsideLeft,
  .doneCritText2.taskTextOutsideRight,
  .doneCritText3.taskTextOutsideLeft,
  .doneCritText3.taskTextOutsideRight {
    fill: ${t.taskTextOutsideColor} !important;
  }

  .vert {
    stroke: ${t.vertLineColor};
  }

  .vertText {
    font-size: 15px;
    text-anchor: middle;
    fill: ${t.vertLineColor} !important;
  }

  .activeCritText0,
  .activeCritText1,
  .activeCritText2,
  .activeCritText3 {
    fill: ${t.taskTextDarkColor} !important;
  }

  .titleText {
    text-anchor: middle;
    font-size: 18px;
    fill: ${t.titleColor||t.textColor};
    font-family: ${t.fontFamily};
  }
`,"getStyles"),xs=vs,tr={parser:$i,db:ms,renderer:gs,styles:xs};export{tr as diagram};
