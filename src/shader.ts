export const vertexShader = `
void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

export const fragmentShader = `
precision highp float;
uniform vec2 resolution;
uniform float turn;
uniform float positionScale;
uniform float tileAngle;
uniform float mirrorCenter;
uniform float motifRadius;
uniform float zoom;
uniform float elevation;
uniform int pattern;
uniform int palette;
uniform bool grid;
const float PI = 3.141592653589793;

// Tractrix height as a function of radius: acosh(1/r)-sqrt(1-r*r).
// No inverse-profile Newton iteration is necessary.
float surfaceGap(vec3 p) {
  float r = min(length(p.xz),1.0);
  if(r == 0.0) return -1.0e30; // The axis lies inside at every finite height.
  float s = sqrt(max(0.0,1.0-r*r));
  return p.y-(log((1.0+s)/r)-s);
}

// Split at analytic stationary points, then bracket the first intersection.
bool intersectSurface(vec3 ro, vec3 rd, out float distance) {
  float aa = dot(rd.xz,rd.xz);
  if(aa == 0.0) {
    float r = length(ro.xz);
    if(r == 0.0 || r > 1.0 || rd.y == 0.0) return false;
    distance = -surfaceGap(ro)/rd.y;
    return distance >= 0.0;
  }
  float closestDistance = -dot(ro.xz,rd.xz)/aa;
  vec2 closestPoint = ro.xz+rd.xz*closestDistance;
  float closestRadiusSquared = dot(closestPoint,closestPoint);
  if(closestRadiusSquared > 1.0) return false;
  float halfSpan = sqrt((1.0-closestRadiusSquared)/aa);
  float lo = max(0.0,closestDistance-halfSpan);
  float hi = closestDistance+halfSpan;
  if(rd.y > 0.0) lo=max(lo,-ro.y/rd.y);
  else if(rd.y < 0.0) hi=min(hi,-ro.y/rd.y);
  else if(ro.y < 0.0) return false;
  if(lo > hi) return false;
  float cut1 = hi;
  float cut2 = hi;
  if(rd.y == 0.0) cut1 = clamp(closestDistance,lo,hi);
  else {
    // For G = y-profile(r), G'=0 implies
    // A*q*q - B*q + D = 0, where q=r*r.
    float A = aa+rd.y*rd.y;
    float D = aa*closestRadiusSquared;
    float B = aa+D;
    float discriminant = B*B-4.0*A*D;
    if(discriminant >= 0.0) {
      float largeRoot = (B+sqrt(discriminant))/(2.0*A);
      float smallRoot = D/(A*largeRoot);
      for(int i=0;i<2;i++) {
        float q = i == 0 ? smallRoot : largeRoot;
        if(q < closestRadiusSquared || q > 1.0) continue;
        // Squaring the derivative introduces spurious roots on the
        // other side of closest approach; retain only the correct sign.
        float offset = sqrt((q-closestRadiusSquared)/aa);
        float cut = closestDistance+(rd.y < 0.0 ? offset : -offset);
        if(cut <= lo || cut >= hi) continue;
        if(cut < cut1) { cut2=cut1; cut1=cut; }
        else cut2=min(cut2,cut);
      }
    }
  }
  float a = lo;
  float fa = surfaceGap(ro+rd*a);
  for(int i=0;i<3;i++) {
    float b = i == 0 ? cut1 : (i == 1 ? cut2 : hi);
    if(b <= a) continue;
    float fb = surfaceGap(ro+rd*b);
    if(fa == 0.0) { distance=a; return true; }
    if(fb == 0.0) { distance=b; return true; }
    // Each section is monotonic, so equal signs really mean no hit.
    if((fa < 0.0) != (fb < 0.0)) {
      for(int j=0;j<32;j++) {
        float m = a+(b-a)*0.5;
        if(m == a || m == b) break;
        float fm = surfaceGap(ro+rd*m);
        if(fm == 0.0) { a=m; b=m; break; }
        if((fa < 0.0) == (fm < 0.0)) { a=m; fa=fm; }
        else b=m;
      }
      distance = a+(b-a)*0.5;
      return true;
    }
    a=b; fa=fb;
  }
  return false;
}

// Fundamental triangle of {p,q}: angles pi/p, pi/2, pi/q.
// All reflections are hyperbolic isometries.
vec3 tile(vec2 p) {
  float parity = 0.0;
  float cx = mirrorCenter;
  float rr = cx*cx-1.0;
  vec2 wedgeNormal = vec2(-sin(tileAngle),cos(tileAngle));
  for(int i=0; i<100; i++) {
    bool changed = false;
    if(p.y < 0.0) { p.y = -p.y; parity = 1.0-parity; changed = true; }
    float wedgeDistance = dot(p,wedgeNormal);
    if(wedgeDistance > 0.0) { p -= 2.0*wedgeDistance*wedgeNormal; parity = 1.0-parity; changed = true; }
    vec2 q = p-vec2(cx,0.0);
    float d = dot(q,q);
    if(d < rr) { p = vec2(cx,0.0)+q*rr/d; parity = 1.0-parity; changed = true; }
    if(!changed) break;
  }
  return vec3(p,parity);
}

