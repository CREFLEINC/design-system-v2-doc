#!/usr/bin/env node
// 폰트 결정성 게이트. 세 가지를 막는다.
//
//   1) @import 가 @font-face 뒤에 오는 것  ← 전신 colors_and_type.css:36 의 실제 버그
//   2) 네트워크에서 받아오는 폰트/자산      ← 업로드 렌더러는 network_mode:"none"
//   3) 존재하지 않는 로컬 파일을 가리키는 src
//
// 각 규칙은 추상적 원칙이 아니라 실측된 사고에서 나왔다:
//
//   (1) colors_and_type.css 는 8행에 "@import rules must precede @font-face per CSS spec"
//       이라고 적어놓고 36행에서 어겼다. Chrome 실측(네트워크 있음): 두 @import 중 하나만
//       파싱을 통과했고 Material Symbols 페이스는 **0개** 등록됐다. 아이콘이 글리프 대신
//       literal "photo_camera" 문자열(94px 폭)로 렌더된다. 규칙을 적어둔 사람조차 어겼다.
//
//   (2) 발행된 OhMyFactory_PoC_기획서_v2.pdf 에는 Pretendard 가 CDN 에서 잘 로드돼 임베드돼
//       있다 — 개발자 **맥**에서 render_pdf.py 를 돌렸기 때문이다. 같은 문서를 웹 업로드로
//       올리면 renderer 컨테이너(network_mode:"none")가 CDN 을 못 받아 폰트가 통째로 폴백된다.
//       같은 문서가 등록 경로에 따라 다른 PDF 가 된다.
//
//   (3) 그 PDF 에는 Menlo-Bold(macOS 전용)도 임베드돼 있다 = 재현 불가능하다는 뜻.
import { readdirSync, statSync, existsSync, readFileSync } from 'node:fs'
import { join, relative, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const SKIP_DIRS = new Set(['node_modules', '.git', 'test-results', 'playwright-report', 'foundation'])
const NETWORK_RE = /\b(https?:)?\/\/|url\(\s*['"]?(https?:)?\/\//i

/**
 * 검사 대상(.css/.html)을 재귀 수집한다.
 * @param {string} dir
 * @param {string[]} out
 * @returns {string[]}
 */
function walk(dir, out = []) {
  for (const name of readdirSync(dir).sort()) {
    if (SKIP_DIRS.has(name)) continue
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (/\.(css|html)$/i.test(p)) out.push(p)
  }
  return out
}

// 주석을 지우되 줄 번호는 보존한다 — 주석 속 예시/설명이 오탐을 내지 않게.
/** @param {string} s @returns {string} */
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))

const problems = []
const files = walk(ROOT)

for (const abs of files) {
  const rel = relative(ROOT, abs)
  const raw = readFileSync(abs, 'utf8')
  const src = strip(raw)

  // ── 1) @import 순서 ────────────────────────────────────────────────
  // CSS 스펙: @import 는 @charset/@layer 를 제외한 모든 규칙보다 앞서야 한다.
  // 뒤에 오면 파서가 조용히 버린다 — 조용해서 위험하다.
  const firstFontFace = src.search(/@font-face/i)
  const importRe = /@import\b/gi
  let m
  while ((m = importRe.exec(src)) !== null) {
    const line = src.slice(0, m.index).split('\n').length
    if (firstFontFace !== -1 && m.index > firstFontFace) {
      const ffLine = src.slice(0, firstFontFace).split('\n').length
      problems.push(
        `${rel}:${line} — @import 가 @font-face(${ffLine}행) 뒤에 있습니다. CSS 스펙상 무효라 ` +
          `파서가 조용히 버립니다(전신 colors_and_type.css:36 이 정확히 이 버그로 아이콘이 죽었습니다). ` +
          `@import 를 파일 맨 위로 올리거나 — 더 낫게는 아예 쓰지 마세요.`
      )
    }
  }

  // ── 2) 네트워크 자산 ──────────────────────────────────────────────
  for (const [i, lineText] of src.split('\n').entries()) {
    if (!NETWORK_RE.test(lineText)) continue
    if (/@import|@font-face|src\s*:|<link|url\(/i.test(lineText))
      problems.push(
        `${rel}:${i + 1} — 네트워크 URL 을 참조합니다. 업로드 PDF 렌더러는 ` +
          `network_mode:"none" 격리 컨테이너라 100% 실패합니다. 로컬 번들만 쓰세요.\n      ${lineText.trim().slice(0, 110)}`
      )
  }

  // ── 3) src: url() 이 실존하는 로컬 파일을 가리키는가 ────────────────
  const urlRe = /src\s*:\s*url\(\s*['"]?([^'")]+)['"]?\s*\)/gi
  while ((m = urlRe.exec(src)) !== null) {
    const u = m[1].trim()
    if (/^(data:|https?:|\/\/)/i.test(u)) continue
    const target = resolve(dirname(abs), u)
    if (!existsSync(target)) {
      const line = src.slice(0, m.index).split('\n').length
      problems.push(`${rel}:${line} — src 가 없는 파일을 가리킵니다: ${u}`)
    }
  }
}

// ── 4) 폴백 스택에 OS 의존 mono 가 섞이지 않았는가 ────────────────────
// ui-monospace/SFMono/Menlo/Consolas 는 Ubuntu 에 없어 DejaVu 로 떨어진다.
// 발행 PDF 의 Menlo-Bold 가 바로 그 증거다.
const OS_FONTS = /\b(ui-monospace|SFMono-Regular|Menlo|Consolas|Monaco|Courier New)\b/i
for (const abs of files) {
  const src = strip(readFileSync(abs, 'utf8'))
  for (const [i, lineText] of src.split('\n').entries()) {
    if (/--font-|font-family/i.test(lineText) && OS_FONTS.test(lineText))
      problems.push(
        `${relative(ROOT, abs)}:${i + 1} — OS 의존 폰트를 폴백에 두었습니다. Ubuntu 엔 없어 ` +
          `DejaVu 로 떨어집니다(맥 미리보기 ≠ 컨테이너 PDF). 번들한 서체만 명명하세요.\n      ${lineText.trim().slice(0, 110)}`
      )
  }
}

if (problems.length) {
  console.error('✗ 폰트 결정성 검사 실패\n')
  for (const p of problems) console.error('  - ' + p)
  process.exitCode = 1
} else {
  console.log(`✓ 폰트 결정성 OK — ${files.length}개 파일: @import 순서 정상, 네트워크 자산 0, src 전부 로컬 실존`)
}
