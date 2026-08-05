import { expect, ROOT, test } from './fixtures.mjs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

async function mountFixture(page) {
  await page.goto(pathToFileURL(join(ROOT, 'examples', 'doc-minimal.html')).href)
  await page.evaluate(() => {
    const fixture = document.createElement('section')
    fixture.id = 'magnitude-meter-fixture'
    fixture.innerHTML = `
      <label for="meter-zero">없음</label>
      <meter id="meter-zero" class="magnitude-meter" min="0" max="12" value="0">0 / 12</meter>
      <label for="meter-eight">차단 화면</label>
      <meter id="meter-eight" class="magnitude-meter" min="0" max="12" value="8">8 / 12</meter>
      <meter id="meter-full" class="magnitude-meter" min="0" max="12" value="12"
             aria-label="전체 화면">12 / 12</meter>
      <div id="meter-bulk"></div>
    `
    document.body.prepend(fixture)

    const bulk = fixture.querySelector('#meter-bulk')
    for (let index = 0; index < 500; index++)
      bulk.insertAdjacentHTML(
        'beforeend',
        `<label>항목 ${index}: ${index % 13} / 12
           <meter class="magnitude-meter" min="0" max="12" value="${index % 13}">${index % 13} / 12</meter>
         </label>`
      )
  })
}

test('magnitude meter — native 값과 접근성 이름을 보존한다', async ({ isolatedPage: page }) => {
  await mountFixture(page)

  const meter = page.getByLabel('차단 화면', { exact: true })
  await expect(meter).toBeVisible()
  await expect(meter).toHaveJSProperty('min', 0)
  await expect(meter).toHaveJSProperty('max', 12)
  await expect(meter).toHaveJSProperty('value', 8)
  await expect(page.getByLabel('전체 화면')).toHaveJSProperty('value', 12)
  expect(await meter.evaluate((element) => element.labels?.[0]?.textContent)).toBe('차단 화면')
})

test('magnitude meter — 중립 track과 fill을 구분하고 compact 높이를 유지한다', async ({
  isolatedPage: page
}) => {
  await mountFixture(page)

  const result = await page.locator('#meter-eight').evaluate((meter) => {
    const meterStyle = getComputedStyle(meter)
    return {
      display: meterStyle.display,
      height: meter.getBoundingClientRect().height,
      trackBackground: meterStyle.backgroundColor,
      valueColor: meterStyle.accentColor,
      trackBorder: meterStyle.borderStyle
    }
  })

  expect(result.display).toBe('block')
  expect(result.height).toBeLessThanOrEqual(12)
  expect(result.trackBackground).not.toBe(result.valueColor)
  expect(result.trackBorder).toBe('solid')
})

test('magnitude meter — 인쇄와 500개 밀도 배치에서 경계·폭·오프라인 출력을 보존한다', async ({
  isolatedPage: page
}) => {
  await mountFixture(page)
  await page.emulateMedia({ media: 'print' })

  const result = await page.evaluate(() => {
    const meters = [...document.querySelectorAll('#meter-bulk .magnitude-meter')]
    const container = document.querySelector('#meter-bulk').getBoundingClientRect()
    const meter = document.querySelector('#meter-eight')
    return {
      count: meters.length,
      overflows: meters.some((item) => item.getBoundingClientRect().right > container.right + 0.5),
      trackBorder: getComputedStyle(meter).borderStyle,
      valueColor: getComputedStyle(meter).accentColor
    }
  })

  expect(result.count).toBe(500)
  expect(result.overflows).toBe(false)
  expect(result.trackBorder).toBe('solid')
  expect(result.valueColor).not.toBe('auto')
  expect(page.consoleErrors).toEqual([])
  expect(page.blocked).toEqual([])

  const pdf = await page.pdf({ printBackground: false, preferCSSPageSize: true })
  expect(pdf.length).toBeGreaterThan(1000)
})
