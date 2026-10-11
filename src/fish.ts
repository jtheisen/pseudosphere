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
  // A swept tail, a pinched peduncle and a pointed fin. Its partner is an
  // exact rotation of this same curve, rather than a separately drawn edge.
  const neck=at(.26,-.27);
  return [...bezier([0,0],at(.08,.035),at(.16,-.27),neck),
    ...bezier(neck,at(.47,-.25),at(.80,-.17),end).slice(1)];
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
const circleY=(R[0]**2+R[1]**2)/(2*R[1]);
// Anatomy is measured along the actual backbone, rather than the kite's chord.
function spine(t:number):Point {
  const x=R[0]*t;
  return [x,circleY-Math.sign(circleY)*Math.sqrt(circleY**2-x*x)];
}
function flank(t:number,offset:number):Point {
  const p=spine(t),slope=Math.sign(circleY)*p[0]/Math.sqrt(circleY**2-p[0]**2);
  const length=Math.hypot(1,slope);
  return [p[0]-offset*slope/length,p[1]+offset/length];
}
function bodyWidth(t:number,side:number):number {
  if(t<=0||t>=1) return 0;
  const origin=spine(t),unit=flank(t,side),normal:Point=[unit[0]-origin[0],unit[1]-origin[1]];
  let available=Infinity;
  // Intersect the normal with the silhouette. The peduncle is much narrower
  // than the kite, and its two sides differ because the fin orders differ.
  for(let i=0;i<outline.length-1;i++) {
    const a=outline[i],b=outline[i+1],dx=b[0]-a[0],dy=b[1]-a[1];
    const det=normal[0]*dy-normal[1]*dx;
    if(Math.abs(det)<1e-12) continue;
    const ox=a[0]-origin[0],oy=a[1]-origin[1];
    const distance=(ox*dy-oy*dx)/det,along=(ox*normal[1]-oy*normal[0])/det;
    if(distance>0&&along>=0&&along<=1) available=Math.min(available,distance);
  }
  return Math.min(.055*Math.sin(Math.PI*t)**1.25*(.7+.3*t),available*.76);
}
type Engraving = {points:Point[];shade:string};
function fishEngraving():Engraving[] {
  const marks:Engraving[]=[];
  const fill=(points:Point[],shade='#000000')=>marks.push({points,shade});
  const ink=(points:Point[],width=.005)=>fill(ribbon(points,width));
  // Broad, swept fins. Each ray follows the fan from its outer web to the
  // central body; the curved fin roots make the narrow fish readable at size.
  for(const side of [1,-1]) {
    const edge=side===1?upperEdge:lowerEdge;
    const center=side===1?P:Q,turn=side===1?pTurn:qTurn;
    const boundary=[...edge,...edge.map(p=>rotate(p,center,turn)).reverse().slice(1)];
    for(let i=0;i<13;i++) {
      const u=.24+i*.047;
      const outer=boundary[Math.round(u*(boundary.length-1))];
      const t=.16+i*.047;
      const root=flank(t,side*bodyWidth(t,side)*.94);
      const bend:Point=[outer[0]*.56+root[0]*.44-.014,outer[1]*.56+root[1]*.44];
      ink(bezier(outer,bend,[root[0]-.015,root[1]+side*.008],root),.0055);
    }
  }
  const upper=Array.from({length:81},(_,i)=>flank(i/80,bodyWidth(i/80,1)));
  const lower=Array.from({length:81},(_,i)=>flank(i/80,-bodyWidth(i/80,-1)));
  fill([...upper,...lower.reverse()],'#969696');
  ink(upper,.0055);
  ink(lower,.0055);
  // The white dorsal stripe widens through the body and narrows to the nose.
  // Its centre remains the exact hypercycle, including at the tail junction.
  const stripe=(side:number)=>Array.from({length:97},(_,i)=>{
    const t=i/96;
    const p=spine(t);
    return flank(t,side*(.0022*(1-p[0]**2-p[1]**2)+.0032*Math.sin(Math.PI*t)**1.4));
  });
  fill([...stripe(1),...stripe(-1).reverse()],'#ffffff');
  // Two pale, elongated eye sockets with dark forward-facing pupils.
  // They sit on either side of the backbone, as in a dorsal view of a fish.
  for(const side of [1,-1]) {
    const oval=(t:number,offset:number,rx:number,ry:number)=>Array.from({length:49},(_,i)=>{
      const a=i*Math.PI/24;
      return flank(t+rx*Math.cos(a)/R[0],side*(offset+ry*Math.sin(a)));
    });
    fill(oval(.845,.021,.027,.0105),'#ffffff');
    fill(oval(.859,.021,.016,.0075));
    fill(oval(.872,.019,.003,.0024),'#ffffff');
    // Short gill seam joins the eye region to the fin root.
    ink(bezier(flank(.735,side*.036),flank(.76,side*.031),flank(.76,side*.020),flank(.735,side*.013)),.004);
  }
  ink(outline,.0045);
  return marks;
}
const engravingMarks=fishEngraving();
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
  const clips:string[]=[];
  for(let index=0;index<copies.length;index++) {
    const copy=copies[index], center=copy.map(mid);
    const key=center.map(v=>Math.round(v*1e7)).join(',');
    if(seen.has(key)) continue;
    seen.add(key);
    if(Math.hypot(...center)>.91) continue;
    const points=outline.map(copy.map);
    if(points.some(p=>p[0]>left-.05&&p[0]<right+.05&&p[1]>bottom-.05&&p[1]<top+.05)) {
      // Encode the color permutation as channels, and ink as darkness.
      const encoded=['#ff0000','#00ff00','#0000ff','#ffffff'][copy.colors[1]];
      fragments.push(`<path d="${path(outline,copy.map,true)}" fill="${encoded}"/>`);
      clips.push(`<clipPath id="fish-${index}"><path d="${path(outline,copy.map,true)}"/></clipPath>`);
      engraving.push(`<path d="${path(outline,copy.map,true)}" fill="#808080"/>`);
      for(const mark of engravingMarks) engraving.push(`<path d="${path(mark.points,copy.map,true)}" fill="${mark.shade}" clip-path="url(#fish-${index})"/>`);
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
  // blended pigment with white ink. Both panels share one mipmapped texture;
  // clip the large offscreen neighbors so ink cannot spill into the labels.
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width*2}" height="${height}" viewBox="0 0 ${width*2} ${height}"><defs><clipPath id="panel"><rect width="${width}" height="${height}"/></clipPath>${clips.join('')}</defs><rect width="100%" height="100%" fill="#000"/><g clip-path="url(#panel)"><g id="labels">${fragments.join('')}</g></g><g transform="translate(${width} 0)" clip-path="url(#panel)">${engraving.join('')}</g></svg>`;
}
