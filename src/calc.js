// 후방교회 기선 거리 — 순수 계산 (DOM 없음)

const DEG = Math.PI / 180;
const NUM_RE = /^[+-]?(\d+\.?\d*|\.\d+)$/;

export function normName(s) {
  return String(s ?? '').trim().toUpperCase();
}

export function parseNum(str, { optional = false } = {}) {
  const s = String(str ?? '').trim().replace(',', '.');
  if (s === '') return optional ? { ok: true, v: 0 } : { ok: false, error: '값 없음' };
  if (!NUM_RE.test(s)) return { ok: false, error: `숫자 아님: ${str}` };
  return { ok: true, v: Number(s) };
}

function parseDms(s) {
  let sign = 1;
  if (s.startsWith('-')) { sign = -1; s = s.slice(1).trim(); }
  else if (s.startsWith('+')) s = s.slice(1).trim();
  let d, m, sec;
  const parts = s.split(/[\s-]+/).filter(Boolean);
  if (parts.length > 1) {
    if (parts.length > 3 || !parts.every(p => NUM_RE.test(p))) return null;
    [d, m = 0, sec = 0] = parts.map(Number);
  } else {
    if (!/^(\d+)(\.(\d*))?$/.test(s)) return null;
    const [ip, fp = ''] = s.split('.');
    const f = fp.padEnd(4, '0');
    d = Number(ip);
    m = Number(f.slice(0, 2));
    sec = Number(f.slice(2, 4) + '.' + (f.slice(4) || '0'));
  }
  if (m >= 60 || sec >= 60) return { error: '분·초는 60 미만이어야 함' };
  return { deg: sign * (d + m / 60 + sec / 3600) };
}

export function parseAngle(str, unit) {
  const s = String(str ?? '').trim().replace(',', '.');
  if (s === '') return { ok: false, error: '각도 없음' };
  if (unit === 'dms') {
    const r = parseDms(s);
    if (!r) return { ok: false, error: `각도 형식 오류: ${str}` };
    if (r.error) return { ok: false, error: r.error };
    return { ok: true, rad: r.deg * DEG };
  }
  if (!NUM_RE.test(s)) return { ok: false, error: `각도 형식 오류: ${str}` };
  const v = Number(s);
  return { ok: true, rad: unit === 'gon' ? v * Math.PI / 200 : v * DEG };
}
