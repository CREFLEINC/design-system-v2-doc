import { test, expect, ROOT } from './fixtures.mjs'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, cpSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { pathToFileURL } from 'node:url'

/**
 * PDF 에서 텍스트를 뽑는다.
 *
 * pdftotext(poppler-utils)를 쓴다. CI 가 설치한다(.github/workflows/ci.yml).
 * **없으면 건너뛰지 않고 실패시킨다** — 조용히 건너뛰면 "로컬만 통과하는 테스트"가
 * 되고, 그건 이 프로젝트가 이미 한 번 당한 실수다(Playwright 브라우저가 CI 에 없어
 * e2e 6개가 전부 실패했다. 로컬은 green 이었다).
 *
 * @param {Buffer} pdf
 * @returns {string}
 */
function pdfText(pdf) {
  try {
    return execFileSync('pdftotext', ['-layout', '-', '-'], { input: pdf, encoding: 'utf8' })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (/ENOENT/.test(msg))
      throw new Error(
        'pdftotext 가 없습니다. PDF 출력 검증에 필요합니다.\n' +
          '  macOS: brew install poppler\n' +
          '  ubuntu: sudo apt-get install -y poppler-utils\n' +
          '  CI 는 .github/workflows/ci.yml 에서 설치합니다 — 거기서 빠졌는지 확인하세요.'
      )
    throw e
  }
}

/**
 * 템플릿 e2e — **소비자와 똑같이 배치해서** 검증한다.
 *
 * 템플릿은 `./crefle-doc/crefle-doc.css` 를 참조한다. repo 의 templates/ 에는 그
 * 폴더가 없다 — 저자가 dist/crefle-doc/ 를 문서 옆에 복사해야 한다. 그 배치를
 * 재현하지 않고 테스트하면 "스타일 없이도 통과하는" 공허한 테스트가 된다.
 *
 * 그리고 examples/ 와 templates/ 는 **경로가 다르다**(../dist/ vs ./crefle-doc/).
 * 저자가 실제로 쓰는 건 templates/ 쪽이므로 그 경로가 맞는지 여기서만 확인된다.
 */

let dir = ''

test.beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'crefle-tpl-'))
  // 소비자 배치: 문서 옆에 crefle-doc/ 번들
  cpSync(join(ROOT, 'dist', 'crefle-doc'), join(dir, 'crefle-doc'), { recursive: true })
  for (const f of readdirSync(join(ROOT, 'templates'))) cpSync(join(ROOT, 'templates', f), join(dir, f))
})
test.afterAll(() => {
  if (dir) rmSync(dir, { recursive: true, force: true })
})

const TEMPLATES = [
  { name: 'report', charts: 1, minPages: 2 },
  { name: 'research-note', charts: 1, minPages: 2 },
  { name: 'minutes', charts: 0, minPages: 1 }
]

// 덱은 문서와 지면이 다르다 — deck-stage.js 가 @page{1920×1080} 을 주입한다.
// 그래서 A4 를 기대하는 위 루프에 넣지 않고 따로 검사한다.
const DECK = { name: 'deck', slides: 4 }

