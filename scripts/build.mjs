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
  'chart.css', // <crefle-chart> 의 슬롯→색 매핑        (Phase 3)
  'print.css' // @page · breaks · print-color-adjust  (Phase 4)
]

// JS 산출물. 각 항목: 출력 파일명 → 이어붙일 소스 목록(순서 고정).
//
// 대부분은 **바이트 그대로 복사**다(parts 가 1개). 그게 기본이고, check:dist 재현성이
// 자명해진다 — 변환이 없으니 도구 버전에 종속되지 않는다.
//
// crefle-chart.js 만 2개를 잇는다. 이유:
//   · 수학(chart-math.mjs)은 **순수 ES 모듈**이어야 vitest 가 import 해 검증한다.
//     30개 테스트가 축퇴 도메인·n=1 분모0·순환금지를 지킨다.
//   · 하지만 산출물은 **IIFE** 여야 한다 — file:// 는 opaque origin 이라 Chromium 이
//     모듈 스크립트를 CORS 로 차단한다.
//   두 요구가 충돌하므로 빌드가 export 를 떼어 앞에 잇는다.
//   concat 은 **문자열 결합**이라 컴파일러 버전에 종속되지 않는다 — 여전히 결정적이다.
const JS_OUTPUTS = [
  { out: 'deck-stage.js', parts: ['deck-stage.js'] },
  { out: 'crefle-chart.js', parts: ['chart-math.mjs', 'crefle-chart.js'] }
]

/**
 * ES 모듈을 IIFE 에 이어붙일 수 있게 export 키워드만 뗀다.
 * `export const X` → `const X`, `export function X` → `function X`.
 * 우리가 소유한 파일에만 쓴다 — 재수출(`export { a } from './b'`)이나 default 는 다루지 않고,
 * 남아 있으면 아래에서 던진다.
 * @param {string} src
 * @returns {string}
 */
function stripExports(src) {
  const out = src.replace(/^export\s+(?=(?:const|let|var|function|class|async)\b)/gm, '')
  const leftover = out.match(/^\s*export\b.*$/m)
  if (leftover) throw new Error(`export 를 떼지 못했습니다: ${leftover[0].trim()}\n  이 자리는 단순한 형태(export const/function/class)만 다룹니다.`)
  if (/^\s*import\s/m.test(out)) throw new Error('import 가 남아 있습니다 — IIFE 로 이어붙일 수 없습니다.')
  return out
}

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
 * JS 산출물 하나를 만든다. parts 가 1개면 소스 그대로, 여러 개면 export 를 떼어 잇는다.
 * @param {string[]} parts src/ 기준 파일명, 순서 고정
 * @returns {string}
 */
