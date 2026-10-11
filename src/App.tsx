import { useCallback, useEffect, useState } from 'react';
import { Grid2X2, Info, MoveHorizontal, Pause, Play, RotateCcw, SlidersHorizontal, X } from 'lucide-react';
import Viewer from './Viewer';
import type { ViewSettings } from './Viewer';
import type { GpuTiming } from './GpuTimer';

const initial: ViewSettings = { turn: 0.3, positionScale: 0.65, tiling: 0, zoom: 6.0, elevation: 0.26, pattern: 5, palette: 0, grid: false, playing: false };
const patterns = [
  { id: 0, urlId: 'procedural', name: 'Procedural', sub: 'Mirrored ornament', className: 'feather' },
  { id: 6, urlId: 'procedural-plain', name: 'Procedural (plain)', sub: 'Six squares · continuous geodesics', className: 'squares' },
  { id: 5, urlId: 'escher-e123', name: 'Escher E123', sub: 'Drawing 123 · warped to (4, 3, 3)', className: 'fish-planar' },
];

function PatternThumbnail({ id, className }: { id: number; className: string }) {
  if(id!==0 && id!==6) return <span className={`pattern-thumb ${className}`}/>;
  const boundary = 'M2 2 Q18.5 10 35 2 Q27 18.5 35 35 Q18.5 27 2 35 Q10 18.5 2 2Z';
  return <svg className="pattern-thumb" viewBox="0 0 37 37" aria-hidden="true" style={{background:'#d9cbaa'}}>
    <defs>
      <pattern id={`checker-${id}`} width="8.25" height="8.25" patternUnits="userSpaceOnUse" x="2" y="2"><rect width="8.25" height="8.25" fill="#d9cbaa"/><path d="M0 0H4.125V4.125H0Z M4.125 4.125H8.25V8.25H4.125Z" fill="#254b4c"/></pattern>
      <clipPath id={`tile-${id}`}><path d={boundary}/></clipPath>
      <radialGradient id="geometry-fill"><stop stopColor="#d9cbaa"/><stop offset="1" stopColor="#b35a33"/></radialGradient>
    </defs>
    <path d={boundary} fill={id===0?'url(#checker-0)':'url(#geometry-fill)'}/>
    {id===0 && <g clipPath="url(#tile-0)" stroke="#b35a33" strokeWidth="1"><path d="M0 18.5H37 M18.5 0V37 M0 0L37 37 M0 37L37 0"/></g>}
    <path d={boundary} fill="none" stroke="#254b4c" strokeWidth="1.3"/>
  </svg>;
}

function locationPattern() {
  const value = new URL(window.location.href).searchParams.get('pattern');
  // Accept old numeric links, but always write the stable identifier.
  return patterns.find(pattern=>pattern.urlId===value || String(pattern.id)===value)?.id ?? initial.pattern;
}

function Slider({ label, value, min, max, step, display, onChange }: { label: string; value: number; min: number; max: number; step: number; display: string; onChange: (value: number) => void }) {
  return <label className="slider"><span>{label}<b>{display}</b></span><input type="range" min={min} max={max} step={step} value={value} onChange={e=>onChange(Number(e.target.value))} /></label>;
}

