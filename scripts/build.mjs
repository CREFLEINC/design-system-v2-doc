#!/usr/bin/env node
// dist/crefle-doc/ 를 만든다 — 문서 옆에 복사되는 벤더링 단위.
//
// 설계 제약 넷. 전부 실측된 사고에서 나왔다:
//
//  1) CSS 는 **평평한 한 파일**. @import 를 쓰지 않는다.
//     전신 colors_and_type.css:36 은 @import 를 @font-face 뒤에 두어 CSS 스펙을 어겼고,
//     파서가 조용히 버려서 Material Symbols 가 한 번도 로드되지 않았다. 평평하게 만들면
//     그 버그가 구조적으로 불가능하다. (file:// 에서 @import 는 요청 워터폴이기도 하다.)
//
//  2) **바이트 결정적**이어야 한다. `check:dist` 가 재빌드 후 git diff --exit-code 로
//     "dist/ 는 이 소스에서 나온 결정론적 산출물"임을 증명한다. 타임스탬프·난수·
//     Object 순회 순서에 의존하면 그 게이트가 거짓이 된다. → 정렬된 고정 목록만 쓴다.
//
//  3) JS 는 **변환하지 않고 바이트 그대로 복사**한다. 소스가 이미 IIFE 다.
//     Chromium 은 모듈 스크립트를 CORS 로 가져오고 file:// 는 opaque origin 이라
//     <script type="module"> 이 차단된다. 번들러를 끼우면 dist ≠ src 가 되어
//     check:dist 재현성이 도구 버전에 종속된다.
//
//  4) 폰트는 **로컬만**. 업로드 PDF 렌더러가 network_mode:"none" 이다.
//
// 사용:
//   node scripts/build.mjs              dist/crefle-doc/ 생성 (벤더링 번들)
//   node scripts/build.mjs --inline <in.html> [out.html]
//                                       폰트까지 base64 인라인한 자기완결 문서 생성
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync, readdirSync, copyFileSync } from 'node:fs'
import { join, dirname, basename, resolve, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const STYLES = join(ROOT, 'styles')
const SRC = join(ROOT, 'src')
const OUT = join(ROOT, 'dist', 'crefle-doc')

// CSS 연결 순서 — **고정**. 캐스케이드가 이 순서에 의존한다.
// 토큰이 먼저, 그 다음 폰트(@font-face), 그 다음 그것들을 쓰는 레이어.
const CSS_ORDER = [
  'foundation/tokens.css', // 잠긴 미러 — 색 단일 진실원
  'doc-tokens.css', // 도메인 토큰 (타입·공간·형태·차트)
  'fonts.css', // @font-face → 로컬 woff2
  'doc.css', // 문서 스케일 + 시맨틱 HTML 기본값       (Phase 3)
  'deck.css', // 슬라이드 스케일 + 슬라이드 컴포넌트   (Phase 2)
  'print.css' // @page · breaks · print-color-adjust  (Phase 4)
]

// JS — 바이트 그대로 복사. 있으면 복사, 없으면 조용히 건너뛴다(페이즈별로 늘어난다).
const JS_FILES = ['deck-stage.js', 'crefle-chart.js']

const FONT_DIRS = [
  { from: join(STYLES, 'foundation', 'fonts'), why: '파운데이션 잠긴 미러' },
  { from: join(STYLES, 'fonts'), why: '도메인 번들 (JetBrains Mono)' }
]

const inlineIdx = process.argv.indexOf('--inline')
const isInline = inlineIdx !== -1

// ── 공통: CSS 를 평평하게 합친다 ────────────────────────────────────────────
/**
 * CSS_ORDER 를 고정 순서로 이어 붙여 평평한 한 파일을 만든다.
 * @param {{ fontUrl: (file: string) => string }} opts
 *   fontUrl — 폰트 파일명을 산출물 기준 url() 문자열로 바꾼다.
 *             번들 모드는 `url('./fonts/X')`, 인라인 모드는 data: URI 를 돌려준다.
 * @returns {string} 평평한 CSS — at-import 규칙을 포함하지 않는다.
 *   (JSDoc 안에 골뱅이+import 를 쓰면 tsc 가 JSDoc 태그로 파싱해 TS1005 를 낸다.)
 */
function buildCss({ fontUrl }) {
  const parts = []
  parts.push(
    '/* CREFLE 문서 디자인 시스템 — 생성물. 직접 수정하지 마세요.\n' +
      '   출처: CREFLEINC/design-system-v2-doc  ·  scripts/build.mjs 가 생성합니다.\n' +
      '   이 파일은 평평합니다 — @import 가 없습니다. 그건 의도입니다(전신의 @import 순서\n' +
      '   버그로 아이콘이 죽은 적이 있습니다). 여기에 @import 를 추가하지 마세요. */'
  )
  for (const rel of CSS_ORDER) {
    const abs = join(STYLES, rel)
    if (!existsSync(abs)) continue // 아직 없는 페이즈의 파일
    let css = readFileSync(abs, 'utf8')

    // 안전망: 소스에 @import 가 있으면 빌드를 멈춘다. 조용히 흘려보내지 않는다.
    if (/^\s*@import\b/m.test(css)) throw new Error(`${rel} 에 @import 가 있습니다. 평평한 산출물에는 들어갈 수 없습니다.`)

    // 폰트 URL 을 산출물 기준으로 고쳐 쓴다.
    //   번들: ./foundation/fonts/X.woff2 · ./fonts/X.woff2  →  ./fonts/X.woff2
    //   인라인: → data: URI
    css = css.replace(/url\(\s*['"]?\.\/(?:foundation\/)?fonts\/([^'")]+)['"]?\s*\)/g, (/** @type {string} */ _m, /** @type {string} */ file) => fontUrl(file))

    parts.push(`/* ───── ${rel} ───── */\n${css.trim()}`)
  }
  return parts.join('\n\n') + '\n'
}

/**
 * 번들 대상 woff2 를 모은다 (파운데이션 미러 + 도메인 번들).
 * @returns {Map<string, string>} 파일명 → 절대경로
 */
function collectFonts() {
  /** @type {Map<string, string>} */
  const map = new Map()
  for (const { from } of FONT_DIRS) {
    if (!existsSync(from)) continue
    for (const f of readdirSync(from).sort()) {
      if (!/\.woff2$/i.test(f)) continue
      if (map.has(f)) throw new Error(`폰트 파일명 충돌: ${f} 가 두 소스 디렉토리에 있습니다.`)
      map.set(f, join(from, f))
    }
  }
  return map
}

/**
 * 폰트 라이선스 전문을 모은다. 번들·인라인 양쪽에서 반드시 동봉된다.
 * @returns {Map<string, string>} 파일명 → 절대경로
 */
function collectLicenses() {
  /** @type {Map<string, string>} */
  const map = new Map()
  for (const { from } of FONT_DIRS) {
    if (!existsSync(from)) continue
    for (const f of readdirSync(from).sort()) if (/^LICENSE-.*\.txt$/i.test(f)) map.set(f, join(from, f))
  }
  return map
}

// ── 모드 1: 벤더링 번들 ─────────────────────────────────────────────────────
/** dist/crefle-doc/ 를 만든다 — 문서 폴더 옆에 복사되는 단위. @returns {void} */
function buildBundle() {
  const fonts = collectFonts()
  const licenses = collectLicenses()

  rmSync(OUT, { recursive: true, force: true })
  mkdirSync(join(OUT, 'fonts'), { recursive: true })

  const css = buildCss({ fontUrl: (f) => `url('./fonts/${f}')` })
  writeFileSync(join(OUT, 'crefle-doc.css'), css)

  for (const [name, abs] of fonts) copyFileSync(abs, join(OUT, 'fonts', name))
  // 라이선스 전문은 폰트와 **같은 디렉토리**에 — check-licenses.mjs 가 dist/ 도 검사한다.
  for (const [name, abs] of licenses) copyFileSync(abs, join(OUT, 'fonts', name))

  const js = []
  for (const f of JS_FILES) {
    const abs = join(SRC, f)
    if (!existsSync(abs)) continue
    const body = readFileSync(abs)
    if (/^\s*(import|export)\s/m.test(body.toString('utf8')))
      throw new Error(`${f} 에 top-level import/export 가 있습니다. file:// 에서 모듈 스크립트는 CORS 로 차단됩니다 — IIFE 여야 합니다.`)
    copyFileSync(abs, join(OUT, f))
    js.push(f)
  }

  const sizes = [...fonts.keys()].length
  console.log(`✓ dist/crefle-doc/ 생성`)
  console.log(`    crefle-doc.css   ${(css.length / 1024).toFixed(1)}KB  (${CSS_ORDER.filter((r) => existsSync(join(STYLES, r))).length}개 레이어 평평하게 연결)`)
  console.log(`    fonts/           woff2 ${sizes}종 + 라이선스 ${licenses.size}종`)
  console.log(`    js               ${js.length ? js.join(', ') : '(아직 없음 — Phase 2·3)'}`)
}

// ── 모드 2: 자기완결 인라인 ─────────────────────────────────────────────────
// 단독·외부공유·이메일·업로드 경로용. network_mode:"none" 컨테이너에서도 동일 렌더.
/**
 * 문서 하나를 자기완결 HTML 로 만든다 — 폰트를 base64 로 임베드.
 * @param {string} inPath  입력 HTML (crefle-doc.css 를 링크하고 있어야 한다)
 * @param {string} outPath 출력 HTML
 * @returns {void}
 */
function buildInline(inPath, outPath) {
  if (!existsSync(inPath)) throw new Error(`입력 파일이 없습니다: ${inPath}`)
  const fonts = collectFonts()
  const licenses = collectLicenses()

  /** @param {string} f @returns {string} */
  const dataUri = (f) => {
    const abs = fonts.get(f)
    if (!abs) throw new Error(`폰트를 찾을 수 없습니다: ${f}`)
    return `url('data:font/woff2;base64,${readFileSync(abs).toString('base64')}')`
  }
  const css = buildCss({ fontUrl: dataUri })

  // base64 로 폰트를 심는 것도 재배포다 → 라이선스 전문을 HTML 주석으로 동봉한다.
  // (LICENSE 파일이 따라올 수 없는 단일 파일이므로 이것이 유일한 준수 경로다.)
  const notice =
    '<!--\n  이 문서에는 아래 폰트가 base64 로 임베드되어 있습니다. 각 라이선스 전문을 함께 싣습니다.\n' +
    [...licenses.keys()].map((n) => `    · ${n.replace(/^LICENSE-|\.txt$/g, '')}`).join('\n') +
    '\n' +
    [...licenses.values()].map((abs) => '\n' + '='.repeat(72) + '\n' + basename(abs) + '\n' + '='.repeat(72) + '\n' + readFileSync(abs, 'utf8')).join('') +
    '\n-->'

  let html = readFileSync(inPath, 'utf8')
  const link = /<link[^>]+href\s*=\s*"[^"]*crefle-doc\.css"[^>]*>/i
  const block = `${notice}\n<style>\n${css}</style>`
  if (link.test(html)) html = html.replace(link, block)
  else if (/<\/head>/i.test(html)) html = html.replace(/<\/head>/i, `${block}\n</head>`)
  else throw new Error('crefle-doc.css 링크도 </head> 도 없습니다 — 어디에 삽입할지 모르겠습니다.')

  // JS 도 인라인한다 (file:// 에서 상대경로 <script src> 는 되지만, 단일 파일이 목적이므로).
  for (const f of JS_FILES) {
    const abs = join(SRC, f)
    if (!existsSync(abs)) continue
    const tag = new RegExp(`<script[^>]+src\\s*=\\s*"[^"]*${f.replace('.', '\\.')}"[^>]*>\\s*</script>`, 'i')
    if (tag.test(html)) html = html.replace(tag, `<script>\n${readFileSync(abs, 'utf8')}\n</script>`)
  }

  writeFileSync(outPath, html)
  console.log(`✓ 자기완결 문서 생성: ${relative(ROOT, outPath)}  (${(html.length / 1024 / 1024).toFixed(2)}MB, 폰트 ${fonts.size}종 임베드 + 라이선스 ${licenses.size}종 동봉)`)
}

try {
  if (isInline) {
    const inPath = resolve(process.argv[inlineIdx + 1] || '')
    const outPath = resolve(process.argv[inlineIdx + 2] || inPath.replace(/\.html$/i, '.inline.html'))
    buildInline(inPath, outPath)
  } else {
    buildBundle()
  }
} catch (e) {
  console.error('✗ 빌드 실패: ' + (e instanceof Error ? e.message : String(e)))
  process.exitCode = 1
}
