# CREFLE 문서 디자인 시스템

CREFLE의 **HTML 문서** — 보고서 · 연구노트 · 회의록 · 발표(덱) — 를 위한 디자인 시스템.
CREFLE 파운데이션(`CREFLEINC/design-system-v2`)의 브랜드 토큰을 소비하는 도메인 DS다.

```
design-system-v2 (파운데이션, private)   ← 색 토큰 + Spoqa/MaterialSymbols woff2 단일 진실원
   │  벤더링 + lock  (tamper=에러 / staleness=경고)
   ▼
design-system-v2-doc  (이 repo)          ← 문서 DS
   │  소비 = Claude 가 문서를 "작성"하는 행위 (스킬 + 템플릿 + 번들)
   ▼
저작 산출물 = 완성된 HTML  (자기완결 or crefle-doc/ 동반)
   │  register-report --assets
   ▼
CREFLEINC/reports                        ← 등록·색인·호스팅·PDF. 이 DS 를 모른다
```

## 왜 있는가

CREFLE 문서의 브랜드 강조색이 **네 갈래**로 갈라져 있었다:

| 무엇 | `--primary` |
|---|---|
| 파운데이션 `tokens.css` | `#C9252C` ← 단일 진실원 |
| `crefle_designer` 스킬 | `#4758A9` (파운데이션이 제품 UI 전용으로 강등한 색) |
| 그 스킬의 손복사본 | `#4758A9` |
| **실제 발행된 문서 전부** | **토큰 없음** — CDN Pretendard |

원인은 스킬이 브랜드 레드 결정보다 **먼저** 만들어졌고 교정을 못 받은 것이다.
**유능한 모델이 가장 접근 가능한 지침을 따랐고, 그 지침이 낡아 있었다.**

설계 근거 전문: [`docs/superpowers/specs/2026-07-17-doc-ds-design.md`](docs/superpowers/specs/2026-07-17-doc-ds-design.md)

## 문서를 쓰려면

**`crefle-doc` 스킬을 쓴다** ([`skills/crefle-doc/`](skills/crefle-doc/)). 요약하면:

```bash
cp templates/report.html   ~/작업/내보고서.html   # 1. 템플릿 복사
cp -r dist/crefle-doc      ~/작업/                # 2. 번들을 문서 옆에
#                                                  3. 내용을 채운다
open ~/작업/내보고서.html                          # 4. 확인
```

| 템플릿 | 용도 |
|---|---|
| `templates/report.html` | 보고서 · 제안서 · 기획서 |
| `templates/research-note.html` | 연구노트 · 실험 기록 |
| `templates/minutes.html` | 회의록 |
| `templates/deck.html` | 발표 (1920×1080, PDF는 슬라이드당 1페이지) |

단일 파일로 배포하려면(이메일 · 외부 공유 · 셀프 업로드):

```bash
node scripts/build.mjs --inline 내보고서.html 내보고서.single.html   # 폰트까지 base64 인라인
```

## 원칙

- **`--primary` 를 재정의하지 않는다.** 잠긴 파운데이션 미러에서 `#C9252C` 로 온다.
  raw hex 금지 — `var(--token)` 만. (`lint:tokens` 규칙A·B 가 강제)
- **시맨틱 HTML 이 클래스 없이 맞는다.** Claude 가 문서를 쓴다 — 클래스를 요구하면 누락
  하나하나가 조용한 드리프트다. 실측: 예제 문서 1부 46개 요소 중 클래스 3개(전부 `num`).
- **네트워크 자산 금지.** 모든 폰트는 로컬 woff2. 업로드 PDF 렌더러는 `network_mode:"none"`
  격리 컨테이너라 CDN 폰트가 100% 실패한다. (`check:fonts` 가 강제)
- **IIFE 만, ESM 금지.** 문서는 `file://` 로 열린다 — Chromium 은 모듈 스크립트를 CORS 로
  가져오고 `file://` 는 opaque origin 이라 차단된다. 같은 이유로 `fetch()` 도 불가 —
  `<crefle-chart>` 가 JSON 을 인라인으로 받는 이유다.
