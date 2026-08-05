import { execFileSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { expect, ROOT, test } from './fixtures.mjs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const PDF_PATH = '/tmp/crefle-process-flow-test.pdf'

function tableMarkup(id, lanes, rows = 3) {
  const laneHeaders = lanes.map((lane) => `<th scope="col">${lane}</th>`).join('')
  const body = Array.from({ length: rows }, (_, row) => {
    const cells = lanes.map((lane, laneIndex) => {
      if (row === 0 && laneIndex === 0)
        return `<td data-transition="enter"><span class="process-flow-transition">시작</span><div class="process-flow-items"><span class="identity-chip" data-identity="${laneIndex + 1}" data-confidence="confirmed">${lane}-시작-${row}</span></div></td>`
      if (row === rows - 1 && laneIndex === lanes.length - 1)
        return `<td data-transition="exit"><span class="process-flow-transition">종료</span><div class="process-flow-items"><span class="identity-chip" data-identity="${laneIndex + 1}" data-confidence="estimated">${lane}-종료-${row}</span></div></td>`
      if ((row + laneIndex) % 4 === 0)
        return '<td><span class="process-flow-empty" aria-label="항목 없음">—</span></td>'
      return `<td><div class="process-flow-items"><span class="identity-chip" data-identity="${laneIndex + 1}" data-confidence="confirmed">${lane}-항목-${row}</span></div></td>`
    }).join('')
    return `<tr><th scope="row"><strong>단계 ${row + 1}</strong><small>부가 정보 ${row + 1}</small></th>${cells}</tr>`
  }).join('')

  return `<div class="process-flow-scroll"><table id="${id}" class="process-flow"><caption>${id === 'four-lanes' ? '화면 요청 처리 흐름' : `${id} 흐름`}</caption><thead><tr><th scope="col">단계</th>${laneHeaders}</tr></thead><tbody>${body}</tbody></table></div>`
}

async function mountFixture(page) {
  await page.goto(pathToFileURL(join(ROOT, 'examples', 'doc-minimal.html')).href)
  await page.evaluate(
    ({ two, three, four, dense }) => {
      const fixture = document.createElement('section')
      fixture.id = 'process-flow-fixture'
      fixture.innerHTML = `
        <div id="two-wrapper">${two}</div>
        <div id="three-wrapper">${three}</div>
        <div id="narrow-wrapper" style="width:320px">${four}</div>
        <div id="multi-items" class="process-flow-items" style="width:240px">
          ${Array.from({ length: 6 }, (_, index) => `<span class="identity-chip" data-identity="${index + 1}" data-confidence="confirmed">긴 항목 ${index + 1}</span>`).join('')}
        </div>
        <table class="process-flow"><tbody><tr>
          <td id="invalid-transition" data-transition="invalid"><span class="process-flow-transition">전환</span></td>
        </tr></tbody></table>
        <div id="dense-wrapper">${dense}</div>
      `
      document.body.prepend(fixture)
    },
    {
      two: tableMarkup('two-lanes', ['WEB', 'POP']),
      three: tableMarkup('three-lanes', ['WEB', 'POP', 'API']),
      four: tableMarkup('four-lanes', ['LANE-WEB-LONG', 'LANE-POP-LONG', 'LANE-API-LONG', 'LANE-DATA-LONG']),
      dense: tableMarkup('dense-flow', ['LANE-WEB', 'LANE-POP', 'LANE-API'], 240)
    }
  )
}

test('process flow — native table 의미와 2~4 lane 구조를 보존한다', async ({ isolatedPage: page }) => {
  await mountFixture(page)

  const table = page.locator('#four-lanes')
  await expect(table).toHaveAccessibleName('화면 요청 처리 흐름')
  await expect(table.getByRole('columnheader', { name: 'LANE-WEB-LONG' })).toBeVisible()
  await expect(table.getByRole('rowheader', { name: /단계 1/ }).first()).toBeVisible()
  await expect(table.getByLabel('항목 없음').first()).toHaveText('—')
  expect(await page.locator('#two-lanes thead th').count()).toBe(3)
  expect(await page.locator('#three-lanes thead th').count()).toBe(4)
  expect(await page.locator('#four-lanes thead th').count()).toBe(5)
})

test('process flow — 좁은 화면은 wrapper 안에서 스크롤하고 item은 셀 안에서 감긴다', async ({ isolatedPage: page }) => {
  await mountFixture(page)

  const scroll = await page.locator('#narrow-wrapper .process-flow-scroll').evaluate((wrapper) => ({
    internalOverflow: wrapper.scrollWidth > wrapper.clientWidth,
    documentOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    overflowMode: getComputedStyle(wrapper).overflowX
  }))
  expect(scroll).toEqual({ internalOverflow: true, documentOverflow: false, overflowMode: 'auto' })

  const itemLayout = await page.locator('#multi-items').evaluate((items) => ({
    display: getComputedStyle(items).display,
    flexWrap: getComputedStyle(items).flexWrap,
    wraps: new Set([...items.children].map((chip) => chip.getBoundingClientRect().top)).size > 1
  }))
  expect(itemLayout).toEqual({ display: 'flex', flexWrap: 'wrap', wraps: true })
})

test('process flow — enter·exit 전환선과 실제 텍스트를 invalid 값과 구분한다', async ({ isolatedPage: page }) => {
  await mountFixture(page)

  await expect(page.locator('[data-transition="enter"] .process-flow-transition').first()).toHaveText('시작')
  await expect(page.locator('[data-transition="exit"] .process-flow-transition').first()).toHaveText('종료')

  const borders = await page.evaluate(() => {
    const read = (selector) => {
      const style = getComputedStyle(document.querySelector(selector))
      return { start: style.borderBlockStartWidth, end: style.borderBlockEndWidth }
    }
    return {
      enter: read('[data-transition="enter"]'),
      exit: read('[data-transition="exit"]'),
      invalid: read('#invalid-transition')
    }
  })
  expect(parseFloat(borders.enter.start)).toBeGreaterThan(parseFloat(borders.invalid.start))
  expect(parseFloat(borders.exit.end)).toBeGreaterThan(parseFloat(borders.invalid.end))
})

test('process flow — A4 인쇄에서 header를 반복하고 행·chip을 분할하지 않는다', async ({ isolatedPage: page }) => {
  await mountFixture(page)
  await page.emulateMedia({ media: 'print' })

  const print = await page.evaluate(() => ({
    wrapperOverflow: getComputedStyle(document.querySelector('.process-flow-scroll')).overflowX,
    tableLayout: getComputedStyle(document.querySelector('.process-flow')).tableLayout,
    theadDisplay: getComputedStyle(document.querySelector('.process-flow thead')).display,
    rowBreak: getComputedStyle(document.querySelector('.process-flow tbody tr')).breakInside,
    chipWhiteSpace: getComputedStyle(document.querySelector('.process-flow .identity-chip')).whiteSpace,
    documentOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth
  }))
  expect(print).toEqual({
    wrapperOverflow: 'visible',
    tableLayout: 'fixed',
    theadDisplay: 'table-header-group',
    rowBreak: 'avoid',
    chipWhiteSpace: 'normal',
    documentOverflow: false
  })
  expect(page.consoleErrors).toEqual([])
  expect(page.blocked).toEqual([])

  const pdf = await page.pdf({ printBackground: false, preferCSSPageSize: true })
  writeFileSync(PDF_PATH, pdf)
  expect(pdf.length).toBeGreaterThan(1000)
  const info = execFileSync('pdfinfo', [PDF_PATH], { encoding: 'utf8' })
  expect(Number(info.match(/^Pages:\s+(\d+)/m)?.[1])).toBeGreaterThan(1)
  const text = execFileSync('pdftotext', [PDF_PATH, '-'], { encoding: 'utf8' })
  expect(text.match(/LANE-WEB/g)?.length ?? 0).toBeGreaterThan(1)
})
