import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseAngle, parseNum, normName } from '../src/calc.js';

const D = Math.PI / 180;
const near = (a, b, eps = 1e-12) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);
const rad = (s, u = 'dms') => { const r = parseAngle(s, u); assert.equal(r.ok, true, r.error); return r.rad; };

test('도분초 ddd.mmss 해석', () => {
  near(rad('123.4530'), (123 + 45 / 60 + 30 / 3600) * D);
});

test('도분초 구분자 표기', () => {
  near(rad('123 45 30'), (123 + 45 / 60 + 30 / 3600) * D);
  near(rad('123-45-30'), (123 + 45 / 60 + 30 / 3600) * D);
});

test('짧은 도분초는 우측 0 채움', () => {
  near(rad('123.45'), (123 + 45 / 60) * D);
  near(rad('123.4'), (123 + 40 / 60) * D);
  near(rad('90'), 90 * D);
});

test('초 소수부', () => {
  near(rad('123.453015'), (123 + 45 / 60 + 30.15 / 3600) * D);
});

test('음수 도분초', () => {
  near(rad('-5.3000'), -5.5 * D);
});

test('분·초 60 이상은 오류', () => {
  assert.equal(parseAngle('10.6000', 'dms').ok, false);
  assert.equal(parseAngle('10.0060', 'dms').ok, false);
});

test('gon과 십진 도', () => {
  near(rad('100', 'gon'), Math.PI / 2);
  near(rad('45.5', 'deg'), 45.5 * D);
});

test('빈 값과 문자는 각도 오류', () => {
  assert.equal(parseAngle('', 'dms').ok, false);
  assert.equal(parseAngle('abc', 'dms').ok, false);
  assert.equal(parseAngle('12.3x', 'deg').ok, false);
});

test('parseNum: 쉼표 소수점, 선택 입력, 필수 입력', () => {
  assert.deepEqual(parseNum('12,5'), { ok: true, v: 12.5 });
  assert.deepEqual(parseNum(' ', { optional: true }), { ok: true, v: 0 });
  assert.equal(parseNum('').ok, false);
  assert.equal(parseNum('1.2.3').ok, false);
});

test('normName은 공백 제거·대문자', () => {
  assert.equal(normName('  t1 '), 'T1');
});
