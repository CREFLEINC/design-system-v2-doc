# 이 디렉토리는 동봉본입니다 — 직접 수정하지 마세요

`tokens.css` 와 `fonts/*.woff2` 는 파운데이션 repo
[`CREFLEINC/design-system-v2`](https://github.com/CREFLEINC/design-system-v2) 에서
복사된 파일입니다. 원본과 **바이트 동일**해야 합니다.

여기 있는 파일을 고치면 `npm run check` 와 CI 가 실패합니다.
토큰을 바꾸려면 파운데이션 repo 에서 고친 뒤 아래를 실행하세요.

```bash
npm run sync-foundation
```

## 이 디렉토리가 이 repo 에서 갖는 특별한 의미

문서 DS 의 존재 이유가 바로 이 미러다. CREFLE 문서의 브랜드 강조색은 한때 네 갈래로
갈라져 있었다 — 파운데이션 `#C9252C`, `crefle_designer` 스킬 `#4758A9`(파운데이션이
`--product-primary` 로 강등한 색), 그 손복사본, 그리고 토큰조차 없는 발행 문서들.
원인은 하나다: **복사본이 있었고, 그것이 원본과 이어져 있지 않았다.**

그래서 이 repo 는 **`--primary` 를 절대 재정의하지 않는다.** 이 미러에서 온다.
`styles/doc-tokens.css` 에서 `--primary` 를 정의하고 싶어지면, 그 순간이 바로
다섯 번째 갈래가 생기는 순간이다. `lint:tokens` 가 막는다.

## 파일

| 파일 | 설명 |
|---|---|
| `foundation.lock.json` | 출처 repo·ref·커밋 SHA 와 파일별 sha256. 무결성 검사의 기준 |
| `tokens.css` | 파운데이션 Stage 1 토큰 (동봉본) |
| `fonts/*.woff2` | Spoqa Han Sans Neo 5종 + Material Symbols Rounded (동봉본) |
| `fonts/LICENSE-*.txt` | 위 폰트들의 원 라이선스 전문 — **폰트와 같은 디렉토리에 반드시 존재해야 한다** (`check:licenses`) |
| `README.md` | 이 파일 |

## 명령

| 명령 | 하는 일 | 네트워크 |
|---|---|---|
| `npm run check:foundation` | 미러가 lock 과 일치하는지 검사. 불일치 시 실패 | 불필요 |
| `npm run check:foundation:upstream` | 파운데이션이 앞서 있는지 확인. **경고만 하고 절대 실패하지 않음** | 필요 |
| `npm run sync-foundation` | 파운데이션에서 다시 받아 lock 갱신 | 필요 |

`check:foundation` 은 `npm run check` 의 **맨 앞**에 있다 — 0.1초짜리 검사라 미러가
오염됐으면 긴 빌드를 기다리기 전에 즉사한다. `check:foundation:upstream` 은 네트워크가
필요하므로 `check` 에 **없다**(오프라인이나 토큰 없는 CI 에서 빌드를 막게 된다).

## 환경변수

| 변수 | 기본값 | 용도 |
|---|---|---|
| `FOUNDATION_REPO` | `https://github.com/CREFLEINC/design-system-v2.git` | 소스 repo |
| `FOUNDATION_REF` | `main` | 브랜치·태그·전체 SHA |
| `FOUNDATION_DIR` | (없음) | 로컬 체크아웃에서 동기화 (동시 작업용) |

## 참고

파운데이션 repo 는 **private** 입니다. `sync-foundation` 은 `gh` CLI 의 credential helper
(또는 SSH 키)로 인증합니다. 접근 권한이 없으면 동기화할 수 없습니다.

반면 `check:foundation` 은 이 repo 안의 lock 파일만 보므로 **누구나, 오프라인에서도** 실행할 수 있고
CI 도 파운데이션에 접근하지 않습니다. 이 성질 덕분에 파운데이션 접근 권한 없이도
이 repo 만 클론해 빌드·테스트를 전부 통과시킬 수 있습니다.

## staleness 는 왜 에러가 아닌가

문서 DS 가 의도적으로 옛 토큰에 핀을 박을 수 있기 때문입니다. 파운데이션에 커밋이 하나
생겼다고 모든 도메인 CI 가 빨개지면 안 됩니다. 반대로 **tamper**(미러 ≠ lock)는 언제나
에러입니다 — 그건 누군가 원본을 우회했다는 뜻이니까요.

## 신뢰의 한계

이 검사는 **실수**(미러를 원본으로 착각하고 고치는 것)를 막기 위한 것이지, 작정한 우회를 막지는 못합니다.
`tokens.css`·`fonts/*.woff2`와 `foundation.lock.json`을 **같은 커밋에서 함께** 고치면 해시가 서로
맞아떨어져 검사를 그대로 통과합니다. 지금 branch protection은 리뷰어 승인 0명이라 이 상태로도
셀프 머지가 가능합니다 — 코드 리뷰가 마지막 방어선이라는 말은 승인이 필수가 되기 전까지는 원칙일 뿐
실제 강제는 아닙니다.
