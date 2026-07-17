import { describe, it, expect } from 'vitest'
import {
  resolveDomain,
  stackedMax,
  yToPx,
  xToPx,
  seriesSlot,
  summarize,
  summarizePie,
  buildSrRows,
  buildLegendItems,
  pieSlices,
  donutSlicePath,
  SLOT_COUNT,
  PIE_MAX_SLICES,
  defaultFormatValue
} from './chart-math.mjs'

/** @param {string} name @param {number[]} vals @returns {import('./chart-math.mjs').ChartSeries} */
const S = (name, vals) => ({ name, data: vals.map((v, i) => ({ label: `L${i}`, value: v })) })

describe('resolveDomain — 축퇴와 종류별 바닥', () => {
  it('bar 는 0에서 시작한다 (막대 길이는 0에서 재는 것이므로)', () => {
    expect(resolveDomain([S('a', [10, 20])], 'bar')).toEqual({ min: 0, max: 20 })
  })

  it('line 은 음수까지 내려간다 (추이는 0을 지날 수 있다)', () => {
    expect(resolveDomain([S('a', [-5, 20])], 'line')).toEqual({ min: -5, max: 20 })
  })

  it('line 이라도 데이터가 전부 양수면 0을 바닥으로 (기준선이 0이어야 크기가 정직하다)', () => {
    expect(resolveDomain([S('a', [10, 20])], 'line')).toEqual({ min: 0, max: 20 })
  })

  it('축퇴: 모든 값이 같으면 max 를 +1 한다 — 없으면 (v-min)/(max-min) 이 0/0', () => {
    const d = resolveDomain([S('a', [7, 7, 7])], 'bar')
    expect(d.max).toBeGreaterThan(d.min)
    expect(() => yToPx(7, d, 0, 100)).not.toThrow()
    expect(Number.isFinite(yToPx(7, d, 0, 100))).toBe(true)
  })

  it('빈 시리즈에도 터지지 않는다', () => {
    const d = resolveDomain([], 'bar')
    expect(Number.isFinite(d.min) && Number.isFinite(d.max)).toBe(true)
    expect(d.max).toBeGreaterThan(d.min)
  })

  it('명시된 min/max 가 데이터를 이긴다', () => {
    expect(resolveDomain([S('a', [10, 20])], 'bar', -100, 100)).toEqual({ min: -100, max: 100 })
  })
})

describe('stackedMax — 누적 합이 진짜 최댓값', () => {
  it('per-value max 가 아니라 카테고리별 합을 쓴다', () => {
    const series = [S('a', [10, 20]), S('b', [30, 5])]
    // per-value max 는 30. 하지만 카테고리 0 의 합은 40 — 30 으로 잡으면 잘린다.
    expect(stackedMax(series, 2)).toBe(40)
  })

  it('음수는 0으로 클램프 (누적 막대에 음수는 정의되지 않는다)', () => {
    expect(stackedMax([S('a', [-5])], 1)).toBe(0)
  })
})

describe('xToPx — n=1 분모 0 가드', () => {
  it('포인트가 하나면 plotLeft (i/(n-1) 이 0/0)', () => {
    expect(xToPx(0, 1, 44, 500)).toBe(44)
  })

  it('양 끝이 plot 을 꽉 채운다', () => {
    expect(xToPx(0, 3, 44, 500)).toBe(44)
    expect(xToPx(2, 3, 44, 500)).toBe(544)
  })
})

describe('yToPx — y축은 아래로 자란다', () => {
  it('min 은 바닥, max 는 천장', () => {
    const d = { min: 0, max: 100 }
    expect(yToPx(0, d, 16, 288)).toBe(288)
    expect(yToPx(100, d, 16, 288)).toBe(16)
    expect(yToPx(50, d, 16, 288)).toBe(152)
  })
})

describe('seriesSlot — **순환하지 않는다** (web-ui 원본에서 의도적으로 바꾼 것)', () => {
  it('0-based 인덱스를 1-based 슬롯으로', () => {
    expect(seriesSlot(0)).toBe(1)
    expect(seriesSlot(7)).toBe(8)
  })

  it('9번째 시리즈는 던진다 — 순환하면 1번과 같은 색이 되어 정체성이 거짓말을 한다', () => {
    // web-ui 원본은 (i % 5) + 1 이라 6번째가 1번과 같은 색이었다.
    // dataviz non-negotiable: "assign in fixed order, never cycled".
    expect(() => seriesSlot(SLOT_COUNT)).toThrow(/순환하지 않습니다/)
    expect(() => seriesSlot(SLOT_COUNT)).toThrow(/기타|facet/)
  })

  it('음수 인덱스도 던진다', () => {
    expect(() => seriesSlot(-1)).toThrow(RangeError)
  })

  it('원형 상한(4)은 슬롯 상한(8)보다 작다 — all-pairs 가 더 어려운 검사다', () => {
    expect(PIE_MAX_SLICES).toBeLessThan(SLOT_COUNT)
  })
})

