#!/usr/bin/env node
import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const DEFAULT_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const ROOT = resolve(process.argv[2] ?? DEFAULT_ROOT)
const componentCss = readFileSync(join(ROOT, 'styles', 'doc.css'), 'utf8')
const exampleHtml = readFileSync(join(ROOT, 'examples', 'doc-minimal.html'), 'utf8')
const uncommentedCss = componentCss.replaceAll(/\/\*[\s\S]*?\*\//g, '')
/** @type {string[]} */
const problems = []

const ruleMatches = [...uncommentedCss.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
const processRules = ruleMatches.filter((match) => match[1].includes('process-flow'))

for (const match of processRules) {
  const selectors = match[1]
    .split(',')
    .map((selector) => selector.trim())
    .filter(Boolean)

  for (const selector of selectors) {
    if (selector.includes('process-flow') && !selector.startsWith('.doc '))
      problems.push(`process-flow 는 .doc 안에서만 지원합니다: ${selector}`)
    if (/::(?:before|after)/.test(selector))
      problems.push(`process-flow 에 absolute connector 또는 pseudo-element 를 만들 수 없습니다: ${selector}`)
  }

  if (/\bcontent\s*:/.test(match[2]))
    problems.push('process-flow 상태는 generated content 로 만들 수 없습니다.')
  if (/\bposition\s*:\s*absolute\b/.test(match[2]))
    problems.push('process-flow 에 absolute connector 를 만들 수 없습니다.')
}

if (processRules.length) {
  const requiredSelectors = [
    '.process-flow-scroll',
    '.process-flow {',
    '.process-flow-items',
    '.process-flow-empty',
    '.process-flow-transition',
    "data-transition='enter'",
    "data-transition='exit'"
  ]

  for (const selector of requiredSelectors)
    if (!uncommentedCss.includes(selector))
      problems.push(`process-flow 필수 selector 가 없습니다: ${selector}`)

  const wrapperMatch = exampleHtml.match(
    /<div\b[^>]*class=["'][^"']*\bprocess-flow-scroll\b[^"']*["'][^>]*>\s*(<table\b[^>]*class=["'][^"']*\bprocess-flow\b[^"']*["'][^>]*>[\s\S]*?<\/table>)\s*<\/div>/
  )

  if (!wrapperMatch) {
    problems.push('process-flow table 은 process-flow-scroll 의 direct child 여야 합니다.')
  } else {
    const table = wrapperMatch[1]
    const caption = table.match(/<caption\b[^>]*>([\s\S]*?)<\/caption>/)
    if (!caption || !stripTags(caption[1]).trim())
      problems.push('process-flow table 에 non-empty caption 이 필요합니다.')

    const headRow = table.match(/<thead\b[^>]*>[\s\S]*?<tr\b[^>]*>([\s\S]*?)<\/tr>[\s\S]*?<\/thead>/)
    const headerTags = headRow ? [...headRow[1].matchAll(/<th\b([^>]*)>/g)] : []
    const laneCount = headerTags.length - 1
    if (laneCount < 2 || laneCount > 4)
      problems.push(`process-flow 는 2..4 lanes 를 지원합니다. 현재: ${Math.max(0, laneCount)}`)
    if (!headerTags.length || headerTags.some((match) => !hasAttribute(match[1], 'scope', 'col')))
      problems.push('process-flow column header 에 scope="col" 이 필요합니다.')

    const body = table.match(/<tbody\b[^>]*>([\s\S]*?)<\/tbody>/)?.[1] ?? ''
    const rows = [...body.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/g)]
    if (!rows.length || rows.some((row) => !/^\s*<th\b[^>]*\bscope=["']row["']/i.test(row[1])))
      problems.push('process-flow stage header 에 scope="row" 이 필요합니다.')

    if (!/class=["'][^"']*\bprocess-flow-items\b[^"']*["'][\s\S]*?class=["'][^"']*\bidentity-chip\b/.test(table))
      problems.push('process-flow item 은 identity-chip 을 재사용해야 합니다.')

    const emptyMarkers = [...table.matchAll(/<span\b([^>]*\bclass=["'][^"']*\bprocess-flow-empty\b[^"']*["'][^>]*)>([\s\S]*?)<\/span>/g)]
    if (!emptyMarkers.length || emptyMarkers.some((marker) => !hasAttribute(marker[1], 'aria-label', '항목 없음') || stripTags(marker[2]).trim() !== '—'))
      problems.push('process-flow empty marker 는 aria-label="항목 없음" 과 실제 — 문자를 써야 합니다.')

    for (const [transition, label] of [['enter', '시작'], ['exit', '종료']]) {
      const cells = [...table.matchAll(/<td\b([^>]*)>([\s\S]*?)<\/td>/g)]
        .filter((cell) => hasAttribute(cell[1], 'data-transition', transition))
      const valid = cells.some((cell) => {
        const marker = cell[2].match(/<span\b[^>]*class=["'][^"']*\bprocess-flow-transition\b[^"']*["'][^>]*>([\s\S]*?)<\/span>/)
        return marker && stripTags(marker[1]).trim() === label
      })
      if (!valid) problems.push(`process-flow ${transition} transition 에 실제 텍스트 ${label} 가 필요합니다.`)
    }
  }
}

/** @param {string} value */
function stripTags(value) {
  return value.replace(/<[^>]*>/g, '')
}

/** @param {string} attributes @param {string} name @param {string} value */
function hasAttribute(attributes, name, value) {
  return new RegExp(`\\b${name}=["']${value}["']`, 'i').test(attributes)
}

if (problems.length) {
  console.error('✗ process flow 계약 검사 실패\n')
  for (const problem of problems) console.error(`  - ${problem}`)
  process.exitCode = 1
} else {
  console.log('✓ process flow 계약 OK — .doc table, explicit empty/transition, connector 없음')
}
