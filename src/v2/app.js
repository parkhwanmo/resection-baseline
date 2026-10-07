// v2 화면 — 입력 칸은 고정, 모드 전환은 hidden 토글, 결과·칸 상태만 갱신
import { inverse, forward, formatDms, parseState, parseForward, emptyState, loadState, saveState } from './inverse.js';

const v2Storage = {
  getItem(k) { return window.localStorage.getItem(k); },
  setItem(k, v) { window.localStorage.setItem(k, v); },
};
const V2_INPUTS = ['xa', 'ya', 'xb', 'yb', 'dist', 'az'];
let v2State = loadState(v2Storage);
const byId = (id) => document.getElementById(id);

function markBad(bad) {
  for (const k of V2_INPUTS) byId(k).classList.toggle('bad', bad.includes(k));
}

function showInverse() {
  const r = parseState(v2State);
  markBad(r.ok ? [] : r.bad);
  if (!r.ok) {
    byId('out-dist').textContent = '—';
    byId('out-az').textContent = '—';
    byId('msg').textContent = r.bad.length ? '빨간 칸의 숫자 형식을 확인하세요' : 'A, B 좌표를 입력하세요';
    return;
  }
  const { dist, az } = inverse(r.a, r.b);
  byId('out-dist').textContent = `${dist.toFixed(3)} m`;
  byId('out-az').textContent = az == null ? '—' : formatDms(az);
  byId('msg').textContent = az == null ? 'A와 B가 같은 점입니다' : '';
}

function showForward() {
  const r = parseForward(v2State);
  markBad(r.ok ? [] : r.bad);
  if (!r.ok) {
    byId('out-xb').textContent = '—';
    byId('out-yb').textContent = '—';
    byId('msg').textContent = r.bad.length ? '빨간 칸의 형식을 확인하세요 (거리는 0 이상, 방위각은 ddd.mmss)' : 'A 좌표, 거리, 방위각을 입력하세요';
    return;
  }
  const b = forward(r.a, r.dist, r.azDeg);
  byId('out-xb').textContent = b.x.toFixed(3);
  byId('out-yb').textContent = b.y.toFixed(3);
  byId('msg').textContent = `방위각 ${formatDms(r.azDeg)}`;
}

function showResult() {
  if (v2State.mode === 'forward') showForward(); else showInverse();
}

function showMode() {
  for (const b of document.querySelectorAll('[data-mode]')) b.setAttribute('aria-pressed', String(b.dataset.mode === v2State.mode));
  for (const el of document.querySelectorAll('[data-show]')) el.hidden = el.dataset.show !== v2State.mode;
}

function persistV2() {
  const ok = saveState(v2Storage, v2State);
  byId('banner').innerHTML = ok ? '' : '<div class="banner">이 브라우저에 저장할 수 없어 새로고침하면 입력이 사라집니다.</div>';
}

for (const k of V2_INPUTS) {
  const el = byId(k);
  el.value = v2State[k];
  el.addEventListener('input', () => { v2State[k] = el.value; persistV2(); showResult(); });
}

for (const b of document.querySelectorAll('[data-mode]')) {
  b.addEventListener('click', () => { v2State.mode = b.dataset.mode; persistV2(); showMode(); showResult(); });
}

byId('clear').addEventListener('click', () => {
  if (V2_INPUTS.some(k => v2State[k].trim()) && !confirm('입력한 값을 모두 지울까요?')) return;
  v2State = { ...emptyState(), mode: v2State.mode };
  for (const k of V2_INPUTS) byId(k).value = '';
  persistV2(); showResult();
  byId('xa').focus();
});

showMode();
showResult();

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
