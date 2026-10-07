// 화면 — 계산은 calc.solve 결과만 사용
import { solve, localPoint, normName, pruneExcluded } from './calc.js';
import { newJob, newObs, loadJobs, saveJobs, exportBackup, importBackup, resultCsv, fmtFixed } from './store.js';

const safeStorage = {
  getItem(k) { return window.localStorage.getItem(k); },
  setItem(k, v) { window.localStorage.setItem(k, v); },
};

const loaded = loadJobs(safeStorage);
const state = {
  jobs: loaded.jobs,
  storageOk: loaded.ok,
  currentId: null,
  tab: 'S1',
  sheet: null, // {type:'obs', station, draft, isNew} | {type:'copy', text}
};

const root = document.getElementById('app');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const f3 = (v) => (v == null ? '—' : fmtFixed(v, 3));
const mmf = (v) => (v == null ? '—' : fmtFixed(v * 1000, 1));
const currentJob = () => state.jobs.find(j => j.id === state.currentId) || null;
const otherStation = (k) => (k === 'S1' ? 'S2' : 'S1');

function persist() {
  const job = currentJob();
  if (job) job.updatedAt = Date.now();
  const ok = saveJobs(safeStorage, state.jobs);
  if (ok !== state.storageOk) { state.storageOk = ok; renderBanner(); }
}

