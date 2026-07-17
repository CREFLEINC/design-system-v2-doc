/**
 * 차트 기하·요약 — **순수 함수만**. DOM 도 브라우저 API 도 쓰지 않는다.
 *
 * 출처: `@crefle/web-ui` 의 `src/components/Chart/Chart.shared.ts`.
 * 그 파일은 이미 순수 함수로 분리돼 있었다(React 컴포넌트에서 수학을 빼낸 상태) —
 * `import type` 한 줄만 떼면 그대로 온다. 어려운 부분(축퇴 도메인 가드, stacked 오프셋,
 * n=1 분모 0 가드, aria 자동 요약, SR 테이블 빌더)이 전부 검증된 채로 따라온다.
 *
 * 여기가 vitest(node, DOM 없음)의 자리다. 렌더링은 crefle-chart.js 가 하고
 * Playwright 가 진짜 Chromium 에서 검증한다 — 피라미드를 **환경**으로 가른다.
 *
 * ## web-ui 원본에서 **의도적으로 바꾼 것**
 *
 * `seriesClassIndex(i) => (i % 5) + 1` — 5개마다 색을 **순환**했다.
 * dataviz 스킬의 non-negotiable 을 정면으로 위반한다:
 *
 *   "Assign categorical hues in fixed order, **never cycled**. A 9th series is never
 *    a generated hue — it folds into 'Other,' small multiples, or composite encoding."
 *
 * 순환하면 6번째 시리즈가 1번째와 **같은 색**이 되어 정체성 채널이 거짓말을 한다.
 * 제품 UI 는 시리즈가 1~2개라 안 드러났지만, 문서 차트에선 무너진다.
 * → `seriesSlot()` 은 순환하지 않고, 9번째부터는 **던진다**. 부르는 쪽이 "기타"로
 *   접거나 facet 으로 쪼개야 한다. 조용히 틀린 색을 주는 것보다 낫다.
 */

/**
 * @typedef {{ label: string, value: number }} ChartPoint
 * @typedef {{ name: string, data: ChartPoint[], color?: string }} ChartSeries
 * @typedef {{ min: number, max: number }} Domain
 */

/** viewBox 논리 크기. 컨테이너 폭에 반응한다(width:100%). */
export const DEFAULT_WIDTH = 640
export const DEFAULT_HEIGHT = 320
export const PADDING = { top: 16, right: 16, bottom: 32, left: 44 }
export const POINT_RADIUS = 4
export const BAR_GROUP_GAP_RATIO = 0.7
export const DONUT_RING_RATIO = 0.32
export const DEFAULT_Y_TICKS = 5

/** categorical 슬롯 수. dataviz 레퍼런스와 동일한 8. 늘리지 말 것 — 검증된 집합이다. */
export const SLOT_COUNT = 8

/** 원형(all-pairs) 안전 상한. 앞 4슬롯만 all-pairs 검증을 통과한다. */
export const PIE_MAX_SLICES = 4

/** 마크 사이 표면 간격(px). dataviz §marks — 인접 채움이 붙으면 경계가 사라진다. */
export const MARK_GAP = 2

/**
 * 직접 라벨을 위한 머리 공간(px). 라벨은 막대 **위**에 붙고, 최댓값 막대의 꼭대기는
 * plotTop 이므로 이만큼 없으면 라벨이 viewBox 밖으로 나가 잘린다.
 * 실측된 버그: 위쪽 2.1px 초과 (bbox y=-2.1..13.6). --text-small(12px) + 6px 오프셋 + 여유.
 */
export const LABEL_HEADROOM = 16

/** @param {number} v @returns {string} */
export const defaultFormatValue = (v) => String(v)

/**
 * 시리즈 인덱스(0-based) → 팔레트 슬롯(1-based). **순환하지 않는다.**
 * @param {number} i
 * @returns {number} 1..SLOT_COUNT
 * @throws 슬롯을 넘으면 — 부르는 쪽이 "기타"로 접거나 facet 으로 쪼개야 한다.
 */
