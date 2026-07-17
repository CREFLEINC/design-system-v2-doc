import { test, expect, ROOT } from './fixtures.mjs'
import { execFileSync } from 'node:child_process'
import { readFileSync, mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { pathToFileURL } from 'node:url'

/**
 * `build --inline` 자기완결 모드 회귀 테스트.
 *
 * 이 모드로 만든 문서는 이메일·공유링크·업로드 렌더러(network_mode:"none")로 나간다.
 * 조용히 깨지면 아무도 모른다 — 실제로 세 번 조용히 깨졌고, 전부 콘솔 에러 0개였다:
 *
 *   1) `</script>` 조기 종료 — deck-stage.js:87 docblock 의 사용 예시
 *      `<script src="deck-stage.js"></script>` 때문에 인라인 <script> 가 92,000자가
 *      아니라 4,598자에서 끊겼다. 커스텀 엘리먼트가 정의되지 않았다.
 *   2) **순서** — CSS 를 먼저 인라인하면 그 CSS **주석**의 예시 마크업이 문서 텍스트가
 *      되고, 뒤이은 <script src> 정규식이 거기에 먼저 매치해 73KB 의 JS 를 <style>
 *      한복판에 쑤셔 넣었다. 진짜 <script src> 는 남았다.
 *   3) `$` 해석 — String.replace 의 치환 문자열에서 `$&`/`` $` `` 는 특수 패턴이다.
 *      2MB base64 + 90KB JS 를 심으면서 함수 치환자를 안 쓰면 조용히 잘릴 수 있다.
 *
 * 부수 효과: --inline 은 file:// 의 썸네일 레일도 고친다. <link> 로 불러온 CSS 는
 * file:// 에서 opaque origin 이라 cssRules 접근이 SecurityError 를 던지고,
 * deck-stage 의 _snapshotAuthorCss 가 그걸 catch 로 삼켜 author CSS 스냅샷이 비어
 * 썸네일이 백지가 된다. <style> 로 심으면 same-origin 이라 읽힌다.
 */

let dir = ''
let inlineHtml = ''

test.beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'crefle-inline-'))
  inlineHtml = join(dir, 'deck.inline.html')
  execFileSync(process.execPath, [join(ROOT, 'scripts', 'build.mjs'), '--inline', join(ROOT, 'examples', 'deck-minimal.html'), inlineHtml], {
    stdio: ['ignore', 'ignore', 'inherit']
  })
})
test.afterAll(() => {
  if (dir) rmSync(dir, { recursive: true, force: true })
})

test('인라인 <script> 가 온전하다 — </script> 조기 종료 없음', () => {
  const html = readFileSync(inlineHtml, 'utf8')
  const src = readFileSync(join(ROOT, 'src', 'deck-stage.js'), 'utf8')

  const i = html.indexOf('<script>')
  const j = html.indexOf('</script>', i)
  const inlined = j - i - '<script>'.length

  // 이스케이프(`</script` → `<\/script`) 때문에 소스보다 몇 자 길다. 짧으면 잘린 것.
  expect(
    inlined,
    `인라인된 <script> 가 ${inlined}자인데 deck-stage.js 는 ${src.length}자다. ` +
      `짧다면 소스 안의 </script> 문자열에서 HTML 파서가 조기 종료한 것이다(실측 4,598자).`
  ).toBeGreaterThanOrEqual(src.length)
})

test('외부 참조가 남지 않는다 — 진짜 자기완결', () => {
  const html = readFileSync(inlineHtml, 'utf8')
  // <style>/<script> 안의 주석 예시 마크업은 제외 — 문서의 실제 참조만 본다.
  const shell = html.replace(/<style\b[\s\S]*?<\/style>/gi, '').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
  const refs = [...shell.matchAll(/(?:src|href)\s*=\s*"(?!https?:|data:|#)([^"]+)"/gi)].map((m) => m[1])
  expect(refs, `단일 파일로 배포되면 깨질 상대경로 참조: ${refs.join(', ')}`).toEqual([])
})

test('폰트 라이선스 전문이 동봉된다 — base64 임베드도 재배포다', () => {
  const html = readFileSync(inlineHtml, 'utf8')
  expect(html).toContain('SIL OPEN FONT LICENSE')
  expect(html).toContain('Apache License')
  // 주석이 조기 종료되면 라이선스 전문이 본문으로 렌더된다.
  const c0 = html.indexOf('<!--\n  이 문서에는')
  const c1 = html.indexOf('-->', c0)
  expect(c0, '라이선스 고지 주석을 찾지 못했다').toBeGreaterThan(-1)
  expect(html.slice(c0, c1)).toContain('SIL OPEN FONT LICENSE')
})

test('자기완결 문서가 무네트워크에서 완전히 작동한다', async ({ isolatedPage: page }) => {
  await page.goto(pathToFileURL(inlineHtml).href)
  await page.waitForFunction(() => document.fonts && document.fonts.status === 'loaded', null, { timeout: 10000 })
  await page.waitForTimeout(500)

  const d = await page.evaluate(() => {
    const el = /** @type {any} */ (document.querySelector('deck-stage'))
    const host = el.shadowRoot.querySelector('.thumb .frame')?.firstElementChild
    return {
      upgraded: !!el.shadowRoot,
      length: el.length,
      fonts: Array.from(document.fonts).filter((f) => f.status === 'loaded').length,
      // <link> 는 file:// 에서 opaque origin 이라 cssRules 가 SecurityError 를 던진다.
      // <style> 로 심으면 읽힌다 — 그게 썸네일 레일이 살아나는 조건이다.
      sheetsReadable: Array.from(document.styleSheets).every((s) => {
        try {
          return s.cssRules.length >= 0
        } catch {
          return false
        }
      }),
      thumbHasShadow: !!(host && host.shadowRoot)
    }
  })

  expect(page.blocked, `외부 요청이 있었다: ${page.blocked.join(', ')}`).toEqual([])
  expect(d.upgraded, 'deck-stage 가 업그레이드되지 않았다 — 인라인 <script> 가 잘렸을 수 있다').toBe(true)
  expect(d.length).toBe(4)
  expect(d.fonts, '번들 폰트가 로드되지 않았다').toBeGreaterThan(0)
  expect(d.sheetsReadable, '스타일시트가 opaque 다 — <style> 인라인이 안 됐다').toBe(true)
  expect(d.thumbHasShadow, '썸네일 클론이 만들어지지 않았다 — author CSS 스냅샷이 비었을 수 있다').toBe(true)
})

test('자기완결 문서의 PDF 도 1440×810pt', async ({ isolatedPage: page }) => {
  await page.goto(pathToFileURL(inlineHtml).href)
  await page.waitForFunction(() => document.fonts && document.fonts.status === 'loaded', null, { timeout: 10000 })
  await page.waitForTimeout(300)

  const pdf = await page.pdf({ printBackground: true, preferCSSPageSize: true, margin: { top: '0', bottom: '0', left: '0', right: '0' } })
  const raw = pdf.toString('latin1')
  const pages = (raw.match(/\/Type\s*\/Page[^s]/g) || []).length
  const nums = (raw.match(/\/MediaBox\s*\[[^\]]*\]/) || [''])[0].match(/[\d.]+/g) || []

  expect(pages).toBe(4)
  expect(Math.round(Number(nums[2]))).toBe(1440)
  expect(Math.round(Number(nums[3]))).toBe(810)
})
