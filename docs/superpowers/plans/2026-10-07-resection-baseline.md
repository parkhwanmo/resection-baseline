# 후방교회 기선 거리 앱 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** S1·S2 두 미지 기계점에서 관측한 공통점으로 S1–S2 거리와 상대 좌표를 구하는 오프라인 모바일 웹앱(PWA).

**Architecture:** 의존성 없는 순수 JS. `src/calc.js`(계산, DOM 없음) · `src/store.js`(저장·백업·CSV) · `src/app.js`(화면). `build.mjs`가 세 파일을 `dist/index.html` 한 파일로 인라인하고 manifest·서비스워커·아이콘을 함께 낸다.

**Tech Stack:** HTML/CSS/JS (ES2020), Node 24 `node:test`, 빌드 도구 없음.

**Spec:** `docs/superpowers/specs/2026-10-07-resection-baseline-design.md`

## Global Constraints

- 외부 라이브러리·CDN 금지 (완전 오프라인).
- UI 문구는 한국어.
- 거리 표시: m 소수 3자리. 잔차 표시: mm 소수 1자리.
- 기본 설정: `angleUnit:'dms'`, `vAngle:'zenith'`, `tolH:0.005`, `tolV:0.005`, `axis:'baseline'`.
- 저장 키 `rb.jobs.v1`. 입력값은 문자열 그대로 저장, 계산 시 해석.
- "항상 진행" 원칙: 계산 불가(공통점 < 2)만 실패, 나머지는 결과 + 경고.
- 모듈 규칙(빌드 인라인용): `import { a, b } from './x.js';` 한 줄 형식만, export는 `export function`/`export const`만, 파일 간 최상위 이름 중복 금지.

## Review Focus

1. 짧은 도분초 `123.45` / `123.4` → 우측 0 채움(123°45′00″, 123°40′00″). Task 1 테스트.
2. 음수 고도각 `-5.3000` → −5°30′. Task 1 테스트.
3. 빈 선택 입력(HI, HT, N0/E0/Z0) → 0, 빈 필수 입력(SD, HA, VA, N, E, Z) → 그 점만 오류. Task 2 테스트.
4. 반위 천정각 270°·HA 350° → HA 170°로 환산(360 넘김 정규화). Task 2 테스트.
5. localStorage 접근 불가(사생활 모드·예외) → 앱은 동작, 저장 실패만 표시. Task 4 테스트.

---

### Task 1: 프로젝트 골격 + 숫자·각도 해석

**Files:**
- Create: `package.json`, `.gitignore`, `src/calc.js`
- Test: `test/calc.angle.test.js`

**Interfaces:**
- Produces (`src/calc.js`):
  - `parseNum(str: string, {optional?: boolean}) -> {ok:true, v:number} | {ok:false, error:string}` — 공백 trim, 빈 문자열은 optional이면 `v:0`, 아니면 `error:'값 없음'`. 쉼표 소수점(`12,5`)도 허용.
  - `parseAngle(str: string, unit: 'dms'|'deg'|'gon') -> {ok:true, rad:number} | {ok:false, error:string}`
  - `normName(s: string) -> string` — trim + toUpperCase.

- [ ] **Step 1: 골격** — `package.json`: `{"name":"resection-baseline","private":true,"type":"module","scripts":{"test":"node --test","build":"node build.mjs"}}`. `.gitignore`: `node_modules/`.
- [ ] **Step 2: 실패 테스트 작성** `test/calc.angle.test.js`:
  - `parseAngle('123.4530','dms')` ≈ 123+45/60+30/3600 도 (rad, 1e-12)
  - `'123 45 30'`, `'123-45-30'` 동일
  - `'123.45'` → 123°45′, `'123.4'` → 123°40′, `'90'` → 90°
  - `'-5.3000'` → −5.5°
  - `'10.6000'`, `'10.0060'` → `ok:false`
  - `parseAngle('100','gon')` = π/2, `parseAngle('45.5','deg')` = 45.5°
  - `parseAngle('','dms')`, `'abc'` → `ok:false`
  - `parseNum('12,5')` → 12.5; `parseNum('',{optional:true})` → 0; `parseNum('')` → ok:false
  - `normName('  t1 ')` === `'T1'`
