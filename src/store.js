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

export function loadJobs(storage) {
  try {
    const text = storage.getItem(STORAGE_KEY);
    if (text == null) return { ok: true, jobs: [] };
    const data = JSON.parse(text);
    return Array.isArray(data.jobs) ? { ok: true, jobs: data.jobs } : { ok: false, jobs: [] };
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
    return { ok: true, jobs: data.jobs };
  } catch {
    return { ok: false, error: '백업 파일을 읽을 수 없음' };
  }
}

const cell = (v) => {
  const s = String(v ?? '');
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const fix = (v, d) => { const s = v.toFixed(d); return /^-0\.0*$/.test(s) ? s.slice(1) : s; };
const m4 = (v) => (v == null ? '' : fix(v, 4));
const mm1 = (v) => (v == null ? '' : fix(v * 1000, 1));

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
