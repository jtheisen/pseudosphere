// Circle Limit III's (4,3,3) rotation group. The bitmap is only a local
// decoration atlas; all placement and scale come from hyperbolic isometries.
export type Point = [number, number];
export const fishAngle = Math.PI / 6;
const chP = (Math.cos(Math.PI/3)**2 + Math.cos(Math.PI/4)) / Math.sin(Math.PI/3)**2;
const chQ = (Math.cos(Math.PI/4)*Math.cos(Math.PI/3) + Math.cos(Math.PI/3)) / (Math.sin(Math.PI/4)*Math.sin(Math.PI/3));
export const P: Point = [Math.sqrt((chQ-1)/(chQ+1))*Math.cos(fishAngle), Math.sqrt((chQ-1)/(chQ+1))*Math.sin(fishAngle)];
export const Q: Point = [Math.sqrt((chP-1)/(chP+1))*Math.cos(fishAngle), -Math.sqrt((chP-1)/(chP+1))*Math.sin(fishAngle)];
const bp = (1+P[0]**2+P[1]**2)/2;
const bq = (1+Q[0]**2+Q[1]**2)/2;
const det = P[0]*Q[1]-P[1]*Q[0];
export const mirror: Point = [(bp*Q[1]-bq*P[1])/det, (P[0]*bq-Q[0]*bp)/det];
export const mirrorRadiusSquared = mirror[0]**2+mirror[1]**2-1;
export function reflect(p: Point): Point {
  const x=p[0]-mirror[0], y=p[1]-mirror[1];
  const factor=mirrorRadiusSquared/(x*x+y*y);
  return [mirror[0]+x*factor,mirror[1]+y*factor];
}
export const R = reflect([0,0]);
function divide(a: Point,b: Point): Point {
  const d=b[0]**2+b[1]**2;
  return [(a[0]*b[0]+a[1]*b[1])/d,(a[1]*b[0]-a[0]*b[1])/d];
}
export function rotate(p: Point, center: Point, angle: number): Point {
  const [x,y]=divide([p[0]-center[0],p[1]-center[1]], [1-center[0]*p[0]-center[1]*p[1],center[1]*p[0]-center[0]*p[1]]);
  const w: Point=[x*Math.cos(angle)-y*Math.sin(angle),x*Math.sin(angle)+y*Math.cos(angle)];
  return divide([w[0]+center[0],w[1]+center[1]],[1+center[0]*w[0]+center[1]*w[1],center[0]*w[1]-center[1]*w[0]]);
}
const distance = (a: Point,b: Point) => Math.hypot(a[0]-b[0],a[1]-b[1]);
export const pTurn = distance(rotate([0,0],P,Math.PI/2),R)<1e-8 ? Math.PI/2 : -Math.PI/2;
export const qTurn = distance(rotate([0,0],Q,Math.PI*2/3),R)<1e-8 ? Math.PI*2/3 : -Math.PI*2/3;
export const atlasBounds = [-0.13,-0.40,0.85,0.40] as const;

function bezier(a: Point,b: Point,c: Point,d: Point): Point[] {
  return Array.from({length:33},(_,i)=>{
    const t=i/32,s=1-t;
    return [s*s*s*a[0]+3*s*s*t*b[0]+3*s*t*t*c[0]+t*t*t*d[0],s*s*s*a[1]+3*s*s*t*b[1]+3*s*t*t*c[1]+t*t*t*d[1]];
  });
}
function ribbon(points: Point[],width: number): Point[] {
  const side=(sign:number)=>points.map((p,i):Point=>{
    const a=points[Math.max(0,i-1)], b=points[Math.min(points.length-1,i+1)];
    const length=Math.hypot(b[0]-a[0],b[1]-a[1]) || 1;
    const half=sign*width*(1-p[0]**2-p[1]**2)/4;
    return [p[0]-(b[1]-a[1])/length*half,p[1]+(b[0]-a[0])/length*half];
  });
  return [...side(1),...side(-1).reverse()];
}
function edge(end: Point, handedness: number): Point[] {
  const at=(t:number,offset:number): Point=>[end[0]*t-end[1]*offset*handedness*.4,end[1]*t+end[0]*offset*handedness*.4];
  // A tail lobe, a pinched peduncle and a broad fin. Its partner is an
  // exact rotation of this same curve, rather than a separately drawn edge.
  const neck=at(.24,-.21);
  return [...bezier([0,0],at(.04,.02),at(.10,.19),at(.13,.16)),
    ...bezier(at(.13,.16),at(.18,.10),at(.17,-.18),neck).slice(1),
    ...bezier(neck,at(.49,-.16),at(.75,.15),end).slice(1)];
}
export const upperEdge = edge(P,1);
export const lowerEdge = edge(Q,-1);
export const outline: Point[] = [...upperEdge,
  ...upperEdge.map(p=>rotate(p,P,pTurn)).reverse().slice(1),
  ...lowerEdge.map(p=>rotate(p,Q,qTurn)).slice(1),
  ...lowerEdge.slice().reverse().slice(1)];

