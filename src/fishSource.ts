import { P } from './fish';
import type { Point } from './fish';

// Register the (4,3,3) kite against the large green fish in the southeast
// quadrant of the print. Only this local patch is sampled, never its rim.
export const sourceRegistration = [P[0],P[1],.5,Math.sqrt(3)/2] as const;
export const sourceDisk = [158/316,1-157.5/316,156.5/316,156.5/316] as const;
export function sourceUv(q:Point):Point {
  const [px,py,c,s]=sourceRegistration;
  const dx=q[0]-px,dy=q[1]-py;
  const a=1-px*q[0]-py*q[1],b=py*q[0]-px*q[1];
  const den=a*a+b*b;
  const x=(dx*a+dy*b)/den,y=(dy*a-dx*b)/den;
  return [sourceDisk[0]+sourceDisk[2]*(c*x-s*y),sourceDisk[1]+sourceDisk[3]*(s*x+c*y)];
}
