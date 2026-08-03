#!/usr/bin/env node
// 저작 스킬이 **약속한 것이 실재하는지** 검사한다.
//
// ## 왜
//
// 이 DS 의 존재 이유는 "지침이 낡아서 유능한 모델이 잘못 만들었다" 는 사고다.
// crefle_designer 스킬은 `--primary: #4758A9` 라고 가르쳤는데 파운데이션은 이미
// #C9252C 로 바뀌어 있었다. 스킬이 코드보다 오래된 것 — 그게 네 갈래 분기의 원인이었다.
//
// **같은 일이 이 스킬에서 반복되지 않게 한다.** 스킬이 "이 클래스를 쓰세요" 라고 했는데
// CSS 에 없으면, Claude 는 그 지침을 따르고 문서는 스타일 없이 나간다. 조용하다.
//
// web-ui 도 같은 구멍을 `scripts/components-inventory.mjs` + `check:components` 로 메웠다
// ("코드와 문서가 어긋나면 CI 거부").
//
// ## 무엇을 검사하나
//
//   1. 스킬·레퍼런스가 언급하는 **템플릿 파일**이 실재하는가
//   2. 스킬·레퍼런스가 언급하는 **클래스**가 빌드된 CSS 에 실재하는가
//   3. 스킬·레퍼런스가 언급하는 **토큰**이 실재하는가
//   4. 템플릿이 스킬이 말한 **경로 관례**(./crefle-doc/)를 쓰는가
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const SKILL_DIR = join(ROOT, 'skills', 'crefle-doc')
const CSS = join(ROOT, 'dist', 'crefle-doc', 'crefle-doc.css')
const DOCUMENT_INFO_LABELS = ['작성자', '작성일', '작성시간', '문서 버전', '열람 대상']
const APPROVED_AUDIENCES = new Set(['사내 한정', '프로젝트 관련자', '고객사 제출', '대외 공개'])

/** @type {string[]} */
const problems = []

