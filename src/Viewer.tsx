import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { fragmentShader, vertexShader } from './shader';
import { reflectionDomain } from './tilings';
import { GpuTimer } from './GpuTimer';
import type { GpuTiming } from './GpuTimer';

export interface ViewSettings {
  turn: number; positionScale: number; zoom: number; tiling: number;
  elevation: number; pattern: number; palette: number; grid: boolean; playing: boolean;
}

export default function Viewer({ settings, motionReset, onOrbit, onZoom, onError, onTiming }: {
  settings: ViewSettings; motionReset: number; onOrbit: (turn: number, tilt: number) => void;
  onZoom: (delta: number) => void; onError: (message: string) => void;
  onTiming: (timing: GpuTiming) => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const latest = useRef(settings);
  const reset = useRef(motionReset);
  const callbacks = useRef({ onOrbit, onZoom, onError, onTiming });
  latest.current = settings;
  reset.current = motionReset;
  callbacks.current = { onOrbit, onZoom, onError, onTiming };

  useEffect(() => {
    const element = host.current!;
    let renderer: THREE.WebGLRenderer;
    try { renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' }); }
    catch { callbacks.current.onError('This viewer needs a browser with WebGL enabled.'); return; }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    element.appendChild(renderer.domElement);
    const gpuTimer = new GpuTimer(renderer.getContext() as WebGL2RenderingContext, timing=>callbacks.current.onTiming(timing));
    const uniforms = {
      resolution: { value: new THREE.Vector2() }, turn: { value: 0 },
      positionScale: { value: 0.65 }, zoom: { value: 5.8 },
      tileAngle: { value: 0 }, mirrorCenter: { value: 0 }, motifRadius: { value: 0 },
      elevation: { value: 0.25 }, pattern: { value: 0 }, palette: { value: 0 }, grid: { value: false },
    };
    const material = new THREE.ShaderMaterial({ vertexShader, fragmentShader, uniforms });
    renderer.debug.onShaderError = (_gl, _program, _vertex, fragment) => {
      callbacks.current.onError('The surface shader could not compile in this browser.');
      console.error(_gl.getShaderInfoLog(fragment));
    };
    const geometry = new THREE.PlaneGeometry(2, 2);
    const scene = new THREE.Scene();
    // Only a screen quad: the trumpet has no mesh or tessellated geometry.
    scene.add(new THREE.Mesh(geometry, material));
    const camera = new THREE.Camera();
    const resize = new ResizeObserver(() => {
      renderer.setSize(element.clientWidth, element.clientHeight);
      renderer.getDrawingBufferSize(uniforms.resolution.value);
    });
    resize.observe(element);
    let frame = 0;
    let last = performance.now();
    let drag: { id: number; x: number; y: number; time: number; movedAt: number } | null = null;
    let turnVelocity = 0;
    let tiltVelocity = 0;
    let lastReset = reset.current;
    const stopMomentum = () => { turnVelocity=0; tiltVelocity=0; };
    const render = (now: number) => {
      const dt = Math.min((now-last)/1000, 0.05);
      last = now;
      const s = latest.current;
      if(lastReset !== reset.current) { stopMomentum(); lastReset=reset.current; }
      if(document.hidden) stopMomentum();
      if(!drag) {
        if((s.elevation >= 1.55 && tiltVelocity > 0) || (s.elevation <= -1.55 && tiltVelocity < 0)) tiltVelocity=0;
        const turnDecay = Math.exp(-3.5*dt);
        const tiltDecay = Math.exp(-18*dt);
        const turnDelta = turnVelocity*(1-turnDecay)/3.5;
        const tiltDelta = tiltVelocity*(1-tiltDecay)/18;
        turnVelocity *= turnDecay; tiltVelocity *= tiltDecay;
        if(Math.abs(turnVelocity)<0.002) turnVelocity=0;
        if(Math.abs(tiltVelocity)<0.002) tiltVelocity=0;
        if(turnDelta || tiltDelta || s.playing) callbacks.current.onOrbit(turnDelta+(s.playing?dt*0.15:0),tiltDelta);
      }
      for(const key of ['turn','positionScale','zoom','elevation','pattern','palette','grid'] as const) {
        uniforms[key].value = s[key] as never;
      }
      const domain = reflectionDomain(s.tiling);
      uniforms.tileAngle.value = domain.angle;
      uniforms.mirrorCenter.value = domain.mirrorCenter;
      uniforms.motifRadius.value = domain.motifRadius;
      const size = uniforms.resolution.value;
      const paused = s.playing || !!drag || turnVelocity!==0 || tiltVelocity!==0 || document.hidden;
      const timingKey = JSON.stringify([s.turn,s.positionScale,s.zoom,s.tiling,s.elevation,s.pattern,s.palette,s.grid,paused]);
      gpuTimer.begin(timingKey,paused,size.x,size.y,now);
      try { renderer.render(scene, camera); }
      finally { gpuTimer.end(); }
      frame = requestAnimationFrame(render);
    };
    frame = requestAnimationFrame(render);
    const canvas = renderer.domElement;
    const down = (e: PointerEvent) => {
      if(!e.isPrimary || e.button!==0 || drag) return;
      stopMomentum();
      const now=performance.now();
      drag={id:e.pointerId,x:e.clientX,y:e.clientY,time:now,movedAt:now};
      canvas.setPointerCapture(e.pointerId); canvas.classList.add('dragging');
    };
    const move = (e: PointerEvent) => {
      if(!drag || drag.id!==e.pointerId) return;
      const now=performance.now();
      const elapsed=Math.max((now-drag.time)/1000,0.008);
      const turnDelta=(e.clientX-drag.x)*0.007;
      const tiltDelta=(e.clientY-drag.y)*0.005;
      callbacks.current.onOrbit(turnDelta,tiltDelta);
      const blend=1-Math.exp(-elapsed/0.04);
      turnVelocity+=(Math.max(-8,Math.min(8,turnDelta/elapsed))-turnVelocity)*blend;
      tiltVelocity+=(Math.max(-2.5,Math.min(2.5,tiltDelta/elapsed))-tiltVelocity)*blend;
      if(turnDelta || tiltDelta) drag.movedAt=now;
      drag.x=e.clientX; drag.y=e.clientY; drag.time=now;
    };
    const end = (e: PointerEvent) => {
      if(!drag || e.pointerId!==drag.id) return;
      if(e.type!=='pointerup' || performance.now()-drag.movedAt>100) stopMomentum();
      const id=drag.id;
      drag=null; canvas.classList.remove('dragging');
      if(canvas.hasPointerCapture(id)) canvas.releasePointerCapture(id);
    };
    const blur = () => { stopMomentum(); drag=null; canvas.classList.remove('dragging'); };
    const wheel = (e: WheelEvent) => { e.preventDefault(); callbacks.current.onZoom(e.deltaY*0.004); };
    canvas.addEventListener('pointerdown',down);
    canvas.addEventListener('pointermove',move);
    canvas.addEventListener('pointerup',end);
    canvas.addEventListener('pointercancel',end);
    canvas.addEventListener('lostpointercapture',end);
    window.addEventListener('blur',blur);
    canvas.addEventListener('wheel',wheel,{passive:false});
    return () => {
      cancelAnimationFrame(frame); resize.disconnect();
      canvas.removeEventListener('pointerdown',down); canvas.removeEventListener('pointermove',move);
      canvas.removeEventListener('pointerup',end); canvas.removeEventListener('pointercancel',end); canvas.removeEventListener('wheel',wheel);
      canvas.removeEventListener('lostpointercapture',end); window.removeEventListener('blur',blur);
      gpuTimer.dispose(); geometry.dispose(); material.dispose(); renderer.dispose(); canvas.remove();
    };
  }, []);
  return <div className="render-host" ref={host} aria-label="Interactive analytic pseudosphere. Drag horizontally to turn, vertically to tilt, and scroll to zoom." />;
}
