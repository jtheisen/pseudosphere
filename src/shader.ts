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
uniform sampler2D fishAtlas;
uniform vec3 fishMirror;
uniform vec4 fishBounds;
uniform sampler2D fishSource;
uniform vec4 sourceRegistration;
uniform vec4 sourceDisk;
uniform sampler2D planarFish;
uniform vec4 planarBasis;
uniform vec2 planarO;
uniform vec2 planarP;
uniform vec2 planarQ;
uniform vec4 planarSpine;
uniform float planarSpineC;
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
    // Solve directly for s = r*r - closestRadiusSquared. Subtracting
    // those nearly equal radii after solving loses the central turning
    // point in float32, creating holes near horizontal and axial rays.
    // The stationary-point equation is A*s*s - C*s + E = 0.
    float A = aa+rd.y*rd.y;
    float C = aa*(1.0-closestRadiusSquared)-2.0*rd.y*rd.y*closestRadiusSquared;
    float E = rd.y*rd.y*closestRadiusSquared*closestRadiusSquared;
    float discriminant = C*C-4.0*A*E;
    if(C > 0.0 && discriminant >= 0.0) {
      float largeRoot = (C+sqrt(discriminant))/(2.0*A);
      float smallRoot = E/(A*largeRoot);
      for(int i=0;i<2;i++) {
        float s = i == 0 ? smallRoot : largeRoot;
        if(closestRadiusSquared+s > 1.0) continue;
        // Squaring the derivative introduces spurious roots on the
        // other side of closest approach; retain only the correct sign.
        float offset = sqrt(s/aa);
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

vec2 fishReflect(vec2 p) {
  vec2 d=p-fishMirror.xy;
  return fishMirror.xy+d*fishMirror.z/dot(d,d);
}

vec3 fishColor(float index) {
  if(palette==1) {
    if(index<0.5) return vec3(.81,.78,.66);
    if(index<1.5) return vec3(.34,.45,.40);
    if(index<2.5) return vec3(.43,.51,.54);
    return vec3(.66,.48,.36);
  }
  if(palette==2) {
    if(index<0.5) return vec3(.77,.87,.88);
    if(index<1.5) return vec3(.26,.58,.62);
    if(index<2.5) return vec3(.22,.38,.65);
    return vec3(.53,.67,.77);
  }
  if(index<0.5) return vec3(.84,.65,.16);
  if(index<1.5) return vec3(.23,.44,.34);
  if(index<2.5) return vec3(.22,.49,.67);
  return vec3(.66,.31,.19);
}

vec3 printPigment(int index) {
  if(pattern==5) {
    if(index==0) return vec3(.68,.29,.28);
    if(index==1) return vec3(.88,.61,.27);
    if(index==2) return vec3(.28,.58,.60);
    return vec3(.35,.49,.30);
  }
  if(index==0) return vec3(.88,.64,.22);
  if(index==1) return vec3(.55,.62,.39);
  if(index==2) return vec3(.29,.49,.53);
  return vec3(.62,.35,.24);
}

vec3 printColor(vec3 sampleColor,vec4 colors,float neighborLabel) {
  // Change only the pigment hue to follow the tiling's color permutation;
  // the photographed engraving, shading, black ink and white paper remain.
  vec3 chroma=sampleColor/max(.001,dot(sampleColor,vec3(1.)));
  float best=1.e10;
  int pigment=0;
  for(int i=0;i<4;i++) {
    if(pattern==5 && i==3) continue;
    vec3 reference=printPigment(i);
    vec3 difference=chroma-reference/dot(reference,vec3(1.));
    float error=dot(difference,difference);
    if(error<best) { best=error; pigment=i; }
  }
  // Drawing 123 has three colors around each fin. The hyperbolic right fin
  // has four fish, so neighboring source fragments need their new kite labels.
  int label=pattern==5&&pigment!=1?int(neighborLabel):pigment;
  float mapped=colors[label];
  vec3 target=palette==0?printPigment(int(mapped)):fishColor(mapped);
  vec3 recolored=sampleColor*target/printPigment(pigment);
  float high=max(sampleColor.r,max(sampleColor.g,sampleColor.b));
  float low=min(sampleColor.r,min(sampleColor.g,sampleColor.b));
  float mask=smoothstep(.09,.22,high-low)*smoothstep(.28,.50,high)*(1.-smoothstep(.50,.70,low));
  return mix(sampleColor,recolored,mask);
}

vec2 planarUv(vec2 q,bool otherHalf) {
  vec2 k=2.*q/(1.+dot(q,q));
  vec2 weights=mat2(planarBasis.x,planarBasis.y,planarBasis.z,planarBasis.w)*k;
  float layer=weights.x+weights.y;
  float u=weights.x/max(layer,1.e-7);
  float A=planarSpine.x*layer;
  float B=planarSpine.w+planarSpine.y*layer;
  float C=planarSpineC+planarSpine.z*layer;
  float root=sqrt(max(0.,B*B-4.*A*C));
  float spine=B>=0.?-2.*C/(B+root):(-B+root)/(2.*A);
  float f=u*(1.-spine)/(spine+(1.-2.*spine)*u);
  vec2 uv=planarO+layer*mix(planarQ-planarO,planarP-planarO,f);
  if(otherHalf) uv.y=2.*planarP.y-uv.y;
  return uv;
}

vec3 fishPigment(vec2 disk,float pixelSpan) {
  vec2 q=disk;
  vec4 colors=vec4(0.,1.,2.,3.);
  bool odd=false;
  vec2 upper=vec2(-0.5,0.866025403784);
  vec2 lower=vec2(0.5,0.866025403784);
  for(int i=0;i<100;i++) {
    float a=dot(q,upper),b=dot(q,lower);
    if(a>0.) {
      q-=2.*a*upper;
      colors=colors.yxwz; // (01)(23), a 4-fold geometric rotation.
      odd=!odd;
    } else if(b<0.) {
      q-=2.*b*lower;
      // Complete each reflection by the PQ mirror to retain chirality.
      if(odd) colors=colors.xwyz; // inverse of the other branch
      else colors=colors.xzwy;
      odd=!odd;
    } else if(dot(q-fishMirror.xy,q-fishMirror.xy)<fishMirror.z) {
      q=fishReflect(q); odd=!odd;
    } else break;
  }
  vec2 triangle=q;
  if(odd) q=fishReflect(q);
  vec3 color;
  if(pattern==5) {
    vec2 imageUv=planarUv(triangle,odd);
    // Estimate the warp's local Jacobian without taking screen derivatives
    // across a folding seam. Sampling remains at the source's native size.
    const float h=.0001;
    vec2 jx=(planarUv(triangle+vec2(h,0.),odd)-imageUv)/h;
    vec2 jy=(planarUv(triangle+vec2(0.,h),odd)-imageUv)/h;
    float step=.5*pixelSpan*(1.-dot(triangle,triangle));
    float neighbor=imageUv.x>planarO.x?0.:(odd?3.:2.);
    color=printColor(texture2DGradEXT(planarFish,imageUv,jx*step,jy*step).rgb,colors,neighbor);
  } else if(pattern==4) {
    vec2 origin=sourceRegistration.xy;
    vec2 d=q-origin;
    vec2 denominator=vec2(1.-dot(origin,q),origin.y*q.x-origin.x*q.y);
    vec2 z=vec2(dot(d,denominator),d.y*denominator.x-d.x*denominator.y)/dot(denominator,denominator);
    z=mat2(sourceRegistration.z,sourceRegistration.w,-sourceRegistration.w,sourceRegistration.z)*z;
    vec2 imageUv=sourceDisk.xy+z*sourceDisk.zw;
    vec2 imageSpan=.5*pixelSpan*(1.-dot(z,z))*sourceDisk.zw;
    color=printColor(texture2DGradEXT(fishSource,imageUv,vec2(imageSpan.x,0.),vec2(0.,imageSpan.y)).rgb,colors,-1.);
  } else {
    vec2 uv=(q-fishBounds.xy)/(fishBounds.zw-fishBounds.xy);
    // Explicit gradients avoid spurious mip levels at reflection seams.
    // The conformal metric supplies the local footprint before folding.
    vec2 span=0.5*pixelSpan*(1.-dot(q,q))/(fishBounds.zw-fishBounds.xy);
    uv.x*=0.5; span.x*=0.5;
    vec3 data=texture2DGradEXT(fishAtlas,uv,vec2(span.x,0.),vec2(0.,span.y)).rgb;
    float white=min(data.r,min(data.g,data.b));
    float strength=max(data.r,max(data.g,data.b));
    vec3 weights=data-vec3(white);
    color=(weights.r*fishColor(colors.x)+weights.g*fishColor(colors.y)+weights.b*fishColor(colors.z)+white*fishColor(colors.w))/max(strength,0.001);
    float engraving=texture2DGradEXT(fishAtlas,uv+vec2(.5,0.),vec2(span.x,0.),vec2(0.,span.y)).r;
    color=mix(vec3(.045,.055,.05),color,min(1.,engraving*(255./128.)));
    color=mix(color,vec3(.95,.91,.80),max(0.,(engraving-128./255.)*(255./127.)));
  }
  if(grid) {
    float edge=min(abs(dot(triangle,upper)),abs(dot(triangle,lower)));
    edge=min(edge,abs(length(triangle-fishMirror.xy)-sqrt(fishMirror.z)));
    edge*=2./max(.00001,1.-dot(triangle,triangle));
    color=mix(color,vec3(.94,.65,.31),1.-smoothstep(.003,.008,edge));
  }
  vec3 average=pattern>=4&&palette==0?(printPigment(0)+printPigment(1)+printPigment(2)+printPigment(3))*.25:(fishColor(0.)+fishColor(1.)+fishColor(2.)+fishColor(3.))*.25;
  return mix(color,average,smoothstep(.06,.22,pixelSpan));
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
  float pixelSpan = max(length(dFdx(disk)),length(dFdy(disk)))*2.0/max(0.00001,1.0-dot(disk,disk));
  if(pattern>=3 && pattern<=5) return fishPigment(disk,pixelSpan);
  vec3 folded = tile(disk);
  vec2 q = folded.xy;
  float cx = mirrorCenter;
  float circleRadius = sqrt(cx*cx-1.0);
  // Local distance to the polygon's side, using the conformal factor.
  float edge = abs(length(q-vec2(cx,0.0))-circleRadius)*2.0/max(0.00001,1.0-dot(q,q));
  float ink = 1.0-smoothstep(0.007,0.018,edge);
  vec3 color;
  if(pattern==0) {
    // In Klein coordinates the square's geodesic sides are straight,
    // at x/y = +/-1/cx. Fit nine checker cells across the whole tile.
    vec2 a = q/motifRadius;
    float angle = atan(a.y,a.x);
    float rad = length(a);
    vec2 square = 2.0*q/(1.0+dot(q,q))*cx;
    vec2 checks = floor((square+1.0)*4.5);
    float checker = mod(checks.x+checks.y,2.0);
    color = mix(dark,paper,checker);
    // Preserve the original narrow brown spokes, rotated half a symmetry
    // angle so they lie on the wedge boundaries rather than its bisector.
    float spine = min(angle,tileAngle-angle)*rad;
    float feather = smoothstep(0.02,0.04,spine);
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
