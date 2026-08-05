import { expect, ROOT, test } from './fixtures.mjs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

async function mountFixture(page) {
  await page.goto(pathToFileURL(join(ROOT, 'examples', 'doc-minimal.html')).href)
  await page.evaluate(() => {
    const fixture = document.createElement('section')
    fixture.id = 'confidence-bar-fixture'
    fixture.innerHTML = `
      <div id="relative" class="confidence-bar" data-identity="2" role="img"
           aria-label="웹: 확정 6, 추정 2.5, 미확인 1.5">
        <span class="confidence-segment" data-confidence="confirmed" style="--segment-size: 6"></span>
        <span class="confidence-segment" data-confidence="estimated" style="--segment-size: 2.5"></span>
        <span class="confidence-segment" data-confidence="unknown" style="--segment-size: 1.5"></span>
      </div>
      <div id="identity-bars"></div>
      <div id="invalid" class="confidence-bar" data-identity="invalid" role="img" aria-label="잘못된 값">
        <span class="confidence-segment" data-confidence="invalid" style="--segment-size: 1"></span>
      </div>
      <div id="dark-token-host" style="--surface: #181818; --surface-container: #242424; --surface-container-low: #202020; --on-surface: #f4f4f4; --on-surface-muted: #b8b8b8; --outline-variant: #777777">
        <div class="confidence-bar" data-identity="2" role="img" aria-label="어두운 표면 확신도">
          <span class="confidence-segment" data-confidence="confirmed" style="--segment-size: 1"></span>
          <span class="confidence-segment" data-confidence="estimated" style="--segment-size: 1"></span>
          <span class="confidence-segment" data-confidence="unknown" style="--segment-size: 1"></span>
        </div>
      </div>
      <div id="confidence-bulk"></div>
    `
    document.body.prepend(fixture)

    const identities = fixture.querySelector('#identity-bars')
    for (let slot = 1; slot <= 8; slot++)
      identities.insertAdjacentHTML(
        'beforeend',
        `<div class="confidence-bar" data-identity="${slot}" role="img" aria-label="identity ${slot}">
           <span class="confidence-segment" data-confidence="confirmed" style="--segment-size: 1"></span>
         </div>`
      )

    const bulk = fixture.querySelector('#confidence-bulk')
    for (let index = 0; index < 500; index++)
      bulk.insertAdjacentHTML(
        'beforeend',
        `<div class="confidence-bar" data-identity="${(index % 8) + 1}" role="img" aria-label="항목 ${index}">
           <span class="confidence-segment" data-confidence="confirmed" style="--segment-size: 6"></span>
           <span class="confidence-segment" data-confidence="estimated" style="--segment-size: 3"></span>
           <span class="confidence-segment" data-confidence="unknown" style="--segment-size: 1"></span>
         </div>`
      )
  })
}

test('confidence bar — 정규화하지 않은 segment weight를 상대 폭으로 렌더한다', async ({ isolatedPage: page }) => {
  await mountFixture(page)

  const widths = await page.locator('#relative .confidence-segment').evaluateAll(
    (segments) => segments.map((segment) => segment.getBoundingClientRect().width)
  )
  expect(widths[0] / widths[1]).toBeCloseTo(6 / 2.5, 1)
  expect(widths[1] / widths[2]).toBeCloseTo(2.5 / 1.5, 1)
  await expect(page.getByRole('img', { name: '웹: 확정 6, 추정 2.5, 미확인 1.5' })).toBeVisible()
})

test('confidence bar — 8 identity와 세 confidence를 독립 시각 채널로 표현한다', async ({ isolatedPage: page }) => {
  await mountFixture(page)

  const treatments = await page.locator('#relative .confidence-segment').evaluateAll((segments) =>
    segments.map((segment) => {
      const style = getComputedStyle(segment)
      return {
        backgroundImage: style.backgroundImage,
        borderStyle: style.borderStyle,
        boxShadow: style.boxShadow
      }
    })
  )
  expect(treatments[0].borderStyle).toBe('solid')
  expect(treatments[1].backgroundImage).toContain('repeating-linear-gradient')
  expect(treatments[1].borderStyle).toBe('double')
  expect(treatments[2].borderStyle).toBe('dashed')

  const identityColors = await page.locator('#identity-bars .confidence-segment').evaluateAll(
    (segments) => segments.map((segment) => getComputedStyle(segment).backgroundColor)
  )
  expect(new Set(identityColors).size).toBe(8)

  const invalid = await page.locator('#invalid .confidence-segment').evaluate((segment) => {
    const style = getComputedStyle(segment)
    return { borderStyle: style.borderStyle, boxShadow: style.boxShadow }
  })
  expect(invalid.borderStyle).not.toBe('solid')
  expect(invalid.boxShadow).not.toBe('none')
})

test('confidence bar — 어두운 토큰·인쇄·500개 배치에서 패턴과 경계를 보존한다', async ({ isolatedPage: page }) => {
  await mountFixture(page)
  await page.emulateMedia({ media: 'print' })

  const result = await page.evaluate(() => {
    const darkSegments = [...document.querySelectorAll('#dark-token-host .confidence-segment')]
    const bulkBars = [...document.querySelectorAll('#confidence-bulk .confidence-bar')]
    const container = document.querySelector('#confidence-bulk').getBoundingClientRect()
    return {
      darkTreatments: darkSegments.map((segment) => {
        const style = getComputedStyle(segment)
        return [style.borderStyle, style.backgroundImage]
      }),
      count: bulkBars.length,
      overflows: bulkBars.some((bar) => bar.getBoundingClientRect().right > container.right + 0.5)
    }
  })

  expect(result.darkTreatments[0][0]).toBe('solid')
  expect(result.darkTreatments[1]).toEqual(expect.arrayContaining(['double']))
  expect(result.darkTreatments[1][1]).toContain('repeating-linear-gradient')
  expect(result.darkTreatments[2][0]).toBe('dashed')
  expect(result.count).toBe(500)
  expect(result.overflows).toBe(false)
  expect(page.consoleErrors).toEqual([])
  expect(page.blocked).toEqual([])

  const pdf = await page.pdf({ printBackground: false, preferCSSPageSize: true })
  expect(pdf.length).toBeGreaterThan(1000)
})
