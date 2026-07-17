# 알려진 한계

실측으로 확인된 것만 적는다. 추측은 적지 않는다.

## `file://` + `<link>` → 썸네일 레일이 백지

**증상**: 문서를 로컬에서 `file://` 로 열면 deck-stage 의 썸네일 레일이 흰 사각형만 보인다.
슬라이드 본문·PDF·폰트는 전부 정상이다.

**원인**: Chromium 은 `file://` 로 불러온 스타일시트를 **opaque origin** 으로 취급한다.
그래서 `sheet.cssRules` 접근이 `SecurityError` 를 던진다. deck-stage 의 `_snapshotAuthorCss()`
는 그 예외를 `catch` 로 삼키도록 설계돼 있어서(cross-origin 시트 대비) author CSS 스냅샷이
**빈 문자열**이 되고, 썸네일 클론이 스타일과 토큰을 못 받는다.

실측:
```
<link> + file://   sheets = ["THROW", 2]   → 썸네일 백지
--inline + file:// sheets = [42, 2]        → 썸네일 정상
http:// 서빙                                → 썸네일 정상 (reports 서버가 이 경우)
```

**deck-stage 를 이관하며 생긴 문제가 아니다.** `crefle_designer` 스킬의 원본 덱도 같은
`SecurityError` 를 겪는다 — 다만 그 덱은 슬라이드 CSS 를 `<style>` 로 **인라인**해 두어서
(`slides/index.html:7`) 우연히 피해 갔을 뿐이다. `<link>` 로 뺀 `colors_and_type.css` 는
거기서도 THROW 한다.

**해결**: 셋 중 아무거나.
- `node scripts/build.mjs --inline <doc>` — 자기완결 문서. `<style>` 이라 same-origin.
- `http://` 로 서빙 — reports 서버에 등록되면 자동으로 해결된다.
- 로컬 미리보기에서 레일이 필요 없으면 무시. 발행물에는 영향이 없다.

`tests/e2e/inline.spec.mjs` 가 `--inline` 경로에서 썸네일이 살아나는 것을 검증한다.

---

## `build --inline` 이 조용히 깨졌던 세 가지 (수정됨, 테스트로 고정)

전부 **콘솔 에러 0개**로 깨졌다. 자기완결 문서는 이메일·공유링크·업로드 렌더러로 나가므로
조용한 실패가 특히 위험하다. `tests/e2e/inline.spec.mjs` 가 셋 다 막는다.

1. **`</script>` 조기 종료** — JS 소스 어디든(주석 안이라도) `</script>` 문자열이 있으면
   HTML 파서가 거기서 스크립트를 끝낸다. `deck-stage.js:87` docblock 의 사용 예시
   `<script src="deck-stage.js"></script>` 때문에 인라인 `<script>` 가 92,000자가 아니라
   **4,598자**에서 끊겼다. → `<\/script` 로 이스케이프.

2. **인라인 순서** — CSS 를 먼저 넣으면 그 CSS **주석** 속 예시 마크업이 문서 텍스트가 된다.
   `deck.css` 헤더에 `<script src="./deck-stage.js"></script>` 가 있어서, 뒤이은
   `<script src>` 치환 정규식이 **그 주석에 먼저 매치**해 73KB 의 JS 를 `<style>` 한복판에
   쑤셔 넣었다. 진짜 `<script src>` 는 그대로 남았다. → **JS 를 CSS 보다 먼저** 인라인한다.

3. **`$` 특수 해석** — `String.replace` 의 치환 **문자열**에서 `` $& $' $` $1 `` 은 특수
   패턴이다. 2MB base64 + 90KB JS 를 심으면서 이게 걸리면 조용히 잘리거나 중복된다.
   → 함수 치환자(`() => body`)를 쓴다.

---

## 참조 덱(49슬라이드) 전체 재작성은 Phase 3 이후에 가능하다

Phase 2 캡스톤으로 5중 실패는 전부 실증했지만, 참조 덱의 **내용**을 그대로 옮기려면
아직 없는 컴포넌트가 필요하다. 실측한 사용 빈도:

| 필요한 것 | 참조 덱에서 | 페이즈 |
|---|---|---|
| 카드 4종 (filled/elev/outline/primary) | 53회 | P3 |
| `table.kv` + `.num` | 12회 | P3 |
| 코드 블록 + 인라인 코드 + 구문 강조 | 11회 + span 40회 | P3 |
| KPI 넘버(`.kpi/.big/.lbl`) | 11회 | P3 |
| 불릿 리스트 | 10회 | P3 |
| 라벨 필(before/after) | 6회 | P3 |
| 체크리스트 | 2회 | P3 |
| bigquote | 3회 | P3 |
| 다이어그램(workflow/radial/pattern/phases/tree) | 각 1~2회 | **DS 아님 — 일회성** |

반가운 것: `section`(42회)·`sub`(9회)·`title-xl`(7회)은 **필요 없다**. `deck.css` 가
`h2`/`h3` 를 시맨틱하게 스타일링하고 `.display` 를 제공하므로 클래스가 사라진다.
설계 의도(LLM 의 기본 출력이 이미 정답)가 실제로 작동한 증거다.

다이어그램 5종은 각각 1~2회만 쓰였다 — web-ui 의 a/b/c/d 트리아지 기준으로 **c(조합)**
또는 일회성이다. DS 에 넣지 않는다.
