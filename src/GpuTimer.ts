export interface GpuTiming {
  status: 'unsupported' | 'settling' | 'measuring' | 'paused';
  meanMs: number | null;
  p95Ms: number | null;
  samples: number;
  width: number;
  height: number;
}

interface TimerExtension {
  TIME_ELAPSED_EXT: number;
  GPU_DISJOINT_EXT: number;
}

export class GpuTimer {
  private readonly extension: TimerExtension | null;
  private pending: WebGLQuery[] = [];
  private active: WebGLQuery | null = null;
  private samples: number[] = [];
  private key = '';
  private warmup = 30;
  private publishedAt = 0;
  private width = 0;
  private height = 0;

  constructor(private gl: WebGL2RenderingContext, private publish: (timing: GpuTiming) => void) {
    this.extension = gl.getExtension('EXT_disjoint_timer_query_webgl2');
  }

  private report(status: GpuTiming['status']) {
    const sorted = [...this.samples].sort((a,b)=>a-b);
    this.publish({
      status,
      meanMs: this.samples.length ? this.samples.reduce((a,b)=>a+b,0)/this.samples.length : null,
      p95Ms: sorted.length ? sorted[Math.ceil(sorted.length*0.95)-1] : null,
      samples: this.samples.length, width: this.width, height: this.height,
    });
  }

  private clear() {
    for(const query of this.pending) this.gl.deleteQuery(query);
    this.pending = [];
    this.samples = [];
    this.warmup = 30;
  }

  begin(key: string, paused: boolean, width: number, height: number, now: number) {
    const changed = this.key !== key || this.width !== width || this.height !== height;
    this.width = width; this.height = height;
    if(changed) {
      this.key = key;
      this.clear();
      this.report(!this.extension ? 'unsupported' : paused ? 'paused' : 'settling');
      this.publishedAt = now;
    }
    const ext = this.extension;
    if(!ext || paused) return;
    if(this.gl.getParameter(ext.GPU_DISJOINT_EXT)) {
      // GPU clock discontinuities invalidate all outstanding results.
      this.clear();
      this.report('settling');
      return;
    }
    while(this.pending.length && this.gl.getQueryParameter(this.pending[0],this.gl.QUERY_RESULT_AVAILABLE)) {
      const query = this.pending.shift()!;
      const ms = Number(this.gl.getQueryParameter(query,this.gl.QUERY_RESULT))/1e6;
      this.gl.deleteQuery(query);
      if(Number.isFinite(ms) && ms > 0) {
        this.samples.push(ms);
        if(this.samples.length > 120) this.samples.shift();
      }
    }
    if(now-this.publishedAt >= 500) {
      this.report(this.samples.length ? 'measuring' : 'settling');
      this.publishedAt = now;
    }
    if(this.warmup > 0) { this.warmup--; return; }
    // Poll on later frames. Never block the GPU or grow an unlimited queue.
    if(this.pending.length >= 8) return;
    this.active = this.gl.createQuery();
    if(this.active) this.gl.beginQuery(ext.TIME_ELAPSED_EXT,this.active);
  }

  end() {
    if(!this.active || !this.extension) return;
    this.gl.endQuery(this.extension.TIME_ELAPSED_EXT);
    this.pending.push(this.active);
    this.active = null;
  }

  dispose() {
    this.end();
    this.clear();
  }
}
