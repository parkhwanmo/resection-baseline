import { test } from 'node:test';
import assert from 'node:assert/strict';
import { V2_KEY, inverse, formatDms, parseState, emptyState, loadState, saveState } from '../src/v2/inverse.js';

const near = (a, b, eps, msg) => assert.ok(Math.abs(a - b) < eps, `${msg ?? ''} ${a} != ${b}`);
const deg = (r) => r * 180 / Math.PI;

test('축 방향 방위각: 북 0°, 동 90°, 남 180°, 서 270°', () => {
  near(inverse({ x: 0, y: 0 }, { x: 10, y: 0 }).az, 0, 1e-12);
  near(inverse({ x: 0, y: 0 }, { x: 0, y: 10 }).az, 90, 1e-12);
  near(inverse({ x: 0, y: 0 }, { x: -10, y: 0 }).az, 180, 1e-12);
  near(inverse({ x: 0, y: 0 }, { x: 0, y: -10 }).az, 270, 1e-12);
  assert.equal(inverse({ x: 0, y: 0 }, { x: 10, y: 0 }).dist, 10);
});

test('4개 사분면 방위각과 거리', () => {
  const a = deg(Math.atan2(4, 3));
  const cases = [[3, 4, a], [-3, 4, 180 - a], [-3, -4, 180 + a], [3, -4, 360 - a]];
  for (const [dx, dy, az] of cases) {
    const r = inverse({ x: 100, y: 200 }, { x: 100 + dx, y: 200 + dy });
    near(r.az, az, 1e-9, `${dx},${dy}`);
    near(r.dist, 5, 1e-9);
  }
});

test('같은 점은 거리 0, 방위각 없음', () => {
  assert.deepEqual(inverse({ x: 1, y: 2 }, { x: 1, y: 2 }), { dist: 0, az: null });
});

test('큰 국가좌표에서도 정밀도 유지', () => {
  const r = inverse({ x: 500000.123, y: 200000.456 }, { x: 500025.423, y: 200042.256 });
  near(r.dist, Math.hypot(25.3, 41.8), 1e-6);
  near(r.az, deg(Math.atan2(41.8, 25.3)), 1e-6);
});

test('formatDms: 도분초, 반올림 올림, 360° → 0°', () => {
  assert.equal(formatDms(58 + 48 / 60 + 42 / 3600), '58°48′42″');
  assert.equal(formatDms(90.5), '90°30′00″');
  assert.equal(formatDms(0), '0°00′00″');
  assert.equal(formatDms(59.99999), '60°00′00″');
  assert.equal(formatDms(359 + 59 / 60 + 59.6 / 3600), '0°00′00″');
  assert.equal(formatDms(5 + 0.4 / 3600), '5°00′00″');
});

test('parseState: 정상, 형식 오류 칸, 빈 칸', () => {
  const ok = parseState({ version: 1, xa: '1000', ya: '2000', xb: '1025,3', yb: '2041.8' });
  assert.equal(ok.ok, true);
  assert.deepEqual(ok.a, { x: 1000, y: 2000 });
  assert.deepEqual(ok.b, { x: 1025.3, y: 2041.8 });
  assert.deepEqual(parseState({ version: 1, xa: 'abc', ya: '1', xb: '', yb: '2' }), { ok: false, bad: ['xa'] });
  assert.deepEqual(parseState(emptyState()), { ok: false, bad: [] });
});

const memStorage = () => { const m = new Map(); return { getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)) }; };

test('저장 왕복', () => {
  const st = memStorage();
  const s = { version: 1, xa: '1', ya: '2', xb: '3', yb: '4' };
  assert.equal(saveState(st, s), true);
  assert.deepEqual(loadState(st), s);
});

test('저장소 없음·깨진 값 → 빈 상태, 저장 실패는 false', () => {
  const broken = { getItem() { throw new Error('x'); }, setItem() { throw new Error('x'); } };
  assert.deepEqual(loadState(broken), emptyState());
  assert.equal(saveState(broken, emptyState()), false);
  const st = memStorage();
  st.setItem(V2_KEY, '{oops');
  assert.deepEqual(loadState(st), emptyState());
  st.setItem(V2_KEY, '{"version":1,"xa":5,"ya":null}');
  assert.deepEqual(loadState(st), { version: 1, xa: '5', ya: '', xb: '', yb: '' });
});
