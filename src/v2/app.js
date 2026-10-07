// v2 화면 — 입력 칸은 고정, 결과·칸 상태만 갱신
import { inverse, formatDms, parseState, emptyState, loadState, saveState } from './inverse.js';

const v2Storage = {
  getItem(k) { return window.localStorage.getItem(k); },
  setItem(k, v) { window.localStorage.setItem(k, v); },
};
const V2_INPUTS = ['xa', 'ya', 'xb', 'yb'];
let v2State = loadState(v2Storage);
const byId = (id) => document.getElementById(id);

function showResult() {
  const r = parseState(v2State);
  for (const k of V2_INPUTS) byId(k).classList.toggle('bad', !r.ok && r.bad.includes(k));
  if (!r.ok) {
    byId('dist').textContent = '—';
    byId('az').textContent = '—';
    byId('msg').textContent = r.bad.length ? '빨간 칸의 숫자 형식을 확인하세요' : 'A, B 좌표를 입력하세요';
    return;
  }
  const { dist, az } = inverse(r.a, r.b);
  byId('dist').textContent = `${dist.toFixed(3)} m`;
  byId('az').textContent = az == null ? '—' : formatDms(az);
  byId('msg').textContent = az == null ? 'A와 B가 같은 점입니다' : '';
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

byId('clear').addEventListener('click', () => {
  if (V2_INPUTS.some(k => v2State[k].trim()) && !confirm('입력한 좌표를 모두 지울까요?')) return;
  v2State = emptyState();
  for (const k of V2_INPUTS) byId(k).value = '';
  persistV2(); showResult();
  byId('xa').focus();
});

showResult();

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
