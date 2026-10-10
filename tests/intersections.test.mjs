import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fragmentShader } from '../src/shader.ts';
import ts from 'typescript';

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

// Round each arithmetic operation to float32, including intermediate
// values. This reproduces cancellation that double-precision checks miss.
function float32(source) {
  const file=ts.createSourceFile('solver.js',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);
  const transform=context=>{
    const visit=node=>{
      const result=ts.visitEachChild(node,visit,context);
      const arithmetic=ts.isBinaryExpression(result) && [ts.SyntaxKind.PlusToken,ts.SyntaxKind.MinusToken,ts.SyntaxKind.AsteriskToken,ts.SyntaxKind.SlashToken].includes(result.operatorToken.kind);
      const mathCall=ts.isCallExpression(result) && ts.isPropertyAccessExpression(result.expression) && result.expression.expression.getText(file)==='Math';
      if(arithmetic || mathCall) return ts.factory.createCallExpression(ts.factory.createIdentifier('round'),undefined,[result]);
      return result;
    };
    return node=>ts.visitNode(node,visit);
  };
  const transformed=ts.transform(file,[transform]);
  const result=ts.createPrinter().printFile(transformed.transformed[0]);
  transformed.dispose();
  return result;
}
const roundedGap=new Function('p','round',float32(scalar(gapBody)));
const roundedBody=scalar(solverBody)
  .replace('ro.xz+rd.xz*closestDistance','ro.xz.map((x,i)=>x+rd.xz[i]*closestDistance)')
  .replace(/ro\+rd\*([a-zA-Z]+)/g,'ray($1)')
  .replace(/return true;/g,'return distance;')
  .replace(/return false;/g,'return null;')
  .replace('return distance >= 0.0;','return distance >= 0.0 ? distance : null;');
const roundedSolver=new Function('ro','rd','surfaceGap','dot','ray','clamp','round',float32(`let distance;${roundedBody}`));
const round=Math.fround;
const solveFloat32=(origin,direction)=>{
  const ro=vector(origin.map(round)),rd=vector(direction.map(round));
  const roundedDot=(a,b)=>a.reduce((sum,x,i)=>round(sum+round(x*b[i])),0);
  const ray=t=>vector(ro.map((x,i)=>round(x+round(rd[i]*t))));
  return roundedSolver(ro,rd,p=>roundedGap(p,round),roundedDot,ray,clamp,round);
};

test('float32 rays near the central axis and horizontal direction do not develop missing pixels',()=>{
  const offsets=[-0.03,-0.01,-0.003,-0.001,-0.0003,-0.0001,-0.00003,-0.00001,0,0.00001,0.00003,0.0001,0.0003,0.001,0.003,0.01,0.03];
  let misses=0;
  for(const elevation of [-0.12,0,0.05]) {
    const ro=vector([0,1.12+6*Math.sin(elevation),6*Math.cos(elevation)]);
    for(const u of offsets) for(const offset of offsets) {
      const v=2.15*Math.tan(elevation)+offset;
      const direction=[u,-Math.sin(elevation)*2.15+Math.cos(elevation)*v,-Math.cos(elevation)*2.15-Math.sin(elevation)*v];
      const norm=Math.hypot(...direction);
      const rd=vector(direction.map(x=>x/norm));
      const expected=solve(ro,rd);
      if(expected!==null && solveFloat32(ro,rd)===null) misses++;
    }
  }
  assert.equal(misses,0,'float32 rounding must not discard an intersection near the cross');
});

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
