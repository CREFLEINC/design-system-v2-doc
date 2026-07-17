# CREFLE 문서 디자인 시스템 — 설계

*2026-07-17 · 상태: Phase 1 구현 중*

## 왜 만드는가

CREFLE 은 이미 HTML 문서를 생산·배포한다. `CREFLEINC/reports`(PUBLIC, Python/FastAPI)가
제안서·기획서를 HTML+PDF 로 서빙한다. 그런데 **실제로 나가는 문서에는 디자인 시스템이 없다.**

조사 결과 CREFLE 문서 생태계는 서로 호환되지 않는 **네 개의 현실**로 갈라져 있었다:

| 무엇 | 서체 | `--primary` | 실태 |
|---|---|---|---|
| 파운데이션 `tokens.css` | Spoqa | **`#C9252C`** | ✅ 단일 진실원 ("RangKim 확정 2026-06-25") — **문서에 도달하지 못함** |
| `~/.claude/skills/crefle_designer` | Spoqa | `#4758A9` | 개인 스킬. 파운데이션이 `--product-primary` 로 강등한 색 |
| `reports/proposals/ohmyfactory/` | Spoqa | `#4758A9` | 위 스킬의 **바이트 동일 손복사본** (`diff -q` 확인) |
| **실제 발행된 자기완결 문서 전부** | **Pretendard (CDN)** | **토큰 없음** | 디자인 시스템을 **아예 안 씀** |

마지막 줄이 핵심이다. 삼진엘앤디 데모 v8/v9, OMF PoC 기획서 v1/v2 — 최근 발행물 전부가
Pretendard 를 CDN 에서 받고 디자인 토큰이 하나도 없다. Spoqa 를 쓰는 `crefle_designer` 쪽이
오히려 안 쓰이고 있었다.

**근본 원인**: `crefle_designer` 스킬이 2026-06-25 브랜드 레드 결정보다 **먼저** 만들어졌다.
파운데이션은 이 스킬에서 *파생되어*(`tokens.css` 헤더: "출처: CREFLE Presentation Design System")
그것을 교정했지만, 스킬과 그 복사본들은 교정을 받지 못했다. 즉 **유능한 모델이 가장 접근 가능한
지침을 따랐고, 그 지침이 낡아 있었다.**

그래서 이 프로젝트는 "드리프트된 시스템을 고치는 일"이 아니라
**"실제로 나가는 문서에는 시스템이 없으니, 하나 만들고 그것이 가장 쉬운 길이 되게 하는 일"** 이다.

## 실측한 사실

### ① `colors_and_type.css` 의 아이콘은 한 번도 작동한 적이 없다

그 파일은 8행에 규칙을 주석으로 적어놓고 36행에서 어긴다:

```
 8  /* @import rules must precede @font-face per CSS spec */
 9  @import url(…JetBrains+Mono…);          ← 유효
11–35  @font-face × 5 (Spoqa)
36  @import url(…Material+Symbols+Rounded…);  ← @font-face 뒤 = 스펙 위반 = 파서가 버림
```

실제 Chrome 에서 **네트워크를 열어둔 채** 실측:

```json
{ "atImportRulesThatSurvivedParsing": ["JetBrainsMono"],   // 둘 중 하나만 살아남음
  "MaterialSymbols_registered": 0,
  "icon_width_px": 94,
  "icon_verdict": "RENDERING AS TEXT (broken)" }
```

`<span class="material-symbols-rounded">photo_camera</span>` 는 글리프가 아니라 **literal
"photo_camera" 문자열**로 렌더된다. CDN 문제가 아니라 순수 CSS 스펙 위반이다.
현재 발행물은 아이콘을 안 쓰므로(`grep -c` → 0) **터진 불이 아니라 장전된 덫**이었다 —
다만 스킬 `SKILL.md:54` 가 아이콘 사용을 **지시**하므로 Claude 가 자기 지침을 따르는 순간 터진다.

