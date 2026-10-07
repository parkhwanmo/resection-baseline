import { test } from 'node:test';
import assert from 'node:assert/strict';
import { localPoint } from '../src/calc.js';

const S = { angleUnit: 'dms', vAngle: 'zenith', tolH: 0.005, tolV: 0.005, axis: 'baseline' };
const st = (o = {}) => ({ hi: '', n0: '', e0: '', z0: '', obs: [], ...o });
const polar = (o) => ({ id: 'a', name: 'T1', mode: 'polar', sd: '', ha: '', va: '', ht: '', n: '', e: '', z: '', ...o });
const coord = (o) => ({ ...polar({}), mode: 'coord', ...o });
const near = (p, q, eps = 1e-9) => {
  assert.equal(p.ok, true, p.error);
  for (const k of ['x', 'y', 'z']) assert.ok(Math.abs(p[k] - q[k]) < eps, `${k}: ${p[k]} != ${q[k]}`);
};
const D = Math.PI / 180;

test('관측값: 수평각 90°, 천정각 90° → +x', () => {
  near(localPoint(polar({ sd: '100', ha: '90', va: '90' }), st(), S), { x: 100, y: 0, z: 0 });
});

test('관측값: 기계고·프리즘고 반영', () => {
  near(localPoint(polar({ sd: '10', ha: '0', va: '60', ht: '1.2' }), st({ hi: '1.5' }), S),
    { x: 0, y: 10 * Math.sin(60 * D), z: 10 * Math.cos(60 * D) + 0.3 });
});

test('고도각 30° = 천정각 60°', () => {
  const a = localPoint(polar({ sd: '10', ha: '30', va: '30' }), st(), { ...S, vAngle: 'elevation' });
  const b = localPoint(polar({ sd: '10', ha: '30', va: '60' }), st(), S);
  near(a, b);
});

test('반위 관측은 정위로 환산 (ZA 270, HA 350 = ZA 90, HA 170)', () => {
  near(localPoint(polar({ sd: '25', ha: '350', va: '270' }), st(), S),
    localPoint(polar({ sd: '25', ha: '170', va: '90' }), st(), S));
});

test('좌표 입력: 기계점 좌표를 빼고 기계고는 무시', () => {
  near(localPoint(coord({ n: '1005', e: '2003', z: '101' }), st({ hi: '1.5', n0: '1000', e0: '2000', z0: '100' }), S),
    { x: 3, y: 5, z: 1 });
});

test('빈 선택 입력은 0, 빈 필수 입력은 그 점만 오류', () => {
  near(localPoint(coord({ n: '1', e: '2', z: '3' }), st(), S), { x: 2, y: 1, z: 3 });
  assert.equal(localPoint(polar({ sd: '', ha: '0', va: '90' }), st(), S).ok, false);
  assert.equal(localPoint(coord({ n: '1', e: '', z: '3' }), st(), S).ok, false);
});

test('잘못된 각도는 오류', () => {
  assert.equal(localPoint(polar({ sd: '10', ha: '10.7000', va: '90' }), st(), S).ok, false);
});
