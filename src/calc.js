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
    if (parts.length > 3 || !parts.every((p, i) => (i < 2 ? /^\d+$/ : NUM_RE).test(p))) return null;
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

// b ≈ R(theta)·a + t 최소제곱 (축척 1)
export function fitRigid2D(pairs) {
  const n = pairs.length;
  let ax = 0, ay = 0, bx = 0, by = 0;
  for (const { a, b } of pairs) { ax += a.x; ay += a.y; bx += b.x; by += b.y; }
  ax /= n; ay /= n; bx /= n; by /= n;
  let sn = 0, cs = 0;
  for (const { a, b } of pairs) {
    const px = a.x - ax, py = a.y - ay, qx = b.x - bx, qy = b.y - by;
    sn += px * qy - py * qx;
    cs += px * qx + py * qy;
  }
  const theta = Math.atan2(sn, cs);
  const c = Math.cos(theta), s = Math.sin(theta);
  return { theta, tx: bx - (c * ax - s * ay), ty: by - (s * ax + c * ay) };
}

const NARROW_SPAN = 0.5;

function stationPoints(station, settings) {
  const list = station.obs.map(o => {
    const p = localPoint(o, station, settings);
    return { id: o.id, name: o.name, key: normName(o.name), ok: p.ok, error: p.ok ? null : p.error, dup: false, p };
  });
  // 같은 점명은 마지막 항목만 사용 (마지막이 오류면 그 점은 계산에서 빠짐)
  const last = new Map();
  for (const it of list) {
    if (!it.key) continue;
    if (last.has(it.key)) last.get(it.key).dup = true;
    last.set(it.key, it);
  }
  const map = new Map([...last].filter(([, it]) => it.ok));
  return { list, map };
}

// 현재 공통점에 해당하는 제외 이름만 남김 (점 삭제·이름 변경 후 정리)
export function pruneExcluded(job) {
  const keys = (st) => new Set(st.obs.map(o => normName(o.name)).filter(Boolean));
  const k1 = keys(job.stations.S1), k2 = keys(job.stations.S2);
  return (job.excluded || []).filter(n => k1.has(normName(n)) && k2.has(normName(n)));
}

