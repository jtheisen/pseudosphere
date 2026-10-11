# Circle Limit III source

`circle-limit-iii.jpg` is the unchanged 316 × 316 image of M. C. Escher's *Circle Limit III* supplied through the user's Wikipedia reference:

- https://en.wikipedia.org/wiki/Circle_Limit_III
- https://upload.wikimedia.org/wikipedia/en/5/55/Escher_Circle_Limit_III.jpg

The “Fish from the print” option crops through texture coordinates. It repeats only the local kite patch around a large central green fish, using `src/fishSource.ts` to register that patch to the hyperbolic geometry. The complete disk is never mapped onto the trumpet. Ink and paper details come from the source pixels; pigment hues are permuted for the tiling and palette controls. The crop has roughly 64 pixels of original fish detail, so enlarged fish retain the source's raster softness and slight alignment imperfections.

## Planar Drawing 123

`planar-fish.webp` is the unchanged 1280 × 944 image provided by Jens, copied from `/Users/jens/Pictures/2024-05-25_2dfbe260b5d89.webp`. It depicts M. C. Escher's planar fish Drawing 123. No resampling or upscaling is performed on this asset.

“Fish from the plane” samples a central region between nose/tail junctions near (493,204) and (493,543), with fin vertices near (593,373.5) and (393,373.5). `src/planarFish.ts` maps those pixels into the hyperbolic kite; the shader relabels neighboring pigment fragments for the changed fin order and preserves the photographed ink and paper details.