- [ ] **Step 3: 실패 확인** — `npm test` → FAIL (모듈 없음).
- [ ] **Step 4: 구현** — 도분초: 앞의 `-` 부호 분리 → 구분자(공백/`-`)가 있으면 d m s 그대로; 없으면 `ddd.mmss` 소수부를 최소 4자리가 되게 우측 0 채움 → 1–2번째 자리 = 분, 3–4번째 = 초, 5번째 이후 = 초의 소수(`123.453015` → 123°45′30.15″). 분 ≥ 60 또는 초 ≥ 60이면 오류.
- [ ] **Step 5: 통과 확인** — `npm test` → PASS.
- [ ] **Step 6: 커밋** — `feat: 각도·숫자 해석`

### Task 2: 기계점 로컬 좌표

**Files:**
- Modify: `src/calc.js`
- Test: `test/calc.local.test.js`

**Interfaces:**
- Consumes: Task 1 `parseNum`, `parseAngle`.
- Produces: `localPoint(obs: Obs, station: Station, settings: Settings) -> {ok:true, x, y, z} | {ok:false, error:string}` (Obs/Station/Settings는 스펙 5장 데이터 모델, 값은 문자열).

- [ ] **Step 1: 실패 테스트** `test/calc.local.test.js`:
  - polar: SD `'100'`, HA `'90'`, VA `'90'`, HT `''`, station HI `''` → (100, 0, 0) (1e-9)
  - polar: SD `'10'`, HA `'0'`, ZA `'60'`, HI `'1.5'`, HT `'1.2'` → x=0, y=10·sin60°, z=10·cos60°+0.3
  - 고도각 설정 `vAngle:'elevation'`, VA `'30'` = 천정각 60°와 같은 결과
  - 반위: ZA `'270'`, HA `'350'` → ZA `'90'`, HA `'170'`과 같은 결과
  - coord: N `'1005'`, E `'2003'`, Z `'101'`, station n0 `'1000'`, e0 `'2000'`, z0 `'100'` → (3, 5, 1); HI는 무시
  - SD `''` → `ok:false`; HA `'10.7000'` → `ok:false`
- [ ] **Step 2: 실패 확인** — `npm test` → FAIL.
- [ ] **Step 3: 구현** — 스펙 3.1 공식 그대로. 반위 판정은 ZA > π (천정각 환산 후).
- [ ] **Step 4: 통과 확인** — `npm test` → PASS.
- [ ] **Step 5: 커밋** — `feat: 기계점 로컬 좌표 계산`

### Task 3: 정합·결과 (`solve`)

**Files:**
- Modify: `src/calc.js`
- Create: `test/helpers/synth.js` (합성 관측 생성기)
- Test: `test/calc.solve.test.js`

**Interfaces:**
- Consumes: Task 1–2.
- Produces:
  - `fitRigid2D(pairs: Array<{a:{x,y}, b:{x,y}}>) -> {theta, tx, ty}` — `b ≈ R(theta)·a + t` (a=S2, b=S1).
  - `solve(job: Job) -> Result`:
    ```
    Result {
      status: 'ok'|'warn'|'fail',
      messages: [{level:'warn'|'error', code:'NOT_ENOUGH_COMMON'|'TWO_COMMON'|'NARROW'|'OVER_TOL', text}],
      baseline: {hd, sd, dz} | null,
      common: [{name, excluded, rh, rv, over}],   // rh/rv m, excluded 행은 rh/rv null
      rmsH, rmsV,                                  // 활성 공통점 기준, fail이면 null
      worst: string|null,                          // 허용 초과 중 max(rh/tolH, |rv|/tolV) 최대 점 이름
      points: [{name, X, Y, Z, source:'S1'|'S2'|'both'}],   // S1, S2 행 포함(앞쪽)
      perStation: {S1: [{id, name, ok, error, dup}], S2: [...]}
    }
    ```
  - `test/helpers/synth.js`: `makeJob({S1:{x,y,z,hi,az}, S2:{...}, targets:[{name,x,y,z,ht}], noise?:number, seed?:number}) -> Job` — 세계 좌표에서 기계점별 HA(=방위각−az), 천정각, 사거리를 dms 문자열(`ddd.mmss`, 초 소수 2자리)과 m 문자열(소수 4자리)로 만든다.

