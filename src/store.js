// 저장·백업·CSV

export const STORAGE_KEY = 'rb.jobs.v1';

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

export function newJob(name) {
  const now = Date.now();
  const station = () => ({ hi: '', n0: '', e0: '', z0: '', obs: [] });
  return {
    id: uid(), name, createdAt: now, updatedAt: now,
    settings: { angleUnit: 'dms', vAngle: 'zenith', tolH: 0.005, tolV: 0.005, axis: 'baseline' },
    stations: { S1: station(), S2: station() },
    excluded: [],
  };
}

export function newObs(mode) {
  return { id: uid(), name: '', mode, sd: '', ha: '', va: '', ht: '', n: '', e: '', z: '' };
}

const SAFE_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const safeId = (v) => typeof v === "string" && SAFE_ID_RE.test(v);
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const str = (v) => (v == null ? '' : typeof v === 'object' ? '' : String(v));
const posNum = (v, d) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : d);
const pick = (v, allowed, d) => (allowed.includes(v) ? v : d);

// 백업·저장소에서 읽은 작업을 현재 스키마로 보정 (객체가 아니면 null)
export function normalizeJob(j) {
  if (!isObj(j)) return null;
  const base = newJob('');
  const s = isObj(j.settings) ? j.settings : {};
  const station = (st) => {
    st = isObj(st) ? st : {};
    return {
      hi: str(st.hi), n0: str(st.n0), e0: str(st.e0), z0: str(st.z0),
      obs: (Array.isArray(st.obs) ? st.obs : []).filter(isObj).map(o => ({
        id: safeId(o.id) ? o.id : uid(),
        name: str(o.name),
        mode: pick(o.mode, ['polar', 'coord'], 'polar'),
        sd: str(o.sd), ha: str(o.ha), va: str(o.va), ht: str(o.ht), n: str(o.n), e: str(o.e), z: str(o.z),
      })),
    };
  };
  const stations = isObj(j.stations) ? j.stations : {};
  return {
    id: safeId(j.id) ? j.id : base.id,
    name: str(j.name) || '이름 없음',
    createdAt: posNum(j.createdAt, base.createdAt),
    updatedAt: posNum(j.updatedAt, base.updatedAt),
    settings: {
      angleUnit: pick(s.angleUnit, ['dms', 'deg', 'gon'], 'dms'),
      vAngle: pick(s.vAngle, ['zenith', 'elevation'], 'zenith'),
      tolH: posNum(s.tolH, 0.005),
      tolV: posNum(s.tolV, 0.005),
      axis: pick(s.axis, ['baseline', 's1'], 'baseline'),
    },
    stations: { S1: station(stations.S1), S2: station(stations.S2) },
    excluded: (Array.isArray(j.excluded) ? j.excluded : []).filter(v => typeof v === 'string'),
  };
}

const normalizeJobs = (jobs) => jobs.map(normalizeJob).filter(Boolean);

export function loadJobs(storage) {
  try {
    const text = storage.getItem(STORAGE_KEY);
    if (text == null) return { ok: true, jobs: [] };
    const data = JSON.parse(text);
    return Array.isArray(data.jobs) ? { ok: true, jobs: normalizeJobs(data.jobs) } : { ok: false, jobs: [] };
  } catch {
    return { ok: false, jobs: [] };
  }
}

export function saveJobs(storage, jobs) {
  try {
    storage.setItem(STORAGE_KEY, exportBackup(jobs));
    return true;
  } catch {
    return false;
  }
}

export function exportBackup(jobs) {
  return JSON.stringify({ version: 1, jobs });
}

export function importBackup(text) {
  try {
    const data = JSON.parse(text);
    if (!data || data.version !== 1 || !Array.isArray(data.jobs)) return { ok: false, error: '백업 파일 형식이 아님' };
    return { ok: true, jobs: normalizeJobs(data.jobs) };
  } catch {
    return { ok: false, error: '백업 파일을 읽을 수 없음' };
  }
}

const cell = (v) => {
  const s = String(v ?? '');
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
export const fmtFixed = (v, d) => { const s = v.toFixed(d); return /^-0\.0*$/.test(s) ? s.slice(1) : s; };
const m4 = (v) => (v == null ? '' : fmtFixed(v, 4));
const mm1 = (v) => (v == null ? '' : fmtFixed(v * 1000, 1));

export function resultCsv(job, result) {
  const rows = [[job.name], []];
  rows.push(['기선'], ['수평거리(m)', '사거리(m)', '고저차(m)']);
  if (result.baseline) {
    const b = result.baseline;
    rows.push([m4(b.hd), m4(b.sd), m4(b.dz)]);
  } else {
    rows.push(['계산 불가']);
  }
  for (const m of result.messages) rows.push([m.text]);
  rows.push([], ['공통점 잔차'], ['점명', '제외', '수평(mm)', '수직(mm)']);
  for (const c of result.common) rows.push([c.name, c.excluded ? 'Y' : '', mm1(c.rh), mm1(c.rv)]);
  if (result.rmsH != null) rows.push(['RMS', '', mm1(result.rmsH), mm1(result.rmsV)]);
  rows.push([], ['상대 좌표'], ['점명', 'X(m)', 'Y(m)', 'Z(m)', '출처']);
  for (const p of result.points) rows.push([p.name, m4(p.X), m4(p.Y), m4(p.Z), p.source]);
  return '﻿' + rows.map(r => r.map(cell).join(',')).join('\r\n') + '\r\n';
}