export default function App() {
  const [settings, setSettings] = useState(()=>({...initial,pattern:locationPattern()}));
  useEffect(()=>{
    const url = new URL(window.location.href);
    url.searchParams.set('pattern',patterns.find(pattern=>pattern.id===settings.pattern)!.urlId);
    window.history.replaceState(window.history.state,'',url);
  },[settings.pattern]);
  useEffect(()=>{
    const restore = ()=>setSettings(s=>({...s,pattern:locationPattern()}));
    window.addEventListener('popstate',restore);
    return ()=>window.removeEventListener('popstate',restore);
  },[]);
  const [error,setError] = useState('');
  const [about,setAbout] = useState(false);
  const [controlsOpen,setControlsOpen] = useState(true);
  useEffect(()=>{
    const dismiss = (event: KeyboardEvent)=>{ if(event.key==='Escape') { setAbout(false); setControlsOpen(false); } };
    window.addEventListener('keydown',dismiss);
    return ()=>window.removeEventListener('keydown',dismiss);
  },[]);
  const [timing,setTiming] = useState<GpuTiming | null>(null);
  const [motionReset,setMotionReset] = useState(0);
  const update = <K extends keyof ViewSettings>(key: K, value: ViewSettings[K]) => {
    if(key==='elevation' || key==='playing') setMotionReset(v=>v+1);
    setSettings(s=>({...s,[key]:value}));
  };
  const resetView = () => { setMotionReset(v=>v+1); setSettings(initial); };
  const onOrbit = useCallback((turn: number, tilt: number)=>setSettings(s=>({...s,turn:s.turn+turn,elevation:Math.max(-1.55,Math.min(1.55,s.elevation+tilt))})),[]);
  const onZoom = useCallback((delta: number)=>setSettings(s=>({...s,zoom:Math.min(10,Math.max(3.5,s.zoom+delta))})),[]);
  const turns = (settings.turn-initial.turn)/(Math.PI*2);
  return <div className="app">
    <header className="app-toolbar"><div className="brand">Pseudosphere<span className="brand-dot">.</span><span className="brand-caption">Hyperbolic explorer</span></div><div className="toolbar-actions"><button className="icon-button" title="About the geometry" aria-label="About the geometry" aria-expanded={about} onClick={()=>setAbout(!about)}><Info size={18}/></button><button className={`icon-button ${controlsOpen?'active':''}`} title="Toggle controls" aria-label="Toggle controls" aria-expanded={controlsOpen} aria-controls="viewer-controls" onClick={()=>setControlsOpen(!controlsOpen)}><SlidersHorizontal size={18}/></button></div></header>
    <main>
      <div className="workspace">
        <section className="stage">
          <Viewer settings={settings} motionReset={motionReset} onOrbit={onOrbit} onZoom={onZoom} onError={setError} onTiming={setTiming}/>
          <div className="gpu-metric" aria-label="GPU benchmark"><span>GPU · SURFACE RENDER</span><b>{timing?.status==='unsupported'?'Unavailable':timing?.status==='paused'?'Hold still':timing?.renderPercent!=null?`${timing.renderPercent.toFixed(1)}% of frame`:'Settling…'}</b>{timing?.meanMs!=null && timing.frameMs!=null && <small>{timing.meanMs.toFixed(2)} ms / {timing.frameMs.toFixed(2)} ms frame · {Math.round(1000/timing.frameMs)} fps cadence</small>}<small>{timing?.meanMs!=null?`p95 ${timing.p95Ms!.toFixed(2)} ms · ${timing.samples}/120 samples`:timing?.status==='unsupported'?'GPU timer extension not supported':'Render time per frame'}{timing?` · ${timing.width} × ${timing.height}`:''}</small></div>
          {error && <div className="error" role="alert">{error}</div>}
          <div className="stage-bottom"><div className="gesture"><MoveHorizontal size={17}/><span>Drag to turn & tilt · Scroll to zoom</span></div><div className="view-status"><span>K = −1</span><span>{(turns*360).toFixed(1)}°</span><button className="icon-button" title="Reset view" aria-label="Reset view" onClick={resetView}><RotateCcw size={17}/></button></div></div>
        </section>
        <aside id="viewer-controls" className="controls" aria-label="Viewer controls" hidden={!controlsOpen}><div className="panel-title">Appearance <button className="icon-button" aria-label="Close controls" onClick={()=>setControlsOpen(false)}><X size={16}/></button></div>
          <div className="control-section"><div className="section-label">01 <span>THE PATTERN</span></div><div className="pattern-list">{patterns.map(({id:i,...p})=><button key={p.name} className={`pattern-option ${settings.pattern===i?'selected':''}`} onClick={()=>update('pattern',i)}><PatternThumbnail id={i} className={p.className}/><span className="pattern-copy"><b>{p.name}</b><small>{p.sub}</small></span><span className="radio"><i/></span></button>)}</div><p className="control-note">{settings.pattern===5?'Planar artwork warped into (4, 3, 3), at native resolution.':'Six squares at each vertex; opposite edges continue straight.'}</p></div>
          <div className="control-section"><div className="section-label">02 <span>THE PALETTE</span></div><div className="palettes">{[['#d9cbaa','#254b4c','#b35a33'],['#e0ded0','#30383b','#7b877d'],['#d6dfe0','#294576','#6b9eaf']].map((colors,i)=><button key={i} aria-label={['Ochre and teal palette','Graphite palette','Glacial blue palette'][i]} className={settings.palette===i?'selected':''} onClick={()=>update('palette',i)}>{colors.map(c=><span key={c} style={{background:c}}/>)}</button>)}</div></div>
          <div className="control-section"><div className="section-label">03 <span>THE SURFACE</span></div><Slider label="Pattern position" value={settings.positionScale} min={0.25} max={1.8} step={0.01} display={settings.positionScale.toFixed(2)} onChange={v=>update('positionScale',v)}/><p className="control-note position-note">Moves the pattern; tile size stays fixed.</p><Slider label="Camera tilt" value={settings.elevation} min={-1.55} max={1.55} step={0.01} display={Math.round(settings.elevation*180/Math.PI)+'°'} onChange={v=>update('elevation',v)}/><button className="toggle-row" onClick={()=>update('grid',!settings.grid)} aria-pressed={settings.grid}><span><Grid2X2 size={15}/> Show reflection domains</span><span className={`switch ${settings.grid?'on':''}`}><i/></span></button></div>
          <button className={`motion-button ${settings.playing?'active':''}`} onClick={()=>update('playing',!settings.playing)}>{settings.playing?<Pause size={16}/>:<Play size={16}/>} {settings.playing?'Pause the journey':'Let it turn'}<span>{settings.playing?'IN MOTION':'AUTO ROTATE'}</span></button>
        </aside>
      </div>
      {about && <section className="about" role="dialog" aria-labelledby="about-title"><div className="panel-title"><h2 id="about-title">Behind the surface</h2><button className="icon-button" aria-label="Close about" onClick={()=>setAbout(false)}><X size={18}/></button></div><p>The trumpet is a tractrix revolved into a pseudosphere, with constant Gaussian curvature K = −1.</p><p>The procedural patterns use geodesic {'{4, 6}'} squares. Escher E123 maps the planar fish drawing into (4, 3, 3) hyperbolic geometry.</p><p>Rotation is unwrapped: a full turn reveals another region of the pattern. The torn seam stays at the back. The cusp extends infinitely; tilt toward −89° to see its vanishing point.</p><p>Pattern position moves the tiling without changing its intrinsic scale.</p></section>}
    </main>
  </div>;
}