vec3 pigment(vec3 p, vec3 normal) {
  float r = length(p.xz);
  vec3 paper = vec3(0.86,0.81,0.66);
  vec3 dark = vec3(0.14,0.29,0.30);
  vec3 accent = vec3(0.70,0.35,0.20);
  if(palette==1) { paper=vec3(0.88,0.87,0.81); dark=vec3(0.19,0.22,0.23); accent=vec3(0.48,0.53,0.49); }
  if(palette==2) { paper=vec3(0.84,0.87,0.88); dark=vec3(0.16,0.27,0.46); accent=vec3(0.42,0.62,0.69); }
  // Far into the cusp, texture coordinates exceed float precision.
  // Average the pattern there; the surface itself still continues.
  if(r < 0.0001) return mix(paper,dark,0.5);
  // The branch cut is opposite the camera. turn remains unbounded.
  float u = atan(p.x,p.z)+turn;
  float v = 1.0/r;
  vec2 w = vec2(u,v)*positionScale;
  float den = w.x*w.x+(w.y+1.0)*(w.y+1.0);
  vec2 disk = vec2(2.0*w.x, dot(w,w)-1.0)/den;
  vec3 folded = tile(disk);
  vec2 q = folded.xy;
  float cx = mirrorCenter;
  float circleRadius = sqrt(cx*cx-1.0);
  // Local distance to the polygon's side, using the conformal factor.
  float edge = abs(length(q-vec2(cx,0.0))-circleRadius)*2.0/max(0.00001,1.0-dot(q,q));
  float ink = 1.0-smoothstep(0.007,0.018,edge);
  vec3 color;
  if(pattern==0) {
    // Mirrored feather ornament within the tessellation's triangles.
    vec2 a = q/motifRadius;
    float angle = atan(a.y,a.x);
    float rad = length(a);
    float spine = abs(angle-tileAngle*0.5)*rad;
    float feather = smoothstep(0.02,0.04,spine);
    float ribs = sin(52.0*rad+13.0*angle);
    float motif = smoothstep(-0.10,0.15,ribs)*smoothstep(0.02,0.09,spine);
    color = mix(dark,paper,0.16+0.78*motif);
    color = mix(accent,color,feather);
    color = mix(color,dark,ink);
  } else if(pattern==1) {
    float qr = min(length(q),0.999);
    float rings = 0.5+0.5*cos(21.0*log((1.0+qr)/(1.0-qr)));
    color = mix(dark,paper,smoothstep(0.35,0.65,rings));
    color = mix(color,accent,ink);
  } else {
    color = mix(paper,accent,smoothstep(0.02,motifRadius*0.93,length(q)) * 0.55);
    color = mix(color,dark,ink);
  }
  if(grid) {
    float triangleEdge = min(q.y,abs(dot(q,vec2(-sin(tileAngle),cos(tileAngle)))))*2.0/(1.0-dot(q,q));
    color = mix(color,vec3(0.94,0.65,0.31),1.0-smoothstep(0.003,0.008,triangleEdge));
  }
  // Suppress subpixel detail toward the cusp and at grazing angles.
  float pixelSpan = max(length(dFdx(disk)),length(dFdy(disk)))*2.0/max(0.00001,1.0-dot(disk,disk));
  color = mix(color,mix(paper,dark,0.5),smoothstep(0.06,0.22,pixelSpan));
  return color;
}

void main() {
  vec2 uv = (gl_FragCoord.xy-0.5*resolution)/resolution.y;
  vec3 bg = vec3(0.073,0.093,0.095);
  bg += 0.018*exp(-2.0*dot(uv-vec2(0.0,0.1),uv-vec2(0.0,0.1)));
  vec3 target = vec3(0.0,1.12,0.0);
  vec3 ro = target + vec3(0.0,sin(elevation),cos(elevation))*zoom;
  vec3 forward = normalize(target-ro);
  vec3 right = normalize(cross(forward,vec3(0.0,1.0,0.0)));
  vec3 up = cross(right,forward);
  vec3 rd = normalize(forward*2.15+right*uv.x+up*uv.y);

  float t;
  if(!intersectSurface(ro,rd,t)) { gl_FragColor=vec4(bg,1.0); return; }
  vec3 p=ro+rd*t;
  float r=length(p.xz);
  vec3 n=vec3(normalize(p.xz).x*sqrt(max(0.0,1.0-r*r)),r,normalize(p.xz).y*sqrt(max(0.0,1.0-r*r)));
  if(dot(n,rd)>0.0) n=-n;
  vec3 color=pigment(p,n);
  vec3 light=normalize(vec3(-0.7,1.3,2.0));
  float diffuse=max(0.0,dot(n,light));
  float spec=pow(max(0.0,dot(n,normalize(light-rd))),50.0);
  color=color*(0.48+0.65*diffuse)+spec*0.10;
  color=pow(color,vec3(0.88));
  gl_FragColor=vec4(color,1.0);
}
`;