**규칙을 알고 적어둔 사람조차 27줄 뒤에 어겼다.** 그래서 규율이 아니라 구조로 막는다:
산출물 CSS 는 평평하고(`build.mjs` 가 concat), `check-fonts.mjs` 가 순서를 검사한다.

### ② PDF 경로가 둘이고, 같은 문서가 경로에 따라 다른 PDF 가 된다

| 경로 | 실행 위치 | 네트워크 | 결과 |
|---|---|---|---|
| `proposals/` (큐레이션) | **개발자 맥**에서 `render_pdf.py --all` 수동 | ✅ | CDN Pretendard 로드 성공 → 정상 |
| `uploads/` (셀프 업로드) | `renderer` 컨테이너, **`network_mode:"none"`** | ❌ 차단 | CDN 폰트 **100% 실패 → 폴백** |

발행된 `OhMyFactory_PoC_기획서_v2.pdf` 의 임베드 폰트를 뜯어보면
`Pretendard-{Regular,Medium,SemiBold,Bold,ExtraBold}` + **`Menlo-Bold`** 가 나온다.
Menlo 는 macOS 에만 있다 → **그 PDF 는 재현 불가능하다.** 다른 머신에서 같은 HTML 을 렌더하면
다른 PDF 가 나온다. 그리고 동료가 웹 업로드로 같은 문서를 올리면 격리 컨테이너가 CDN 을 못 받아
폰트가 통째로 폴백된다.

→ **자산을 번들하면 두 경로가 같은 결과를 낸다.** 이것이 이 DS 의 실질 가치 중 하나다.

### ③ `reports` 는 이 DS 의 소비자가 **아니다**

README: "사내 HTML 보고서를 한곳에서 열람하는 자체 호스팅 문서 서버".
`register-report` 스킬: **"리포트 본문 작성 자체는 외부에서 수행하며 이 스킬은 '등록'만 담당한다"**.
`proposals/ohmyfactory/colors_and_type.css` 는 reports 가 벤더링한 DS 가 **아니라**, 그 폴더에
등록된 문서들이 `--assets` 로 지고 들어온 자산이 쌓인 것이다.
**자산은 문서의 짐이지 서버의 것이 아니다.** reports 는 인쇄기지 편집국이 아니다 — 건드리지 않는다.

### ④ 파운데이션 `--on-surface-muted` 는 네 표면 전부에서 WCAG AA 미달

실측:

