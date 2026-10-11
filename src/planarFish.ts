import { P,Q,R } from './fish';
import type { Point } from './fish';

// Drawing 123, at its original 1280 x 944 resolution. The central yellow
// fish runs between the two white junctions; P/Q are its fin-tip vertices.
const uv=(x:number,y:number):Point=>[x/1280,1-y/944];
export const planarO=uv(493,204);
export const planarP=uv(593,373.5);
export const planarQ=uv(393,373.5);
const klein=(p:Point):Point=>p.map(v=>2*v/(1+p[0]**2+p[1]**2)) as Point;
const pk=klein(P),qk=klein(Q);
const det=pk[0]*qk[1]-pk[1]*qk[0];
// Columns of the inverse triangle matrix, in GLSL mat2 order.
export const planarBasis=[qk[1]/det,-pk[1]/det,-qk[0]/det,pk[0]/det] as const;
const dx=pk[0]-qk[0],dy=pk[1]-qk[1];
const w=(R[0]**2+R[1]**2)/(2*R[1]);
const yy=1+4*w*w;
// Intersect each radial layer of the Klein triangle with the exact
// hypercycle: Kx² + (1+4w²)Ky² - 4w Ky = 0.
export const planarSpine=[dx*dx+yy*dy*dy,2*(qk[0]*dx+yy*qk[1]*dy),qk[0]**2+yy*qk[1]**2,-4*w*dy] as const;
export const planarSpineC=-4*w*qk[1];

export function planarUv(q:Point,otherHalf=false):Point {
  const k=klein(q),[a,b,c,d]=planarBasis;
  const wp=a*k[0]+c*k[1],wq=b*k[0]+d*k[1];
  const layer=wp+wq;
  const u=wp/Math.max(layer,1e-7);
  const [aa,bb,cc,b0]=planarSpine;
  const A=aa*layer,B=b0+bb*layer,C=planarSpineC+cc*layer;
  const root=Math.sqrt(Math.max(0,B*B-4*A*C));
  const spine=B>=0?-2*C/(B+root):(-B+root)/(2*A);
  // A smooth projective lateral warp fixes both edges and takes the
  // hypercycle to the planar drawing's straight white backbone.
  const f=u*(1-spine)/(spine+(1-2*spine)*u);
  const out:Point=[0,0];
  for(const axis of [0,1]) out[axis]=planarO[axis]+layer*((1-f)*(planarQ[axis]-planarO[axis])+f*(planarP[axis]-planarO[axis]));
  if(otherHalf) out[1]=2*planarP[1]-out[1];
  return out;
}
