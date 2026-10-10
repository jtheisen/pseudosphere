import { useCallback, useState } from 'react';
import { ArrowUpRight, ChevronDown, Expand, Grid2X2, MoveHorizontal, Pause, Play, RotateCcw, Sparkles } from 'lucide-react';
import Viewer from './Viewer';
import type { ViewSettings } from './Viewer';
import { tilings } from './tilings';
import type { GpuTiming } from './GpuTimer';

const initial: ViewSettings = { turn: 0.3, positionScale: 0.65, tiling: 0, zoom: 6.0, elevation: 0.26, pattern: 0, palette: 0, grid: false, playing: false };
const patterns = [
  { name: 'Feather study', sub: 'Mirrored ornament', className: 'feather' },
  { name: 'Concentric', sub: 'Hyperbolic rosettes', className: 'rings' },
  { name: 'Pure geometry', sub: 'Regular hyperbolic polygons', className: 'squares' },
];

function Slider({ label, value, min, max, step, display, onChange }: { label: string; value: number; min: number; max: number; step: number; display: string; onChange: (value: number) => void }) {
  return <label className="slider"><span>{label}<b>{display}</b></span><input type="range" min={min} max={max} step={step} value={value} onChange={e=>onChange(Number(e.target.value))} /></label>;
}

export default function App() {
  const [settings, setSettings] = useState(initial);
  const [error,setError] = useState('');
  const [about,setAbout] = useState(false);
  const [expanded,setExpanded] = useState(false);
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
  return <div className={`app ${expanded?'expanded':''}`}>
    <header><a className="brand" href="/" aria-label="Traktrix home"><span className="brand-mark">τ</span>traktrix<span className="brand-dot">.</span></a><div className="header-right"><span className="header-description">AN EXPLORATION OF CURVED SPACE</span><button className="about-link" onClick={()=>setAbout(!about)}>About the study <ArrowUpRight size={15}/></button></div></header>
    <main>
      <section className="intro"><div className="eyebrow"><span/> GEOMETRY / STUDY 001</div><h1>A different kind<br/>of <em>infinity.</em></h1><p>A tractrix, revolved. A hyperbolic world,<br/>revealed one turn at a time.</p></section>
      <div className="workspace">
        <section className="stage">
          <div className="stage-heading"><span className="live-dot"/> PSEUDOSPHERE <span className="stage-caption">Constant negative curvature</span></div>
          <Viewer settings={settings} motionReset={motionReset} onOrbit={onOrbit} onZoom={onZoom} onError={setError} onTiming={setTiming}/>
          <div className="gpu-metric" aria-label="GPU benchmark"><span>GPU · SURFACE RENDER</span><b>{timing?.status==='unsupported'?'Unavailable':timing?.status==='paused'?'Hold still':timing?.meanMs!=null?`${timing.meanMs.toFixed(2)} ms`:'Settling…'}</b><small>{timing?.meanMs!=null?`p95 ${timing.p95Ms!.toFixed(2)} ms · ${timing.samples}/120 samples`:timing?.status==='unsupported'?'GPU timer extension not supported':'Render time per frame'}{timing?` · ${timing.width} × ${timing.height}`:''}</small></div>
          {error && <div className="error" role="alert">{error}</div>}
          <div className="axis"><span>y</span><i/><span className="axis-x">x</span><span className="axis-z">z</span></div>
          <div className="stage-equation">K = −1<span>EVERYWHERE ON THE SURFACE</span></div>
          <div className="stage-bottom"><div className="gesture"><MoveHorizontal size={17}/><span>Drag to turn & tilt <i>·</i> Scroll to zoom</span></div><div className="stage-buttons"><button title="Reset view" aria-label="Reset view" onClick={resetView}><RotateCcw size={16}/></button><button title={expanded?'Restore layout':'Expand viewer'} aria-label={expanded?'Restore layout':'Expand viewer'} onClick={()=>setExpanded(!expanded)}><Expand size={16}/></button></div></div>
        </section>
        <aside className="controls"><div className="panel-title">Make it your own <Sparkles size={17}/></div>
          <div className="control-section"><div className="section-label">01 <span>THE PATTERN</span></div><label className="tiling-select">Tessellation<select value={settings.tiling} onChange={e=>update('tiling',Number(e.target.value))}>{tilings.map((t,i)=><option key={t.name} value={i}>{t.name}</option>)}</select></label><div className="pattern-list">{patterns.map((p,i)=><button key={p.name} className={`pattern-option ${settings.pattern===i?'selected':''}`} onClick={()=>update('pattern',i)}><span className={`pattern-thumb ${p.className}`}/><span className="pattern-copy"><b>{p.name}</b><small>{p.sub}</small></span><span className="radio"><i/></span></button>)}</div><p className="control-note">{settings.tiling===0?'Five squares':'Seven triangles'} at every vertex.</p></div>
          <div className="control-section"><div className="section-label">02 <span>THE PALETTE</span></div><div className="palettes">{[['#d9cbaa','#254b4c','#b35a33'],['#e0ded0','#30383b','#7b877d'],['#d6dfe0','#294576','#6b9eaf']].map((colors,i)=><button key={i} aria-label={['Ochre and teal palette','Graphite palette','Glacial blue palette'][i]} className={settings.palette===i?'selected':''} onClick={()=>update('palette',i)}>{colors.map(c=><span key={c} style={{background:c}}/>)}</button>)}</div></div>
          <div className="control-section"><div className="section-label">03 <span>THE SURFACE</span></div><Slider label="Pattern position" value={settings.positionScale} min={0.25} max={1.8} step={0.01} display={settings.positionScale.toFixed(2)} onChange={v=>update('positionScale',v)}/><p className="control-note position-note">Moves the pattern; tile size stays fixed.</p><Slider label="Camera tilt" value={settings.elevation} min={-1.55} max={1.55} step={0.01} display={Math.round(settings.elevation*180/Math.PI)+'°'} onChange={v=>update('elevation',v)}/><button className="toggle-row" onClick={()=>update('grid',!settings.grid)} aria-pressed={settings.grid}><span><Grid2X2 size={15}/> Show reflection domains</span><span className={`switch ${settings.grid?'on':''}`}><i/></span></button></div>
          <button className={`motion-button ${settings.playing?'active':''}`} onClick={()=>update('playing',!settings.playing)}>{settings.playing?<Pause size={16}/>:<Play size={16}/>} {settings.playing?'Pause the journey':'Let it turn'}<span>{settings.playing?'IN MOTION':'AUTO ROTATE'}</span></button>
        </aside>
      </div>
      <section className="footnotes"><div className="rotation"><span className="label">UNWRAPPED ROTATION</span><span className="rotation-value">{(turns*360).toFixed(1)}<small>°</small></span><span className="rotation-detail">{turns.toFixed(2)} turns <span>·</span> No two revolutions need look alike.</span></div><div className="insight"><span className="insight-symbol">∞</span><p>The shape repeats.<br/><span>The world on it keeps going.</span></p><button onClick={()=>setAbout(!about)} aria-label="Read about the geometry"><ChevronDown size={18} className={about?'flipped':''}/></button></div></section>
      {about && <section className="about"><div><span className="eyebrow">BEHIND THE SURFACE</span><h2>A window into hyperbolic space.</h2></div><div><p>The trumpet is the surface of revolution of a tractrix: r = sech(t), y = t − tanh(t). Its Gaussian curvature is −1. It is rendered by numerically intersecting viewing rays with that analytic surface; there is no trumpet mesh.</p><p>The coordinates u = θ and v = 1/r put its metric in the upper-half-plane form (du² + dv²)/v². Hyperbolic reflections produce regular {'{4, 5}'} squares or {'{3, 7}'} triangles. The ornaments are procedural, inspired by tessellation art, rather than reproductions of an Escher print.</p><p>Rotation advances θ without wrapping. The unmatched edges meet behind the trumpet, so a full revolution reveals another region. The cusp extends infinitely, with no length cutoff or surface fade. Tilt the camera toward −89° to bring its vanishing point into view. Pixel resolution and floating-point precision limit the finest visible detail. Pattern position moves the tessellation through a hyperbolic isometry; it does not resize its intrinsic tiles.</p></div></section>}
    </main><footer><span>TRAKTRIX <i>/</i> A STUDY IN NEGATIVE CURVATURE</span><span>Built from mathematics. Made for curiosity.</span></footer>
  </div>;
}
