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

function num(str, label, optional = false) {
  const r = parseNum(str, { optional });
  if (!r.ok) throw new Error(`${label}: ${r.error}`);
  return r.v;
}

function ang(str, unit, label) {
  const r = parseAngle(str, unit);
  if (!r.ok) throw new Error(`${label}: ${r.error}`);
  return r.rad;
}

// 기계점 지면 표지 원점, x=E(수평각 90°), y=N(수평각 0°), z=위
export function localPoint(obs, station, settings) {
  try {
    if (obs.mode === 'coord') {
      return {
        ok: true,
        x: num(obs.e, 'E') - num(station.e0, 'E0', true),
        y: num(obs.n, 'N') - num(station.n0, 'N0', true),
        z: num(obs.z, 'Z') - num(station.z0, 'Z0', true),
      };
    }
    const sd = num(obs.sd, '사거리');
    let ha = ang(obs.ha, settings.angleUnit, '수평각');
    let za = ang(obs.va, settings.angleUnit, '연직각');
    if (settings.vAngle === 'elevation') za = Math.PI / 2 - za;
    if (za > Math.PI) { za = 2 * Math.PI - za; ha += Math.PI; }
    const hd = sd * Math.sin(za);
    return {
      ok: true,
      x: hd * Math.sin(ha),
      y: hd * Math.cos(ha),
      z: sd * Math.cos(za) + num(station.hi, '기계고', true) - num(obs.ht, '프리즘고', true),
    };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}
