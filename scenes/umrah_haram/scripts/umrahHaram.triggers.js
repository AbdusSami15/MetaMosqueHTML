import * as THREE from "three";

export function buildTriggers(raw) {
  return raw.map(t => ({
    id: t.id,
    min: new THREE.Vector3(...t.bounds.min),
    max: new THREE.Vector3(...t.bounds.max),
    media: t.media
  }));
}

export function isInsideTrigger(pos, t) {
  return pos.x >= t.min.x && pos.x <= t.max.x &&
         pos.y >= t.min.y && pos.y <= t.max.y &&
         pos.z >= t.min.z && pos.z <= t.max.z;
}

export function findTriggerIndex(pos, triggers) {
  return triggers.findIndex(t => isInsideTrigger(pos, t));
}
