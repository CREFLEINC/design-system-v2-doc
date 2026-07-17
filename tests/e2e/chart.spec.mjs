import { test, expect, fileUrl } from './fixtures.mjs'

/**
 * <crefle-chart> e2e.
 *
 * dataviz 스킬의 절차 중 **7단계**를 기계화한다:
 *   "Render it and look at it. The validator checks color, not layout —
 *    open or screenshot the output and eyeball it for label collisions,
 *    geometry, and overflow before calling it done."
 *
 * 실제로 그 단계에서 버그를 잡았다: unit="점" 일 때 y축 눈금 "56.2점" 이
 * text-anchor:end 로 x=36 에 놓여 viewBox 왼쪽(-9)으로 삐져나가 첫 글자가 잘렸다.
 * 팔레트 validator 는 색만 보므로 이걸 놓쳤고, 스크린샷을 보고서야 발견했다.
 * → 눈으로만 잡히는 버그는 다시 돌아온다. 아래 오버플로 테스트가 그 자리를 지킨다.
 */

const DOC = 'examples/chart-minimal.html'

test('차트가 전부 렌더되고 조용히 죽지 않는다', async ({ isolatedPage: page }) => {
  await page.goto(fileUrl(DOC))
  await page.waitForFunction(() => customElements.get('crefle-chart') !== undefined, null, { timeout: 10000 })
  await page.waitForTimeout(200)

  const d = await page.evaluate(() => ({
    total: document.querySelectorAll('crefle-chart').length,
    rendered: document.querySelectorAll('crefle-chart figure').length,
    errors: [...document.querySelectorAll('.crefle-chart-error')].map((e) => e.textContent)
  }))

  expect(d.errors, '차트가 오류 상태다').toEqual([])
  expect(d.rendered, `${d.total}개 중 ${d.rendered}개만 렌더됐다`).toBe(d.total)
  expect(d.total).toBeGreaterThan(0)
  expect(page.blocked).toEqual([])
  expect(page.consoleErrors).toEqual([])
})

test('SVG 안의 텍스트가 viewBox 밖으로 삐져나가지 않는다 (실측된 버그의 회귀)', async ({ isolatedPage: page }) => {
  await page.goto(fileUrl(DOC))
  await page.waitForFunction(() => customElements.get('crefle-chart') !== undefined, null, { timeout: 10000 })
  await page.waitForTimeout(300)

  const overflows = await page.evaluate(() => {
    /** @type {{chart: string, text: string, side: string, detail: string}[]} */
    const bad = []
    const r1 = (/** @type {number} */ n) => Math.round(n * 10) / 10
    for (const fig of Array.from(document.querySelectorAll('crefle-chart'))) {
      const s = fig.querySelector('svg')
      if (!s) continue
      const [vx, vy, vw, vh] = (s.getAttribute('viewBox') || '').split(/\s+/).map(Number)
      for (const t of Array.from(s.querySelectorAll('text'))) {
        // getBBox 는 SVG 사용자 좌표계 — viewBox 와 같은 단위다.
        const b = /** @type {SVGGraphicsElement} */ (t).getBBox()
        /** @type {string[]} */
        const sides = []
        if (b.x < vx - 0.5) sides.push(`왼쪽 ${r1(vx - b.x)}px`)
        if (b.y < vy - 0.5) sides.push(`위쪽 ${r1(vy - b.y)}px`)
        if (b.x + b.width > vx + vw + 0.5) sides.push(`오른쪽 ${r1(b.x + b.width - vx - vw)}px`)
        if (b.y + b.height > vy + vh + 0.5) sides.push(`아래쪽 ${r1(b.y + b.height - vy - vh)}px`)
        if (sides.length)
          bad.push({
            chart: fig.getAttribute('title') || '(무제)',
            text: t.textContent || '',
            side: sides.join(', '),
            detail: `bbox x=${r1(b.x)}..${r1(b.x + b.width)} y=${r1(b.y)}..${r1(b.y + b.height)} / viewBox=[${vx} ${vy} ${vw} ${vh}]`
          })
      }
    }
    return bad
  })

  expect(
    overflows,
    `viewBox 밖으로 나간 텍스트가 있다 — 렌더하면 잘려 보인다:\n` +
      overflows.map((o) => `  "${o.text}" (${o.chart}) — ${o.side} 초과\n      ${o.detail}`).join('\n')
  ).toEqual([])
})

