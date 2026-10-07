import { test } from 'node:test';
import assert from 'node:assert/strict';
import { solve, fitRigid2D, pruneExcluded } from '../src/calc.js';
import { makeJob } from './helpers/synth.js';

const S1 = { x: 0, y: 0, z: 0, hi: 1.55, az: 23 };
const S2 = { x: 37.21, y: -12.48, z: 0.85, hi: 1.42, az: 251 };
const T = [
  { name: 'T1', x: 15, y: 30, z: 2.1, ht: 0.1 },
  { name: 'T2', x: -12, y: 8, z: -0.4 },
  { name: 'T3', x: 20, y: -35, z: 1.2 },
  { name: 'T4', x: 55, y: 10, z: 3.3, ht: 1.5 },
  { name: 'T5', x: 40, y: 25, z: 0.2 },
];
const TRUE_HD = Math.hypot(37.21, -12.48);
const near = (a, b, eps, msg) => assert.ok(Math.abs(a - b) < eps, `${msg ?? ''} ${a} != ${b}`);
const codes = (r) => r.messages.map(m => m.code);

test('fitRigid2D는 회전·이동을 복원', () => {
  const th = 0.7, t = { x: 3, y: -2 };
  const pts = [{ x: 1, y: 2 }, { x: -4, y: 5 }, { x: 7, y: -1 }];
  const pairs = pts.map(a => ({ a, b: { x: Math.cos(th) * a.x - Math.sin(th) * a.y + t.x, y: Math.sin(th) * a.x + Math.cos(th) * a.y + t.y } }));
  const f = fitRigid2D(pairs);
  near(f.theta, th, 1e-12); near(f.tx, 3, 1e-12); near(f.ty, -2, 1e-12);
});

test('무오차: 기선 거리 0.1mm 이내, 상태 ok', () => {
  const r = solve(makeJob({ S1, S2, targets: T }));
  assert.equal(r.status, 'ok', JSON.stringify(r.messages));
  near(r.baseline.hd, TRUE_HD, 1e-4, 'hd');
  near(r.baseline.dz, 0.85, 1e-4, 'dz');
  near(r.baseline.sd, Math.hypot(TRUE_HD, 0.85), 1e-4, 'sd');
  assert.ok(r.rmsH < 1e-4 && r.rmsV < 1e-4);
});

test('잡음 ±2mm: 기선 거리 1mm 이내', () => {
  const r = solve(makeJob({ S1, S2, targets: T, noise: 0.002, seed: 11 }));
  near(r.baseline.hd, TRUE_HD, 1e-3, 'hd');
});

test('착오 50mm 점은 worst로 지목되고, 제외하면 ok', () => {
  const job = makeJob({ S1, S2, targets: T });
  const o = job.stations.S2.obs.find(o => o.name === 'T3');
  o.sd = (Number(o.sd) + 0.05).toFixed(4);
  const r = solve(job);
  assert.equal(r.status, 'warn');
  assert.ok(codes(r).includes('OVER_TOL'));
  assert.equal(r.worst, 'T3');
  assert.ok(r.common.find(c => c.name === 'T3').over);
  job.excluded = ['T3'];
  const r2 = solve(job);
  assert.equal(r2.status, 'ok', JSON.stringify(r2.messages));
  const c3 = r2.common.find(c => c.name === 'T3');
  assert.equal(c3.excluded, true); assert.equal(c3.rh, null);
  near(r2.baseline.hd, TRUE_HD, 1e-4);
});

test('공통점 2점: 경고와 함께 계산', () => {
  const r = solve(makeJob({ S1, S2, targets: T.slice(0, 2) }));
  assert.equal(r.status, 'warn');
  assert.ok(codes(r).includes('TWO_COMMON'));
  near(r.baseline.hd, TRUE_HD, 1e-4);
});

test('공통점 1점: 계산 불가', () => {
  const r = solve(makeJob({ S1, S2, targets: T.slice(0, 1) }));
  assert.equal(r.status, 'fail');
  assert.ok(codes(r).includes('NOT_ENOUGH_COMMON'));
  assert.equal(r.baseline, null);
});

test('제외로 공통점이 2점 미만이 되면 제외 무시', () => {
  const job = makeJob({ S1, S2, targets: T.slice(0, 2) });
  job.excluded = ['t1'];
  const r = solve(job);
  assert.equal(r.status, 'warn');
  assert.ok(codes(r).includes('EXCLUDE_IGNORED'));
});

test('공통점 배치가 좁으면 NARROW 경고', () => {
  const tight = [
    { name: 'A', x: 10, y: 10, z: 0 },
    { name: 'B', x: 10.2, y: 10, z: 0 },
    { name: 'C', x: 10, y: 10.2, z: 0 },
  ];
  const r = solve(makeJob({ S1, S2, targets: tight }));
  assert.ok(codes(r).includes('NARROW'));
  assert.notEqual(r.baseline, null);
});

test('점명은 대소문자·공백 무시하고 매칭', () => {
  const job = makeJob({ S1, S2, targets: T });
  job.stations.S2.obs[0].name = ' t1 ';
  const r = solve(job);
  assert.equal(r.common.length, 5);
});

