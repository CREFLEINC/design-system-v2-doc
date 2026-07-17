#!/usr/bin/env node
// 차트 categorical 팔레트 게이트.
//
// ## 이 게이트가 하는 일과 **하지 않는 일** (정직하게)
//
// 하는 일:
//   1. 팔레트 토큰이 **검증된 값에서 벗어나면 실패**시킨다. 누가 색을 바꾸고
//      validator 를 안 돌리는 것을 막는다 — 그게 이 팔레트가 무너지는 유일한 경로다.
//   2. **흑백 인쇄 명도차**를 실제로 계산한다. 이건 dataviz 스킬에 **없는** 검사이고
//      문서 DS 고유 요구다 — 보고서는 흑백으로 인쇄된다.
//
// 하지 않는 일:
//   CVD 시뮬레이션(Machado 2009) · OKLab ΔE · lightness band · chroma floor 는
//   여기서 재구현하지 않는다. dataviz 스킬의 validate_palette.js 가 표준이고,
//   그 모델 자체가 표준의 일부다("the model is part of the standard"). 재구현하면
//   두 개의 진실원이 생기고 조용히 갈라진다.
//   → 팔레트를 바꾸려면 **스킬의 validator 를 직접 돌리고** 아래 EXPECTED 를 갱신하라.
//      명령은 실패 메시지에 그대로 찍힌다.
//
// 즉 이 게이트는 "검증했음"을 증명하지 않는다. **"검증한 것에서 벗어나지 않았음"**
// 을 증명한다. 그 둘의 차이를 알고 쓰는 것이 중요하다.
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

// dataviz validate_palette.js 로 검증된 값 (2026-07-17, --mode light --surface #FBF8FD).
//   · adjacent pairs, 8슬롯 전부 → ALL PASS
//   · all-pairs, 앞 4슬롯        → ALL PASS (최악 ΔE 13.0 deutan / 16.3 normal)
// slot 1 은 var(--primary) 로 파운데이션에서 온다 — 여기선 그 해석값을 적는다.
const EXPECTED = [
  ['--chart-1', '#C9252C', 'var(--primary) — 브랜드 레드. 단일 시리즈의 기본색'],
  ['--chart-2', '#2a78d6', '블루'],
  ['--chart-3', '#eda100', '옐로'],
  ['--chart-4', '#4a3aa7', '바이올렛 — 여기까지가 원형(all-pairs) 안전 상한'],
  ['--chart-5', '#008300', '그린 — 레드와 적록 충돌(ΔE 2.7 deutan)이라 5번으로 밀림'],
  ['--chart-6', '#e87ba4', '마젠타'],
  ['--chart-7', '#1baf7a', '아쿠아'],
  ['--chart-8', '#eb6834', '오렌지']
]

const VALIDATOR_CMD =
  'node <dataviz-skill>/scripts/validate_palette.js \\\n' +
  '       "#C9252C,#2a78d6,#eda100,#4a3aa7,#008300,#e87ba4,#1baf7a,#eb6834" \\\n' +
  '       --mode light --surface "#FBF8FD"\n' +
  '   그리고 원형용으로 앞 4슬롯을 --pairs all 로 한 번 더:\n' +
  '     node <…>/validate_palette.js "#C9252C,#2a78d6,#eda100,#4a3aa7" \\\n' +
  '       --mode light --surface "#FBF8FD" --pairs all'

/** @param {string} hex @returns {number} WCAG 상대 명도 */
function luminance(hex) {
  const h = hex.replace('#', '')
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255)
  const f = (/** @type {number} */ c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
}

/** @type {string[]} */
const problems = []
const css = readFileSync(join(ROOT, 'styles', 'doc-tokens.css'), 'utf8')

