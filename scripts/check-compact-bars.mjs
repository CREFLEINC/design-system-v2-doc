#!/usr/bin/env node
import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const DEFAULT_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const ROOT = resolve(process.argv[2] ?? DEFAULT_ROOT)
const componentCss = readFileSync(join(ROOT, 'styles', 'doc.css'), 'utf8')
const exampleHtml = readFileSync(join(ROOT, 'examples', 'doc-minimal.html'), 'utf8')
const uncommentedCss = componentCss.replaceAll(/\/\*[\s\S]*?\*\//g, '')
const componentPattern = /magnitude-meter|confidence-bar|confidence-segment/
/** @type {string[]} */
const problems = []

const ruleMatches = [...uncommentedCss.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
const compactRules = ruleMatches.filter((match) => componentPattern.test(match[1]))

for (const match of compactRules) {
  const selectors = match[1]
    .split(',')
    .map((selector) => selector.trim())
    .filter(Boolean)
  for (const selector of selectors)
    if (componentPattern.test(selector) && !selector.startsWith('.doc '))
      problems.push(`compact bar 는 .doc 안에서만 지원합니다: ${selector}`)
}

const hasMagnitudeMeter = uncommentedCss.includes('.magnitude-meter')
const hasConfidenceBar = uncommentedCss.includes('.confidence-bar')

if (hasMagnitudeMeter) {
  for (const match of compactRules.filter((rule) => rule[1].includes('magnitude-meter'))) {
    const forbiddenToken = match[2].match(/var\(--(?:primary|chart-|semantic-)[^)]+\)/)?.[0]
    if (forbiddenToken)
      problems.push(`magnitude meter 는 neutral 토큰만 사용해야 합니다: ${forbiddenToken}`)
  }
}

if (hasConfidenceBar) {
  for (let slot = 1; slot <= 8; slot++) {
    const selector = `.confidence-bar[data-identity='${slot}']`
    const rule = compactRules.find((match) => match[1].includes(selector))
    for (const token of [`--chart-${slot}-container`, `--chart-${slot}-border`])
      if (!rule?.[2].includes(`var(${token})`))
        problems.push(`${selector} 는 ${token} 토큰을 재사용해야 합니다.`)
  }

  for (const confidence of ['confirmed', 'estimated', 'unknown']) {
    const selector = `.confidence-segment[data-confidence='${confidence}']`
    if (!compactRules.some((match) => match[1].includes(selector)))
      problems.push(`${selector} 규칙이 필요합니다.`)
  }
}

if (hasMagnitudeMeter) {
  const meterTag = exampleHtml.match(/<meter\b(?=[^>]*class="[^"]*\bmagnitude-meter\b)[^>]*>/)?.[0]
  if (!meterTag) {
    problems.push('최소 예제에 native .magnitude-meter를 포함하세요.')
  } else {
    for (const attribute of ['min', 'max', 'value'])
      if (!new RegExp(`\\s${attribute}="[^"]+"`).test(meterTag))
        problems.push(`magnitude meter 예제에 ${attribute} 속성이 필요합니다.`)

    const id = meterTag.match(/\sid="([^"]+)"/)?.[1]
    const hasAriaName = /\saria-(?:label|labelledby)="[^"]+"/.test(meterTag)
    const hasLabel = id && new RegExp(`<label\\b[^>]*for="${id}"`).test(exampleHtml)
    if (!hasAriaName && !hasLabel)
      problems.push('magnitude meter 예제에 label 연결 또는 aria-label이 필요합니다.')
  }
}

if (hasConfidenceBar) {
  const barMatch = exampleHtml.match(
    /<div\b(?=[^>]*class="[^"]*\bconfidence-bar\b)([^>]*)>([\s\S]*?)<\/div>/
  )
  if (!barMatch) {
    problems.push('최소 예제에 .confidence-bar를 포함하세요.')
  } else {
    const [, attributes, segments] = barMatch
    if (!/\sdata-identity="[1-8]"/.test(attributes))
      problems.push('confidence bar 예제에 data-identity="1..8"이 필요합니다.')
    if (!/\srole="img"/.test(attributes) || !/\saria-(?:label|labelledby)="[^"]+"/.test(attributes))
      problems.push('confidence bar 예제에 role="img"와 accessible summary가 필요합니다.')

    for (const confidence of ['confirmed', 'estimated', 'unknown']) {
      const segmentTag = segments.match(
        new RegExp(`<span\\b(?=[^>]*data-confidence="${confidence}")[^>]*>`)
      )?.[0]
      if (!segmentTag) {
        problems.push(`confidence bar 예제에 ${confidence} segment가 필요합니다.`)
      } else if (!/--segment-size:\s*\d+(?:\.\d+)?/.test(segmentTag)) {
        problems.push(`${confidence} segment 예제에 --segment-size가 필요합니다.`)
      }
    }
  }
}

if (problems.length) {
  console.error('✗ compact bar 계약 검사 실패\n')
  for (const problem of problems) console.error(`  - ${problem}`)
  process.exitCode = 1
} else {
  console.log('✓ compact bar 계약 OK — neutral magnitude, 8 identity, 3 confidence, .doc 전용')
}