describe('summarize — role="img" 의 대체 텍스트', () => {
  it('단일 시리즈는 시리즈명을 반복하지 않는다', () => {
    expect(summarize([S('품질', [1, 2])], defaultFormatValue, '제목')).toBe('제목: L0 1, L1 2')
  })

  it('다중 시리즈는 시리즈명으로 구분한다', () => {
    expect(summarize([S('a', [1]), S('b', [2])], defaultFormatValue)).toBe('a: L0 1 b: L0 2')
  })

  it('formatValue 를 존중한다 (단위가 붙어야 읽힌다)', () => {
    expect(summarize([S('a', [23.8])], (v) => `${v}점`, undefined)).toContain('23.8점')
  })

  it('원형도 요약된다', () => {
    expect(summarizePie([{ label: 'A', value: 1 }], defaultFormatValue, 'T')).toBe('T: A 1')
  })
})

describe('buildSrRows — 시각적 숨김 표', () => {
  it('카테고리를 행으로, 시리즈를 열로', () => {
    expect(buildSrRows([S('a', [1, 2]), S('b', [3, 4])], defaultFormatValue)).toEqual([
      { label: 'L0', values: ['1', '3'] },
      { label: 'L1', values: ['2', '4'] }
    ])
  })

  it('길이가 다른 시리즈는 0으로 메운다 (구멍이 표를 깨지 않게)', () => {
    expect(buildSrRows([S('a', [1, 2]), S('b', [3])], defaultFormatValue)).toEqual([
      { label: 'L0', values: ['1', '3'] },
      { label: 'L1', values: ['2', '0'] }
    ])
  })

  it('빈 입력은 빈 배열', () => {
    expect(buildSrRows([], defaultFormatValue)).toEqual([])
  })
})

describe('buildLegendItems', () => {
  it('슬롯을 순서대로 매긴다', () => {
    expect(buildLegendItems([S('a', [1]), S('b', [1])])).toEqual([
      { name: 'a', slot: 1, color: undefined },
      { name: 'b', slot: 2, color: undefined }
    ])
  })

  it('9개 시리즈면 던진다 — 조용히 색을 재사용하지 않는다', () => {
    expect(() => buildLegendItems(Array.from({ length: 9 }, (_, i) => S(`s${i}`, [1])))).toThrow(/순환/)
  })
})

describe('pieSlices — 비율과 0 나눗셈', () => {
  it('누적 경계가 0에서 1까지 이어진다', () => {
    const s = pieSlices([
      { label: 'A', value: 25 },
      { label: 'B', value: 75 }
    ])
    expect(s[0].start).toBe(0)
    expect(s[0].end).toBeCloseTo(0.25)
    expect(s[1].start).toBeCloseTo(0.25)
    expect(s[1].end).toBeCloseTo(1)
  })

  it('합이 0이면 균등 분할 (0/0 가드) — 빈 원이 아니라 균등한 원이 정직하다', () => {
    const s = pieSlices([
      { label: 'A', value: 0 },
      { label: 'B', value: 0 }
    ])
    expect(s[0].frac).toBeCloseTo(0.5)
    expect(s[1].frac).toBeCloseTo(0.5)
    expect(s.every((x) => Number.isFinite(x.start) && Number.isFinite(x.end))).toBe(true)
  })

  it('음수는 0으로 클램프 (원형에 음수 면적은 없다)', () => {
    const s = pieSlices([
      { label: 'A', value: -10 },
      { label: 'B', value: 10 }
    ])
    expect(s[0].frac).toBe(0)
    expect(s[1].frac).toBeCloseTo(1)
  })
})

describe('donutSlicePath — 100% 한 조각', () => {
  it('한 조각이 전부면 두 개의 반원으로 그린다 (시작=끝이면 호가 사라진다)', () => {
    const p = donutSlicePath(100, 100, 80, 25, 0, 1)
    // 사라지지 않았는지 = 실제 경로가 있는지
    expect(p).toMatch(/^M /)
    expect(p.match(/A /g)?.length).toBeGreaterThanOrEqual(4)
    expect(p).not.toContain('NaN')
  })

  it('일반 조각에 NaN 이 없다', () => {
    for (const [a, b] of [
      [0, 0.25],
      [0.25, 0.9],
      [0.9, 1]
    ])
      expect(donutSlicePath(100, 100, 80, 25, a, b)).not.toContain('NaN')
  })

  it('반원 초과 조각은 large-arc 플래그를 세운다', () => {
    expect(donutSlicePath(100, 100, 80, 25, 0, 0.75)).toMatch(/A 80 80 0 1 1/)
    expect(donutSlicePath(100, 100, 80, 25, 0, 0.25)).toMatch(/A 80 80 0 0 1/)
  })
})