export function seriesSlot(i) {
  if (i < 0) throw new RangeError(`시리즈 인덱스가 음수입니다: ${i}`)
  if (i >= SLOT_COUNT)
    throw new RangeError(
      `시리즈가 ${i + 1}개입니다. categorical 팔레트는 ${SLOT_COUNT}슬롯이고 **순환하지 않습니다** — ` +
        `순환하면 ${SLOT_COUNT + 1}번째가 1번째와 같은 색이 되어 정체성 채널이 거짓말을 합니다. ` +
        `작은 시리즈를 "기타"로 접거나, facet(small multiples)으로 쪼개거나, 직접 라벨을 쓰세요.`
    )
  return i + 1
}

/**
 * bar: [0, dataMax] / line: [min(0,dataMin), dataMax]. min/max 가 주어지면 그대로 우선.
 * 축퇴(min===max) 시 도메인 폭이 0이 되어 나눗셈이 터지므로 +1 한다.
 * @param {ChartSeries[]} series
 * @param {'bar'|'line'} kind
 * @param {number} [min]
 * @param {number} [max]
 * @returns {Domain}
 */
export function resolveDomain(series, kind, min, max) {
  const values = series.flatMap((s) => s.data.map((p) => p.value))
  const dataMin = values.length ? Math.min(...values) : 0
  const dataMax = values.length ? Math.max(...values) : 0
  const resolvedMin = min ?? (kind === 'bar' ? 0 : Math.min(0, dataMin))
  const resolvedMax = max ?? dataMax
  if (resolvedMax === resolvedMin) return { min: resolvedMin, max: resolvedMin + 1 }
  return { min: resolvedMin, max: resolvedMax }
}

/**
 * stacked 막대의 도메인 최댓값 — 카테고리별 **누적 합**이 실제 최댓값이다.
 * per-value max 로 잡으면 상단 세그먼트가 plot 밖으로 잘린다.
 * @param {ChartSeries[]} series
 * @param {number} n 카테고리 수
 * @returns {number}
 */
export function stackedMax(series, n) {
  return Math.max(0, ...Array.from({ length: n }, (_, i) => series.reduce((sum, s) => sum + (s.data[i]?.value ?? 0), 0)))
}

/**
 * 값 v → plot 영역 내 y px. plotTop/plotBottom 은 PADDING 이 반영된 실제 좌표.
 * @param {number} v @param {Domain} domain @param {number} plotTop @param {number} plotBottom
 * @returns {number}
 */
export function yToPx(v, domain, plotTop, plotBottom) {
  const ratio = (v - domain.min) / (domain.max - domain.min)
  return plotBottom - ratio * (plotBottom - plotTop)
}

/**
 * i번째(0-based, 총 n개) 포인트의 x px. n===1 이면 분모 0 가드 → plotLeft.
 * @param {number} i @param {number} n @param {number} plotLeft @param {number} plotWidth
 * @returns {number}
 */
export function xToPx(i, n, plotLeft, plotWidth) {
  if (n <= 1) return plotLeft
  return plotLeft + (i / (n - 1)) * plotWidth
}

/**
 * 라벨:포맷값을 나열한 자동 aria-label 요약. 차트는 role="img" 이므로 이게 대체 텍스트다.
 * @param {ChartSeries[]} series @param {(v:number)=>string} formatValue @param {string} [title]
 * @returns {string}
 */
export function summarize(series, formatValue, title) {
  /** @type {string[]} */
  const parts = []
  if (title) parts.push(title + ':')
  const flat = series.length === 1
  for (const s of series) {
    const points = s.data.map((p) => `${p.label} ${formatValue(p.value)}`).join(', ')
    parts.push(flat ? points : `${s.name}: ${points}`)
  }
  return parts.join(' ')
}

/**
 * @param {ChartPoint[]} data @param {(v:number)=>string} formatValue @param {string} [title]
 * @returns {string}
 */