for (const t of TEMPLATES) {
  test(`${t.name} — 무네트워크 file:// 에서 온전히 렌더된다`, async ({ isolatedPage: page }) => {
    await page.goto(pathToFileURL(join(dir, `${t.name}.html`)).href)
    await page.waitForFunction(() => document.fonts && document.fonts.status === 'loaded', null, { timeout: 10000 })
    await page.waitForTimeout(300)

    const d = await page.evaluate(() => ({
      fonts: Array.from(document.fonts).filter((f) => f.status === 'loaded').length,
      charts: document.querySelectorAll('crefle-chart figure').length,
      chartErrors: document.querySelectorAll('.crefle-chart-error').length,
      // .doc 스코프가 없으면 아무 스타일도 안 걸린다 — 가장 흔한 저작 실수다.
      hasDocScope: document.querySelector('.doc') !== null,
      h1: parseFloat(getComputedStyle(/** @type {Element} */ (document.querySelector('h1'))).fontSize),
      primary: getComputedStyle(document.documentElement).getPropertyValue('--primary').trim().toUpperCase()
    }))

    // ./crefle-doc/ 경로가 틀리면 여기서 잡힌다 — 스타일도 폰트도 안 온다.
    expect(d.hasDocScope, '.doc 스코프가 없다 — 아무 스타일도 안 걸린다').toBe(true)
    expect(d.h1, 'h1 이 문서 스케일이 아니다 — crefle-doc.css 경로가 틀렸을 수 있다').toBe(30)
    expect(d.fonts, '번들 폰트가 로드되지 않았다').toBeGreaterThan(0)
    expect(d.primary, '브랜드 레드가 아니다').toBe('#C9252C')
    expect(d.charts, `차트 ${t.charts}개를 기대했다`).toBe(t.charts)
    expect(d.chartErrors).toBe(0)
    expect(page.blocked, `네트워크 요청이 있었다: ${page.blocked.join(', ')}`).toEqual([])
    expect(page.consoleErrors).toEqual([])
  })

  test(`${t.name} — A4 PDF 로 떨어지고 페이지 번호가 찍힌다`, async ({ isolatedPage: page }) => {
    await page.goto(pathToFileURL(join(dir, `${t.name}.html`)).href)
    await page.waitForFunction(() => document.fonts && document.fonts.status === 'loaded', null, { timeout: 10000 })
    await page.waitForTimeout(300)

    const pdf = await page.pdf({ printBackground: true, preferCSSPageSize: true })
    const raw = pdf.toString('latin1')
    const pages = (raw.match(/\/Type\s*\/Page[^s]/g) || []).length
    const nums = (raw.match(/\/MediaBox\s*\[[^\]]*\]/) || [''])[0].match(/[\d.]+/g) || []
    const [w, h] = [Math.round(Number(nums[2])), Math.round(Number(nums[3]))]

    // 덱은 deck-stage.js 가 1920×1080 을 주입하고, 문서는 print.css 의 @page 가 A4 를 준다.
    // render_pdf.py 의 prefer_css_page_size=True 가 이걸 집어간다.
    expect(w, `PDF 폭이 ${w}pt 다 — A4 는 595pt`).toBe(595)
    expect(h, `PDF 높이가 ${h}pt 다 — A4 는 842pt`).toBe(842)
    expect(pages).toBeGreaterThanOrEqual(t.minPages)
  })
}

test('인쇄 시 종이가 곧 표면 — 98% 흰색 사각형을 찍지 않는다', async ({ isolatedPage: page }) => {
  await page.goto(pathToFileURL(join(dir, 'report.html')).href)
  await page.waitForTimeout(300)

  const screen = await page.evaluate(() => getComputedStyle(document.body).backgroundColor)
  await page.emulateMedia({ media: 'print' })
  const print = await page.evaluate(() => getComputedStyle(document.body).backgroundColor)

  // 실측으로 잡은 버그: @page 여백은 순백(255,255,255)인데 .doc 는 --surface
  // (251,248,253) 라 98% 흰색 사각형이 매 페이지에 찍히고 **경계선이 보였다**.
  // 토너를 낭비하고 인쇄물답지 않다.
  //
  // 함정: 셀렉터가 `body` 면 못 이긴다 — 템플릿은 <body class="doc"> 이고
  // `.doc`(0-1-0)가 `body`(0-0-1)보다 특이성이 높다. print.css 가 뒤에 와도 진다.
  expect(print, '인쇄에서 문서 배경이 칠해진다 — .doc 특이성을 이기지 못했을 수 있다').toBe('rgba(0, 0, 0, 0)')
  // 화면에서는 --surface 가 유지되어야 한다 — 인쇄만 종이다.
  expect(screen, '화면 배경까지 지워졌다').toBe('rgb(251, 248, 253)')
})

test('러닝 헤더와 페이지 번호 — 표지는 건너뛴다', async ({ isolatedPage: page }) => {
  await page.goto(pathToFileURL(join(dir, 'report.html')).href)
  await page.waitForFunction(() => document.fonts && document.fonts.status === 'loaded', null, { timeout: 10000 })
  await page.waitForTimeout(300)

  const pdf = await page.pdf({ printBackground: true, preferCSSPageSize: true })
  const pageTexts = pdfText(pdf).split('\f').filter((s) => s.trim())

  // 계획 단계에서 나는 "Chromium 은 @page 마진 박스와 counter(page) 를 지원하지 않는다"
  // 고 적었다. **틀렸다** — 실측하니 전부 동작했다(Chromium 148). 이 테스트가 그 사실을
  // 고정한다. 만약 미래에 깨지면 여기서 알게 된다.
  expect(pageTexts.length).toBeGreaterThanOrEqual(2)
  expect(pageTexts[0], '표지에 페이지 번호가 찍혔다 — @page :first 가 안 먹었다').not.toMatch(/1 \/ \d/)
  expect(pageTexts[1], '2페이지에 페이지 번호가 없다 — counter(page) 가 안 먹었다').toMatch(/2 \/ \d/)
  // 러닝 헤더는 string-set 이 미지원이라 content: var(--doc-running-title) 로 받는다.
  expect(pageTexts[1], '러닝 헤더(조직명)가 없다').toContain('CREFLE')
  expect(pageTexts[1], '러닝 헤더(문서 제목)가 없다 — var() 가 안 먹었다').toContain('보고서 제목')
})

