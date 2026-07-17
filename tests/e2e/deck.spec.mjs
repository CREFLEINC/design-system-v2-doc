import { test, expect, fileUrl } from './fixtures.mjs'

/**
 * 덱 e2e — 참조 덱의 5중 실패 각각에 대한 회귀 테스트.
 *
 * 첨부된 Harness Engineering 덱(49슬라이드)이 저지른 것:
 *   #1 <deck-stage> 선언만 하고 deck-stage.js 미로드 → 자동스케일·nav·레일 상실
 *   #2 @media print / @page 0개        → PDF 가 1페이지로 깨짐
 *   #3 토큰 자체 발명 (--primary:#A81E24 등)
 *   #4 CDN 폰트                        → 무네트워크 렌더러에서 폴백
 *   #5 style="" 에 raw hex
 *
 * #3·#5 는 lint:tokens 가(정적) 막는다. 여기서는 #1·#2·#4 를 **실행해서** 막는다.
 */

const DECK = 'examples/deck-minimal.html'

test('네트워크 자산을 하나도 요청하지 않는다 (실패 #4 회귀)', async ({ isolatedPage: page }) => {
  await page.goto(fileUrl(DECK))
  await page.waitForFunction(() => document.fonts && document.fonts.status === 'loaded', null, { timeout: 10000 })

  // 이 단언이 이 repo 에서 가장 값지다 — CDN 폰트 버그가 못 돌아온다는 기계적 증명.
  // network_mode:"none" 컨테이너에서 무엇이 실패할지를 여기서 미리 실패시킨다.
  expect(page.blocked, `file:// 외 요청이 있었다 → 무네트워크 렌더러에서 깨진다:\n${page.blocked.join('\n')}`).toEqual([])
  expect(page.consoleErrors).toEqual([])
})

test('번들 폰트가 실제로 로드된다 — 폴백 0건 (실패 #4 회귀)', async ({ isolatedPage: page }) => {
  await page.goto(fileUrl(DECK))
  await page.waitForFunction(() => document.fonts && document.fonts.status === 'loaded', null, { timeout: 10000 })

  const fonts = await page.evaluate(() => {
    /** @type {Record<string, number>} */
    const byFamily = {}
    for (const f of Array.from(document.fonts)) {
      if (f.status !== 'loaded') continue
      byFamily[f.family] = (byFamily[f.family] || 0) + 1
    }
    return byFamily
  })

  // 폰트가 "등록"만 되고 로드가 안 되면 조용히 폴백된다 — status==='loaded' 로 확인.
  expect(fonts['Spoqa Han Sans Neo'], 'Spoqa 가 로드되지 않았다').toBeGreaterThan(0)
  expect(fonts['Material Symbols Rounded'], 'Material Symbols 가 로드되지 않았다').toBeGreaterThan(0)
})

test('아이콘이 글리프로 렌더된다 — literal 텍스트가 아니라 (전신의 @import 순서 버그 회귀)', async ({
  isolatedPage: page
}) => {
  await page.goto(fileUrl(DECK))
  await page.waitForFunction(() => document.fonts && document.fonts.status === 'loaded', null, { timeout: 10000 })
  // 아이콘 슬라이드로 이동 (기본은 첫 슬라이드만 보인다)
  await page.evaluate(() => {
    const el = /** @type {any} */ (document.querySelector('deck-stage'))
    el.goTo(3)
  })

  const box = await page.evaluate(() => {
    const el = document.getElementById('probe-icon')
    if (!el) return null
    const r = el.getBoundingClientRect()
    return { w: r.width, family: getComputedStyle(el).fontFamily }
  })

  expect(box, '#probe-icon 을 찾지 못했다').not.toBeNull()
  expect(box.family).toContain('Material Symbols Rounded')

  // 전신 colors_and_type.css 에서 실측된 증상: "photo_camera" 가 글자로 렌더돼 94px.
  // 글리프면 폰트 크기(--icon-md=24px) 언저리다. 넉넉히 40px 를 경계로 둔다.
  expect(
    box.w,
    `아이콘이 ${Math.round(box.w)}px 폭이다 — 40px 을 넘으면 글리프가 아니라 "photo_camera" 라는 글자가 렌더된 것이다. ` +
      `전신 colors_and_type.css:36 의 @import 순서 버그가 정확히 이 증상이었다(실측 94px).`
  ).toBeLessThan(40)
})

test('deck-stage 가 업그레이드되고 슬라이드를 스케일한다 (실패 #1 회귀)', async ({ isolatedPage: page }) => {
  await page.goto(fileUrl(DECK))
  await page.waitForFunction(() => customElements.get('deck-stage') !== undefined, null, { timeout: 10000 })

  const state = await page.evaluate(() => {
    const el = /** @type {any} */ (document.querySelector('deck-stage'))
    return {
      defined: customElements.get('deck-stage') !== undefined,
      hasShadow: !!el.shadowRoot,
      length: el.length, // 공개 API: index / length / goTo / next / prev / reset
      index: el.index,
      designWidth: el.designWidth,
      designHeight: el.designHeight,
      // 활성 슬라이드는 data-deck-active 로 표시된다 (::slotted 가 그것만 보인다)
      activeCount: document.querySelectorAll('.slide[data-deck-active]').length
    }
  })

  // 참조 덱은 <deck-stage> 를 선언만 하고 JS 를 안 불러서 이게 전부 실패했다.
  expect(state.defined, 'deck-stage 커스텀 엘리먼트가 정의되지 않았다 — <script src> 를 빠뜨렸나?').toBe(true)
  expect(state.hasShadow, 'shadow root 가 없다 — 업그레이드되지 않았다').toBe(true)
  expect(state.length, '슬라이드를 못 셌다').toBe(4)
  expect(state.index, '초기 인덱스는 0 이어야 한다').toBe(0)
  expect(state.activeCount, '활성 슬라이드는 정확히 하나여야 한다').toBe(1)
  expect(state.designWidth).toBe(1920)
  expect(state.designHeight).toBe(1080)
})