test('색만으로 시리즈를 구분하지 않는다 — 팔레트 검증이 남긴 의무', async ({ isolatedPage: page }) => {
  await page.goto(fileUrl(DOC))
  await page.waitForFunction(() => customElements.get('crefle-chart') !== undefined, null, { timeout: 10000 })
  await page.waitForTimeout(200)

  const d = await page.evaluate(() => {
    /** @type {{title: string, series: number, legend: boolean, srTable: boolean, directLabels: number}[]} */
    const out = []
    for (const c of Array.from(document.querySelectorAll('crefle-chart'))) {
      const type = c.getAttribute('type')
      const groups = c.querySelectorAll('svg > g[data-slot]').length
      const slices = c.querySelectorAll('.crefle-chart-slice').length
      out.push({
        title: c.getAttribute('title') || '',
        series: type === 'pie' ? slices : groups,
        legend: !!c.querySelector('.crefle-chart-legend'),
        srTable: !!c.querySelector('.crefle-sr-only table'),
        directLabels: c.querySelectorAll('.crefle-chart-value').length
      })
    }
    return out
  })

  for (const c of d) {
    // 표 대체는 **항상** — 대비 relief 의무(slot 3·6·7 이 3:1 미만)를 갚는다.
    expect(c.srTable, `"${c.title}" 에 시각적 숨김 표가 없다`).toBe(true)
    // 범례는 시리즈 2개 이상이면 항상 (dataviz non-negotiable).
    if (c.series > 1) expect(c.legend, `"${c.title}" 는 시리즈 ${c.series}개인데 범례가 없다`).toBe(true)
  }

  // 단일 시리즈 막대는 직접 라벨로 값을 나른다 — 흑백 인쇄에서 색이 사라져도 읽힌다.
  const single = d.find((c) => c.series === 1 && c.directLabels > 0)
  expect(single, '단일 시리즈 막대에 직접 라벨이 없다 — 흑백 인쇄에서 값이 사라진다').toBeTruthy()
})

test('접근성 — role=img + 자동 aria-label + 클립(display:none 아님) 표', async ({ isolatedPage: page }) => {
  await page.goto(fileUrl(DOC))
  await page.waitForFunction(() => customElements.get('crefle-chart') !== undefined, null, { timeout: 10000 })
  await page.waitForTimeout(200)

  const d = await page.evaluate(() => {
    const svgs = Array.from(document.querySelectorAll('crefle-chart svg'))
    const tbl = document.querySelector('.crefle-sr-only')
    const cs = tbl ? getComputedStyle(tbl) : null
    return {
      allImg: svgs.every((s) => s.getAttribute('role') === 'img'),
      allLabelled: svgs.every((s) => (s.getAttribute('aria-label') || '').length > 10),
      // display:none 이면 접근성 트리에서 사라진다 — 클립이어야 한다.
      srDisplay: cs?.display,
      srPosition: cs?.position
    }
  })

  expect(d.allImg, 'SVG 에 role="img" 가 없다').toBe(true)
  expect(d.allLabelled, 'aria-label 이 비었거나 너무 짧다 — 자동 요약이 동작하지 않았다').toBe(true)
  expect(d.srDisplay, 'SR 표가 display:none 이다 — 접근성 트리에서 사라진다. 클립으로 숨겨야 한다').not.toBe('none')
  expect(d.srPosition).toBe('absolute')
})

test('원형 조각이 4개를 넘으면 경고한다 — all-pairs 검증 상한', async ({ isolatedPage: page }) => {
  /** @type {string[]} */
  const warns = []
  page.on('console', (m) => m.type() === 'warning' && warns.push(m.text()))

  await page.goto(fileUrl(DOC))
  await page.waitForFunction(() => customElements.get('crefle-chart') !== undefined, null, { timeout: 10000 })

  // 예제는 상한을 지키므로 경고가 없어야 한다.
  expect(warns.filter((w) => w.includes('원형 조각')), '예제가 원형 상한을 넘었다').toEqual([])

  // 5조각을 주입하면 경고해야 한다.
  await page.evaluate(() => {
    const c = document.createElement('crefle-chart')
    c.setAttribute('type', 'pie')
    c.setAttribute('title', '상한 초과 프로브')
    c.textContent = JSON.stringify({ data: [1, 2, 3, 4, 5].map((v) => ({ label: `L${v}`, value: v })) })
    document.body.appendChild(c)
  })
  await page.waitForTimeout(200)

  expect(warns.some((w) => w.includes('원형 조각') && w.includes('기타')), '5조각 원형에 경고가 없다').toBe(true)
})
