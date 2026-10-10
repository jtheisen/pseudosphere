# Traktrix

A React / TypeScript / Vite viewer of an analytic pseudosphere, with an intrinsic hyperbolic tessellation rendered in a fragment shader.

```sh
corepack pnpm install
corepack pnpm dev
```

Build with `corepack pnpm build`. If pnpm is already installed, omit `corepack`.

`pnpm test:geometry` checks the shader's intersection mathematics on the CPU, including 6,600 rays aimed at known surface points across steep camera angles, plus axial and horizontal cases. It does not launch a browser or verify GPU floating-point behavior.

Drag horizontally to turn and vertically to tilt, using a mouse or touch. Scroll to zoom. Releasing a moving drag applies inertia: horizontal rotation decays at 3.5/s, while tilt decays much faster at 18/s. Grabbing again stops momentum; a pause of up to 100 ms before releasing preserves momentum, while a longer pause does not fling. Tilt is clamped to approximately ±89°. Resetting the view or changing the tilt slider stops momentum. Rotation is accumulated without reducing modulo 2π; the coordinate branch cut stays at the back.

The viewer shows GPU render time using `EXT_disjoint_timer_query_webgl2`, with a rolling mean and 95th percentile over the latest 120 valid samples. Timing encloses the render pass and excludes React/UI work and display refresh waiting. Queries are read asynchronously; GPU-disjoint results are discarded. Changing any view/pattern setting or rendering resolution resets the samples and skips 30 warmup frames. Dragging, inertia, and automatic rotation suspend benchmarking. Read the metric at a stationary view after the sample count reaches 120. Browsers without the timer extension show “Unavailable”; CPU frame timing is not substituted.

The only rasterized geometry is a full-screen quad. Rays intersect the unbounded analytic surface r = sech(t), y = t − tanh(t). The solver evaluates the height gap y − profile(r), whose stationary points along a ray reduce to a quadratic in squared radius. Splitting at those points creates at most three monotonic sections; the first sign-changing section is refined with up to 32 bisections. This handles overlapping projections without marching past paired intersections or exhausting a marching budget. Each ray's entry and exit from the infinite radius-one cylinder bound its search, with only the natural wide rim at y = 0. Axial rays are handled analytically. There is no upper height cutoff or surface fade. Camera tilt spans approximately −89° to +89°; near −89° the upward vanishing point is in view. Pixel resolution and floating-point precision limit the narrowest visible detail, and unresolved texture detail is averaged.

For u = θ and v = cosh(t) = 1/r, the induced metric is (du² + dv²)/v². Mapping the upper half-plane into the Poincaré disk and reflecting through a triangle with angles π/p, π/2, π/q produces the regular {p,q} tessellation. Choose {4,5} squares or {3,7} triangles; triangles have 5/14 the intrinsic area of the squares. The pattern-position control applies an upper-half-plane dilation, an isometry; congruent tiles keep their intrinsic size. Decorative motifs are procedural ornaments, not copies of Escher artwork. The unmatched circumferential pattern joins on the hidden back side.

The fold solver uses a finite reflection budget, and the cusp uses pixel-footprint filtering. Extremely large accumulated rotations can eventually lose precision in GPU floats. WebGL is required. Fonts load from Google Fonts, with local fallbacks.