| 표면 | 대비 | 판정 |
|---|---|---|
| `--surface` (#FBF8FD) | 4.26:1 | ❌ |
| `--surface-container-low` | 4.04:1 | ❌ |
| `--surface-container` | 3.86:1 | ❌ |
| `--surface-container-high` | 3.65:1 | ❌ |

본문 AA 기준은 4.5:1. 가이드는 `--surface` 기준 4.26 만 기록했지만 실제로는 **네 표면 전부** 미달이다.
`--primary`(#C9252C)는 전 표면 통과(5.27→4.52)라 다행이다.
→ `doc-tokens.css` 가 `#65646D`(최악 4.75:1)로 덮는다. 파운데이션 업스트림 이슈 대상.

## 결정

| 항목 | 결정 | 근거 |
|---|---|---|
| 본문 서체 | **Spoqa 유지** | 파운데이션이 단일 진실원. Pretendard 발행물들이 이탈한 것으로 본다. woff2 가 이미 미러에 있다 |
| 덱 엔진 | `deck-stage.js` **이관해 정본화** | 이미 작동하는 1,732줄. 자동 스케일·스피커노트·썸네일 레일·`@media print`(슬라이드당 1페이지) |
| 차트 | 웹컴포넌트 `<crefle-chart>` + **인라인 JSON** | `file://` 는 opaque origin → `fetch()` 차단. 인라인은 취향이 아니라 유일한 방법 |
| 배포 | 파운데이션→doc DS 는 **벤더링+lock**. 문서에는 **번들** | 강제는 hop 1 과 DS CI 에만. 하류에 소비 repo 가 없으므로 하류 강제도 없다 |
| 문서 자산 | **자기완결 · 자산폴더 둘 다** | reports 에 두 패턴이 이미 공존. 스킬이 상황에 따라 선택 |
| `reports` | **건드리지 않음** | DS 소비자가 아니다 |

## 아키텍처

```
design-system-v2 (파운데이션, private)   ← 색 토큰 + Spoqa/MaterialSymbols woff2
   │  벤더링 + lock  (tamper=에러 / staleness=경고)
   ▼
design-system-v2-doc (이 repo, public)   ← 문서 DS
   │  소비 = Claude 가 문서를 "작성"하는 행위 (스킬 + 템플릿 + 번들)
   ▼
저작 산출물 = 완성된 HTML  (자기완결 or crefle-doc/ 동반)
   │  register-report --assets   ← 기존 스킬 그대로. 수정 불필요
   ▼
CREFLEINC/reports                        ← 등록·색인·호스팅·PDF. 이 DS 를 모른다
```

### 핵심 규칙: `--primary` 를 재정의하지 않는다

잠긴 미러에서 `#C9252C` 로 온다. 이 한 줄이 네 갈래 분기를 죽인다.
`doc-tokens.css` 에서 `--primary` 를 정의하고 싶어지는 순간이 **다섯 번째 갈래가 생기는 순간**이다.
`check-tokens.mjs` 규칙 A 가 막는다 — 실증 완료(그 실수를 재현하면 파운데이션 값을 보여주며 실패한다).

### 툴체인 — Vite/Storybook 은 과잉이다

| 도구 | 결정 | 이유 |
|---|---|---|
| Vite | ❌ 제거 | 필요한 건 "CSS 를 고정 순서로 concat + JS 복사". `build.mjs` 40줄, 의존성 0, **바이트 결정적** |
| TS 소스 | ❌ (단 `tsc` 는 유지) | `.js` + JSDoc + `tsc --noEmit --checkJs`. → `dist/*.js` 가 `src/` 의 **바이트 동일 복사본** → 빌드 재현성이 자명 |
| Storybook | ❌ 제거 → `examples/*.html` | Storybook 은 **`http://`로 서빙**한다. 최대 리스크는 "`file://`·무네트워크에서 작동하는가"인데 **구조적으로 검증 불가** |
| Vitest | ✅ | `environment:'node'` — 순수 수학·lock 로직만 |
| Playwright | ✅ (Phase 2) | 업로드 렌더러와 **같은 엔진**(`playwright==1.60.0` 에 핀) |

**의존성: devDeps 4개**(vitest·typescript·@types/node·@playwright/test), **런타임 0**.

### 테스트 — jsdom 은 덫이다

설치된 jsdom 29.1.1 프로브: `adoptedStyleSheets` 는 **존재하지 않는데 대입은 조용히 성공**한다.
즉 `deck-stage.js:1547` 의 shadow 스타일 주입에 대해 `expect(sr.adoptedStyleSheets).toHaveLength(1)`
은 **통과하면서 아무 의미가 없다**. `getBoundingClientRect` 는 전부 0 → 자동 스케일 수학 검증 불가.
이건 이 팀이 **이미 데인 함정**이다 — `check-foundation.test.mjs:1-16` 에 "공허한(vacuous) 테스트였다"
라고 기록돼 있다. → 환경으로 피라미드를 가른다: 순수 수학은 vitest(node), DOM 은 Playwright(진짜 Chromium).

### 출력 형식 — IIFE 만

Chromium 은 모듈 스크립트를 **CORS 의미론**으로 가져오고 `file://` 는 **opaque origin** 이라
`<script type="module">` 이 차단된다. 기존 `deck-stage.js` 가 이미 `(() => {…})()` IIFE 에
import/export **0개**다 — 그 형태를 유지한다. `build.mjs` 가 top-level import/export 를 발견하면 빌드를 멈춘다.

## 이식한 것 (수정하지 않는다)

`scripts/foundation-lock.mjs` · `sync-foundation.mjs` · `check-foundation.mjs` + 테스트 3종은
`design-system-v2-webui` 에서 **바이트 그대로** 이식했다(`diff -q` 확인).
가이드가 "그대로 베껴라"라고 명시했고, 그 동일성이 기능이다 — 업스트림에서 고쳐지면 재복사만 하면 된다.
그래서 `tsconfig.json` 이 이 6개를 typecheck 에서 **제외**한다(JSDoc 을 달면 '그대로'가 깨진다).
대신 함께 이식한 자체 테스트 11개가 검증한다.

획득 목록도 그대로다 — `tokens.css` + `ds-bundle/fonts/*.woff2`. 문서 DS 가 필요한 것과 정확히 같다.

## Phase 1 실증 완료

- 미러 1바이트 변조 → `check:foundation` 실패(정확한 해시 diff), 되돌리면 통과 ✅
- 미등록 파일 끼워넣기 → 실패 ✅
- `--primary: #4758A9` 재정의(스킬이 저지른 그 실수) → 규칙A 가 파운데이션 값과 함께 거부 ✅
- `style="color:#F3B0B5"`(참조 덱의 실패 #5) → 규칙B 가 거부 ✅
- `font-weight: 800`(Spoqa 에 없음) → 규칙E 가 거부 ✅
- **실제 `colors_and_type.css` 를 넣으면** `check-fonts` 가 잡는 것: @import 순서(:36) · CDN 폰트(:9,:36) ·
  없는 src(:13,18,23,28,33) · **OS 의존 폴백(:137 `Menlo, Consolas`)** — 발행 PDF 에 `Menlo-Bold` 를
  박아넣은 바로 그 줄 ✅
- 라이선스 전문 삭제/스텁화 → `check:licenses` 거부 ✅
- 산출물 실측: 실제 `@import` **0개**, `@font-face` 9개, 네트워크 자산 **0**, 빌드 **바이트 결정적** ✅

## 열린 질문

1. **차트 범주형 팔레트** — `--chart-1..5` 는 primary 레드 + 차콜 사다리로 거의 단색. 인쇄된 5조각
   원형 차트에 충분한가? `dataviz` 스킬의 대비 공식으로 검증 (Phase 3)
2. **기존 발행 문서 마이그레이션** — Pretendard 구문서를 Spoqa 로 재작업할 것인가, 신규만 적용하고
   자연 교체를 기다릴 것인가. 신규만 하면 서버 목차에 **두 서체가 섞여 보인다** (Phase 5)
3. **문서 페이지 번호** — Chromium 은 `@page` 마진 박스(`@top-center`)·`counter(page)` 를 지원하지
   않아 CSS 만으론 불가. reports 를 안 건드리므로 문서가 자체 해결해야 한다.
   후보: (a) 고정 A4 페이지 div(덱 패턴과 일관, 자동 흐름 상실) (b) `position:fixed` 인쇄 반복 동작 실측
   (c) 페이지 번호 포기. **Phase 4 에서 실측 후 결정**
4. **`--on-surface-muted` 승격** — 파운데이션을 고치고 이 오버라이드를 지울 것인가
5. **JetBrains Mono 승격** — 두 번째 도메인이 mono 를 요구하면 파운데이션으로 (가이드 권장)

## 참고

- 부트스트랩 체크리스트: 파운데이션 `docs/domain-ds-guide.md`
- 참조 구현: `CREFLEINC/design-system-v2-webui`
- 폴리레포 무결성 스펙: webui `docs/superpowers/specs/2026-07-09-polyrepo-integrity-design.md`