function download(name, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const today = () => new Date().toISOString().slice(0, 10);
const angleHint = (unit) => ({ dms: 'ddd.mmss', deg: '도', gon: 'gon' }[unit]);

// ---------- 렌더 ----------

function render() {
  const job = currentJob();
  root.innerHTML = job ? jobView(job) : listView();
  renderBanner();
  renderSheet();
}

function renderBanner() {
  let el = document.getElementById('banner');
  if (!el) return;
  el.innerHTML = state.storageOk ? '' : '<div class="banner">저장 안 됨 — 이 브라우저에 저장할 수 없습니다. 작업 목록에서 백업을 내려받으세요.</div>';
}

function listView() {
  const items = state.jobs.slice().sort((a, b) => b.updatedAt - a.updatedAt).map(j => {
    let r;
    try { r = solve(j); } catch { r = { baseline: null }; }
    const meta = r.baseline ? `기선 ${f3(r.baseline.hd)} m` : `S1 ${j.stations.S1.obs.length}점 · S2 ${j.stations.S2.obs.length}점`;
    return `<li><div class="row">
      <button class="item grow" data-act="open" data-id="${j.id}"><span class="name">${esc(j.name)}</span><span class="meta">${meta}<br>${new Date(j.updatedAt).toLocaleString('ko-KR')}</span></button>
      <button data-act="rename" data-id="${j.id}" aria-label="이름 변경">✎</button>
      <button class="danger" data-act="delete" data-id="${j.id}" aria-label="삭제">🗑</button>
    </div></li>`;
  }).join('');
  return `
    <header class="bar"><h1>후방교회 기선 거리</h1></header>
    <div id="banner"></div>
    <div class="card">
      <button class="primary full" data-act="new">+ 새 작업</button>
    </div>
    <div class="card">
      <h2>작업 목록</h2>
      ${items ? `<ul class="list">${items}</ul>` : '<p class="hint">아직 작업이 없습니다. 새 작업을 만들고 S1 → S2 순서로 공통점 관측값을 입력하세요.</p>'}
    </div>
    <div class="card">
      <h2>백업</h2>
      <div class="row">
        <button class="grow" data-act="backup">백업 저장</button>
        <label class="btn grow" style="display:flex;align-items:center;justify-content:center">백업 불러오기
          <input type="file" accept=".json,application/json" data-act="restore" hidden></label>
      </div>
      <p class="hint">데이터는 이 브라우저에만 저장됩니다. 브라우저 데이터를 지우기 전에 백업하세요.</p>
    </div>`;
}

function jobView(job) {
  const tabs = [['S1', 'S1'], ['S2', 'S2'], ['result', '결과'], ['settings', '설정']]
    .map(([k, l]) => `<button role="tab" aria-selected="${state.tab === k}" data-act="tab" data-tab="${k}">${l}</button>`).join('');
  let body;
  if (state.tab === 'S1' || state.tab === 'S2') body = stationView(job, state.tab);
  else if (state.tab === 'result') body = resultView(job);
  else body = settingsView(job);
  return `
    <header class="bar"><button data-act="home" aria-label="작업 목록">←</button><h1>${esc(job.name)}</h1></header>
    <nav class="tabs" role="tablist">${tabs}</nav>
    <div id="banner"></div>
    ${body}`;
}

function obsSummary(o, settings) {
  if (o.mode === 'coord') return `N ${esc(o.n) || '?'} · E ${esc(o.e) || '?'} · Z ${esc(o.z) || '?'}`;
  return `SD ${esc(o.sd) || '?'} · HA ${esc(o.ha) || '?'} · ${settings.vAngle === 'zenith' ? 'ZA' : 'VA'} ${esc(o.va) || '?'}${o.ht ? ` · HT ${esc(o.ht)}` : ''}`;
}

function stationView(job, key) {
  const st = job.stations[key];
  const r = solve(job);
  const status = new Map(r.perStation[key].map(p => [p.id, p]));
  const otherKeys = new Set(job.stations[otherStation(key)].obs.map(o => normName(o.name)).filter(Boolean));
  const rows = st.obs.map(o => {
    const s = status.get(o.id);
    let tag;
    if (!s.ok) tag = `<span class="tag bad">오류</span>`;
    else if (s.dup) tag = `<span class="tag warn">중복</span>`;
    else if (otherKeys.has(normName(o.name))) tag = `<span class="tag ok">공통</span>`;
    else tag = `<span class="tag">${key}만</span>`;
    return `<li><button class="item" data-act="edit" data-st="${key}" data-id="${o.id}">
      <span class="name">${esc(o.name) || '(이름 없음)'}</span>
      <span class="meta">${obsSummary(o, job.settings)}${s.ok ? '' : `<br><span class="err">${esc(s.error)}</span>`}</span>${tag}</button></li>`;
  }).join('');
  const nCommon = r.common.length;
  return `
    <div class="card">
      <h2>기계점 ${key}</h2>
      <label class="field"><span>기계고 HI (m) — 관측값 입력에 사용, 비우면 0</span>
        <input inputmode="decimal" data-bind="hi" data-st="${key}" value="${esc(st.hi)}"></label>
      <details ${st.n0 || st.e0 || st.z0 ? 'open' : ''}>
        <summary class="hint">기계점 좌표 (좌표 입력 시, 측량기에 설정한 값)</summary>
        <div class="grid3">
          <label class="field"><span>N0</span><input inputmode="decimal" data-bind="n0" data-st="${key}" value="${esc(st.n0)}"></label>
          <label class="field"><span>E0</span><input inputmode="decimal" data-bind="e0" data-st="${key}" value="${esc(st.e0)}"></label>
          <label class="field"><span>Z0</span><input inputmode="decimal" data-bind="z0" data-st="${key}" value="${esc(st.z0)}"></label>
        </div>
      </details>
    </div>
    <div class="card"><div id="obs-list">
      <h2>관측점 ${st.obs.length}개 · 공통점 ${nCommon}개</h2>
      ${rows ? `<ul class="list">${rows}</ul>` : `<p class="hint">${key === 'S1' ? 'S1에서 보이는 공통점(타겟)을 관측해 입력하세요. S2에서도 같은 이름으로 관측해야 합니다.' : 'S1에서 관측한 공통점을 같은 이름으로 관측해 입력하세요. 3점 이상 권장.'}</p>`}</div>
      <div class="row" style="margin-top:8px">
        <button class="primary grow" data-act="add" data-st="${key}" data-mode="polar">+ 관측값</button>
        <button class="grow" data-act="add" data-st="${key}" data-mode="coord">+ 좌표</button>
      </div>
    </div>`;
}

function resultView(job) {
  const r = solve(job);
  const cls = { ok: 'ok', warn: 'warn', fail: 'fail' }[r.status];
  const label = { ok: '정상', warn: '경고', fail: '계산 불가' }[r.status];
  const msgs = r.messages.length ? `<ul>${r.messages.map(m => `<li>${esc(m.text)}</li>`).join('')}</ul>` : '';
  let html = `<div class="status ${cls}">${label}${msgs}</div>`;
  if (r.status === 'fail') {
    const names = (k) => job.stations[k].obs.map(o => esc(o.name.trim())).filter(Boolean).join(', ') || '없음';
    return html + `<div class="card"><h2>점명 확인</h2><p>S1: ${names('S1')}</p><p>S2: ${names('S2')}</p>
      <p class="hint">두 기계점에서 같은 이름으로 관측한 점이 공통점이 됩니다(대소문자·공백 무시).</p></div>`;
  }
  const b = r.baseline;
  html += `<div class="card"><h2>S1 – S2</h2><div class="big">
    <div><b>${f3(b.hd)}</b><small>수평거리 m</small></div>
    <div><b>${f3(b.sd)}</b><small>사거리 m</small></div>
    <div><b>${f3(b.dz)}</b><small>고저차 m</small></div></div></div>`;
  const active = r.common.filter(c => !c.excluded).length;
  const rows = r.common.map(c => {
    const lock = !c.excluded && active <= 2;
    return `<tr class="${c.excluded ? 'off' : c.over ? 'over' : ''}">
      <td><label><input type="checkbox" data-act="toggle" data-name="${esc(c.name)}" ${c.excluded ? '' : 'checked'} ${lock ? 'disabled' : ''}> ${esc(c.name)}</label></td>
      <td>${mmf(c.rh)}</td><td>${mmf(c.rv)}</td></tr>`;
  }).join('');
  html += `<div class="card"><h2>공통점 잔차 (mm) · 허용 수평 ${mmf(job.settings.tolH)} / 수직 ${mmf(job.settings.tolV)}</h2>
    <div class="tablewrap"><table><thead><tr><th>사용 · 점명</th><th>수평</th><th>수직</th></tr></thead><tbody>${rows}
    <tr><td><b>RMS</b></td><td><b>${mmf(r.rmsH)}</b></td><td><b>${mmf(r.rmsV)}</b></td></tr></tbody></table></div>
    ${r.worst && active > 2 ? `<button class="full" style="margin-top:8px" data-act="toggle" data-name="${esc(r.worst)}">${esc(r.worst)} 제외 후 재계산</button>` : ''}
    <p class="hint">체크를 해제하면 그 점을 빼고 다시 계산합니다.</p></div>`;
  const pts = r.points.map(p => `<tr><td>${esc(p.name)}</td><td>${f3(p.X)}</td><td>${f3(p.Y)}</td><td>${f3(p.Z)}</td><td>${{ both: '양쪽', S1: 'S1', S2: 'S2' }[p.source]}</td></tr>`).join('');
  const axis = job.settings.axis === 'baseline' ? 'S1 원점, S1→S2 = +X' : 'S1 원점, S1 수평각 0° = +Y';
  html += `<div class="card"><h2>상대 좌표 (m) · ${axis}</h2>
    <div class="tablewrap"><table><thead><tr><th>점명</th><th>X</th><th>Y</th><th>Z</th><th>관측</th></tr></thead><tbody>${pts}</tbody></table></div></div>
    <div class="row"><button class="grow" data-act="csv">CSV 저장</button><button class="grow" data-act="copy">결과 복사</button></div>`;
  return html;
}

function settingsView(job) {
  const s = job.settings;
  const opt = (v, cur, l) => `<option value="${v}" ${v === cur ? 'selected' : ''}>${l}</option>`;
  return `<div class="card">
    <label class="field"><span>각도 단위</span><select data-set="angleUnit">
      ${opt('dms', s.angleUnit, '도분초 (ddd.mmss)')}${opt('deg', s.angleUnit, '십진 도')}${opt('gon', s.angleUnit, 'gon')}</select></label>
    <label class="field"><span>연직각 종류</span><select data-set="vAngle">
      ${opt('zenith', s.vAngle, '천정각 (수평 = 90°)')}${opt('elevation', s.vAngle, '고도각 (수평 = 0°)')}</select></label>
    <div class="grid2">
      <label class="field"><span>허용 잔차 수평 (mm)</span><input inputmode="decimal" data-set="tolH" value="${esc(+(s.tolH * 1000).toFixed(3))}"></label>
      <label class="field"><span>허용 잔차 수직 (mm)</span><input inputmode="decimal" data-set="tolV" value="${esc(+(s.tolV * 1000).toFixed(3))}"></label>
    </div>
    <label class="field"><span>상대 좌표 축</span><select data-set="axis">
      ${opt('baseline', s.axis, 'S1 원점, S1→S2 방향 = +X')}${opt('s1', s.axis, 'S1 원점, S1 수평각 0° = +Y')}</select></label>
    <p class="hint">입력한 값은 그대로 보관되므로 단위를 바꾸면 기존 입력도 새 단위로 다시 해석됩니다.</p>
  </div>`;
}

// ---------- 입력 시트 ----------

function renderSheet() {
  let el = document.getElementById('sheet');
  if (!state.sheet) { if (el) el.remove(); return; }
  if (!el) { el = document.createElement('div'); el.id = 'sheet'; document.body.appendChild(el); }
  const sh = state.sheet;
  if (sh.type === 'copy') {
    el.innerHTML = `<div class="sheet-bg" data-act="close-bg"><div class="sheet"><h2>결과 텍스트</h2>
      <textarea class="copy" readonly>${esc(sh.text)}</textarea>
      <p class="hint">자동 복사가 안 되면 길게 눌러 선택·복사하세요.</p>
      <button class="full" data-act="close">닫기</button></div></div>`;
    return;
  }
  const job = currentJob();
  const d = sh.draft;
  const unit = angleHint(job.settings.angleUnit);
  const vl = job.settings.vAngle === 'zenith' ? '천정각 ZA' : '고도각 VA';
  const names = [...new Set(job.stations[otherStation(sh.station)].obs.map(o => o.name.trim()).filter(Boolean))];
  const fields = d.mode === 'coord'
    ? `<div class="grid3">
        ${inp('n', 'N', d.n)}${inp('e', 'E', d.e)}${inp('z', 'Z', d.z)}</div>`
    : `<div class="grid2">
        ${inp('sd', '사거리 SD (m)', d.sd)}${inp('ht', '프리즘고 HT (m)', d.ht)}
        ${inp('ha', `수평각 HA (${unit})`, d.ha)}${inp('va', `${vl} (${unit})`, d.va)}</div>`;
  el.innerHTML = `<div class="sheet-bg" data-act="close-bg"><div class="sheet" role="dialog" aria-label="관측점 입력">
    <h2>${sh.station} · ${sh.isNew ? '점 추가' : '점 수정'}</h2>
    <div class="seg" role="group">
      <button data-act="mode" data-mode="polar" aria-pressed="${d.mode === 'polar'}">관측값</button>
      <button data-act="mode" data-mode="coord" aria-pressed="${d.mode === 'coord'}">좌표</button>
    </div>
    <label class="field"><span>점명</span><input data-draft="name" list="names" autocomplete="off" autocapitalize="characters" value="${esc(d.name)}"></label>
    <datalist id="names">${names.map(n => `<option value="${esc(n)}">`).join('')}</datalist>
    ${fields}
    <div class="preview" id="preview"></div>
    <div class="row">
      <button class="primary grow" data-act="save-next">저장 후 다음 점</button>
      <button class="grow" data-act="save">저장</button>
    </div>
    <div class="row" style="margin-top:8px">
      ${sh.isNew ? '' : '<button class="danger grow" data-act="remove">삭제</button>'}
      <button class="grow" data-act="close">취소</button>
    </div></div></div>`;
  updatePreview();
}

function inp(k, label, v) {
  return `<label class="field"><span>${label}</span><input inputmode="decimal" data-draft="${k}" value="${esc(v)}"></label>`;
}

function updatePreview() {
  const el = document.getElementById('preview');
  if (!el || !state.sheet || state.sheet.type !== 'obs') return;
  const job = currentJob();
  const p = localPoint(state.sheet.draft, job.stations[state.sheet.station], job.settings);
  el.innerHTML = p.ok
    ? `기계점 기준 x ${f3(p.x)} · y ${f3(p.y)} · z ${f3(p.z)} · 수평거리 ${f3(Math.hypot(p.x, p.y))}`
    : `<span class="err">${esc(p.error)}</span>`;
}

const DRAFT_FIELDS = ['name', 'sd', 'ha', 'va', 'n', 'e', 'z'];
const draftHasValues = (d) => DRAFT_FIELDS.some(k => String(d[k] ?? '').trim());

function openObsSheet(station, draft, isNew) {
  state.sheet = { type: 'obs', station, draft, isNew, orig: JSON.stringify(draft) };
}

// 입력한 내용이 있으면 확인 후 닫기
function closeSheet() {
  const sh = state.sheet;
  if (sh && sh.type === 'obs' && JSON.stringify(sh.draft) !== sh.orig && !confirm('입력한 내용을 버릴까요?')) return;
  state.sheet = null; renderSheet();
}

// 저장할 값이 없으면 false
function saveDraft() {
  const sh = state.sheet;
  if (!draftHasValues(sh.draft)) return false;
  const st = currentJob().stations[sh.station];
  const i = st.obs.findIndex(o => o.id === sh.draft.id);
  if (i >= 0) st.obs[i] = { ...sh.draft }; else st.obs.push({ ...sh.draft });
  currentJob().excluded = pruneExcluded(currentJob());
  persist();
  return true;
}

function focusName() {
  const n = document.querySelector('[data-draft="name"]');
  if (n) n.focus();
}

// ---------- 이벤트 ----------

function resultText(job) {
  const r = solve(job);
  const lines = [`${job.name} (${today()})`];
  if (r.baseline) {
    lines.push(`S1–S2 수평거리 ${f3(r.baseline.hd)} m`, `사거리 ${f3(r.baseline.sd)} m`, `고저차 ${f3(r.baseline.dz)} m`,
      `잔차 RMS 수평 ${mmf(r.rmsH)} mm / 수직 ${mmf(r.rmsV)} mm (공통점 ${r.common.filter(c => !c.excluded).length}점)`);
  }
  for (const m of r.messages) lines.push(`※ ${m.text}`);
  if (r.points.length) {
    lines.push('', '점명\tX\tY\tZ');
    for (const p of r.points) lines.push(`${p.name}\t${f3(p.X)}\t${f3(p.Y)}\t${f3(p.Z)}`);
  }
  return lines.join('\n');
}

document.addEventListener('click', async (e) => {
  const t = e.target.closest('[data-act]');
  if (!t) return;
  const act = t.dataset.act;
  const job = currentJob();
  if (act === 'close-bg') { if (e.target === t) closeSheet(); return; }
  switch (act) {
    case 'new': {
      const name = prompt('작업 이름', `기선 ${today()}`);
      if (name == null) return;
      const j = newJob(name.trim() || `기선 ${today()}`);
      state.jobs.push(j); state.currentId = j.id; state.tab = 'S1';
      persist(); render(); break;
    }
    case 'open': state.currentId = t.dataset.id; state.tab = 'S1'; render(); break;
    case 'home': state.currentId = null; render(); break;
    case 'rename': {
      const j = state.jobs.find(x => x.id === t.dataset.id);
      const name = prompt('작업 이름', j.name);
      if (name == null || !name.trim()) return;
      j.name = name.trim(); persist(); render(); break;
    }
    case 'delete': {
      const j = state.jobs.find(x => x.id === t.dataset.id);
      if (!confirm(`"${j.name}" 작업을 삭제할까요? 되돌릴 수 없습니다.`)) return;
      state.jobs = state.jobs.filter(x => x !== j); persist(); render(); break;
    }
    case 'backup': download(`기선거리-백업-${today()}.json`, exportBackup(state.jobs), 'application/json'); break;
    case 'tab': state.tab = t.dataset.tab; render(); window.scrollTo(0, 0); break;
    case 'add':
      openObsSheet(t.dataset.st, newObs(t.dataset.mode), true);
      renderSheet(); focusName(); break;
    case 'edit': {
      const o = job.stations[t.dataset.st].obs.find(x => x.id === t.dataset.id);
      openObsSheet(t.dataset.st, { ...o }, false);
      renderSheet(); break;
    }
    case 'mode': state.sheet.draft.mode = t.dataset.mode; renderSheet(); break;
    case 'save': saveDraft(); state.sheet = null; render(); break;
    case 'save-next': {
      if (!saveDraft()) { focusName(); break; }
      const { station, draft } = state.sheet;
      openObsSheet(station, { ...newObs(draft.mode), ht: draft.ht }, true);
      render(); focusName(); break;
    }
    case 'remove': {
      if (!confirm('이 점을 삭제할까요?')) return;
      const st = job.stations[state.sheet.station];
      st.obs = st.obs.filter(o => o.id !== state.sheet.draft.id);
      job.excluded = pruneExcluded(job);
      state.sheet = null; persist(); render(); break;
    }
    case 'close': closeSheet(); break;
    case 'toggle': {
      const k = normName(t.dataset.name);
      const ex = new Set(job.excluded.map(normName));
      if (ex.has(k)) ex.delete(k); else ex.add(k);
      job.excluded = [...ex]; persist(); render(); break;
    }
    case 'csv': download(`${job.name}-${today()}.csv`, resultCsv(job, solve(job)), 'text/csv;charset=utf-8'); break;
    case 'copy': {
      const text = resultText(job);
      try { await navigator.clipboard.writeText(text); alert('결과를 복사했습니다.'); }
      catch { state.sheet = { type: 'copy', text }; renderSheet(); }
      break;
    }
  }
});

document.addEventListener('input', (e) => {
  const t = e.target;
  const job = currentJob();
  if (t.dataset.draft && state.sheet) {
    state.sheet.draft[t.dataset.draft] = t.value; updatePreview();
  } else if (t.dataset.bind && job) {
    job.stations[t.dataset.st][t.dataset.bind] = t.value; persist();
  } else if (t.dataset.set && job && (t.dataset.set === 'tolH' || t.dataset.set === 'tolV')) {
    const v = Number(t.value.replace(',', '.'));
    if (Number.isFinite(v) && v > 0) { job.settings[t.dataset.set] = v / 1000; persist(); }
  }
});

document.addEventListener('change', async (e) => {
  const t = e.target;
  const job = currentJob();
  if (t.dataset.set && job && t.tagName === 'SELECT') {
    job.settings[t.dataset.set] = t.value; persist(); render();
  } else if (t.dataset.bind && job) {
    // 기계고·기계점 좌표 변경 후 관측점 목록만 갱신 (입력 칸 포커스 유지)
    const card = document.getElementById('obs-list');
    const tmp = document.createElement('div');
    tmp.innerHTML = stationView(job, t.dataset.st);
    const fresh = tmp.querySelector('#obs-list');
    if (card && fresh) card.replaceWith(fresh);
  } else if (t.dataset.act === 'restore' && t.files[0]) {
    const res = importBackup(await t.files[0].text());
    if (!res.ok) { alert(res.error); return; }
    const ids = new Set(state.jobs.map(j => j.id));
    const added = res.jobs.filter(j => !ids.has(j.id));
    if (!confirm(`백업에서 작업 ${res.jobs.length}개 중 새 작업 ${added.length}개를 추가할까요? (같은 작업은 건너뜀)`)) return;
    state.jobs.push(...added); persist(); render();
  }
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && state.sheet) closeSheet();
});

render();

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
