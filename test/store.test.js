import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STORAGE_KEY, newJob, newObs, loadJobs, saveJobs, exportBackup, importBackup, resultCsv } from '../src/store.js';
import { solve } from '../src/calc.js';
import { makeJob } from './helpers/synth.js';

const memStorage = () => {
  const m = new Map();
  return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), _m: m };
};
const brokenStorage = () => ({
  getItem() { throw new Error('denied'); },
  setItem() { throw new Error('quota'); },
});

test('newJob 기본 설정과 빈 기계점', () => {
  const j = newJob('현장 A');
  assert.equal(j.name, '현장 A');
  assert.deepEqual(j.settings, { angleUnit: 'dms', vAngle: 'zenith', tolH: 0.005, tolV: 0.005, axis: 'baseline' });
  assert.deepEqual(j.stations.S1, { hi: '', n0: '', e0: '', z0: '', obs: [] });
  assert.deepEqual(j.excluded, []);
  assert.notEqual(newJob('b').id, j.id);
});

test('newObs는 모든 값이 빈 문자열', () => {
  const o = newObs('coord');
  assert.equal(o.mode, 'coord');
  for (const k of ['name', 'sd', 'ha', 'va', 'ht', 'n', 'e', 'z']) assert.equal(o[k], '');
  assert.ok(o.id);
});

test('저장→불러오기 왕복', () => {
  const st = memStorage();
  const jobs = [newJob('a'), newJob('b')];
  assert.equal(saveJobs(st, jobs), true);
  assert.ok(st._m.has(STORAGE_KEY));
  assert.deepEqual(loadJobs(st), { ok: true, jobs });
});

test('빈 저장소는 빈 목록', () => {
  assert.deepEqual(loadJobs(memStorage()), { ok: true, jobs: [] });
});

test('저장소 접근 불가여도 예외 없이 실패 반환', () => {
  assert.deepEqual(loadJobs(brokenStorage()), { ok: false, jobs: [] });
  assert.equal(saveJobs(brokenStorage(), [newJob('a')]), false);
});

test('깨진 JSON은 실패 반환', () => {
  const st = memStorage();
  st.setItem(STORAGE_KEY, '{oops');
  assert.deepEqual(loadJobs(st), { ok: false, jobs: [] });
});

test('백업 왕복과 잘못된 백업 거부', () => {
  const jobs = [newJob('a')];
  assert.deepEqual(importBackup(exportBackup(jobs)), { ok: true, jobs });
  assert.equal(importBackup('{}').ok, false);
  assert.equal(importBackup('not json').ok, false);
  assert.equal(importBackup('{"version":1,"jobs":"x"}').ok, false);
});

test('CSV: BOM, 섹션, S2 행, CRLF', () => {
  const job = makeJob({
    S1: { x: 0, y: 0, z: 0, az: 10 }, S2: { x: 20, y: 5, z: 0.3, az: 200 },
    targets: [{ name: 'T1', x: 5, y: 15, z: 0 }, { name: 'T2', x: 25, y: -10, z: 1 }, { name: 'T3', x: -5, y: -5, z: 0 }],
  });
  const csv = resultCsv(job, solve(job));
  assert.ok(csv.startsWith('﻿'));
  assert.ok(csv.includes('\r\n'));
  assert.ok(csv.includes('기선'));
  assert.ok(csv.includes('공통점 잔차'));
  assert.ok(csv.includes('상대 좌표'));
  assert.match(csv, /\r\nS2,20\.6155,0\.0000,0\.3000,S2\r\n/);
});

test('CSV: 계산 불가여도 생성', () => {
  const job = newJob('빈 작업');
  const csv = resultCsv(job, solve(job));
  assert.ok(csv.startsWith('﻿'));
  assert.ok(csv.includes('계산 불가'));
});
