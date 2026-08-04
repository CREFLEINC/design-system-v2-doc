import { expect, ROOT, test } from './fixtures.mjs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const IDENTITIES = ['1', '2', '3', '4', '5', '6', '7', '8']
const CONFIDENCES = {
  confirmed: 'solid',
  estimated: 'dashed',
  unknown: 'double'
}
const STATUSES = [
  ['신설', '✦'],
  ['폐기', '×'],
  ['통합', '⊕'],
  ['이관', '↗'],
  ['격하', '↓']
]

async function mountFixture(page) {
  await page.goto(pathToFileURL(join(ROOT, 'examples', 'doc-minimal.html')).href)
  await page.evaluate(
    ({ identities, confidences, statuses }) => {
      const fixture = document.createElement('section')
      fixture.id = 'identity-chip-fixture'
      fixture.innerHTML = `
        <div id="identity-matrix"></div>
        <div id="identity-statuses"></div>
        <div id="identity-bulk"></div>
      `
      document.body.prepend(fixture)

      const matrix = fixture.querySelector('#identity-matrix')
      for (const identity of identities)
        for (const confidence of Object.keys(confidences))
          matrix.insertAdjacentHTML(
            'beforeend',
            `<span class="identity-chip" data-identity="${identity}" data-confidence="${confidence}">
               <span class="identity-chip-label">ID-${identity}-${confidence}</span>
             </span>`
          )
      matrix.insertAdjacentHTML(
        'beforeend',
        `<span id="invalid-confidence" class="identity-chip" data-identity="1" data-confidence="invalid">
           <span class="identity-chip-label">invalid</span>
         </span>`
      )

      const statusRoot = fixture.querySelector('#identity-statuses')
      for (const [name, glyph] of statuses)
        statusRoot.insertAdjacentHTML(
          'beforeend',
          `<span class="identity-chip" data-identity="2" data-confidence="confirmed">
             <span class="identity-chip-label">${name}</span>
             <span class="identity-chip-status" aria-label="${name}">${glyph}</span>
           </span>`
        )
      statusRoot.insertAdjacentHTML(
        'beforeend',
        `<span id="deprecated-chip" class="identity-chip" data-identity="3"
               data-confidence="confirmed" data-change="deprecated">
           <span class="identity-chip-label">폐기 대상</span>
           <span class="identity-chip-status" aria-label="폐기">×</span>
         </span>`
      )

      const bulk = fixture.querySelector('#identity-bulk')
      for (let i = 0; i < 700; i++)
        bulk.insertAdjacentHTML(
          'beforeend',
          `<span class="identity-chip" data-identity="${(i % 8) + 1}" data-confidence="estimated">
             <span class="identity-chip-label">ITEM-${i}</span>
           </span>`
        )
    },
    { identities: IDENTITIES, confidences: CONFIDENCES, statuses: STATUSES }
  )
}

test('identity chip — identity 8슬롯과 confidence 3단계를 독립 표현한다', async ({ isolatedPage: page }) => {
  await mountFixture(page)

  const styles = await page.evaluate(() =>
    [...document.querySelectorAll('#identity-matrix .identity-chip:not(#invalid-confidence)')].map((chip) => {
      const style = getComputedStyle(chip)
      return {
        identity: chip.getAttribute('data-identity'),
        confidence: chip.getAttribute('data-confidence'),
        borderStyle: style.borderStyle,
        backgroundColor: style.backgroundColor
      }
    })
  )

  expect(styles).toHaveLength(24)
  for (const style of styles) {
    expect(style.borderStyle).toBe(CONFIDENCES[style.confidence])
    expect(style.backgroundColor).not.toBe('rgba(0, 0, 0, 0)')
  }
  for (const identity of IDENTITIES)
    expect(new Set(styles.filter((style) => style.identity === identity).map((style) => style.backgroundColor)).size).toBe(1)

  const invalid = await page.locator('#invalid-confidence').evaluate((chip) => {
    const style = getComputedStyle(chip)
    return { borderStyle: style.borderStyle, boxShadow: style.boxShadow }
  })
  expect(invalid.borderStyle).not.toBe('solid')
  expect(invalid.boxShadow).not.toBe('none')
})

test('identity chip — 상태 텍스트·접근성 이름과 폐기 취소선을 보존한다', async ({ isolatedPage: page }) => {
  await mountFixture(page)

  for (const [name, glyph] of STATUSES) {
    const status = page.locator(`.identity-chip-status[aria-label="${name}"]`).first()
    await expect(status).toHaveText(glyph)
  }

  const deprecated = await page.locator('#deprecated-chip').evaluate((chip) => ({
    labelDecoration: getComputedStyle(chip.querySelector('.identity-chip-label')).textDecorationLine,
    statusDecoration: getComputedStyle(chip.querySelector('.identity-chip-status')).textDecorationLine
  }))
  expect(deprecated.labelDecoration).toContain('line-through')
  expect(deprecated.statusDecoration).not.toContain('line-through')
})

test('identity chip — 인쇄에서도 confidence 선이 유지되고 700개가 컨테이너 안에서 감긴다', async ({
  isolatedPage: page
}) => {
  await mountFixture(page)
  await page.emulateMedia({ media: 'print' })

  const result = await page.evaluate(() => {
    const confidenceStyles = ['confirmed', 'estimated', 'unknown'].map(
      (confidence) =>
        getComputedStyle(document.querySelector(`.identity-chip[data-confidence="${confidence}"]`)).borderStyle
    )
    const chips = [...document.querySelectorAll('#identity-bulk .identity-chip')]
    const container = document.querySelector('#identity-bulk').getBoundingClientRect()
    const first = chips[0].getBoundingClientRect()
    const last = chips.at(-1).getBoundingClientRect()
    return {
      confidenceStyles,
      count: chips.length,
      wraps: last.top > first.top,
      overflows: chips.some((chip) => chip.getBoundingClientRect().right > container.right + 0.5)
    }
  })

  expect(result.confidenceStyles).toEqual(['solid', 'dashed', 'double'])
  expect(result.count).toBe(700)
  expect(result.wraps).toBe(true)
  expect(result.overflows).toBe(false)
  expect(page.consoleErrors).toEqual([])
  expect(page.blocked).toEqual([])

  const pdf = await page.pdf({ printBackground: true, preferCSSPageSize: true })
  expect(pdf.length).toBeGreaterThan(1000)
})