test('자동 번호 — 장·절·표가 실제 출력에 찍힌다', async ({ isolatedPage: page }) => {
  await page.goto(pathToFileURL(join(dir, 'report.html')).href)
  await page.waitForFunction(() => document.fonts && document.fonts.status === 'loaded', null, { timeout: 10000 })
  await page.waitForTimeout(300)

  // ⚠️ getComputedStyle(el, '::before').content 로 검사하지 말 것.
  //    카운터를 **해석하지 않은** 문자열을 돌려준다 — 실측: `counter(chapter) ". "`.
  //    첫 버전이 그렇게 짰다가 실패했다. "카운터가 실제로 몇으로 렌더됐나" 를 물으려면
  //    렌더 결과(PDF 텍스트)를 봐야 한다.
  const pdf = await page.pdf({ printBackground: true, preferCSSPageSize: true })
  const txt = pdfText(pdf)

  expect(txt, '장 번호가 출력에 없다 — counter(chapter) 가 안 먹었다').toMatch(/1\.\s*요약/)
  expect(txt, '장 번호가 증가하지 않는다').toMatch(/2\.\s*배경/)
  expect(txt, '절 번호가 없다 — counter(section) 이 안 먹었다').toMatch(/2\.1\s*현황/)
  expect(txt, '표 번호가 없다').toMatch(/표 \d/)
})

test('deck 템플릿 — 슬라이드당 1페이지, 1440×810pt', async ({ isolatedPage: page }) => {
  await page.goto(pathToFileURL(join(dir, `${DECK.name}.html`)).href)
  await page.waitForFunction(() => document.fonts && document.fonts.status === 'loaded', null, { timeout: 10000 })
  await page.waitForTimeout(400)

  const d = await page.evaluate(() => {
    const el = /** @type {any} */ (document.querySelector('deck-stage'))
    return {
      upgraded: !!el?.shadowRoot,
      slides: el?.length,
      charts: document.querySelectorAll('crefle-chart figure').length,
      chartErrors: document.querySelectorAll('.crefle-chart-error').length
    }
  })

  // 템플릿에서 <script src> 를 지우면 여기서 잡힌다 — 참조 덱이 그랬다.
  expect(d.upgraded, 'deck-stage 가 업그레이드되지 않았다 — <script src> 가 빠졌나?').toBe(true)
  expect(d.slides).toBe(DECK.slides)
  expect(d.charts, '덱 템플릿의 차트가 렌더되지 않았다').toBe(1)
  expect(d.chartErrors).toBe(0)
  expect(page.blocked).toEqual([])

  const pdf = await page.pdf({ printBackground: true, preferCSSPageSize: true })
  const raw = pdf.toString('latin1')
  const pages = (raw.match(/\/Type\s*\/Page[^s]/g) || []).length
  const nums = (raw.match(/\/MediaBox\s*\[[^\]]*\]/) || [''])[0].match(/[\d.]+/g) || []

  expect(pages, '슬라이드당 1페이지가 아니다').toBe(DECK.slides)
  // 문서는 A4(595×842), 덱은 1920×1080px = 1440×810pt. 둘이 한 스타일시트에 공존한다.
  expect(Math.round(Number(nums[2])), 'US Letter(612)로 떨어졌다면 @page 주입이 안 된 것').toBe(1440)
  expect(Math.round(Number(nums[3]))).toBe(810)
})

test('덱 차트가 light 슬라이드에 있다 — 팔레트는 다크에서 검증되지 않았다', async ({ isolatedPage: page }) => {
  /** @type {string[]} */
  const warns = []
  page.on('console', (m) => m.type() === 'warning' && warns.push(m.text()))
  await page.goto(pathToFileURL(join(dir, 'deck.html')).href)
  await page.waitForTimeout(600)

  expect(
    warns.filter((w) => w.includes('다크 슬라이드')),
    '템플릿이 다크 슬라이드 위에 차트를 올렸다 — 팔레트가 다크에서 검증되지 않았다'
  ).toEqual([])
})
