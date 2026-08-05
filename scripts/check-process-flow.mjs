#!/usr/bin/env node
import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const DEFAULT_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const ROOT = resolve(process.argv[2] ?? DEFAULT_ROOT)
const componentCss = readFileSync(join(ROOT, 'styles', 'doc.css'), 'utf8')
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
}

if (problems.length) {
  console.error('✗ process flow 계약 검사 실패\n')
  for (const problem of problems) console.error(`  - ${problem}`)
  process.exitCode = 1
} else {
  console.log('✓ process flow 계약 OK — .doc table, explicit empty/transition, connector 없음')
}
