// Offline rendering of the actual analytic surface and fish mapping.
// Input: original 1280x944 image decoded to top-down sRGB RGBA bytes.
// No browser, generated artwork, or screenshot of the UI is involved.
import { readFileSync,writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import ts from 'typescript';
const load=async file=>{
  const js=ts.transpileModule(readFileSync(new URL(file,import.meta.url),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);
};
const {fragmentShader}=await load('../src/shader.ts');
const {P,Q,R,mirror,mirrorRadiusSquared}=await load('../src/fish.ts');
const warpSource=readFileSync(new URL('../src/planarFish.ts',import.meta.url),'utf8').replace("import { P,Q,R } from './fish';",`const P=${JSON.stringify(P)},Q=${JSON.stringify(Q)},R=${JSON.stringify(R)};`);
const warpJs=ts.transpileModule(warpSource,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
const {planarUv}=await import(`data:text/javascript;base64,${Buffer.from(warpJs).toString('base64')}`);
const image=readFileSync(process.argv[2]);
if(image.length!==1280*944*4) throw Error('Expected a 1280x944 RGBA source image.');
class Vector extends Array { get y(){return this[1];} get xz(){return [this[0],this[2]];} }
const vector=a=>new Vector(...a),dot=(a,b)=>a.reduce((s,x,i)=>s+x*b[i],0);
const normalize=a=>{const norm=Math.hypot(...a);return a.map(x=>x/norm);};
const clamp=(x,a,b)=>Math.min(b,Math.max(a,x));
const scalar=source=>source.replace(/\b(float|vec3|vec2|int)\b/g,'let').replace(/\b(sqrt|min|max|log)\(/g,'Math.$1(').replace(/length\((p|ro).xz\)/g,'Math.hypot(...$1.xz)');
const gap=new Function('p',scalar(fragmentShader.match(/float surfaceGap\(vec3 p\) \{([\s\S]*?)\n\}/)[1]));
const solver=new Function('ro','rd','surfaceGap','dot','ray','clamp',`let distance;${scalar(fragmentShader.match(/bool intersectSurface\(vec3 ro, vec3 rd, out float distance\) \{([\s\S]*?)\n\}/)[1]).replace('ro.xz+rd.xz*closestDistance','ro.xz.map((x,i)=>x+rd.xz[i]*closestDistance)').replace(/ro\+rd\*([a-zA-Z]+)/g,'ray($1)').replace(/return true;/g,'return distance;').replace(/return false;/g,'return null;').replace('return distance >= 0.0;','return distance >= 0.0 ? distance : null;')}`);
const refs=[[.68,.29,.28],[.88,.61,.27],[.28,.58,.60],[.35,.49,.30]],luma=[.2126,.7152,.0722];
const smooth=(a,b,x)=>{const t=clamp((x-a)/(b-a),0,1);return t*t*(3-2*t);};
function sample(u,v){
  const x=clamp(u*1280-.5,0,1279),y=clamp((1-v)*944-.5,0,943),ix=Math.floor(x),iy=Math.floor(y),fx=x-ix,fy=y-iy;
  return [0,1,2].map(c=>{
    const at=(a,b)=>image[(Math.min(b,943)*1280+Math.min(a,1279))*4+c]/255;
    return (at(ix,iy)*(1-fx)+at(ix+1,iy)*fx)*(1-fy)+(at(ix,iy+1)*(1-fx)+at(ix+1,iy+1)*fx)*fy;
  });
}
function fish(disk){
  let q=disk.slice(),colors=[0,1,2,3],odd=false;
  for(let i=0;i<100;i++){
    const a=-.5*q[0]+Math.sqrt(3)/2*q[1],b=.5*q[0]+Math.sqrt(3)/2*q[1];
    if(a>0){q=[q[0]+a,q[1]-Math.sqrt(3)*a];colors=[colors[1],colors[0],colors[3],colors[2]];odd=!odd;}
    else if(b<0){q=[q[0]-b,q[1]-Math.sqrt(3)*b];colors=odd?[colors[0],colors[3],colors[1],colors[2]]:[colors[0],colors[2],colors[3],colors[1]];odd=!odd;}
    else {const d=q.map((x,i)=>x-mirror[i]),dd=dot(d,d);if(dd>=mirrorRadiusSquared)break;q=d.map((x,i)=>mirror[i]+x*mirrorRadiusSquared/dd);odd=!odd;}
  }
  const uv=planarUv(q,odd),rgb=sample(...uv),chroma=rgb.map(x=>x/Math.max(.001,rgb.reduce((a,b)=>a+b)));
  const errors=refs.slice(0,3).map(ref=>{const sum=ref.reduce((a,b)=>a+b);return ref.reduce((e,x,i)=>e+(chroma[i]-x/sum)**2,0);});
  const id=errors.indexOf(Math.min(...errors)),label=id===1?1:uv[0]>493/1280?0:odd?3:2;
  let changed=rgb.map((x,i)=>x*refs[colors[label]][i]/refs[id][i]);
  const brightness=dot(rgb,luma),high=Math.max(...rgb),low=Math.min(...rgb);
  changed=changed.map(x=>x*brightness/Math.max(.00001,dot(changed,luma)));
  const peak=Math.max(...changed);
  if(peak>high){const sat=clamp((high-brightness)/Math.max(.00001,peak-brightness),0,1);changed=changed.map(x=>brightness+(x-brightness)*sat);}
  const mask=smooth(.09,.22,high-low)*smooth(.28,.50,high)*(1-smooth(.50,.70,low));
  return rgb.map((x,i)=>x+(changed[i]-x)*mask);
}
const width=1200,height=630,elevation=.26,zoom=6.4,ro=vector([0,1.0+zoom*Math.sin(elevation),zoom*Math.cos(elevation)]);
const forward=[0,-Math.sin(elevation),-Math.cos(elevation)],up=[0,Math.cos(elevation),-Math.sin(elevation)],light=normalize([-.7,1.3,2]);
const pixels=Buffer.alloc(width*height*3);
for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  const color=[0,0,0];
  for(let sy=0;sy<2;sy++)for(let sx=0;sx<2;sx++){
    const u=(x+(sx+.5)/2-width/2)/height,v=(height/2-y-(sy+.5)/2)/height;
    const rd=vector(normalize(forward.map((f,i)=>2.15*f+(i===0?u:0)+up[i]*v)));
    const ray=t=>vector(ro.map((p,i)=>p+rd[i]*t)),t=solver(ro,rd,gap,dot,ray,clamp);
    let rgb=[.073,.093,.095].map(c=>c+.018*Math.exp(-2*(u*u+(v-.1)**2)));
    if(t!==null){
      const p=ray(t),r=Math.hypot(...p.xz);
      const a=(Math.atan2(p[0],p[2])+.3)*.65,b=.65/r,den=a*a+(b+1)**2;
      rgb=r<.0001?[.5,.5,.4]:fish([2*a/den,(a*a+b*b-1)/den]);
      let n=[p[0]/r*Math.sqrt(Math.max(0,1-r*r)),r,p[2]/r*Math.sqrt(Math.max(0,1-r*r))];
      if(dot(n,rd)>0)n=n.map(x=>-x);
      const diffuse=Math.max(0,dot(n,light)),spec=Math.max(0,dot(n,normalize(light.map((x,i)=>x-rd[i]))))**50;
      rgb=rgb.map(c=>(c*(.48+.65*diffuse)+spec*.10)**.88);
    }
    for(let c=0;c<3;c++)color[c]+=rgb[c]/4;
  }
  for(let c=0;c<3;c++)pixels[(y*width+x)*3+c]=Math.round(clamp(color[c],0,1)*255);
}
// Minimal RGB PNG encoding, using only Node's built-in compression.
const crc32=data=>{let crc=0xffffffff;for(const b of data){crc^=b;for(let i=0;i<8;i++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}return (crc^0xffffffff)>>>0;};
const chunk=(name,data)=>{const type=Buffer.from(name),size=Buffer.alloc(4),crc=Buffer.alloc(4);size.writeUInt32BE(data.length);crc.writeUInt32BE(crc32(Buffer.concat([type,data])));return Buffer.concat([size,type,data,crc]);};
const header=Buffer.alloc(13);header.writeUInt32BE(width);header.writeUInt32BE(height,4);header[8]=8;header[9]=2;
const rows=Buffer.alloc(height*(width*3+1));for(let y=0;y<height;y++)pixels.copy(rows,y*(width*3+1)+1,y*width*3,(y+1)*width*3);
writeFileSync(new URL('../public/social-preview.png',import.meta.url),Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',deflateSync(rows)),chunk('IEND',Buffer.alloc(0))]));
console.log('Rendered public/social-preview.png (1200 x 630, 2x antialiasing)');