test('자동 스케일이 1920 캔버스를 뷰포트에 맞춘다 (실패 #1 회귀)', async ({ isolatedPage: page }) => {
  await page.setViewportSize({ width: 1280, height: 720 })
  await page.goto(fileUrl(DECK))
  await page.waitForFunction(() => document.fonts && document.fonts.status === 'loaded', null, { timeout: 10000 })
  await page.waitForTimeout(300)

  const fit = await page.evaluate(() => {
    const el = /** @type {any} */ (document.querySelector('deck-stage'))
    const canvas = el.shadowRoot.querySelector('.canvas')
    const r = canvas.getBoundingClientRect()
    return { w: r.width, h: r.height, vw: window.innerWidth, vh: window.innerHeight }
  })

  // 참조 덱은 스케일이 없어 1920 캔버스가 1280 뷰포트를 넘쳤다(미디어쿼리로 땜질했다).
  expect(fit.w, `캔버스 폭 ${Math.round(fit.w)}px 가 뷰포트 ${fit.vw}px 를 넘는다 — 스케일이 안 걸렸다`).toBeLessThanOrEqual(fit.vw + 1)
  expect(fit.h, `캔버스 높이 ${Math.round(fit.h)}px 가 뷰포트 ${fit.vh}px 를 넘는다`).toBeLessThanOrEqual(fit.vh + 1)
  // 레터박스이므로 16:9 비율이 유지되어야 한다.
  expect(fit.w / fit.h).toBeCloseTo(1920 / 1080, 1)
})

test('PDF 가 슬라이드당 1페이지로 떨어진다 (실패 #1·#2 회귀)', async ({ isolatedPage: page }) => {
  await page.goto(fileUrl(DECK))
  await page.waitForFunction(() => document.fonts && document.fonts.status === 'loaded', null, { timeout: 10000 })
  await page.waitForTimeout(300) // data-fonts-pending reveal 정착

  // render_pdf.py 와 같은 설정: prefer_css_page_size=True + margin 0.
  // deck-stage.js 가 <head> 에 주입한 @page{size:1920px 1080px} 를 그대로 쓴다.
  const pdf = await page.pdf({ printBackground: true, preferCSSPageSize: true, margin: { top: '0', bottom: '0', left: '0', right: '0' } })

  const raw = pdf.toString('latin1')
  const pages = (raw.match(/\/Type\s*\/Page[^s]/g) || []).length
  const slides = await page.evaluate(() => document.querySelectorAll('.slide:not([data-deck-skip])').length)

  expect(pages, `PDF 가 ${pages}페이지인데 슬라이드는 ${slides}장이다.`).toBe(slides)

  // ── 페이지 **크기**가 진짜 시험이다 ──────────────────────────────────
  // 페이지 수만 세면 부족하다. 실측(2026-07-17):
  //     deck-stage.js 로드  → 4페이지 · MediaBox [0 0 1440 810]  = 1920×1080px ✅
  //     deck-stage.js 미로드 → 4페이지 · MediaBox [0 0 612 792]   = US Letter ❌ 슬라이드 잘림
  // 즉 수는 같고 크기가 다르다. @page{size:1920px 1080px} 를 <head> 에 주입하는 것이
  // deck-stage.js 이고, render_pdf.py 의 prefer_css_page_size=True 가 그걸 집어간다.
  // 없으면 조용히 Letter 로 떨어져 1920px 슬라이드가 잘린 PDF 가 나간다.
  const boxes = [...new Set(raw.match(/\/MediaBox\s*\[[^\]]*\]/g) || [])]
  const nums = (boxes[0] || '').match(/[\d.]+/g) || []
  const [w, h] = [Number(nums[2]), Number(nums[3])]

  // 1920×1080 px @96dpi = 1440×810 pt
  expect(
    Math.round(w),
    `PDF 페이지 폭이 ${w}pt 다. 1440pt(=1920px) 여야 한다. 612pt 라면 US Letter 로 떨어진 것 — ` +
      `deck-stage.js 가 @page 를 주입하지 못했다는 뜻이고, 슬라이드가 잘린 PDF 가 발행된다.`
  ).toBe(1440)
  expect(Math.round(h), `PDF 페이지 높이가 ${h}pt 다. 810pt(=1080px) 여야 한다.`).toBe(810)
  expect(boxes.length, `페이지 크기가 섞여 있다: ${boxes.join(' ')}`).toBe(1)
})
