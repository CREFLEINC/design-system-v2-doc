# 컴포넌트와 사용법

`SKILL.md` 를 먼저 읽으세요. 이 파일은 **템플릿에 없는 것이 필요할 때** 봅니다.

## 먼저: 클래스가 정말 필요한가

`.doc` 안에서 시맨틱 HTML 은 클래스 없이 맞습니다. 아래를 쓰기 전에 대응하는 HTML
엘리먼트가 없는지 확인하세요.

| 쓰고 싶은 것 | HTML 로 되는가 |
|---|---|
| 제목 | `<h1>` 30 · `<h2>` 24 · `<h3>` 20 · `<h4>` 17 |
| 본문 | `<p>` 16 |
| 작은 글씨 · 캡션 | `<small>` · `<figcaption>` 12 |
| 강조 | `<strong>` `<em>` |
| 인용 | `<blockquote>` — 브랜드 레드 바가 자동 |
| 목록 | `<ul>` `<ol>` — 중첩도 됨 |
| 표 | `<table>` `<thead>` `<tbody>` `<tfoot>` `<caption>` |
| 코드 | `<code>` 인라인 · `<pre><code>` 블록 |
| 그림 | `<figure>` + `<figcaption>` |
| 구분선 | `<hr>` |

**수치 열만 예외**: `<td class="num">` — HTML 에 "이 칸은 숫자다"를 표현할 방법이 없습니다.
우측 정렬 + 등폭 + 자릿수 정렬(tabular-nums)이 붙습니다. `<td class="num"><strong>78%</strong></td>`
처럼 strong 을 쓰면 브랜드 레드가 됩니다.

## 역할 클래스 — HTML 에 없는 것만

### eyebrow · lede

```html
<p class="eyebrow">2부 · 분류</p>   <!-- 제목 위 라벨. <h5> 로 쓰면 문서 개요가 오염된다 -->
<h2>제목</h2>
<p class="lede">제목 아래 요약. <p> 지만 크기가 다르다.</p>
```

### 카드 4종

```html
<div class="card">…</div>          <!-- 보더 + 톤. 기본 -->
<div class="card-filled">…</div>   <!-- 보더 없이 톤만 -->
<div class="card-elev">…</div>     <!-- 그림자. 보더와 함께 쓰지 않는다 -->
<div class="card-primary">…</div>  <!-- 브랜드 컨테이너. 강조 하나에만 -->
```

`.grid-2` / `.grid-3` 안에 넣으면 자동 배치됩니다(좁아지면 한 열로 접힘).

### 콜아웃 — 개념 동등 = 색 동등

```html
<div class="callout">…</div>                     <!-- info -->
<div class="callout callout-success">…</div>     <!-- 양품 · Pass · OK -->
<div class="callout callout-warning">…</div>     <!-- 주의 -->
<div class="callout callout-error">…</div>       <!-- 불량 · Fail · NG -->
```

**semantic 색은 판정·상태·델타에만** 씁니다. 장식으로 쓰지 마세요 — 파운데이션의
Rule 1 입니다. "양품"은 어디서나 success, "불량"은 어디서나 error 여야 합니다.

### KPI 넘버

```html
<div class="kpi">
  <div><span class="big">+60%</span><span class="lbl">설명<br>둘째 줄</span></div>
  <div><span class="big">15/15</span><span class="lbl">설명</span></div>
</div>
```

큰 숫자 하나가 문장 열 개보다 강합니다. 3개까지가 적당합니다.

### 캡슐 · 라벨 필

```html
<span class="capsule">2026.07.17</span>
<span class="label-pill label-before">Before</span>
<span class="label-pill label-after">After</span>
```

### 각주

Chromium 은 페이지 하단 각주를 지원하지 않습니다. 문서 끝 미주로 씁니다.

```html
본문에 참조<a class="fn-ref" href="#fn1">1</a>.
…
<section class="footnotes">
  <ol><li id="fn1">각주 내용.</li></ol>
</section>
```

## 문서 루트

```html
<body class="doc doc-numbered">
```

- `.doc` — **필수**. 없으면 아무 스타일도 안 걸립니다.
- `.doc-numbered` — 장·절·그림·표에 자동 번호(`1.` `2.1` `그림 1.` `표 1.`).
  회의록처럼 번호가 어색하면 빼세요.

## 인쇄 · PDF

`:root` 에 러닝 헤더를 세팅합니다. **따옴표 포함**:

```html
<style>
  :root { --doc-running-title: '문서 제목'; }
</style>
```

매 페이지 머리에 `CREFLE` / 문서 제목, 아래에 `2 / 4` 가 찍힙니다. 표지(1페이지)는 자동으로 비웁니다.

| 필요 | 방법 |
|---|---|
| 여기서 페이지를 끊고 싶다 | `<div class="page-break">` |
| 이 블록이 페이지 중간에 잘리면 안 된다 | `class="page-break-avoid"` |
| 화면에만 보이고 인쇄엔 빼고 싶다 | `class="screen-only"` |

표 머리 반복 · 제목 고아 방지 · 코드블록 미분할은 **자동**입니다.

## 덱 (발표)

슬라이드 스케일은 `.slide` 안에서만 적용됩니다. 문서와 같은 스타일시트를 써도 충돌하지 않습니다.

```html
<section class="slide">…</section>          <!-- 기본 -->
<section class="slide dark">…</section>     <!-- 타이틀. 브랜드 그라디언트 -->
<section class="slide divider">…</section>  <!-- 섹션 구분 -->
<section class="slide filled">…</section>   <!-- 톤 낮춘 배경 -->
```

슬라이드 안: `.stage`(콘텐츠 영역) · `.stage.middle`(수직 중앙) · `.footer` · `.ghost-num`
· `.display`(h1 보다 큰 히어로) · `.capsule-row`.

**한 슬라이드 = 한 생각.** 두 가지를 말해야 하면 슬라이드가 두 장 필요합니다.
의미 있는 요소 사이는 최소 24px(`--slide-min-gap`).

## 하지 말 것

- **색을 쓰지 않는다** — `#`, `rgb()`, `hsl()` 전부. 토큰만.
- **`font-weight: 600/800`** — Spoqa 는 100/300/400/500/700 만 있습니다. 600·800 은
  브라우저가 합성(faux bold)해 **인쇄에서 뭉갭니다**.
- **임의 px** — `--s-*`(4pt 그리드) · `--text-*` · `--radius-*` 토큰을 씁니다.
- **네트워크 자산** — 무네트워크 렌더러에서 100% 실패합니다.

이 규칙들은 `npm run check` 가 기계로 잡습니다. 문서가 아니라 게이트가 강제합니다.
