#!/usr/bin/env node
// 토큰 규율 게이트. web-ui 의 scripts/check-tokens.mjs 를 문서 DS 에 맞게 확장했다.
//
// 여섯 규칙:
//   A. 파운데이션 토큰 재정의 금지  ← 이 repo 의 존재 이유. 가장 중요하다.
//   B. raw 색상 금지 (CSS + HTML 의 style= 속성까지)
//   C. 임의 px 금지 (0/1/2 제외)
//   D. 정의되지 않은 var(--token) 참조 금지
//   E. Spoqa 에 없는 굵기(600/800) 금지 — 브라우저가 합성해 인쇄에서 뭉갠다
//   F. JS(웹컴포넌트 shadow CSS)의 **유채색** 금지 — 중립 크롬은 허용
//
// 규칙 F 가 왜 있나 — 이것도 실측된 사고다:
//   deck-stage.js 를 이관할 때 shadow CSS 에서 #D97757 · #c96442 · rgba(166,50,68) 이
//   발견됐다. Anthropic/Claude 의 코럴 계열이다 — CREFLE 브랜드가 아니다. 게다가
//   의미 있는 자리에 있었다: #D97757 은 "현재 슬라이드" 선택 강조(=브랜드 강조색이어야 함),
//   #c96442 는 삭제 버튼(=파운데이션 --semantic-error 여야 함).
//   파운데이션의 "개념 동등 = 색 동등" 규칙 위반이었고, 린터가 .js 를 안 봐서 숨어 있었다.
//
//   그런데 크롬(레터박스 검정, 레일 회색, 알파 흰색)까지 토큰을 강요하면 규칙을 위한
//   규칙이 된다 — 레터박스는 비디오 관례상 검정이 맞고 브랜드 표면이 아니다.
//   그래서 경계를 색상성(chroma)에 둔다: **중립은 크롬, 유채색은 브랜드.**
//   유채색이 JS 에 하드코딩돼 있으면 그건 브랜드 결정이 코드에 숨은 것이다.
//
// 규칙 A 가 왜 있나:
//   CREFLE 문서의 브랜드 강조색은 한때 네 갈래였다 — 파운데이션 #C9252C,
//   crefle_designer 스킬 #4758A9, 그 바이트 동일 손복사본, 그리고 토큰조차 없이
//   CDN Pretendard 를 쓴 실제 발행 문서들. 원인은 "복사본이 원본과 이어져 있지 않음".
//   이 게이트는 다섯 번째 갈래가 생기는 것을 막는다.
//
// 규칙 B 가 HTML 까지 보는 이유:
//   첨부 참조 덱은 style="color:#F3B0B5" 같은 raw hex 를 문서 전체에 뿌렸다.
//   CSS 만 검사하면 그 실패를 그대로 놓친다.
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { join, relative, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const MIRROR = join(ROOT, 'styles', 'foundation')
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'test-results', 'playwright-report'])

const COLOR_RE = /#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(|\boklch\(/
const PX_RE = /\b(\d+(?:\.\d+)?)px\b/g
const PX_ALLOW = new Set(['0', '1', '2'])
const DEFINE_RE = /(--[a-zA-Z0-9-]+)\s*:/g
const REF_RE = /var\(\s*(--[a-zA-Z0-9-]+)/g

// 파운데이션 토큰을 이 repo 에서 재정의해도 되는 예외. 근거 없이 늘리지 말 것.
const REDEFINE_ALLOW = new Map([
  [
    '--on-surface-muted',
    '파운데이션 값 #77767F 는 네 표면 전부에서 WCAG AA 미달(4.26/4.04/3.86/3.65:1). ' +
      'doc-tokens.css 가 #65646D 로 덮는다(최악 4.75:1). 업스트림 승격 시 제거.'
  ]
])

// 토큰 레이어는 raw hex/px 를 정의하는 것이 본업이다 — 규칙 B·C 면제. 규칙 A·D 는 적용.
const TOKEN_LAYER = new Set(['styles/doc-tokens.css'])

// 런타임에 JS 가 setProperty 로 주입하는 커스텀 프로퍼티. CSS 에 정의가 없는 것이 정상이므로
// 규칙D(정의되지 않은 토큰) 대상에서 뺀다. 디자인 토큰이 아니라 컴포넌트의 내부 API 다.
// 반드시 CSS 쪽에서 폴백을 주고 써야 한다: var(--deck-design-w, var(--slide-canvas-w))
const RUNTIME_TOKENS = new Map([
  ['--deck-design-w', 'deck-stage.js:790 — width 속성에서 계산해 .canvas 에 주입 (기본 1920)'],
  ['--deck-design-h', 'deck-stage.js:791 — height 속성에서 계산해 .canvas 에 주입 (기본 1080)'],
  ['--deck-aspect', 'deck-stage.js:793 — 썸네일 레일 비율'],
  ['--deck-rail-w', 'deck-stage.js — 레일 폭 (localStorage 에서 복원)']
])

/** @type {string[]} */
const errors = []
/** 줄 번호를 보존한 채 CSS 주석 제거. @param {string} t @returns {string} */
const stripComments = (t) => t.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ''))
// HTML 주석도 지운다 — 라이선스 블록(build --inline)이나 설명이 오탐을 내지 않게.
/** @param {string} t @returns {string} */
const stripHtmlComments = (t) => t.replace(/<!--[\s\S]*?-->/g, (m) => m.replace(/[^\n]/g, ''))

