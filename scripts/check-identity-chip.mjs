#!/usr/bin/env node
import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const DEFAULT_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const ROOT = resolve(process.argv[2] ?? DEFAULT_ROOT)
const tokenCss = readFileSync(join(ROOT, 'styles', 'doc-tokens.css'), 'utf8')
const componentCss = readFileSync(join(ROOT, 'styles', 'doc.css'), 'utf8')

/** @type {string[]} */
const problems = []

for (let slot = 1; slot <= 8; slot++) {
  const expected = [
    `--chart-${slot}-container: color-mix(in srgb, var(--chart-${slot}) 14%, var(--surface));`,
    `--chart-${slot}-border: color-mix(in srgb, var(--chart-${slot}) 55%, var(--on-surface));`
  ]

  for (const declaration of expected) {
    const token = declaration.slice(0, declaration.indexOf(':'))
    const declarations = tokenCss.match(new RegExp(`${token.replaceAll('-', '\\-')}\\s*:`, 'g')) ?? []
    if (declarations.length !== 1) {
      problems.push(`${token} 선언은 정확히 1개여야 합니다 (현재 ${declarations.length}개).`)
      continue
    }
    if (!tokenCss.includes(declaration))
      problems.push(`${token} 혼합 비율 또는 참조 토큰이 표준과 다릅니다: ${declaration}`)
  }
}

const uncommentedComponentCss = componentCss.replaceAll(/\/\*[\s\S]*?\*\//g, '')
for (const match of uncommentedComponentCss.matchAll(/([^{}]+identity-chip[^{}]*)\{/g)) {
  const selectors = match[1]
    .split(',')
    .map((selector) => selector.trim())
    .filter(Boolean)
  for (const selector of selectors)
    if (!selector.startsWith('.doc '))
      problems.push(`identity-chip 은 .doc 안에서만 지원합니다: ${selector}`)
}

if (problems.length) {
  console.error('✗ identity chip 계약 검사 실패\n')
  for (const problem of problems) console.error(`  - ${problem}`)
  process.exitCode = 1
} else {
  console.log('✓ identity chip 토큰 계약 OK — 8슬롯 × container/border, .doc 전용')
}