type Copy = { map: (p: Point)=>Point; colors: number[]; depth: number };
const identity = (p:Point):Point=>p;
const swap=(v:number[],a:number,b:number)=>{ const out=v.slice(); [out[a],out[b]]=[out[b],out[a]]; return out; };
export function fishSvg(): string {
  const width=1536,height=1254;
  const [left,bottom,right,top]=atlasBounds;
  const xy=(p:Point)=>`${((p[0]-left)/(right-left)*width).toFixed(3)},${((top-p[1])/(top-bottom)*height).toFixed(3)}`;
  const path=(points:Point[],map:(p:Point)=>Point,close=false)=>`M${points.map(p=>xy(map(p))).join(' L')}${close?' Z':''}`;
  const mid: Point=[R[0]*.46,R[1]*.46];
  const copies: Copy[]=[{map:identity,colors:[0,1,2,3],depth:0}];
  const seen=new Set<string>();
  const fragments:string[]=[];
  const engraving:string[]=[];
  for(let index=0;index<copies.length;index++) {
    const copy=copies[index], center=copy.map(mid);
    const key=center.map(v=>Math.round(v*1e7)).join(',');
    if(seen.has(key)) continue;
    seen.add(key);
    if(Math.hypot(...center)>.91) continue;
    const points=outline.map(copy.map);
    if(points.some(p=>p[0]>left-.05&&p[0]<right+.05&&p[1]>bottom-.05&&p[1]<top+.05)) {
      // The exact hypercycle through O, R and (-R.x,R.y).
      const circleY=(R[0]**2+R[1]**2)/(2*R[1]);
      const backbone=Array.from({length:65},(_,i):Point=>{
        const x=R[0]*i/64;
        return [x,circleY-Math.sign(circleY)*Math.sqrt(circleY**2-x*x)];
      });
      const eye:Point=[R[0]*.84,backbone[54][1]+.019];
      const eyeRing=Array.from({length:41},(_,i):Point=>[eye[0]+.014*Math.cos(i*Math.PI/20),eye[1]+.014*Math.sin(i*Math.PI/20)]);
      // Encode the color permutation as channels, and ink as darkness.
      const encoded=['#ff0000','#00ff00','#0000ff','#ffffff'][copy.colors[1]];
      fragments.push(`<path d="${path(outline,copy.map,true)}" fill="${encoded}"/>`);
      engraving.push(`<path d="${path(outline,copy.map,true)}" fill="#808080"/>`);
      engraving.push(`<path d="${path(ribbon(outline,.004),copy.map,true)}" fill="#000000"/>`);
      engraving.push(`<path d="${path(ribbon(backbone,.019),copy.map,true)}" fill="#ffffff"/>`);
      for(let i=0;i<12;i++) {
        const t=.29+i*.043;
        const start:Point=[R[0]*t,R[1]*t-.015];
        const end:Point=[R[0]*(t-.10),R[1]*(t-.10)+(i<8?.048:.027)];
        engraving.push(`<path d="${path(ribbon(bezier(start,[start[0]-.016,start[1]+.01],[end[0]+.01,end[1]],end),.005),copy.map,true)}" fill="#000000"/>`);
      }
      engraving.push(`<path d="${path(eyeRing,copy.map,true)}" fill="#000000"/>`);
    }
    if(copy.depth<7) {
      // Mirror words describe the local kite's neighbors. An odd word is
      // completed by the PQ mirror, preserving the fish's handedness.
      for(const side of [0,1,2,3]) {
        const c=side<2?P:Q,angle=side===0?pTurn:side===1?-pTurn:side===2?qTurn:-qTurn;
        // The four-color quotient sends the 4-fold turn to (01)(23),
        // and the 3-fold turn to (123). Adjacent fish have different colors.
        let colors=copy.colors;
        if(side<2) colors=swap(swap(colors,0,1),2,3);
        else {
          colors=side===2?swap(swap(colors,2,3),1,2):swap(swap(colors,1,2),2,3);
        }
        copies.push({map:p=>copy.map(rotate(p,c,angle)),colors,depth:copy.depth+1});
      }
    }
  }
  // Separate pigment labels from engraving so filtering never confuses a
  // blended pigment with white ink. Both panels share one mipmapped texture.
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width*2}" height="${height}" viewBox="0 0 ${width*2} ${height}"><rect width="100%" height="100%" fill="#000"/><g id="labels">${fragments.join('')}</g><g transform="translate(${width} 0)">${engraving.join('')}</g></svg>`;
}
