import{p as tt}from"./chunk-JWPE2WC7-CvZwX0gD.js";import{g as et,s as at,a as rt,b as it,p as ot,o as nt,_ as l,l as E,c as st,B as lt,F as ct,G as pt,d as dt,q as gt,D as mt}from"./mermaid.core-Bk-A1DXm.js";import{p as ht}from"./cynefin-OW5HDTMX-D2_lgZTU.js";import"./transform-Dmxhnzuu.js";import{d as I}from"./arc-BUCeyIDP.js";import{o as ft}from"./ordinal-Cboi1Yqb.js";import{d as ut}from"./pie-BEqb8BTq.js";import"./file-viewer-archive-C6DFu3cK.js";import"./file-viewer-preset-all-jJpqdWIk.js";import"./file-viewer-text-CagrNa-n.js";import"./file-viewer-cad-DqKHzoQv.js";import"./file-viewer-chm-nMGK0xOa.js";import"./file-viewer-data-D8py2LFT.js";import"./file-viewer-drawing-DmttRGuw.js";import"./file-viewer-mindmap-BLn7QW0-.js";import"./file-viewer-ebook-DBjsEgS7.js";import"./file-viewer-eda-u1uA9Ede.js";import"./file-viewer-email-HKvEgJm1.js";import"./file-viewer-geo-BGZtL4s1.js";import"./file-viewer-hangul-BLaU_zuV.js";import"./file-viewer-iwork-C8fzohUs.js";import"./file-viewer-image-BTrThNQF.js";import"./file-viewer-media-C_8lNTa7.js";import"./file-viewer-ofd-irIzOn2J.js";import"./file-viewer-pdf-CPUZp2bb.js";import"./file-viewer-presentation-Jx2WMjwY.js";import"./file-viewer-presentation-ppt-nt4JwUNc.js";import"./file-viewer-presentation-pptx-r8HcNElH.js";import"./file-viewer-spreadsheet-CwLizh4U.js";import"./file-viewer-typst-iAzGJ6e3.js";import"./file-viewer-word-Duh4bUi8.js";import"./file-viewer-wordperfect-BQ0PGTCD.js";import"./rough.esm-BCKZ66Jd.js";import"./init-Gi6I4Gst.js";var vt=mt.pie,R={sections:new Map,showData:!1},T=R.sections,F=R.showData,St=structuredClone(vt),xt=l(()=>structuredClone(St),"getConfig"),wt=l(()=>{T=new Map,F=R.showData,gt()},"clear"),Ct=l(({label:t,value:a})=>{if(a<0)throw new Error(`"${t}" has invalid value: ${a}. Negative values are not allowed in pie charts. All slice values must be >= 0.`);T.has(t)||(T.set(t,a),E.debug(`added new section: ${t}, with value: ${a}`))},"addSection"),$t=l(()=>T,"getSections"),Dt=l(t=>{F=t},"setShowData"),yt=l(()=>F,"getShowData"),U={getConfig:xt,clear:wt,setDiagramTitle:nt,getDiagramTitle:ot,setAccTitle:it,getAccTitle:rt,setAccDescription:at,getAccDescription:et,addSection:Ct,getSections:$t,setShowData:Dt,getShowData:yt},Tt=l((t,a)=>{tt(t,a),a.setShowData(t.showData),t.sections.map(a.addSection)},"populateDb"),bt={parse:l(async t=>{const a=await ht("pie",t);E.debug(a),Tt(a,U)},"parse")},At=l(t=>`
  .pieCircle{
    stroke: ${t.pieStrokeColor};
    stroke-width : ${t.pieStrokeWidth};
    opacity : ${t.pieOpacity};
  }
  .pieCircle.highlighted{
    scale: 1.05;
    opacity: 1;
  }
  .pieCircle.highlightedOnHover:hover{
    transition-duration: 250ms;
    scale: 1.05;
    opacity: 1;
  }
  .pieOuterCircle{
    stroke: ${t.pieOuterStrokeColor};
    stroke-width: ${t.pieOuterStrokeWidth};
    fill: none;
  }
  .pieTitleText {
    text-anchor: middle;
    font-size: ${t.pieTitleTextSize};
    fill: ${t.pieTitleTextColor};
    font-family: ${t.fontFamily};
  }
  .slice {
    font-family: ${t.fontFamily};
    fill: ${t.pieSectionTextColor};
    font-size:${t.pieSectionTextSize};
    // fill: white;
  }
  .legend text {
    fill: ${t.pieLegendTextColor};
    font-family: ${t.fontFamily};
    font-size: ${t.pieLegendTextSize};
  }
`,"getStyles"),_t=At,kt=l(t=>{const a=[...t.values()].reduce((n,u)=>n+u,0),L=[...t.entries()].map(([n,u])=>({label:n,value:u})).filter(n=>n.value/a*100>=1);return ut().value(n=>n.value).sort(null)(L)},"createPieArcs"),zt=l((t,a,L,W)=>{E.debug(`rendering pie chart
`+t);const n=W.db,u=st(),m=lt(n.getConfig(),u.pie),G=40,i=18,c=4,C=450,S=C,b=ct(a),$=b.append("g");$.attr("transform","translate("+S/2+","+C/2+")");const{themeVariables:o}=u;let[H]=pt(o.pieOuterStrokeWidth);H??=2;const q=m.legendPosition,M=m.textPosition,V=m.donutHole>0&&m.donutHole<=.9?m.donutHole:0,h=Math.min(S,C)/2-G,X=I().innerRadius(V*h).outerRadius(h),Z=I().innerRadius(h*M).outerRadius(h*M),x=$.append("g");x.append("circle").attr("cx",0).attr("cy",0).attr("r",h+H/2).attr("class","pieOuterCircle");const D=n.getSections(),j=kt(D),J=[o.pie1,o.pie2,o.pie3,o.pie4,o.pie5,o.pie6,o.pie7,o.pie8,o.pie9,o.pie10,o.pie11,o.pie12];let A=0;D.forEach(e=>{A+=e});const O=j.filter(e=>(e.data.value/A*100).toFixed(0)!=="0"),_=ft(J).domain([...D.keys()]);x.selectAll("mySlices").data(O).enter().append("path").attr("d",X).attr("fill",e=>_(e.data.label)).attr("class",e=>{let r="pieCircle";return m.highlightSlice==="hover"?r+=" highlightedOnHover":m.highlightSlice===e.data.label&&(r+=" highlighted"),r}),x.selectAll("mySlices").data(O).enter().append("text").text(e=>(e.data.value/A*100).toFixed(0)+"%").attr("transform",e=>"translate("+Z.centroid(e)+")").style("text-anchor","middle").attr("class","slice");const K=$.append("text").text(n.getDiagramTitle()).attr("x",0).attr("y",-400/2).attr("class","pieTitleText"),w=[...D.entries()].map(([e,r])=>({label:e,value:r})),f=$.selectAll(".legend").data(w).enter().append("g").attr("class","legend");f.append("rect").attr("width",i).attr("height",i).style("fill",e=>_(e.label)).style("stroke",e=>_(e.label)),f.append("text").attr("x",i+c).attr("y",i-c).text(e=>n.getShowData()?`${e.label} [${e.value}]`:e.label);const v=Math.max(...f.selectAll("text").nodes().map(e=>e?.getBoundingClientRect().width??0));let y=C,k=S+G;const s=i+c,z=w.length*s;switch(q){case"center":f.attr("transform",(e,r)=>{const p=s*w.length/2,d=-v/2-(i+c),g=r*s-p;return"translate("+d+","+g+")"});break;case"top":y+=z,f.attr("transform",(e,r)=>{const p=h,d=-v/2-(i+c),g=r*s-p;return`translate(${d}, ${g})`}),x.attr("transform",()=>`translate(0, ${z+s})`);break;case"bottom":y+=z,f.attr("transform",(e,r)=>{const p=-h-s,d=-v/2-(i+c),g=r*s-p;return"translate("+d+","+g+")"});break;case"left":k+=i+c+v,f.attr("transform",(e,r)=>{const p=s*w.length/2,d=-h-(i+c),g=r*s-p;return"translate("+d+","+g+")"}),x.attr("transform",()=>`translate(${v+i+c}, 0)`);break;default:k+=i+c+v,f.attr("transform",(e,r)=>{const p=s*w.length/2,d=12*i,g=r*s-p;return"translate("+d+","+g+")"});break}const P=K.node()?.getBoundingClientRect().width??0,Q=S/2-P/2,Y=S/2+P/2,B=Math.min(0,Q),N=Math.max(k,Y)-B;b.attr("viewBox",`${B} 0 ${N} ${y}`),dt(b,y,N,m.useMaxWidth)},"draw"),Et={draw:zt},me={parser:bt,db:U,renderer:Et,styles:_t};export{me as diagram};
