import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fragmentShader } from '../src/shader.ts';

// Execute the actual scalar GLSL solver in JavaScript. This checks the
// intersection math without a browser; GPU float precision is separate.
class Vector extends Array {
  get y() { return this[1]; }
  get xz() { return [this[0],this[2]]; }
}
const vector = values=>new Vector(...values);
const dot = (a,b)=>a.reduce((sum,x,i)=>sum+x*b[i],0);
const clamp = (x,a,b)=>Math.min(b,Math.max(a,x));
const scalar = source=>source
  .replace(/\b(float|vec3|vec2|int)\b/g,'let')
  .replace(/\b(sqrt|min|max|log)\(/g,'Math.$1(')
  .replace(/length\((p|ro).xz\)/g,'Math.hypot(...$1.xz)');
const gapBody = fragmentShader.match(/float surfaceGap\(vec3 p\) \{([\s\S]*?)\n\}/)[1];
const surfaceGap = new Function('p',scalar(gapBody));
const solverBody = fragmentShader.match(/bool intersectSurface\(vec3 ro, vec3 rd, out float distance\) \{([\s\S]*?)\n\}/)[1];
const solver = new Function('ro','rd','surfaceGap','dot','ray','clamp',`let distance;${scalar(solverBody)
  .replace('ro.xz+rd.xz*closestDistance','ro.xz.map((x,i)=>x+rd.xz[i]*closestDistance)')
  .replace(/ro\+rd\*([a-zA-Z]+)/g,'ray($1)')
  .replace(/return true;/g,'return distance;')
  .replace(/return false;/g,'return null;')
  .replace('return distance >= 0.0;','return distance >= 0.0 ? distance : null;')}`);
const solve = (ro,rd)=>solver(ro,rd,surfaceGap,dot,t=>vector(ro.map((x,i)=>x+rd[i]*t)),clamp);

test('rays aimed at the rim, overlapping projections, and cusp find a hit no farther than their target',()=>{
  for(const elevation of [0.26,0.85,1.1,1.3,1.5]) {
    const ro=vector([0,1.12+6*Math.sin(elevation),6*Math.cos(elevation)]);
    for(const t of [0.001,0.01,0.05,0.1,0.2,0.4,0.8,1.2,2,3,5]) {
      for(let j=0;j<120;j++) {
        const angle=j*Math.PI/60;
        const point=[Math.sin(angle)/Math.cosh(t),t-Math.tanh(t),Math.cos(angle)/Math.cosh(t)];
        const delta=point.map((x,i)=>x-ro[i]);
        const targetDistance=Math.hypot(...delta);
        const rd=vector(delta.map(x=>x/targetDistance));
        const hit=solve(ro,rd);
        const context=`tilt=${elevation}, tractrix parameter=${t}, angle=${angle}`;
        assert.notEqual(hit,null,context);
        assert.ok(hit<=targetDistance+1e-7,`missed nearer surface: ${context}`);
        const intersection=vector(ro.map((x,i)=>x+rd[i]*hit));
        assert.ok(Math.abs(surfaceGap(intersection))<2e-6,`off-surface hit: ${context}`);
      }
    }
  }
});

test('axial and horizontal rays are handled without marching',()=>{
  const height=Math.acosh(2)-Math.sqrt(0.75);
  assert.ok(Math.abs(solve(vector([0.5,3,0]),vector([0,-1,0]))-(3-height))<1e-12);
  assert.equal(solve(vector([0,3,0]),vector([0,1,0])),null);
  assert.equal(solve(vector([2,3,0]),vector([0,-1,0])),null);
  assert.ok(solve(vector([0,1,3]),vector([0,0,-1]))>0);
  assert.equal(solve(vector([2,1,3]),vector([0,0,-1])),null);
});
