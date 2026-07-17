/**
 * `crefle-chart.js` 가 자유 변수로 쓰는 이름들의 타입 선언.
 *
 * ## 왜 이 파일이 있나
 *
 * `scripts/build.mjs` 가 `chart-math.mjs` 의 export 를 떼어 `crefle-chart.js` 앞에
 * **결정적으로 concat** 한다(둘을 감싸는 IIFE 하나로). 그래서 런타임에는 같은 스코프에
 * 있지만, `crefle-chart.js` 파일 **혼자서는** 그 이름들이 정의돼 있지 않다.
 *
 * import 를 쓰면 안 되는 이유: `file://` 는 opaque origin 이라 Chromium 이 모듈
 * 스크립트를 CORS 로 차단한다. 문서는 file:// 로 열린다. 그래서 산출물은 IIFE 여야 하고,
 * 소스에 top-level import 를 둘 수 없다.
 *
 * 이 파일은 그 **concat 계약을 타입으로 적어둔 것**이다. 런타임 영향이 0이면서
 * `tsc --checkJs` 가 실제 시그니처로 사용처를 검사하게 한다 — 인자 순서를 틀리거나
 * 없는 함수를 부르면 게이트가 잡는다.
 *
 * 원칙: **저작한 것은 typecheck, 흡수한 것은 e2e.** crefle-chart.js 는 저작한 것이므로
 * `@ts-nocheck` 로 도망가지 않는다(deck-stage.js 의 면제는 흡수한 코드에만 해당).
 *
 * chart-math.mjs 의 시그니처가 바뀌면 여기가 자동으로 따라간다 — `typeof` 로 참조하므로
 * 손으로 베낀 타입이 갈라질 일이 없다.
 */
import type * as M from './chart-math.mjs'

declare global {
  // 상수
  const DEFAULT_WIDTH: typeof M.DEFAULT_WIDTH
  const DEFAULT_HEIGHT: typeof M.DEFAULT_HEIGHT
  const PADDING: typeof M.PADDING
  const POINT_RADIUS: typeof M.POINT_RADIUS
  const BAR_GROUP_GAP_RATIO: typeof M.BAR_GROUP_GAP_RATIO
  const DONUT_RING_RATIO: typeof M.DONUT_RING_RATIO
  const DEFAULT_Y_TICKS: typeof M.DEFAULT_Y_TICKS
  const SLOT_COUNT: typeof M.SLOT_COUNT
  const PIE_MAX_SLICES: typeof M.PIE_MAX_SLICES
  const MARK_GAP: typeof M.MARK_GAP
  const LABEL_HEADROOM: typeof M.LABEL_HEADROOM

  // 함수
  const defaultFormatValue: typeof M.defaultFormatValue
  const seriesSlot: typeof M.seriesSlot
  const resolveDomain: typeof M.resolveDomain
  const stackedMax: typeof M.stackedMax
  const yToPx: typeof M.yToPx
  const xToPx: typeof M.xToPx
  const summarize: typeof M.summarize
  const summarizePie: typeof M.summarizePie
  const buildSrRows: typeof M.buildSrRows
  const buildLegendItems: typeof M.buildLegendItems
  const pieSlices: typeof M.pieSlices
  const donutSlicePath: typeof M.donutSlicePath
}
