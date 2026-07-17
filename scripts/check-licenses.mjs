#!/usr/bin/env node
// 폰트 바이너리가 있는 **모든** 디렉토리에 라이선스 전문이 있는지 검사한다.
//
// 왜 이 게이트가 있나 — 가상의 위험이 아니다:
//   CREFLEINC/reports 는 PUBLIC 이고 proposals/ohmyfactory/fonts/ 에 Spoqa OTF 5종 +
//   MaterialSymbolsRounded.woff2 를 **라이선스 전문 0개**로 재배포하고 있다(2026-07-17 실측).
//   파운데이션 docs/domain-ds-guide.md 가 정확히 이 함정을 예언했다:
//     "폰트를 두 곳에 복사한다면 두 곳 모두에 라이선스 전문을 둔다."
//     "하나라도 없으면 그 사본은 무단 재배포다."
//   web-ui 는 그 교훈을 받았고 reports 는 못 받았다. 문서가 아니라 게이트로 만든다.
//
// 규칙: 폰트 파일(.woff2/.woff/.ttf/.otf)이 있는 디렉토리마다, 그 안에 있는 폰트
//       패밀리 각각에 대한 LICENSE-*.txt 가 **같은 디렉토리에** 있어야 한다.
//       (상위 디렉토리의 LICENSE 로 대신할 수 없다 — 디렉토리 단위로 복사되기 때문이다.)
import { readdirSync, statSync, existsSync, readFileSync } from 'node:fs'
import { join, relative, dirname, basename } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const FONT_RE = /\.(woff2?|ttf|otf)$/i
const SKIP_DIRS = new Set(['node_modules', '.git', 'test-results', 'playwright-report'])

// 폰트 파일명 → 어떤 라이선스 파일을 요구하는가.
const FAMILIES = [
  { match: /^SpoqaHanSansNeo-/i, license: 'LICENSE-SpoqaHanSansNeo.txt', name: 'Spoqa Han Sans Neo (SIL OFL 1.1)' },
  { match: /^MaterialSymbols/i, license: 'LICENSE-MaterialSymbols.txt', name: 'Material Symbols (Apache-2.0)' },
  { match: /^JetBrainsMono-/i, license: 'LICENSE-JetBrainsMono.txt', name: 'JetBrains Mono (SIL OFL 1.1)' }
]

// 라이선스 "전문" 인지 최소 검증 — 빈 파일이나 "see LICENSE" 한 줄짜리 스텁을 막는다.
const MARKERS = [/SIL OPEN FONT LICENSE/i, /Apache License/i]
const MIN_BYTES = 1000

/**
 * repo 전체 파일을 재귀 수집한다.
 * @param {string} dir
 * @param {string[]} out
 * @returns {string[]}
 */
function walk(dir, out = []) {
  for (const name of readdirSync(dir).sort()) {
    if (SKIP_DIRS.has(name)) continue
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p, out)
    else out.push(p)
  }
  return out
}

/** @type {string[]} */
const problems = []
/** @type {Map<string, string[]>} 디렉토리 절대경로 → 그 안의 폰트 파일명들 */
const fontsByDir = new Map()

for (const abs of walk(ROOT)) {
  if (!FONT_RE.test(abs)) continue
  const d = dirname(abs)
  const list = fontsByDir.get(d) ?? []
  list.push(basename(abs))
  fontsByDir.set(d, list)
}

if (fontsByDir.size === 0) problems.push('폰트 파일을 하나도 찾지 못했습니다 — 이 검사가 무의미해졌는지 확인하세요.')

for (const [dir, fonts] of [...fontsByDir].sort()) {
  const rel = relative(ROOT, dir) || '.'
  /** @type {Map<string, {match: RegExp, license: string, name: string}>} */
  const required = new Map()
  for (const f of fonts) {
    const fam = FAMILIES.find((x) => x.match.test(f))
    if (!fam) {
      problems.push(`${rel}/${f}: 어느 폰트 패밀리인지 모릅니다. check-licenses.mjs 의 FAMILIES 에 추가하세요.`)
      continue
    }
    required.set(fam.license, fam)
  }
  for (const [licFile, fam] of required) {
    const licPath = join(dir, licFile)
    if (!existsSync(licPath)) {
      problems.push(`${rel}/ 에 ${fam.name} 폰트가 있는데 ${licFile} 이(가) 없습니다 → 무단 재배포입니다.`)
      continue
    }
    const body = readFileSync(licPath, 'utf8')
    if (body.length < MIN_BYTES || !MARKERS.some((m) => m.test(body)))
      problems.push(`${rel}/${licFile} 이(가) 라이선스 전문으로 보이지 않습니다 (${body.length} bytes). 요약본·스텁 금지 — 전문을 넣으세요.`)
  }
}

if (problems.length) {
  console.error('✗ 폰트 라이선스 검사 실패\n')
  for (const p of problems) console.error('  - ' + p)
  console.error('\n라이선스 전문 없이 배포되는 폰트 사본은 무단 재배포입니다.')
  console.error('SIL OFL 1.1 / Apache-2.0 모두 재배포되는 **사본마다** 전문 포함을 요구합니다.')
  console.error('\n사본을 전부 찾으려면:  git ls-files | grep -Ei \'\\.(woff2?|ttf|otf)$\'')
  process.exitCode = 1
} else {
  const dirs = [...fontsByDir].map(([d, f]) => `${relative(ROOT, d) || '.'}(${f.length})`).join(', ')
  console.log(`✓ 폰트 라이선스 OK — ${fontsByDir.size}개 디렉토리에 전문 동봉됨: ${dirs}`)
}