- **CSS 는 평평한 한 파일.** `@import` 없음 — 순서 버그가 구조적으로 불가능해진다.
- **차트 색은 계산으로 정한다.** 눈으로 고르지 않는다. (`check:palette`)

## 개발

```bash
npm ci
npm run check          # 게이트 11종
open examples/*.html   # 개발 표면 = Playwright 픽스처 = 소비자와 동일 환경
```

| 게이트 | 무엇을 막나 |
|---|---|
| `check:foundation` | 미러 변조 · 미등록 파일 (1초, **맨 앞** — 오염 시 즉사) |
| `check:licenses` | 폰트가 있는 디렉토리에 라이선스 전문 누락 → 무단 재배포 |
| `check:fonts` | 네트워크 폰트 · `@import` 순서 · OS 의존 폴백 |
| `check:palette` | 검증된 차트 팔레트 이탈 (+ 흑백 인쇄 명도차 경고) |
| `check:comments` | CSS 주석 조기 종료(`*/` 가 텍스트로 들어간 경우) |
| `typecheck` | JS + JSDoc, `tsc --checkJs --strict` |
| `test` | 순수 함수 (vitest, DOM 없음) |
| `lint:tokens` | 파운데이션 토큰 재정의 · raw 색상 · 임의 px · 없는 굵기 · JS 유채색 |
| `check:dist` | `dist/` 가 소스의 **결정론적** 산출물인가 (stale · 비결정성 둘 다) |
| `check:skill` | 스킬이 안내한 템플릿·클래스·토큰이 실재하는가 |
| `test:e2e` | 진짜 Chromium · `file://` · **네트워크 차단** (렌더러와 같은 조건) |

`check:foundation:upstream`(staleness)은 네트워크가 필요하므로 `check` 에 **없다**.

`dist/` 는 **커밋한다** — `check:dist` 가 빌드 재현성을 증명하고, 문서 저작 시 그걸 복사해 쓴다.

### 테스트는 환경으로 가른다

- **vitest** — DOM 없음. 순수 함수만(차트 수학 · lock 로직).
- **Playwright** — DOM 전부. 렌더러와 **같은 엔진**(`playwright==1.60.0` 에 핀, CI 가 검사).

jsdom 은 쓰지 않는다. 실측: `adoptedStyleSheets` 가 **없는데 대입은 조용히 성공**해서
shadow 스타일 테스트가 통과하면서 아무 의미가 없다. 이 팀이 이미 데인 함정이다
(`check-foundation.test.mjs:1-16` 에 "공허한 테스트였다"고 기록).

## 파운데이션 동기화

```bash
npm run sync-foundation            # 재취득 → lock 갱신 (네트워크 · 인증 필요)
npm run check:foundation           # tamper (오프라인, 에러)
npm run check:foundation:upstream  # staleness (네트워크, 경고만)
```

파운데이션은 **private** 이라 `sync-foundation` 에는 인증이 필요하다 —
자세한 건 [`styles/foundation/README.md`](styles/foundation/README.md).
CI 는 파운데이션에 **접근하지 않는다**(lock 만 대조).

## 발행된 문서의 출처 추적

문서 옆 `crefle-doc/crefle-doc.lock.json` 이 답한다 — **네트워크 없이**:

```bash
jq -r .version              crefle-doc/crefle-doc.lock.json   # 어느 doc DS 버전인가
jq -r .foundation.commit    crefle-doc/crefle-doc.lock.json   # 그 레드는 어느 파운데이션 커밋인가
```

강제(enforcement)가 아니라 출처(provenance)다 — 하류에 소비 repo 가 없으므로 강제할 자리가 없다.

## 알려진 한계

[`docs/known-issues.md`](docs/known-issues.md) — 실측한 것만 적는다.

## 라이선스

독점. 번들된 폰트는 별도 라이선스(SIL OFL 1.1 / Apache-2.0) — [`LICENSE`](LICENSE) 참조.
폰트 바이너리가 있는 **모든** 디렉토리에 라이선스 전문이 있어야 하며 `check:licenses` 가 강제한다.
`--inline` 산출물은 폰트를 base64 로 심으므로 빌드가 라이선스 전문을 HTML 주석으로 자동 삽입한다.
