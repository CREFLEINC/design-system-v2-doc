#!/usr/bin/env node
// CSS 주석의 **조기 종료** 검사.
//
// ## 무엇을 잡나
//
// CSS 주석 안에 `*/` 가 텍스트로 들어가면 주석이 **거기서 닫힌다**. 그 뒤의 설명문은
// 전부 CSS 로 파싱되어 규칙이 통째로 사라지거나 이상하게 해석된다. 조용하다.
//
// 실제로 있었던 일: `styles/print.css` 헤더의 마크다운 표 행
//     | @top-*/@bottom-*/@left-middle/@right-* | ✅ |
// 의 `*/` 가 헤더 주석을 **821번째 문자에서** 닫았고, 그 뒤 40줄의 설명문이 CSS 로
// 파싱됐다. `lint:tokens` 가 "정의되지 않은 토큰 --token" 으로 **우연히** 잡았다 —
// 표 안의 `var(--token)` 예시가 진짜 참조로 읽혔기 때문이다. 우연이 없었으면 지나갔다.
//
// ## 무엇을 **안** 잡나 (일부러)
//
// JS 의 `</script` · CSS 의 `</style` 은 검사하지 않는다. 인라인 시 HTML 파서를
// 조기 종료시키는 건 맞지만(deck-stage.js:87 이 실제로 그랬다 — 92,000자가 4,598자로),
// **`scripts/build.mjs` 가 이스케이프하고 `tests/e2e/inline.spec.mjs` 가 산출물 길이를
// 검증한다.** 이미 처리되는 걸 소스에서 금지하면 과잉이고, 오탐은 게이트 신뢰를 깎는다.
// 게이트는 **다른 게이트가 못 잡는 것**만 잡아야 한다.
//
// ## 방법
//
// 주석이 의도한 곳에서 닫혔는지는 직접 볼 수 없다(첫 `*/` 가 정의상 끝이므로).
// 대신 **주석을 정상 규칙대로 제거한 뒤 남은 것이 CSS 로 말이 되는가** 를 본다.
// 마크다운 표 · 박스 드로잉 · 산문 목록이 남아 있으면 주석이 일찍 닫힌 것이다.
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { join, relative, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'test-results', 'playwright-report', 'foundation'])

/** CSS 에 있을 수 없는 산문의 흔적. 주석 밖에 있으면 조기 종료의 증거다. */
const PROSE = [
  { re: /^\|.*\|\s*$/, what: '마크다운 표 행' },
  { re: /^[│┌└├┤─┐┘┬┴]/, what: '박스 드로잉' },
  { re: /^#{1,4}\s+\S/, what: '마크다운 제목' },
  { re: /^[·‣▪]\s/, what: '산문 목록' },
  { re: /^\d+\.\s+\S+.*[가-힣]/, what: '번호 목록(한글)' }
]

/**
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
    else if (/\.css$/i.test(p)) out.push(p)
  }
  return out
}

/** @type {string[]} */
const problems = []
const files = walk(ROOT)

for (const abs of files) {
  const rel = relative(ROOT, abs).split('\\').join('/')
  const src = readFileSync(abs, 'utf8')
  // 주석을 정상 규칙대로 제거 (줄 번호 보존)
  const stripped = src.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ''))

  for (const [i, line] of stripped.split('\n').entries()) {
    const t = line.trim()
    if (!t) continue
    const hit = PROSE.find((p) => p.re.test(t))
    if (!hit) continue
    problems.push(
      `${rel}:${i + 1} — 주석 밖에 ${hit.what} 이(가) 있습니다 → 주석이 **조기 종료**됐습니다.\n` +
        `      원인: 그 위 주석 어딘가에 \`*/\` 가 텍스트로 들어 있습니다.\n` +
        `      흔한 범인: "@top-*/@bottom-*" 같은 와일드카드 나열, 정규식 예시, 경로 예시.\n` +
        `      고치기: 슬래시 앞뒤를 띄우거나("@top-* / @bottom-*") 표현을 바꾸세요.\n` +
        `      남은 줄: ${t.slice(0, 60)}`
    )
  }
}

if (problems.length) {
  console.error('✗ CSS 주석 조기 종료 검사 실패\n')
  for (const p of problems) console.error('  - ' + p)
  console.error('\n문서를 쓰다가 코드를 망가뜨리는 부류입니다. print.css 헤더가 실제로 이렇게')
  console.error('821번째 문자에서 닫혀 40줄이 CSS 로 파싱됐고, 다른 게이트가 우연히 잡았습니다.')
  process.exitCode = 1
} else {
  console.log(`✓ CSS 주석 온전 — ${files.length}개 파일, 주석 밖 산문 0`)
}
