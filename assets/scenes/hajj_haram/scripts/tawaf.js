export async function loadTawaf(basePath) {
  const res = await fetch(`${basePath}config/tawaf.json`);
  if (!res.ok) return [];
  return await res.json();
}

export function isInsideTawafPoint(point, pos) {
  if (!point?.center) return false;
  const dx = pos.x - point.center[0];
  const dz = pos.z - point.center[2];
  const r = point.radius || 2;
  return dx * dx + dz * dz <= r * r;
}

export function getTawafPointCenter(point) {
  return {
    x: point.center[0],
    y: point.center[1],
    z: point.center[2],
  };
}
