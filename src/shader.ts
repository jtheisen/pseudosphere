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

// Revolved tractrix: r = sech(t), h = t - tanh(t), a = 1.
float surfaceRadius(float height) {
  if(height <= 0.0) return 1.0;
  float t;
  if(height < 0.0001) {
    // Inverse series avoids cancellation in t - tanh(t) near the rim.
    float w = pow(3.0*height,1.0/3.0);
    t = w*(1.0+w*w*(2.0/15.0+w*w*3.0/175.0));
  } else {
    t = height < 1.0 ? pow(3.0*height,1.0/3.0) : height+1.0;
    for(int i=0;i<8;i++) {
      float th = tanh(t);
      t -= (t-th-height)/(th*th);
    }
  }
  float e = exp(-t);
  return 2.0*e/(1.0+e*e);
}
float field(vec3 p) { return length(p.xz)-surfaceRadius(p.y); }

// Adaptive ray marching, with sign-change bisection to refine crossings.
bool intersectSurface(vec3 ro, vec3 rd, out float distance) {
  float aa = dot(rd.xz,rd.xz);
  if(aa == 0.0) return false;
  float bb = dot(ro.xz,rd.xz);
  float cc = dot(ro.xz,ro.xz)-1.0;
  float disc = bb*bb-aa*cc;
  if(disc < 0.0) return false;
  float lo = max(0.0,(-bb-sqrt(disc))/aa);
  float hi = (-bb+sqrt(disc))/aa;
  if(rd.y > 0.0) lo=max(lo,-ro.y/rd.y);
  else if(rd.y < 0.0) hi=min(hi,-ro.y/rd.y);
  else if(ro.y < 0.0) return false;
  if(lo > hi) return false;
  float t = lo+0.00001;
  float prevT = t;
  float prevF = field(ro+rd*t);
  for(int i=0;i<240;i++) {
    vec3 p = ro+rd*t;
    float f = field(p);
    float radius = surfaceRadius(p.y);
    float d = abs(f)*sqrt(max(0.0,1.0-radius*radius));
    float pixelWidth = t/(2.15*resolution.y);
    if(f*prevF < 0.0) {
      float a = prevT; float b = t; float fa = prevF;
      for(int j=0;j<16;j++) {
        float m = (a+b)*0.5; float fm = field(ro+rd*m);
        if(fa*fm > 0.0) { a=m; fa=fm; } else { b=m; }
      }
      distance = (a+b)*0.5;
      return true;
    }
    if(abs(f) < max(0.000001,pixelWidth*0.05)) {
      distance = t;
      return true;
    }
    prevT=t; prevF=f;
    t += max(max(0.000001,pixelWidth*0.1),d*0.45);
    if(t > hi) break;
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