/**
 * 검사 대상(.css/.html)을 재귀 수집한다.
 * @param {string} dir
 * @param {string[]} out
 * @returns {string[]}
 */
function walk(dir, out = []) {
  if (!existsSync(dir)) return out
  for (const name of readdirSync(dir).sort()) {
    if (SKIP_DIRS.has(name)) continue
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (/\.(css|html)$/i.test(p)) out.push(p)
  }
  return out
}

// ── 파운데이션이 소유한 토큰 이름을 미러에서 읽는다 ────────────────────────
/** @type {Map<string, string>} 파운데이션이 소유한 토큰 이름 → 값 */
const mirrorTokens = new Map()
const mirrorCss = join(MIRROR, 'tokens.css')
if (!existsSync(mirrorCss)) {
  console.error('✗ styles/foundation/tokens.css 가 없습니다. npm run sync-foundation 을 먼저 실행하세요.')
  process.exitCode = 1
} else {
  // ⚠️ 줄 단위로 쪼개 파싱하지 말 것. 파운데이션의 --brand-gradient-dark 는
  //    linear-gradient(...) 가 네 줄에 걸쳐 있어(tokens.css:31-34) 줄 단위 정규식이
  //    놓친다. 그러면 (a) 규칙A 가 그 토큰의 재정의를 못 막고 (b) 규칙D 가 정당한
  //    사용을 "정의되지 않음"으로 오탐한다. 실제로 이 버그가 있었다 — 30/31 종만 읽었다.
  //    전체 텍스트에 대해 매칭한다([^;] 는 개행을 포함하므로 여러 줄 값도 잡는다).
  const text = stripComments(readFileSync(mirrorCss, 'utf8'))
  for (const m of text.matchAll(/(--[a-zA-Z0-9-]+)\s*:\s*([^;]+);/g)) mirrorTokens.set(m[1], m[2].trim().replace(/\s+/g, ' '))
}

/** @type {Set<string>} */
const definitions = new Set(mirrorTokens.keys())
/** @type {{name: string, at: string}[]} */
const references = []

// ── 파일별 검사 ────────────────────────────────────────────────────────────
const files = walk(ROOT).filter((p) => !p.startsWith(MIRROR))

for (const abs of files) {
  const rel = relative(ROOT, abs).split('\\').join('/')
  const isHtml = /\.html$/i.test(abs)
  const raw = readFileSync(abs, 'utf8')
  const text = stripHtmlComments(stripComments(raw))
  const isTokenLayer = TOKEN_LAYER.has(rel)

  // style="" 속성 안의 색상은 아래 전용 검사가 더 구체적인 메시지로 보고한다.
  // 같은 위반을 두 번 찍으면 도구를 안 믿게 되므로, 여기서 해당 줄을 미리 표시해 둔다.
  /** @type {Set<number>} */
  const attrColorLines = new Set()
  if (isHtml) {
    const pre = /style\s*=\s*"([^"]*)"/gi
    let a
    while ((a = pre.exec(text)) !== null)
      if (COLOR_RE.test(a[1])) attrColorLines.add(text.slice(0, a.index).split('\n').length)
  }

  text.split('\n').forEach((line, i) => {
    const at = `${rel}:${i + 1}`

    // 정의 · 참조 수집
    for (const m of line.matchAll(DEFINE_RE)) {
      const name = m[1]
      definitions.add(name)

      // ── 규칙 A: 파운데이션 토큰 재정의 금지 ──
      if (mirrorTokens.has(name) && !REDEFINE_ALLOW.has(name))
        errors.push(
          `${at} 규칙A — 파운데이션 토큰 ${name} 을(를) 재정의했습니다.\n` +
            `      파운데이션 값: ${mirrorTokens.get(name)}\n` +
            `      이 토큰은 styles/foundation/tokens.css(잠긴 미러)가 소유합니다. 여기서 정의하면\n` +
            `      브랜드가 갈라집니다 — CREFLE 은 이미 --primary 가 네 갈래로 갈라진 적이 있습니다.\n` +
            `      바꿔야 한다면 파운데이션 repo 에서 고치고 npm run sync-foundation 하세요.`
        )
    }
    for (const m of line.matchAll(REF_RE)) references.push({ name: m[1], at })

    if (line.trimStart().startsWith('@media')) return

    // ── 규칙 B: raw 색상 ── (style="" 안의 것은 아래 전용 검사가 보고한다)
    if (!isTokenLayer && COLOR_RE.test(line) && !attrColorLines.has(i + 1))
      errors.push(`${at} 규칙B — raw 색상 금지 → var(--token) 사용: ${line.trim().slice(0, 90)}`)

    // ── 규칙 C: 임의 px ── (HTML 은 제외 — 인라인 SVG 기하 등 정당한 px 가 많다)
    if (!isTokenLayer && !isHtml)
      for (const m of line.matchAll(PX_RE))
        if (!PX_ALLOW.has(m[1]))
          errors.push(`${at} 규칙C — 임의 px(${m[0]}) 금지 → spacing/type/radius 토큰: ${line.trim().slice(0, 70)}`)

    // ── 규칙 E: Spoqa 에 없는 굵기 ──
    const w = /font-weight\s*:\s*(\d{3})/.exec(line)
    if (w && ['600', '800', '900', '200'].includes(w[1]))
      errors.push(
        `${at} 규칙E — font-weight:${w[1]} 은 Spoqa 에 없습니다(100/300/400/500/700 만 제공). ` +
          `브라우저가 합성(faux bold)해 인쇄에서 뭉갭니다.`
      )
  })

  // ── 규칙 B (HTML): style="" 속성 안의 raw 색상 ──
  // 참조 덱의 실패 #5 — style="color:#F3B0B5" 가 문서 전체에 뿌려져 있었다.
  if (isHtml) {
    const attrRe = /style\s*=\s*"([^"]*)"/gi
    let m
    while ((m = attrRe.exec(text)) !== null) {
      if (!COLOR_RE.test(m[1])) continue
      const line = text.slice(0, m.index).split('\n').length
      errors.push(
        `${rel}:${line} 규칙B — style 속성에 raw 색상: ${m[1].trim().slice(0, 70)}\n` +
          `      인라인 style 의 하드코딩 hex 가 참조 덱을 브랜드에서 이탈시킨 경로입니다. 클래스+토큰을 쓰세요.`
      )
    }
  }
}