// ── 1) 검증된 값에서 벗어나지 않았는가 ─────────────────────────────────────
for (const [name, expected, why] of EXPECTED) {
  const m = new RegExp(`^\\s*${name}\\s*:\\s*([^;]+);`, 'm').exec(css)
  if (!m) {
    problems.push(`${name} 이(가) doc-tokens.css 에 없습니다. (${why})`)
    continue
  }
  const actual = m[1].trim()
  // slot 1 은 var(--primary) 라 리터럴 비교가 안 된다 — 파운데이션 미러에서 해석한다.
  if (actual.startsWith('var(')) {
    const ref = /var\(\s*(--[a-z0-9-]+)/.exec(actual)?.[1]
    const mirror = readFileSync(join(ROOT, 'styles', 'foundation', 'tokens.css'), 'utf8')
    // --primary: var(--brand-red) → 한 단계 더 따라간다
    let val = new RegExp(`${ref}\\s*:\\s*([^;]+);`).exec(mirror)?.[1]?.trim()
    if (val?.startsWith('var(')) {
      const ref2 = /var\(\s*(--[a-z0-9-]+)/.exec(val)?.[1]
      val = new RegExp(`${ref2}\\s*:\\s*([^;]+?)\\s*(?:;|/\\*)`).exec(mirror)?.[1]?.trim()
    }
    if (!val || val.toUpperCase() !== expected.toUpperCase())
      problems.push(`${name} = ${actual} → 파운데이션에서 ${val} 로 해석됩니다. 검증된 값은 ${expected} 입니다.`)
    continue
  }
  if (actual.toUpperCase() !== expected.toUpperCase())
    problems.push(`${name} 이(가) ${actual} 입니다. 검증된 값은 ${expected} (${why})`)
}

// ── 2) 흑백 인쇄 — dataviz 스킬에 없는 검사. 문서 DS 고유. ─────────────────
// 보고서는 흑백으로 인쇄된다. 색이 사라지면 명도만 남는다.
// 원형 차트의 안전 상한인 앞 4슬롯을 본다.
const PIE_SLOTS = EXPECTED.slice(0, 4)
const lums = PIE_SLOTS.map(([n, hex]) => ({ n, hex, l: luminance(hex) }))
let worst = { pair: '', d: 1 }
for (let i = 0; i < lums.length; i++)
  for (let j = i + 1; j < lums.length; j++) {
    const d = Math.abs(lums[i].l - lums[j].l)
    if (d < worst.d) worst = { pair: `${lums[i].n}(${lums[i].l.toFixed(3)}) ↔ ${lums[j].n}(${lums[j].l.toFixed(3)})`, d }
  }

// 임계값은 경고선이다 — 실패시키지 않는다. 이 팔레트는 CVD 를 위해 색상(hue)으로
// 구분하도록 설계됐고, 명도까지 전부 벌리면 lightness band 를 벗어난다.
// 대신 **2차 인코딩 의무**를 상기시킨다. 그것이 진짜 해법이다.
const BW_WARN = 0.1

if (problems.length) {
  console.error('✗ 차트 팔레트가 검증된 값에서 벗어났습니다\n')
  for (const p of problems) console.error('  - ' + p)
  console.error('\n색을 바꿨다면 **눈으로 판단하지 말고 validator 를 돌리세요**:')
  console.error('   ' + VALIDATOR_CMD)
  console.error('\n통과하면 이 파일의 EXPECTED 를 갱신하세요.')
  console.error('web-ui 의 옛 팔레트(레드+차콜 사다리)는 이 검사에서 3개 FAIL 했습니다 —')
  console.error('그중 하나는 "정상 시력으로도 구분 불가"(ΔE 13.3 < 15) 였습니다.')
  process.exitCode = 1
} else {
  console.log(`✓ 차트 팔레트 OK — 검증된 8슬롯 유지 (원형 상한 4슬롯)`)
  if (worst.d < BW_WARN)
    console.log(
      `  ⚠ 흑백 인쇄: 최소 명도차 ${worst.d.toFixed(3)} — ${worst.pair}\n` +
        `    색만으로 구분하게 두지 말 것. 범례 + 직접 라벨 + 마크 간 간격이 의무입니다\n` +
        `    (crefle-chart.js 가 제공). 이건 dataviz 스킬 밖의 문서 DS 고유 요구입니다.`
    )
}
