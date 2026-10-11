import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
const source=readFileSync(new URL('../src/fish.ts',import.meta.url),'utf8');
const js=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
const {P,Q,R,pTurn,qTurn,rotate,reflect,mirror,mirrorRadiusSquared,atlasBounds,fishSvg}=await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);
const registrationSource=readFileSync(new URL('../src/fishSource.ts',import.meta.url),'utf8');
const registrationJs=ts.transpileModule(registrationSource,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText.replace(/import \{ P \} from '.\/fish';/,`const P=${JSON.stringify(P)};`);
const {sourceUv}=await import(`data:text/javascript;base64,${Buffer.from(registrationJs).toString('base64')}`);
const planarSource=readFileSync(new URL('../src/planarFish.ts',import.meta.url),'utf8');
const planarJs=ts.transpileModule(planarSource,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText.replace(/import \{ P, Q, R \} from '.\/fish';/,`const P=${JSON.stringify(P)},Q=${JSON.stringify(Q)},R=${JSON.stringify(R)};`);
const {planarUv,planarO,planarP,planarQ}=await import(`data:text/javascript;base64,${Buffer.from(planarJs).toString('base64')}`);

const close=(a,b)=>assert.ok(Math.hypot(a[0]-b[0],a[1]-b[1])<1e-8,`${a} != ${b}`);
const swap=(v,a,b)=>{const next=v.slice();[next[a],next[b]]=[next[b],next[a]];return next;};

// Mirror the shader's fold, including its orientation-preserving completion
// and color permutation, against independently composed disk rotations.
function fold(point) {
  let q=point.slice(),colors=[0,1,2,3],odd=false;
  for(let i=0;i<100;i++) {
    const a=-.5*q[0]+Math.sqrt(3)/2*q[1];
    const b=.5*q[0]+Math.sqrt(3)/2*q[1];
    if(a>1e-12) { q=[q[0]+a,q[1]-Math.sqrt(3)*a];colors=swap(swap(colors,0,1),2,3);odd=!odd; }
    else if(b< -1e-12) {
      q=[q[0]-b,q[1]-Math.sqrt(3)*b];
      colors=odd?swap(swap(colors,2,3),1,2):swap(swap(colors,1,2),2,3);odd=!odd;
    } else if((q[0]-mirror[0])**2+(q[1]-mirror[1])**2<mirrorRadiusSquared-1e-12) {q=reflect(q);odd=!odd;}
    else return {point:odd?reflect(q):q,colors};
  }
  assert.fail('Reflection budget exhausted');
}

test('kite side rotations match nose/tail and have orders four and three',()=>{
  close(rotate([0,0],P,pTurn),R);
  close(rotate([0,0],Q,qTurn),R);
  close(rotate(R,P,pTurn*4),R);
  close(rotate(R,Q,qTurn*3),R);
  close(reflect(reflect([.2,.05])),[.2,.05]);
});

test('the bitmap crop registers the kite to central print landmarks',()=>{
  const pixel=q=>{const uv=sourceUv(q);return [uv[0]*316,(1-uv[1])*316];};
  close(pixel(P),[158,157.5]);
  const tail=pixel([0,0]),nose=pixel(R);
  assert.ok(Math.abs(tail[0]-158)<1e-8 && tail[1]>220 && tail[1]<222);
  assert.ok(Math.abs(nose[1]-157.5)<1e-8 && nose[0]>221 && nose[0]<222);
  for(let i=0;i<80;i++) for(let j=0;j<80;j++) {
    const point=fold([i/100-.1,j/100-.4]).point;
    const uv=sourceUv(point);
    assert.ok(uv[0]>.45&&uv[0]<.75&&uv[1]>.25&&uv[1]<.55);
  }
});

test('the planar warp fixes fin vertices and joins the two kite halves',()=>{
  close(planarUv([0,0]),planarO);
  close(planarUv(P),planarP);
  close(planarUv(Q),planarQ);
  const klein=p=>p.map(v=>2*v/(1+p[0]**2+p[1]**2));
  const disk=k=>k.map(v=>v/(1+Math.sqrt(1-k[0]**2-k[1]**2)));
  const pk=klein(P),qk=klein(Q);
  for(let i=0;i<=100;i++) {
    const k=pk.map((v,j)=>v*(1-i/100)+qk[j]*i/100);
    close(planarUv(disk(k)),planarUv(disk(k),true));
  }
});

test('the planar white backbone maps onto the exact hypercycle',()=>{
  const w=(R[0]**2+R[1]**2)/(2*R[1]);
  for(let i=0;i<=100;i++) {
    const x=R[0]*i/100;
    let q=[x,w-Math.sign(w)*Math.sqrt(w*w-x*x)];
    const other=(q[0]-mirror[0])**2+(q[1]-mirror[1])**2<mirrorRadiusSquared;
    if(other) q=reflect(q);
    const uv=planarUv(q,other);
    assert.ok(Math.abs(uv[0]-planarO[0])<1e-10);
    assert.ok(Number.isFinite(uv[1]));
  }
});

test('the planar warp stays stable where the backbone crosses the half-kite seam',()=>{
  const w=(R[0]**2+R[1]**2)/(2*R[1]);
  const spine=x=>[x,w-Math.sign(w)*Math.sqrt(w*w-x*x)];
  let lo=0,hi=R[0];
  for(let i=0;i<60;i++) {
    const mid=(lo+hi)/2,q=spine(mid);
    if((q[0]-mirror[0])**2+(q[1]-mirror[1])**2>mirrorRadiusSquared) lo=mid;
    else hi=mid;
  }
  const q=spine((lo+hi)/2),center=planarUv(q);
  close(center,[planarO[0],planarP[1]]);
  for(const delta of [[1e-7,0],[-1e-7,0],[0,1e-7],[0,-1e-7]]) {
    const uv=planarUv(q.map((v,i)=>v+delta[i]));
    assert.ok(Math.hypot(uv[0]-center[0],uv[1]-center[1])<1e-5);
  }
});

test('the planar crop stays within the detailed central source region',()=>{
  for(let i=0;i<160;i++) for(let j=0;j<160;j++) {
    const q=fold([i/160-.3,j/160-.5]).point;
    const other=(q[0]-mirror[0])**2+(q[1]-mirror[1])**2<mirrorRadiusSquared;
    const uv=planarUv(other?reflect(q):q,other);
    assert.ok(uv[0]>=planarQ[0]-1e-9&&uv[0]<=planarP[0]+1e-9);
    assert.ok(uv[1]>=2*planarP[1]-planarO[1]-1e-9&&uv[1]<=planarO[1]+1e-9);
  }
});

test('folding preserves fish handedness and four-color assignments',()=>{
  const base=[R[0]*.46,R[1]*.46];
  let copies=[{map:p=>p,colors:[0,1,2,3]}];
  for(let depth=0;depth<5;depth++) {
    const next=[];
    for(const copy of copies) {
      const folded=fold(copy.map(base));
      close(folded.point,base);
      assert.equal(folded.colors[1],copy.colors[1]);
      for(let side=0;side<4;side++) {
        const center=side<2?P:Q;
        const angle=side===0?pTurn:side===1?-pTurn:side===2?qTurn:-qTurn;
        const colors=side<2?swap(swap(copy.colors,0,1),2,3):side===2?swap(swap(copy.colors,2,3),1,2):swap(swap(copy.colors,1,2),2,3);
        assert.notEqual(colors[1],copy.colors[1]);
        next.push({map:p=>copy.map(rotate(p,center,angle)),colors});
      }
    }
    copies=next;
  }
});

test('head-to-tail translation follows the hypercycle and preserves color',()=>{
  // The word P^-1 Q P^-1 carries the preceding fish's nose to our tail.
  const map=p=>rotate(rotate(rotate(p,P,-pTurn),Q,qTurn),P,-pTurn);
  close(map(R),[0,0]);
  close(map([0,0]),[-R[0],R[1]]);
  let colors=swap(swap([0,1,2,3],0,1),2,3);
  colors=swap(swap(colors,2,3),1,2);
  colors=swap(swap(colors,0,1),2,3);
  assert.equal(colors[1],1);
  assert.ok(Math.abs(Math.abs(R[1])/(R[0]**2+R[1]**2)-Math.sqrt((3*Math.sqrt(2)-4)/8))<1e-12);
});

test('the local atlas covers the entire canonical kite without holes',()=>{
  const svg=fishSvg().split('<g id="labels">')[1].split('</g>')[0];
  const polygons=[...svg.matchAll(/<path d="([^"]+)" fill="(#ff0000|#00ff00|#0000ff|#ffffff)"/g)].map(m=>{
    const points=[...m[1].matchAll(/(-?\d+\.\d+),(-?\d+\.\d+)/g)].map(v=>[+v[1],+v[2]]);
    return {points,minX:Math.min(...points.map(p=>p[0])),maxX:Math.max(...points.map(p=>p[0])),minY:Math.min(...points.map(p=>p[1])),maxY:Math.max(...points.map(p=>p[1]))};
  });
  function contains(poly,x,y) {
    if(x<poly.minX||x>poly.maxX||y<poly.minY||y>poly.maxY) return false;
    let inside=false;
    for(let i=0,j=poly.points.length-1;i<poly.points.length;j=i++) {
      const a=poly.points[i],b=poly.points[j];
      if((a[1]>y)!==(b[1]>y)&&x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0]) inside=!inside;
    }
    return inside;
  }
  const [left,bottom,right,top]=atlasBounds;
  let samples=0,holes=0,overlaps=0;
  for(let i=0;i<240;i++) for(let j=0;j<240;j++) {
    const p=[(i+.37)*R[0]/240,bottom+(j+.41)*(top-bottom)/240];
    const f=fold(p);
    if(Math.hypot(f.point[0]-p[0],f.point[1]-p[1])>1e-8) continue;
    const x=(p[0]-left)/(right-left)*1536,y=(top-p[1])/(top-bottom)*1254;
    const count=polygons.filter(poly=>contains(poly,x,y)).length;
    samples++; if(!count) holes++; if(count>1) overlaps++;
  }
  assert.ok(samples>8000,JSON.stringify({samples,holes,overlaps}));
  assert.equal(holes,0);
  assert.equal(overlaps,0);
});
