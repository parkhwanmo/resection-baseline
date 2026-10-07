// v2 — 두 점 좌표 역계산 (X=북, Y=동, 방위각은 북에서 시계 방향)
import { parseNum } from '../calc.js';

export const V2_KEY = 'rb.v2.state';
const V2_FIELDS = ['xa', 'ya', 'xb', 'yb'];

export function inverse(a, b) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const dist = Math.hypot(dx, dy);
  if (dist === 0) return { dist: 0, az: null };
  let az = Math.atan2(dy, dx) * 180 / Math.PI;
  if (az < 0) az += 360;
  return { dist, az };
}

// 1″ 단위 반올림, 360° → 0°
export function formatDms(deg) {
  let total = Math.round(deg * 3600) % (360 * 3600);
  if (total < 0) total += 360 * 3600;
  const d = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${d}°${String(m).padStart(2, '0')}′${String(s).padStart(2, '0')}″`;
}

export function emptyState() {
  return { version: 1, xa: '', ya: '', xb: '', yb: '' };
}

// 네 칸이 모두 유효하면 ok, 아니면 형식이 틀린 칸 목록 (빈 칸은 제외)
export function parseState(state) {
  const vals = {}, bad = [];
  for (const k of V2_FIELDS) {
    const raw = String(state[k] ?? '').trim();
    if (raw === '') continue;
    const r = parseNum(raw);
    if (r.ok) vals[k] = r.v; else bad.push(k);
  }
  if (bad.length || Object.keys(vals).length < V2_FIELDS.length) return { ok: false, bad };
  return { ok: true, a: { x: vals.xa, y: vals.ya }, b: { x: vals.xb, y: vals.yb } };
}

export function loadState(storage) {
  try {
    const data = JSON.parse(storage.getItem(V2_KEY));
    if (data === null || typeof data !== 'object' || Array.isArray(data)) return emptyState();
    const s = emptyState();
    for (const k of V2_FIELDS) {
      const v = data[k];
      s[k] = v == null || typeof v === 'object' ? '' : String(v);
    }
    return s;
  } catch {
    return emptyState();
  }
}

export function saveState(storage, state) {
  try {
    storage.setItem(V2_KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}
