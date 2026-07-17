#!/usr/bin/env node
// 토큰 규율 게이트. web-ui 의 scripts/check-tokens.mjs 를 문서 DS 에 맞게 확장했다.
//
// 다섯 규칙:
//   A. 파운데이션 토큰 재정의 금지  ← 이 repo 의 존재 이유. 가장 중요하다.
//   B. raw 색상 금지 (CSS + HTML 의 style= 속성까지)
//   C. 임의 px 금지 (0/1/2 제외)
//   D. 정의되지 않은 var(--token) 참조 금지
//   E. Spoqa 에 없는 굵기(600/800) 금지 — 브라우저가 합성해 인쇄에서 뭉갠다
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
  const text = stripComments(readFileSync(mirrorCss, 'utf8'))
  for (const line of text.split('\n')) {
    const m = /^\s*(--[a-zA-Z0-9-]+)\s*:\s*([^;]+);/.exec(line)
    if (m) mirrorTokens.set(m[1], m[2].trim())
  }
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
for (const r of references)
  if (!definitions.has(r.name)) errors.push(`${r.at} 규칙D — 정의되지 않은 토큰 참조: ${r.name}`)

if (errors.length) {
  console.error('✗ 토큰 검사 실패\n')
  for (const e of errors) console.error('  - ' + e)
  process.exitCode = 1
} else {
  console.log(
    `✓ 토큰 규율 OK — ${files.length}개 파일, 파운데이션 토큰 ${mirrorTokens.size}종 무결, ` +
      `참조 ${references.length}건 전부 정의됨` +
      (REDEFINE_ALLOW.size ? ` (문서화된 오버라이드 ${REDEFINE_ALLOW.size}종 제외)` : '')
  )
}