- [ ] **Step 1: 실패 테스트** `test/calc.solve.test.js`:
  - 무오차: S1(0,0,0) S2(37.21,−12.48,0.85), 타겟 5개, az 각각 23°·251° → `baseline.hd` = 참값 ± 0.0001, `dz` ± 0.0001, status `'ok'`
  - 잡음 0.002: 거리 ± 0.001
  - 타겟 하나 S2 관측 SD +0.050 → status `'warn'`, `OVER_TOL` 포함, `worst` = 그 점; `excluded`에 넣고 재계산 → status `'ok'`
  - 공통점 2 → status `'warn'`, `TWO_COMMON`, baseline 계산됨
  - 공통점 1 → status `'fail'`, `NOT_ENOUGH_COMMON`, baseline null
  - 공통점 간격 0.3m → `NARROW`
  - 이름 대소문자·공백 다름(`'t1'` vs `' T1'`) → 공통점으로 매칭
  - 한 기계점 안 중복 이름 → 마지막 값 사용, 앞 항목 `dup:true`
  - 관측·좌표 혼합(S2를 좌표 모드 + n0/e0 비영) → 같은 결과
  - `axis:'baseline'` → S2 행 = (hd, 0, dz) ± 1e-6, S1 행 = (0,0,0); `axis:'s1'` → S2 행 = S1 로컬 좌표의 S2 위치
  - 양쪽 관측 점의 X,Y = 두 추정 평균, `source:'both'`; 한쪽만 관측한 점 `source:'S1'`
  - 입력 오류 점은 `perStation`에 `ok:false`이고 계산에서 빠짐
- [ ] **Step 2: 실패 확인** — `npm test` → FAIL.
- [ ] **Step 3: 구현** — 스펙 3.2–3.5. `fitRigid2D`는 무게중심 닫힌 해. NARROW 판정: 활성 공통점(S1 로컬) 최대 쌍 간 수평거리 < 0.5. `over`: rh > tolH 또는 |rv| > tolV. 메시지 문구는 스펙 3.5 표 그대로.
- [ ] **Step 4: 통과 확인** — `npm test` → PASS.
- [ ] **Step 5: 커밋** — `feat: 후방교회 정합과 기선·상대좌표 계산`

### Task 4: 저장·백업·CSV

**Files:**
- Create: `src/store.js`
- Test: `test/store.test.js`

**Interfaces:**
- Consumes: Task 3 `Result`.
- Produces (`src/store.js`):
  - `STORAGE_KEY = 'rb.jobs.v1'`
  - `newJob(name: string) -> Job` (Global Constraints의 기본 설정, 빈 S1/S2, `id`=`Date.now().toString(36)+난수`)
  - `newObs(mode: 'polar'|'coord') -> Obs` (모든 값 `''`)
  - `loadJobs(storage) -> {ok:boolean, jobs: Job[]}` — 예외·파싱 실패 시 `{ok:false, jobs:[]}`
  - `saveJobs(storage, jobs) -> boolean` — 예외 시 false
  - `exportBackup(jobs) -> string` (`{"version":1,"jobs":[...]}`)
  - `importBackup(text) -> {ok:true, jobs} | {ok:false, error}` — version·jobs 배열 확인
  - `resultCsv(job, result) -> string` — `'﻿'` 시작, 섹션: `기선`(수평거리,사거리,고저차 m 4자리), `공통점 잔차`(점명,제외,수평mm,수직mm), `상대 좌표`(점명,X,Y,Z,출처). 줄바꿈 `\r\n`.

- [ ] **Step 1: 실패 테스트** `test/store.test.js`: Map 기반 가짜 storage로 저장→불러오기 왕복 동일; `getItem`이 throw하는 storage → `loadJobs` `{ok:false, jobs:[]}`, `setItem` throw → `saveJobs` false; 백업 왕복; `importBackup('{}')` → ok:false; CSV가 BOM으로 시작하고 `'상대 좌표'` 섹션과 `S2` 행 포함.
- [ ] **Step 2: 실패 확인** — `npm test` → FAIL.
- [ ] **Step 3: 구현**.
- [ ] **Step 4: 통과 확인** — `npm test` → PASS.
- [ ] **Step 5: 커밋** — `feat: 저장·백업·CSV`

### Task 5: 화면 (작업 목록·S1/S2·결과·설정)

**Files:**
- Create: `src/index.html`, `src/style.css`, `src/app.js`

**Interfaces:**
- Consumes: Task 1–4 전부. `app.js`는 `solve(job)` 결과만 그린다(계산 로직 금지).