if (!existsSync(CSS)) {
  console.error('✗ dist/crefle-doc/crefle-doc.css 가 없습니다. npm run build 를 먼저 실행하세요.')
  process.exitCode = 1
} else {
  // 주석을 뺀 실제 규칙만 본다 — 주석 속 설명을 "존재한다" 로 세면 공허해진다.
  const css = readFileSync(CSS, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')

  /** 스킬 문서 전부 (SKILL.md + references/) @type {{rel: string, text: string}[]} */
  const docs = [{ rel: 'skills/crefle-doc/SKILL.md', text: readFileSync(join(SKILL_DIR, 'SKILL.md'), 'utf8') }]
  const refDir = join(SKILL_DIR, 'references')
  if (existsSync(refDir))
    for (const f of readdirSync(refDir).sort())
      docs.push({ rel: `skills/crefle-doc/references/${f}`, text: readFileSync(join(refDir, f), 'utf8') })

  for (const { rel, text } of docs) {
    // ── 1) 템플릿 — `templates/x.html` 또는 표 안의 `x.html`
    for (const m of text.matchAll(/`([a-z-]+\.html)`/g)) {
      const f = m[1]
      if (!existsSync(join(ROOT, 'templates', f)))
        problems.push(`${rel} 이(가) templates/${f} 를 안내하는데 파일이 없습니다.`)
    }

    // ── 2) 클래스 — 코드 span 안의 `.foo` 또는 class="foo"
    /** @type {Set<string>} */
    const cls = new Set()
    for (const m of text.matchAll(/`\.([a-z][a-z0-9-]*)`/g)) cls.add(m[1])
    for (const m of text.matchAll(/class="([^"]+)"/g)) for (const c of m[1].split(/\s+/)) if (c) cls.add(c)
    for (const c of cls) {
      // JS 가 만드는 클래스(crefle-chart-*)와 HTML 태그명은 CSS 셀렉터로 존재해야 한다.
      if (!new RegExp('\\.' + c.replace(/[-]/g, '\\-') + '(?![\\w-])').test(css))
        problems.push(`${rel} 이(가) .${c} 를 안내하는데 CSS 에 없습니다 — 따르면 스타일이 안 걸립니다.`)
    }

    // ── 3) 토큰
    for (const m of text.matchAll(/`(--[a-z][a-z0-9-]*)`/g))
      if (!css.includes(m[1])) problems.push(`${rel} 이(가) ${m[1]} 를 안내하는데 CSS 에 없습니다.`)
  }

  // ── 4) 템플릿의 경로 관례 — 스킬은 "번들을 문서 옆에" 라고 가르친다
  const tplDir = join(ROOT, 'templates')
  for (const f of readdirSync(tplDir).sort()) {
    const t = readFileSync(join(tplDir, f), 'utf8')
    for (const m of t.matchAll(/(?:src|href)\s*=\s*"([^"]+)"/g)) {
      const p = m[1]
      // 문서 내부 앵커(#fn1)와 data: URI 는 자산이 아니다 — 건너뛴다.
      // 첫 버전이 `#` 를 외부 자산으로 잘못 분류해 각주 링크를 오탐했다.
      if (/^(#|data:)/.test(p)) continue
      if (/^https?:/.test(p)) {
        problems.push(`templates/${f} 이(가) 네트워크 자산을 참조합니다: ${p}\n      업로드 PDF 렌더러는 network_mode:"none" 이라 100% 실패합니다.`)
        continue
      }
      if (!p.startsWith('./crefle-doc/'))
        problems.push(
          `templates/${f} 의 자산 경로가 ./crefle-doc/ 가 아닙니다: ${p}\n` +
            `      스킬은 "번들을 문서 옆에 복사" 라고 가르칩니다. examples/ 의 ../dist/ 경로를 복사해 오면 저자에게서 깨집니다.`
        )
    }
  }

  /** @param {string} block */
  function documentInfoRows(block) {
    return [...block.matchAll(/<tr>\s*<th>([^<]+)<\/th>\s*<td>([\s\S]*?)<\/td>\s*<\/tr>/g)]
  }

  /** @param {string} block @param {RegExpMatchArray[]} rows */
  function hasExpectedLabels(block, rows) {
    return (block.match(/<tr\b/g) || []).length === DOCUMENT_INFO_LABELS.length &&
      rows.length === DOCUMENT_INFO_LABELS.length &&
      rows.every((row, index) => row[1] === DOCUMENT_INFO_LABELS[index])
  }

  // ── 5) 문서 정보 계약 — 저자가 확인하기 전에는 추측값을 넣지 않는다
  for (const f of readdirSync(tplDir).sort()) {
    const t = readFileSync(join(tplDir, f), 'utf8')
    const block = t.match(/<table data-document-info>[\s\S]*?<\/table>/)?.[0]
    if (!block) {
      problems.push(`templates/${f} 에 data-document-info 표가 없습니다.`)
      continue
    }
    const rows = documentInfoRows(block)
    if (!hasExpectedLabels(block, rows)) {
      problems.push(`templates/${f} 의 문서 정보는 표준 순서의 <th>·<td> 쌍 5개여야 합니다.`)
      continue
    }
    for (const [_, label, cell] of rows) {
      const expectedComment = label === '작성시간'
        ? '사용자 확인 전 기입 금지 · 24시간제 HH:mm'
        : '사용자 확인 전 기입 금지'
      if (!new RegExp(`^\\s*<!--\\s*${expectedComment}\\s*-->\\s*\\[사용자 확인 필요\\]\\s*$`).test(cell))
        problems.push(`templates/${f} 의 ${label} 행은 ${expectedComment} 주석과 [사용자 확인 필요] placeholder를 함께 써야 합니다.`)
    }
  }

  // ── 6) 완료 예제의 문서 정보 계약 — 템플릿과 같은 항목·순서로 실제 값을 보여 준다
  for (const f of ['deck-minimal.html', 'doc-minimal.html']) {
    const t = readFileSync(join(ROOT, 'examples', f), 'utf8')
    const block = t.match(/<table data-document-info>[\s\S]*?<\/table>/)?.[0]
    if (!block) {
      problems.push(`examples/${f} 에 data-document-info 표가 없습니다.`)
      continue
    }
    const rows = documentInfoRows(block)
    if (!hasExpectedLabels(block, rows)) {
      problems.push(`examples/${f} 의 문서 정보는 표준 순서의 <th>·<td> 쌍 5개여야 합니다.`)
      continue
    }
    for (const [_, label, cell] of rows) {
      const value = cell.replace(/<!--[\s\S]*?-->/g, '').trim()
      if (!value || value.includes('[사용자 확인 필요]'))
        problems.push(`examples/${f} 의 ${label} 행에는 확인된 실제 값을 넣어야 합니다.`)
      if (label === '작성시간' && !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value))
        problems.push(`examples/${f} 의 작성시간은 24시간제 HH:mm 형식이어야 합니다.`)
      if (label === '열람 대상' && !APPROVED_AUDIENCES.has(value))
        problems.push(`examples/${f} 의 열람 대상은 권장 선택지(${[...APPROVED_AUDIENCES].join(', ')}) 중 하나여야 합니다.`)
    }
  }
}

if (problems.length) {
  console.error('✗ 스킬이 약속한 것이 실재하지 않습니다\n')
  for (const p of problems) console.error('  - ' + p)
  console.error('\n스킬이 코드보다 낡으면 Claude 는 낡은 지침을 따릅니다 — 그게 이 DS 가 생긴 이유입니다')
  console.error('(crefle_designer 가 --primary:#4758A9 을 가르쳤고, 파운데이션은 이미 #C9252C 였습니다).')
  process.exitCode = 1
} else {
  console.log('✓ 스킬 ↔ 코드 일치 — 안내한 템플릿·클래스·토큰이 전부 실재, 템플릿 경로 관례 준수')
}
