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
저작 산출물 = 완성된 HTML  (자기완결 or crefle-doc/ 폴더 동반)
   ▼
CREFLEINC/reports                        ← 등록·색인·호스팅·PDF. 이 DS 를 모른다
```

## 왜 있는가

CREFLE 문서의 브랜드 강조색이 네 갈래로 갈라져 있었다 — 파운데이션 `#C9252C`,
`crefle_designer` 스킬 `#4758A9`, 그 손복사본 `#4758A9`, 그리고 실제 발행 문서들은
아예 토큰 없이 CDN Pretendard. 이 repo 가 그 단일 기준이 된다.

설계 근거 전문: [`docs/superpowers/specs/2026-07-17-doc-ds-design.md`](docs/superpowers/specs/2026-07-17-doc-ds-design.md)

## 원칙

- **`--primary` 를 재정의하지 않는다.** 잠긴 파운데이션 미러에서 `#C9252C` 로 온다.
  raw hex 금지 — `var(--token)` 만. (`lint:tokens` 가 강제)
- **네트워크 자산 금지.** 모든 폰트는 로컬 woff2. CREFLE reports 의 업로드 PDF 렌더러는
  `network_mode:"none"` 격리 컨테이너라 CDN 폰트가 100% 실패한다. (`check:fonts` 가 강제)
- **IIFE 만, ESM 금지.** 문서는 `file://` 로 열린다. Chromium 은 모듈 스크립트를 CORS 로
  가져오고 `file://` 는 opaque origin 이라 차단된다. 같은 이유로 `fetch()` 도 불가 —
  `<crefle-chart>` 가 JSON 을 인라인으로 받는 이유다.
- **CSS 는 평평한 한 파일.** `@import` 없음. (순서 버그가 구조적으로 불가능해진다)

## 개발

```bash
npm ci
npm run check          # 전체 게이트
open examples/*.html   # 개발 표면 = Playwright 픽스처 = 스킬 레퍼런스 = 소비자와 동일 환경
```

`npm run check` 는 `check:foundation` 으로 시작한다(1초, tamper 검사) — 미러가 오염됐으면
긴 빌드를 기다리기 전에 즉사한다. `check:foundation:upstream`(staleness)은 네트워크가
필요하므로 `check` 에 **없다**.

`dist/` 는 **커밋한다**. `check:dist` 가 재빌드 후 `git diff --exit-code` 로 빌드 재현성을
증명하고, 문서 저작 시 `dist/crefle-doc/` 를 문서 옆에 복사해 쓴다.

## 파운데이션 동기화

```bash
npm run sync-foundation          # 파운데이션에서 tokens.css + woff2 재취득 → lock 갱신
npm run check:foundation         # tamper (오프라인, 에러)
npm run check:foundation:upstream  # staleness (네트워크, 경고만)
```

파운데이션은 **private** 이므로 `sync-foundation` 에는 인증이 필요하다 —
자세한 것은 [`styles/foundation/README.md`](styles/foundation/README.md).
CI 는 파운데이션에 **접근하지 않는다**(lock 만 대조).

## 라이선스

독점. 번들된 폰트는 별도 라이선스(SIL OFL 1.1 / Apache-2.0) — [`LICENSE`](LICENSE) 참조.
폰트 바이너리가 있는 **모든** 디렉토리에 라이선스 전문이 있어야 하며 `check:licenses` 가 강제한다.