export function solve(job) {
  const settings = job.settings;
  const tolH = Number(settings.tolH), tolV = Number(settings.tolV);
  const s1 = stationPoints(job.stations.S1, settings);
  const s2 = stationPoints(job.stations.S2, settings);
  const perStation = {
    S1: s1.list.map(({ id, name, ok, error, dup }) => ({ id, name, ok, error, dup })),
    S2: s2.list.map(({ id, name, ok, error, dup }) => ({ id, name, ok, error, dup })),
  };
  let excluded = new Set((job.excluded || []).map(normName));
  const commonKeys = [...s1.map.keys()].filter(k => s2.map.has(k));
  let activeKeys = commonKeys.filter(k => !excluded.has(k));
  const messages = [];

  // 제외 때문에 2점 미만이 되면 제외를 무시 (항상 진행)
  if (activeKeys.length < 2 && commonKeys.length >= 2) {
    excluded = new Set();
    activeKeys = commonKeys;
    messages.push({ level: 'warn', code: 'EXCLUDE_IGNORED', text: '공통점이 부족해 제외 설정을 무시하고 모든 공통점으로 계산함' });
  }

  if (activeKeys.length < 2) {
    const bad = s1.list.filter(p => !p.ok).length + s2.list.filter(p => !p.ok).length;
    messages.push({ level: 'error', code: 'NOT_ENOUGH_COMMON',
      text: '계산 불가 — S1과 S2에서 같은 이름으로 2점 이상 관측 필요' + (bad ? ` (입력 오류 ${bad}점은 계산에서 빠짐)` : '') });
    return {
      status: 'fail', messages, baseline: null,
      common: commonKeys.map(k => ({ name: s1.map.get(k).name.trim(), excluded: excluded.has(k), rh: null, rv: null, over: false })),
      rmsH: null, rmsV: null, worst: null, points: [], perStation,
    };
  }

  const fit = fitRigid2D(activeKeys.map(k => ({ a: s2.map.get(k).p, b: s1.map.get(k).p })));
  const tz = activeKeys.reduce((s, k) => s + s1.map.get(k).p.z - s2.map.get(k).p.z, 0) / activeKeys.length;
  const c = Math.cos(fit.theta), sn = Math.sin(fit.theta);
  const toS1 = (p) => ({ x: c * p.x - sn * p.y + fit.tx, y: sn * p.x + c * p.y + fit.ty, z: p.z + tz });

  const common = commonKeys.map(k => {
    const name = s1.map.get(k).name.trim();
    if (excluded.has(k)) return { name, excluded: true, rh: null, rv: null, over: false };
    const a = s1.map.get(k).p, b = toS1(s2.map.get(k).p);
    const rh = Math.hypot(a.x - b.x, a.y - b.y), rv = a.z - b.z;
    return { name, excluded: false, rh, rv, over: rh > tolH || Math.abs(rv) > tolV };
  });
  const active = common.filter(r => !r.excluded);
  const rmsH = Math.sqrt(active.reduce((s, r) => s + r.rh ** 2, 0) / active.length);
  const rmsV = Math.sqrt(active.reduce((s, r) => s + r.rv ** 2, 0) / active.length);
  const overs = active.filter(r => r.over);
  const badness = (r) => Math.max(r.rh / tolH, Math.abs(r.rv) / tolV);
  const worst = overs.length ? overs.reduce((m, r) => (badness(r) > badness(m) ? r : m)).name : null;

  if (activeKeys.length === 2)
    messages.push({ level: 'warn', code: 'TWO_COMMON', text: '검증 불가 — 공통점 3점 이상 권장' });
  let span = 0;
  for (let i = 0; i < activeKeys.length; i++)
    for (let j = i + 1; j < activeKeys.length; j++) {
      const p = s1.map.get(activeKeys[i]).p, q = s1.map.get(activeKeys[j]).p;
      span = Math.max(span, Math.hypot(p.x - q.x, p.y - q.y));
    }
  if (span < NARROW_SPAN)
    messages.push({ level: 'warn', code: 'NARROW', text: '공통점 배치가 좁아 방향 오차가 큼' });
  if (overs.length)
    messages.push({ level: 'warn', code: 'OVER_TOL', text: `허용 잔차 초과 ${overs.length}점 — 최대: ${worst}` });

  const hd = Math.hypot(fit.tx, fit.ty);
  const baseline = { hd, dz: tz, sd: Math.hypot(hd, tz) };

  // 상대 좌표 (S1 로컬 → 축 회전)
  const raw = [
    { name: 'S1', x: 0, y: 0, z: 0, source: 'S1' },
    { name: 'S2', x: fit.tx, y: fit.ty, z: tz, source: 'S2' },
  ];
  const keys = [...new Set([...s1.map.keys(), ...s2.map.keys()])];
  for (const k of keys) {
    const a = s1.map.get(k), b = s2.map.get(k);
    const ests = [];
    if (a) ests.push(a.p);
    if (b) ests.push(toS1(b.p));
    raw.push({
      name: (a || b).name.trim(),
      x: ests.reduce((s, p) => s + p.x, 0) / ests.length,
      y: ests.reduce((s, p) => s + p.y, 0) / ests.length,
      z: ests.reduce((s, p) => s + p.z, 0) / ests.length,
      source: a && b ? 'both' : a ? 'S1' : 'S2',
    });
  }
  const phi = settings.axis === 'baseline' && hd > 0 ? Math.atan2(fit.ty, fit.tx) : 0;
  const pc = Math.cos(phi), ps = Math.sin(phi);
  const points = raw.map(p => ({
    name: p.name, source: p.source, Z: p.z,
    X: p.x * pc + p.y * ps,
    Y: -p.x * ps + p.y * pc,
  }));

  return {
    status: messages.length ? 'warn' : 'ok',
    messages, baseline, common, rmsH, rmsV, worst, points, perStation,
  };
}
