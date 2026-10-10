export const tilings = [
  { name: '{4, 5} squares', sides: 4, meeting: 5 },
  { name: '{3, 7} triangles', sides: 3, meeting: 7 },
] as const;

export function reflectionDomain(index: number) {
  const { sides, meeting } = tilings[index];
  const angle = Math.PI / sides;
  const vertexAngle = Math.PI / meeting;
  // Hyperbolic right triangle: center, side midpoint, polygon vertex.
  const coshMidpoint = Math.cos(vertexAngle) / Math.sin(angle);
  const mirrorCenter = coshMidpoint / Math.sqrt(coshMidpoint ** 2 - 1);
  const coshVertex = 1 / (Math.tan(angle) * Math.tan(vertexAngle));
  const vertexRadius = Math.sqrt((coshVertex - 1) / (coshVertex + 1));
  return { angle, mirrorCenter, motifRadius: vertexRadius * 0.73 };
}
