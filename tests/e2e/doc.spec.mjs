import { test, expect, fileUrl } from './fixtures.mjs'

/**
 * 문서 레이어 e2e.
 *
 * 가장 중요한 테스트는 **"클래스 없는 시맨틱 HTML 이 그냥 맞는가"** 다.
 * 그게 이 DS 의 핵심 설계 주장이고, 무너지면 조용히 무너진다 — 누군가
 * `.t-body` 같은 걸 추가하고, Claude 가 그걸 빠뜨리고, 문서가 드리프트한다.
 *
 * 실증(참조 덱 49슬라이드 대조): section(42회)·sub(9회)·title-xl(7회) 클래스가
 * 이 설계에선 전부 필요 없다 — h2/h3 와 .display 가 대신한다.
 */

const DOC = 'examples/doc-minimal.html'

test('클래스 없는 시맨틱 HTML 이 문서 스케일로 맞는다 — 핵심 주장', async ({ isolatedPage: page }) => {
  await page.goto(fileUrl(DOC))
  await page.waitForTimeout(300)

  // 클래스를 하나도 안 붙인 요소들을 새로 만들어 넣는다 — 예제가 우연히 맞은 게
  // 아니라 **기본값**이 맞는지 본다.
  const sizes = await page.evaluate(() => {
    const probe = document.createElement('div')
    probe.innerHTML = `<h1>t</h1><h2>t</h2><h3>t</h3><h4>t</h4><p>t</p><small>t</small>
      <blockquote><p>t</p></blockquote><ul><li>t</li></ul>
      <table><thead><tr><th>t</th></tr></thead><tbody><tr><td>t</td></tr></tbody></table>
      <pre><code>t</code></pre>`
    document.body.appendChild(probe)
    const px = (/** @type {string} */ sel) => parseFloat(getComputedStyle(/** @type {Element} */ (probe.querySelector(sel))).fontSize)
    const fam = (/** @type {string} */ sel) => getComputedStyle(/** @type {Element} */ (probe.querySelector(sel))).fontFamily.split(',')[0].replace(/["']/g, '')
    const out = {
      h1: px('h1'), h2: px('h2'), h3: px('h3'), h4: px('h4'), p: px('p'), small: px('small'),
      bodyFamily: fam('p'),
      thFamily: fam('thead th'),
      preFamily: fam('pre'),
      quoteBorder: getComputedStyle(/** @type {Element} */ (probe.querySelector('blockquote'))).borderLeftWidth,
      tableCollapse: getComputedStyle(/** @type {Element} */ (probe.querySelector('table'))).borderCollapse
    }
    probe.remove()
    return out
  })

  // spec mandate 앵커: 제목 20 / 본문 16 / 본문 작은 12
  expect(sizes.h3, 'h3(절)은 spec mandate 의 "제목 20" 앵커다').toBe(20)
  expect(sizes.p, 'p 는 spec mandate 의 "본문 16" 앵커다').toBe(16)
  expect(sizes.small, 'small 은 spec mandate 의 "본문 작은 12" 앵커다').toBe(12)

  // 6단계 확장이 단조 감소하는가 — 위계가 뒤집히면 문서가 읽히지 않는다
  const scale = [sizes.h1, sizes.h2, sizes.h3, sizes.h4, sizes.p, sizes.small]
  for (let i = 1; i < scale.length; i++)
    expect(scale[i], `타입 스케일이 단조 감소하지 않는다: ${scale.join(' → ')}`).toBeLessThan(scale[i - 1])

  // 폰트가 번들 서체로 붙는가 (클래스 없이)
  expect(sizes.bodyFamily).toBe('Spoqa Han Sans Neo')
  expect(sizes.thFamily, '표 머리는 mono 여야 한다').toBe('JetBrains Mono')
  expect(sizes.preFamily, '코드 블록은 mono 여야 한다').toBe('JetBrains Mono')

  // 클래스 없이 붙는 장식들
  expect(sizes.quoteBorder, 'blockquote 에 강조 바가 없다').not.toBe('0px')
  expect(sizes.tableCollapse, 'table 이 collapse 되지 않았다').toBe('collapse')
})

test('예제가 클래스에 의존하지 않는다 — 1부는 num 3개뿐', async ({ isolatedPage: page }) => {
  await page.goto(fileUrl(DOC))
  await page.waitForTimeout(200)

  const d = await page.evaluate(() => {
    const hr = document.querySelector('hr')
    /** @type {string[]} */
    const classes = []
    let n = 0
    for (let el = document.body.firstElementChild; el && el !== hr; el = el.nextElementSibling) {
      n++
      if (typeof el.className === 'string' && el.className) classes.push(el.className)
      for (const sub of Array.from(el.querySelectorAll('*'))) {
        n++
        if (typeof sub.className === 'string' && sub.className) classes.push(sub.className)
      }
    }
    return { total: n, classes }
  })

  // HTML 에 "이 칸은 숫자다"를 표현할 방법이 없다 — 그래서 num 은 정당한 역할 클래스다.
  // 그 외의 클래스가 1부에 등장하면, 시맨틱 기본값이 부족하다는 신호다.
  const notNum = d.classes.filter((c) => c !== 'num')
  expect(
    notNum,
    `1부(${d.total}개 요소)에 num 이외의 클래스가 있다: ${notNum.join(', ')}\n` +
      `  시맨틱 HTML 기본값으로 표현할 수 없는지 먼저 확인하세요 — 클래스를 요구하면\n` +
      `  Claude 가 빠뜨리고 문서가 드리프트합니다.`
  ).toEqual([])
})

test('문서 색이 파운데이션에서 온다 — 다섯 번째 갈래 없음', async ({ isolatedPage: page }) => {
  await page.goto(fileUrl(DOC))
  await page.waitForTimeout(200)

  const d = await page.evaluate(() => {
    const cs = getComputedStyle(document.documentElement)
    /** @param {string} c @returns {string} */
    const hex = (c) => {
      const m = c.match(/\d+/g)
      return m ? '#' + m.slice(0, 3).map((n) => Number(n).toString(16).padStart(2, '0')).join('').toUpperCase() : c
    }
    const q = document.querySelector('blockquote')
    return {
      primary: cs.getPropertyValue('--primary').trim(),
      surface: cs.getPropertyValue('--surface').trim(),
      quoteAccent: hex(getComputedStyle(/** @type {Element} */ (q)).borderLeftColor)
    }
  })

  // 브랜드가 네 갈래로 갈라진 적이 있다. 여기가 그 회귀 지점이다.
  expect(d.primary.toUpperCase(), '--primary 가 브랜드 레드가 아니다').toBe('#C9252C')
  expect(d.surface.toUpperCase(), '--surface 가 파운데이션 값이 아니다 (순수 흰색 금지)').toBe('#FBF8FD')
  expect(d.quoteAccent, 'blockquote 강조가 브랜드 레드가 아니다').toBe('#C9252C')
})

test('인쇄 — 제목이 페이지 끝에 홀로 남지 않고, 표 머리가 반복된다', async ({ isolatedPage: page }) => {
  await page.goto(fileUrl(DOC))
  await page.waitForTimeout(200)
  await page.emulateMedia({ media: 'print' })

  const d = await page.evaluate(() => {
    const cs = (/** @type {string} */ sel, /** @type {string} */ prop) =>
      getComputedStyle(/** @type {Element} */ (document.querySelector(sel))).getPropertyValue(prop)
    return {
      h2BreakAfter: cs('h2', 'break-after'),
      theadDisplay: cs('thead', 'display'),
      pOrphans: cs('p', 'orphans'),
      preBreak: cs('pre', 'break-inside'),
      docMaxWidth: cs('.doc', 'max-width')
    }
  })

  expect(d.h2BreakAfter, '제목이 페이지 맨 아래 홀로 남을 수 있다').toBe('avoid')
  expect(d.theadDisplay, '표가 페이지를 넘을 때 머리가 반복되지 않는다').toBe('table-header-group')
  expect(Number(d.pOrphans)).toBeGreaterThanOrEqual(2)
  expect(d.preBreak, '코드 블록이 페이지 중간에서 잘린다').toBe('avoid')
  // 인쇄 지면은 @page 가 관리한다 — 화면용 줄길이 제약이 남으면 여백이 이중이 된다.
  expect(d.docMaxWidth, '인쇄 시 화면용 max-width 가 남아 있다').toBe('none')
})
