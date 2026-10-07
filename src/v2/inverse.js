// v2 — 좌표 역계산(두 점 → 거리·방위각)과 정계산(한 점 + 거리·방위각 → 두 번째 점)
// X=북, Y=동, 방위각은 북에서 시계 방향
import { parseNum, parseAngle } from '../calc.js';

export const V2_KEY = 'rb.v2.state';
const V2_FIELDS = ['xa', 'ya', 'xb', 'yb'];
const V2_TEXT_FIELDS = ['xa', 'ya', 'xb', 'yb', 'dist', 'az'];
const V2_MODES = ['inverse', 'forward'];

export function inverse(a, b) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const dist = Math.hypot(dx, dy);
  if (dist === 0) return { dist: 0, az: null };
  let az = Math.atan2(dy, dx) * 180 / Math.PI;
  if (az < 0) az += 360;
  return { dist, az };
}

export function forward(a, dist, azDeg) {
  const r = azDeg * Math.PI / 180;
  return { x: a.x + dist * Math.cos(r), y: a.y + dist * Math.sin(r) };
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
  return { version: 1, mode: 'inverse', xa: '', ya: '', xb: '', yb: '', dist: '', az: '' };
}

// 칸별 해석: 빈 칸은 건너뛰고, 형식이 틀린 칸은 bad에 모음
function readFields(state, specs) {
  const vals = {}, bad = [];
  for (const [k, parse] of specs) {
    const raw = String(state[k] ?? '').trim();
    if (raw === '') continue;
    const r = parse(raw);
    if (r.ok) vals[k] = r.v; else bad.push(k);
  }
  return { vals, bad, complete: !bad.length && Object.keys(vals).length === specs.length };
}

const numField = (raw) => parseNum(raw);

// 역계산: 네 칸이 모두 유효하면 ok
export function parseState(state) {
  const { vals, bad, complete } = readFields(state, V2_FIELDS.map(k => [k, numField]));
  if (!complete) return { ok: false, bad };
  return { ok: true, a: { x: vals.xa, y: vals.ya }, b: { x: vals.xb, y: vals.yb } };
}

// 정계산: A 좌표, 거리(0 이상), 방위각(도분초)이 모두 유효하면 ok
export function parseForward(state) {
  const { vals, bad, complete } = readFields(state, [
    ['xa', numField], ['ya', numField],
    ['dist', (raw) => { const r = parseNum(raw); return r.ok && r.v < 0 ? { ok: false } : r; }],
    ['az', (raw) => { const r = parseAngle(raw, 'dms'); return r.ok ? { ok: true, v: r.rad * 180 / Math.PI } : r; }],
  ]);
  if (!complete) return { ok: false, bad };
  const azDeg = ((vals.az % 360) + 360) % 360;
  return { ok: true, a: { x: vals.xa, y: vals.ya }, dist: vals.dist, azDeg };
}

export function loadState(storage) {
  try {
    const data = JSON.parse(storage.getItem(V2_KEY));
    if (data === null || typeof data !== 'object' || Array.isArray(data)) return emptyState();
    const s = emptyState();
    if (V2_MODES.includes(data.mode)) s.mode = data.mode;
    for (const k of V2_TEXT_FIELDS) {
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