export function summarizePie(data, formatValue, title) {
  /** @type {string[]} */
  const parts = []
  if (title) parts.push(title + ':')
  parts.push(data.map((p) => `${p.label} ${formatValue(p.value)}`).join(', '))
  return parts.join(' ')
}

/**
 * @typedef {{ label: string, values: string[] }} SrTableRow
 * 시각적으로 숨긴 <table> 의 행. display:none 이 아니라 **클립**으로 숨긴다 —
 * display:none 은 접근성 트리에서 사라진다.
 * @param {ChartSeries[]} series @param {(v:number)=>string} formatValue
 * @returns {SrTableRow[]}
 */
export function buildSrRows(series, formatValue) {
  if (series.length === 0) return []
  const labels = series[0].data.map((p) => p.label)
  return labels.map((label, i) => ({
    label,
    values: series.map((s) => formatValue(s.data[i]?.value ?? 0))
  }))
}

/**
 * @typedef {{ name: string, slot: number, color?: string }} LegendItem
 * 범례는 시리즈 2개 이상이면 **항상** 있어야 한다(dataviz non-negotiable) —
 * 정체성이 색만으로 전달되면 CVD·흑백 인쇄에서 사라진다.
 * @param {ChartSeries[]} series
 * @returns {LegendItem[]}
 */
export function buildLegendItems(series) {
  return series.map((s, i) => ({ name: s.name, slot: seriesSlot(i), color: s.color }))
}

/**
 * 원형 조각 → SVG path (도넛 링). 0~1 비율 구간을 호로 그린다.
 * 조각 사이 간격(MARK_GAP)은 stroke 로 표면색을 덧그려 만든다 — path 를 줄이면
 * 각도가 왜곡되어 면적이 값과 어긋난다.
 * @param {number} cx @param {number} cy @param {number} r @param {number} innerR
 * @param {number} startFrac @param {number} endFrac
 * @returns {string}
 */
export function donutSlicePath(cx, cy, r, innerR, startFrac, endFrac) {
  const TAU = Math.PI * 2
  // -90° 에서 시작(12시 방향) — 사람이 원형 차트를 읽기 시작하는 곳.
  const a0 = startFrac * TAU - Math.PI / 2
  const a1 = endFrac * TAU - Math.PI / 2
  const large = endFrac - startFrac > 0.5 ? 1 : 0
  const p = (/** @type {number} */ rad, /** @type {number} */ a) => [cx + rad * Math.cos(a), cy + rad * Math.sin(a)]
  const [x0, y0] = p(r, a0)
  const [x1, y1] = p(r, a1)
  const [ix1, iy1] = p(innerR, a1)
  const [ix0, iy0] = p(innerR, a0)
  // 100% 한 조각이면 시작=끝이라 호가 사라진다 — 두 개의 반원으로 그린다.
  if (endFrac - startFrac >= 1)
    return (
      `M ${cx - r} ${cy} A ${r} ${r} 0 1 1 ${cx + r} ${cy} A ${r} ${r} 0 1 1 ${cx - r} ${cy} Z ` +
      `M ${cx - innerR} ${cy} A ${innerR} ${innerR} 0 1 0 ${cx + innerR} ${cy} A ${innerR} ${innerR} 0 1 0 ${cx - innerR} ${cy} Z`
    )
  return `M ${x0} ${y0} A ${r} ${r} 0 ${large} 1 ${x1} ${y1} L ${ix1} ${iy1} A ${innerR} ${innerR} 0 ${large} 0 ${ix0} ${iy0} Z`
}

/**
 * 원형 조각의 누적 비율 경계. 합이 0이면 균등 분할(0 나눗셈 가드).
 * @param {ChartPoint[]} data
 * @returns {{ point: ChartPoint, start: number, end: number, frac: number }[]}
 */
export function pieSlices(data) {
  const total = data.reduce((s, p) => s + Math.max(0, p.value), 0)
  let acc = 0
  return data.map((point) => {
    const frac = total > 0 ? Math.max(0, point.value) / total : 1 / Math.max(1, data.length)
    const start = acc
    acc += frac
    return { point, start, end: acc, frac }
  })
}