test('같은 기계점 중복 점명은 마지막 값 사용, 앞 항목 dup', () => {
  const job = makeJob({ S1, S2, targets: T });
  const first = { ...job.stations.S1.obs[1], id: 'dup', sd: '999' };
  job.stations.S1.obs.unshift(first);
  const r = solve(job);
  assert.equal(r.perStation.S1.find(p => p.id === 'dup').dup, true);
  near(r.baseline.hd, TRUE_HD, 1e-4);
});

test('관측값·좌표 혼합 입력(S2 좌표 모드, 기계점 좌표 비영)', () => {
  const r = solve(makeJob({ S1, S2: { ...S2, mode: 'coord', n0: 1000, e0: 500, z0: 50 }, targets: T }));
  near(r.baseline.hd, TRUE_HD, 1e-4); near(r.baseline.dz, 0.85, 1e-4);
});

test('입력 오류 점은 perStation에 표시되고 계산에서 빠짐', () => {
  const job = makeJob({ S1, S2, targets: T });
  job.stations.S1.obs[0].ha = '10.7000';
  const r = solve(job);
  const bad = r.perStation.S1[0];
  assert.equal(bad.ok, false); assert.ok(bad.error);
  assert.equal(r.common.length, 4);
  near(r.baseline.hd, TRUE_HD, 1e-4);
});

test('상대 좌표 baseline 축: S1 원점, S2 = (hd, 0, dz)', () => {
  const r = solve(makeJob({ S1, S2, targets: T }));
  const p = Object.fromEntries(r.points.map(q => [q.name, q]));
  near(p.S1.X, 0, 1e-9); near(p.S1.Y, 0, 1e-9); near(p.S1.Z, 0, 1e-9);
  near(p.S2.X, r.baseline.hd, 1e-6); near(p.S2.Y, 0, 1e-6); near(p.S2.Z, r.baseline.dz, 1e-6);
  near(Math.hypot(p.T1.X, p.T1.Y), Math.hypot(15, 30), 1e-4);
  assert.equal(p.T1.source, 'both');
});

test('상대 좌표 s1 축: S1 수평각 0° 방향이 +Y', () => {
  const r = solve(makeJob({ S1, S2, targets: T, settings: { axis: 's1' } }));
  const p = r.points.find(q => q.name === 'S2');
  const a = Math.atan2(37.21, -12.48) - 23 * Math.PI / 180;
  near(p.X, TRUE_HD * Math.sin(a), 1e-4); near(p.Y, TRUE_HD * Math.cos(a), 1e-4);
});

test('한쪽에서만 관측한 점은 그 기계점 출처로 포함', () => {
  const r = solve(makeJob({ S1, S2, targets: [...T, { name: 'X9', x: 5, y: 5, z: 0, only: 'S2' }] }));
  const p = r.points.find(q => q.name === 'X9');
  assert.equal(p.source, 'S2');
  const s2 = r.points.find(q => q.name === 'S2');
  near(Math.hypot(p.X - s2.X, p.Y - s2.Y), Math.hypot(5 - 37.21, 5 + 12.48), 1e-4);
});

test('프리즘고 착오(높이만 틀림)는 그 점이 worst로 지목', () => {
  const pts = [
    { name: 'A', x: 15, y: 30, z: 2.1 }, { name: 'B', x: -12, y: 8, z: -0.4 },
    { name: 'C', x: 20, y: -35, z: 1.2 }, { name: 'D', x: 55, y: 10, z: 3.3 }, { name: 'E', x: 40, y: 25, z: 0.2 },
  ];
  const job = makeJob({ S1, S2, targets: pts, noise: 0.001, seed: 3 });
  job.stations.S2.obs.find(o => o.name === 'A').ht = '0.05';
  const r = solve(job);
  assert.equal(r.worst, 'A');
});

test('제외 후 공통점이 줄어 2점 미만이면 제외를 무시하고 계산', () => {
  const job = makeJob({ S1, S2, targets: T.slice(0, 3) });
  job.excluded = ['T3'];
  job.stations.S2.obs = job.stations.S2.obs.filter(o => o.name !== 'T1');
  const r = solve(job);
  assert.notEqual(r.status, 'fail');
  assert.ok(codes(r).includes('EXCLUDE_IGNORED'));
  assert.equal(r.common.every(c => !c.excluded), true);
  near(r.baseline.hd, TRUE_HD, 1e-4);
});

test('계산 불가 메시지에 입력 오류 점 수 표시', () => {
  const job = makeJob({ S1, S2, targets: T.slice(0, 3) });
  job.stations.S2.hi = '1.4x';
  const r = solve(job);
  assert.equal(r.status, 'fail');
  assert.match(r.messages[0].text, /입력 오류 3점/);
});

test('pruneExcluded는 공통점이 아닌 제외 이름을 정리', () => {
  const job = makeJob({ S1, S2, targets: T });
  job.excluded = ['T2', 'GONE'];
  assert.deepEqual(pruneExcluded(job), ['T2']);
});

test('중복 점명의 마지막 값이 오류면 앞 값으로 대체하지 않음', () => {
  const job = makeJob({ S1, S2, targets: T });
  const last = { ...job.stations.S1.obs[1], id: 'bad-last', sd: '' };
  job.stations.S1.obs.push(last);
  const r = solve(job);
  assert.equal(r.perStation.S1.find(p => p.id === job.stations.S1.obs[1].id).dup, true);
  assert.equal(r.common.length, 4);
});