// ── 규칙 D: 정의되지 않은 토큰 참조 ────────────────────────────────────────
for (const r of references) {
  if (definitions.has(r.name) || RUNTIME_TOKENS.has(r.name)) continue
  errors.push(`${r.at} 규칙D — 정의되지 않은 토큰 참조: ${r.name}`)
}

// ── 규칙 F: JS 의 유채색 ───────────────────────────────────────────────────
// 중립(회색조)은 크롬으로 허용, 유채색은 브랜드 결정이므로 토큰이어야 한다.
/** 색 문자열 → [r,g,b] 또는 null. @param {string} t @returns {number[] | null} */
function rgbOf(t) {
  const hex = /^#([0-9a-fA-F]{3,8})$/.exec(t)
  if (hex) {
    let h = hex[1]
    if (h.length === 3 || h.length === 4) h = h.slice(0, 3).split('').map((c) => c + c).join('')
    if (h.length < 6) return null
    return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16))
  }
  const fn = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/.exec(t)
  return fn ? [Number(fn[1]), Number(fn[2]), Number(fn[3])] : null
}
/** 회색조인가 (크롬으로 허용). @param {number[]} c @returns {boolean} */
const isNeutral = (c) => Math.max(...c) - Math.min(...c) <= 6

/** @type {string[]} */
const jsFiles = []
{
  /** @param {string} dir */
  const walkJs = (dir) => {
    if (!existsSync(dir)) return
    for (const name of readdirSync(dir).sort()) {
      if (SKIP_DIRS.has(name)) continue
      const p = join(dir, name)
      if (statSync(p).isDirectory()) walkJs(p)
      else if (/\.js$/i.test(p)) jsFiles.push(p)
    }
  }
  walkJs(join(ROOT, 'src'))
}

for (const abs of jsFiles) {
  const rel = relative(ROOT, abs).split('\\').join('/')
  // JS 는 블록주석 + 라인주석 둘 다 지운다 (줄 번호 보존).
  const text = stripComments(readFileSync(abs, 'utf8')).replace(/^([^\n'"`]*?)\/\/.*$/gm, '$1')
  text.split('\n').forEach((line, i) => {
    for (const m of line.matchAll(/#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)/g)) {
      const c = rgbOf(m[0])
      if (!c || isNeutral(c)) continue
      errors.push(
        `${rel}:${i + 1} 규칙F — JS 에 유채색 하드코딩: ${m[0]}\n` +
          `      중립(회색조)은 크롬으로 허용되지만 유채색은 브랜드 결정입니다 — 토큰을 쓰세요.\n` +
          `      var(--token) 은 shadow DOM 경계를 넘어 상속됩니다.\n` +
          `      (deck-stage.js 에 Anthropic 코럴 #D97757 이 "현재 슬라이드" 강조로 숨어 있었습니다.)`
      )
    }
  })
}

if (errors.length) {
  console.error('✗ 토큰 검사 실패\n')
  for (const e of errors) console.error('  - ' + e)
  process.exitCode = 1
} else {
  console.log(
    `✓ 토큰 규율 OK — CSS·HTML ${files.length}개 + JS ${jsFiles.length}개, 파운데이션 토큰 ${mirrorTokens.size}종 무결, ` +
      `참조 ${references.length}건 전부 정의됨` +
      (REDEFINE_ALLOW.size ? ` (문서화된 오버라이드 ${REDEFINE_ALLOW.size}종 제외)` : '')
  )
}