- [ ] **Step 1: `src/index.html`** — `<meta viewport>`, `<link rel="manifest" href="manifest.webmanifest">`, `<!--STYLE-->`, `<!--SCRIPT-->` 자리표시(빌드가 치환), `<div id="app">`.
- [ ] **Step 2: `src/style.css`** — 모바일 세로 우선, 터치 대상 ≥ 44px, 다크모드(`prefers-color-scheme`), 상태 색: 정상 초록 / 경고 노랑 / 실패·초과 빨강.
- [ ] **Step 3: `src/app.js`** — 스펙 4장 화면:
  - 상태 `{jobs, currentId, tab:'S1'|'S2'|'result'|'settings', editing:{station, obsId}|null}`; 변경마다 `saveJobs(localStorage 접근을 try로 감싼 객체)` → 실패 시 상단에 "저장 안 됨 — 백업을 내려받으세요" 배너.
  - 점 입력 폼: 모드 토글, `inputmode="decimal"`, 점명 `<datalist>`에 상대 기계점 점명, "저장 후 다음 점" 버튼.
  - 결과 탭: 큰 숫자 3개, 상태 배지, 잔차 표(활성 공통점이 2개면 남은 체크박스 비활성), `worst`에 "제외 후 재계산" 버튼, 상대 좌표 표, CSV 저장(`Blob` + `a[download]`), 결과 복사(`navigator.clipboard`, 실패 시 선택 가능한 textarea).
  - 작업 목록: 새 작업, 열기, 이름 변경(`prompt`), 삭제(`confirm`).
  - 설정 탭: 각도 단위 3종, 연직각 종류 2종, 허용 잔차 수평·수직(mm로 입력, m로 저장), 축 방식 2종.
  - 백업 저장/불러오기(`<input type=file accept=".json">`).
- [ ] **Step 4: 동작 확인** — Task 6 빌드 후 확인(아래).
- [ ] **Step 5: 커밋** — `feat: 모바일 화면`

### Task 6: 빌드·PWA·README

**Files:**
- Create: `build.mjs`, `src/manifest.webmanifest`, `src/sw.js`, `src/icon.svg`, `README.md`

**Interfaces:**
- Consumes: Task 5 자리표시 `<!--STYLE-->`, `<!--SCRIPT-->`.
- Produces: `dist/index.html`(단일 파일), `dist/manifest.webmanifest`, `dist/sw.js`, `dist/icon.svg`.

- [ ] **Step 1: `build.mjs`** — `calc.js`→`store.js`→`app.js` 순으로 읽어 `import ... from` 줄 삭제, 줄 머리 `export ` 제거, 하나의 `<script>`로 삽입; CSS 인라인; `sw.js`의 `__VERSION__`을 산출 HTML의 SHA-256 앞 8자로 치환.
- [ ] **Step 2: `sw.js`** — install 시 `['./','./index.html','./manifest.webmanifest','./icon.svg']` 캐시, fetch는 캐시 우선·네트워크 대체, activate 시 이전 버전 캐시 삭제. `app.js`는 `location.protocol==='https:'`일 때만 등록.
- [ ] **Step 3: manifest** — `name:"후방교회 기선 거리"`, `short_name:"기선거리"`, `display:"standalone"`, `start_url:"./"`, 아이콘 svg(`sizes:"any"`).
- [ ] **Step 4: 빌드·테스트** — `npm test && npm run build` → 테스트 PASS, `dist/` 4개 파일 생성, `dist/index.html`에 `import `·`export ` 없음(`Select-String` 0건).
- [ ] **Step 5: 브라우저 확인** — `dist/index.html`을 모바일 뷰포트(390×844)로 열어: 새 작업 → Task 3 무오차 시나리오 값 입력(S1·S2 각 3점) → 결과 탭 거리가 테스트 참값과 mm까지 일치, 새로고침 후 데이터 유지, 콘솔 오류 없음.
- [ ] **Step 6: README** — 사용 순서(S1 관측 → S2 관측 → 결과), 각도 입력 형식, 설치(GitHub Pages URL 또는 단일 파일), 개발 명령.
- [ ] **Step 7: 커밋** — `feat: 단일 파일 빌드와 PWA`

### 배포 (사용자 확인 후)
GitHub 저장소 생성·푸시·Pages 활성화는 공개 작업이므로 사용자에게 확인을 받은 뒤 진행한다.