function buildJs(parts) {
  if (parts.length === 1) return readFileSync(join(SRC, parts[0]), 'utf8')

  // 전체를 IIFE 로 한 번 더 감싼다. 안 감싸면 export 를 뗀 `const DEFAULT_WIDTH` 같은
  // 것들이 **스크립트 전역 렉시컬 스코프**로 새어 나가, 같은 이름을 쓰는 다른 스크립트와
  // 충돌하면 페이지 전체가 SyntaxError 로 죽는다. 문서 하나에 스크립트가 여럿 실릴 수 있다.
  const body = parts
    .map((p, i) => {
      const src = readFileSync(join(SRC, p), 'utf8')
      // 마지막 조각(컴포넌트)은 이미 IIFE 다 — 중첩돼도 무해하다. 앞 조각만 export 를 뗀다.
      return `/* ───── ${p} ───── */\n${(i === parts.length - 1 ? src : stripExports(src)).trim()}\n`
    })
    .join('\n')

  return (
    `/* CREFLE 문서 DS — 생성물. 직접 수정하지 마세요.\n` +
    `   ${parts.join(' + ')} 를 결정적으로 이어붙인 것입니다(scripts/build.mjs).\n` +
    `   수학은 src/chart-math.mjs 에 순수 함수로 있고 vitest 가 검증합니다.\n` +
    `   산출물이 IIFE 인 이유: file:// 는 opaque origin 이라 Chromium 이 모듈 스크립트를\n` +
    `   CORS 로 차단합니다. 문서는 file:// 로 열립니다. */\n` +
    `;(() => {\n${body}\n})();\n`
  )
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
  for (const { out, parts } of JS_OUTPUTS) {
    const abs = parts.map((p) => join(SRC, p))
    if (!abs.every(existsSync)) continue
    const body = buildJs(parts)
    // 최종 산출물에 top-level import/export 가 남으면 file:// 에서 통째로 차단된다.
    if (/^\s*(import|export)\s/m.test(body))
      throw new Error(`${out} 에 top-level import/export 가 남았습니다. file:// 에서 모듈 스크립트는 CORS 로 차단됩니다 — IIFE 여야 합니다.`)
    writeFileSync(join(OUT, out), body)
    js.push(parts.length > 1 ? `${out} (${parts.join(' + ')})` : out)
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
  //
  // ⚠️ HTML 주석 안에서 `--` 는 위험하다. 라이선스 전문에 `-->` 가 있으면 주석이 조기
  //    종료되고 나머지가 문서 본문으로 렌더된다. `--` 를 유니코드 대시로 바꿔 막는다
  //    (라이선스 전문의 **의미**는 보존된다 — 글자만 시각적으로 동등한 것으로 바뀐다).
  const safeComment = (/** @type {string} */ s) => s.replace(/--/g, '––')
  const notice =
    '<!--\n  이 문서에는 아래 폰트가 base64 로 임베드되어 있습니다. 각 라이선스 전문을 함께 싣습니다.\n' +
    [...licenses.keys()].map((n) => `    · ${n.replace(/^LICENSE-|\.txt$/g, '')}`).join('\n') +
    '\n' +
    [...licenses.values()]
      .map((abs) => '\n' + '='.repeat(72) + '\n' + basename(abs) + '\n' + '='.repeat(72) + '\n' + safeComment(readFileSync(abs, 'utf8')))
      .join('') +
    '\n-->'

  let html = readFileSync(inPath, 'utf8')

  // ⚠️ **순서가 중요하다: JS 를 CSS 보다 먼저 인라인한다.**
  //
  //    CSS 를 먼저 넣으면, 그 CSS 안의 **주석**에 있는 사용 예시 마크업이 문서 텍스트가
  //    된다. deck.css 헤더 주석에는 `<script src="./deck-stage.js"></script>` 가 있다.
  //    그 다음 <script src> 치환 정규식을 돌리면, 정규식이 **먼저 나오는** 그 주석 속
  //    예시에 매치해서 73KB 의 JS 소스를 <style> 한복판에 쑤셔 넣는다. 진짜 <script src>
  //    는 그대로 남고, deck-stage 는 영영 정의되지 않는다. 에러는 0개다.
  //    실제로 그렇게 깨졌다 — </style> 직전 80자가 deck-stage.js 의 docblock 이었다.
  //
  //    JS 를 먼저 넣으면 <script src> 정규식이 원본 HTML 만 본다.
  //
  // 그리고 JS 소스 어디든 `</script>` 가 있으면 — 주석 안이든 — HTML 파서가 거기서
  // 스크립트를 **종료**한다. deck-stage.js:87 docblock 의 `<script src="deck-stage.js">
  // </script>` 때문에 인라인 <script> 가 92,000자가 아니라 4,598자에서 끊겼었다.
  // `<\/script` 는 JS 파서에는 동일하고(주석/문자열 안에서 `\/` 는 `/`) HTML 파서는
  // 종료 태그로 보지 않는다.
  const escapeInlineJs = (/** @type {string} */ s) => s.replace(/<\/(script)/gi, '<\\/$1')

  for (const { out, parts } of JS_OUTPUTS) {
    if (!parts.every((p) => existsSync(join(SRC, p)))) continue
    const tag = new RegExp(`<script[^>]+src\\s*=\\s*"[^"]*${out.replace(/\./g, '\\.')}"[^>]*>\\s*</script>`, 'i')
    if (!tag.test(html)) continue
    // 번들과 **같은 buildJs** 를 쓴다 — 두 경로가 다른 코드를 심으면 한쪽만 깨진 채 오래 간다.
    const body = escapeInlineJs(buildJs(parts))
    // 함수 치환자 — 치환 문자열의 `$&`/`$'`/`` $` `` 특수 해석을 끈다.
    html = html.replace(tag, () => `<script>\n${body}\n</script>`)
  }

  const link = /<link[^>]+href\s*=\s*"[^"]*crefle-doc\.css"[^>]*>/i
  // ⚠️ <style> 안에 `</style` 가 있으면 파서가 조기 종료한다. CSS 주석의 예제 마크업이
  //    그럴 수 있다. CSS 문자열/주석 안에서는 이스케이프가 안 되므로 분해해 넣는다.
  const safeCss = css.replace(/<\/(style)/gi, '<\\/$1')
  const block = `${notice}\n<style>\n${safeCss}</style>`

  // ⚠️ String.replace 의 **치환 문자열**에서 `$&` `$'` `` $` `` `$1` 은 특수 패턴이다.
  //    여기 치환물은 2MB 의 base64 폰트 + 90,000자의 JS 소스다 — 그 안에 우연히 그런
  //    시퀀스가 있으면 조용히 잘리거나 중복된다. **함수 치환자**를 쓰면 해석이 아예
  //    일어나지 않는다. 큰 텍스트를 replace 로 심을 때의 기본기다.
  if (link.test(html)) html = html.replace(link, () => block)
  else if (/<\/head>/i.test(html)) html = html.replace(/<\/head>/i, () => `${block}\n</head>`)
  else throw new Error('crefle-doc.css 링크도 </head> 도 없습니다 — 어디에 삽입할지 모르겠습니다.')

  // 남은 외부 참조가 있으면 자기완결이 아니다 — 조용히 넘기지 않는다.
  //
  // ⚠️ <style>/<script> **안**은 보지 않는다. 인라인된 CSS·JS 의 주석에는 사용 예시
  //    마크업이 정당하게 들어 있다 — deck.css 헤더의 `<script src="./deck-stage.js">`,
  //    deck-stage.js:87 docblock 의 `<script src="deck-stage.js">`. 그걸 세면 오탐이다.
  //    실제로 첫 버전이 그 둘을 "인라인 안 됨"이라고 잘못 보고했다.
  const shell = html.replace(/<style\b[\s\S]*?<\/style>/gi, '').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
  const leftovers = [...shell.matchAll(/(?:src|href)\s*=\s*"(?!https?:|data:|#)([^"]+)"/gi)].map((m) => m[1])
  if (leftovers.length)
    throw new Error(
      `자기완결이 아닙니다 — 인라인되지 않은 외부 참조가 남았습니다: ${leftovers.join(', ')}\n` +
        `  단일 파일로 배포되면 이 참조들은 깨집니다(이메일·공유링크·업로드 렌더러).`
    )

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
