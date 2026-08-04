# Identity / Confidence / Status Chip 설계

*2026-08-04 · GitHub Issue #7*

## 목적

보고서의 목록·카탈로그·프로세스 셀에서 짧은 ID와 라벨을 반복 표시할 때 정체성,
확신도, 상태 변화를 서로 다른 시각 채널로 전달한다. 색만으로 의미를 전달하지 않고,
JavaScript 없이 대량 렌더링·복사·인쇄·접근성을 유지한다.

## 범위

- `.doc` 문서 안에서만 지원한다.
- 보고서·연구노트·회의록의 화면 및 인쇄/PDF를 지원한다.
- 덱의 투사 크기와 간격은 이 이슈에서 다루지 않는다.
- 상태 변화 어휘는 신설·폐기·통합·이관·격하로 제한한다.
- 임의 상태 기호, JavaScript 웹 컴포넌트, 자동 상태 추론은 범위 밖이다.

## 공개 HTML API

```html
<span
  class="identity-chip"
  data-identity="2"
  data-confidence="estimated"
>
  WEB-01 · 대시보드
  <span class="identity-chip-status" aria-label="신설">✦</span>
</span>
```

### `data-identity`

`1`부터 `8`까지의 숫자 슬롯을 받는다. 슬롯은 `--chart-1..8`과 동일한 정체성
색을 사용한다. 슬롯에 도메인 이름을 고정하지 않는다. WEB·POP·모바일 같은 이름과
슬롯의 대응은 문서의 범례가 정의한다.

### `data-confidence`

| 값 | 테두리 | 의미 |
|---|---|---|
| `confirmed` | 실선 | 확정 |
| `estimated` | 점선 | 추정 |
| `unknown` | 이중선 | 미정 |

확신도는 색이 아니라 테두리 스타일로 표현한다. 속성을 생략하지 않는다. 잘못된 값은
확정으로 폴백하지 않고 중립 기본 테두리로 보여 잘못된 확신을 만들지 않는다.

### 상태 변화

상태는 CSS 의사 요소로 자동 생성하지 않고 실제 자식 요소에 기록한다.

| 상태 | 기호 | 접근성 이름 |
|---|:---:|---|
| 신설 | ✦ | `aria-label="신설"` |
| 폐기 | × | `aria-label="폐기"` |
| 통합 | ⊕ | `aria-label="통합"` |
| 이관 | ↗ | `aria-label="이관"` |
| 격하 | ↓ | `aria-label="격하"` |

폐기 상태는 본체에 `data-change="deprecated"`를 함께 두어 라벨에 취소선을 적용한다.
상태가 없으면 `.identity-chip-status`를 생략한다. 목록 밖 상태는 새 기호를 발명하지
않고 칩 옆의 일반 텍스트로 보충한다.

## 색 토큰

기존 categorical 원색에서 컨테이너와 테두리 토큰을 공개 파생한다.

```css
--chart-1-container
--chart-1-border
…
--chart-8-container
--chart-8-border
```

총 16개 토큰을 `styles/doc-tokens.css`에서 정의한다. 컴포넌트는
`data-identity`별로 내부 변수 `--identity-color`, `--identity-container`,
`--identity-border`를 해당 공개 토큰에 연결한다. 각 문서나 컴포넌트가
`color-mix()` 비율을 다시 쓰지 않는다.

원색은 정체성, 테두리 스타일은 확신도, 상태 기호는 변화 사건만 표현한다. semantic
색은 사용하지 않는다.

## 시각 구조

- 기존 `.capsule`과 같은 inline-flex 흐름을 따르되 정체성 색과 확신도 API를 갖는다.
- 글꼴·크기·간격·모서리는 기존 문서 토큰만 사용한다.
- 라벨과 상태 기호 사이에는 토큰 간격을 둔다.
- 칩 자체는 한 줄을 유지하되 칩 목록은 자연스럽게 다음 줄로 감긴다.
- `data-change="deprecated"`는 라벨 텍스트에 취소선을 적용하되 상태 기호는 지우지 않는다.
- 700개 이상 반복될 수 있으므로 DOM은 본체와 선택적 상태 자식 외에 래퍼를 요구하지 않는다.

## 접근성

- 정체성은 색만으로 전달하지 않는다. 본문 라벨과 문서 범례가 슬롯 의미를 함께 제공한다.
- 확신도는 색과 무관한 선 스타일로 구분한다.
- 상태 기호에는 반드시 `aria-label`을 둔다.
- 기호가 제거되거나 흑백으로 인쇄돼도 텍스트·테두리·취소선이 의미를 보조한다.
- `authoring.md`는 기호만 단독으로 사용하거나 `aria-label`을 생략하는 예제를 금지한다.

## 인쇄

- 배경색이 약해지거나 제거돼도 identity border와 confidence 선 스타일을 유지한다.
- `print-color-adjust`에만 의존하지 않는다.
- 이중선·점선·실선이 PDF와 흑백 출력에서 구분되는지 렌더 결과로 검증한다.
- 칩은 페이지 경계에서 내부가 분할되지 않게 한다.

## 문서화와 예제

`skills/crefle-doc/references/authoring.md`에 다음을 추가한다.

1. 공개 HTML API와 8개 identity 슬롯
2. confidence 3단계 표
3. 상태 기호 5종과 접근성 규칙
4. 색·확신도·상태의 역할을 섞지 않는 금지사항
5. 도메인별 슬롯 대응을 문서 범례에 명시하는 요구

`examples/doc-minimal.html`에는 confirmed·estimated·unknown과 상태 기호를 포함한 작은
예제를 추가한다.

## 검증

구현은 테스트 우선으로 진행한다.

1. 파생 토큰 16개가 존재하고 각 identity 슬롯이 정확한 원색·컨테이너·테두리 토큰에
   연결되는지 정적 게이트로 검증한다.
2. Playwright에서 8개 identity × 3개 confidence 조합의 계산된 border style과 배경을
   확인한다.
3. 잘못된 confidence 값이 confirmed로 보이지 않는지 확인한다.
4. 상태 기호 5종의 실제 텍스트와 접근성 이름, 폐기 취소선을 확인한다.
5. 인쇄 미디어와 PDF에서 세 테두리 스타일이 유지되는지 확인한다.
6. 700개 칩 fixture가 스크립트 오류 없이 렌더되고 컨테이너 안에서 줄바꿈되는지 확인한다.
7. `npm run check`로 토큰·dist 재현성·스킬 계약·전체 E2E를 검증한다.

## 후속 이슈와의 관계

- #9 확신도 세그먼트 바는 이 이슈의 `--chart-N-container/border` 토큰을 재사용한다.
- #8 스테이지 × 레인 다이어그램은 셀 내부 항목 표현에 `.identity-chip`을 재사용한다.
- #7이 병합되기 전에는 #9나 #8 구현을 시작하지 않는다.
