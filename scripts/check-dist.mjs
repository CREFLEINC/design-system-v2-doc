#!/usr/bin/env node
// dist/ 가 소스에서 결정론적으로 재생산되는지 검사한다. **스스로 빌드를 돌린다.**
//
// 왜 이게 keystone 인가:
//   문서는 dist/crefle-doc/ 를 자기 옆에 복사해 쓴다(벤더링). 그 복사본의 출처를
//   증명하려면 해시가 필요한데, **빌드 산출물 위에 얹은 해시는 빌드가 재현
//   가능할 때만 의미가 있다.** 재현 불가능하면 해시는 "우리가 보낸 바이트"일 뿐
//   "이 소스에서 나온 바이트"가 아니다 — 출처 연극(provenance theatre)이 된다.
//
// 방법: 빌드 **전** dist/ 를 해시 → 빌드 → 다시 해시 → 대조.
//   두 가지를 한 번에 증명한다:
//     (1) 디스크의 dist/ 가 이미 소스의 산출물이었다 (stale 아님)
//     (2) 빌드가 결정적이다 (같은 입력 → 같은 바이트)
//
// ⚠️ 두 가지 함정을 피한다:
//   · `git diff --exit-code -- dist/` — diff 는 **추적되는 파일의 변경**만 본다.
//     빌드가 **새 파일**을 만들면(untracked) 조용히 통과한다. 실제로 이 구멍이
//     있었다: dist/crefle-doc/deck-stage.js 가 처음 생겼을 때 diff 는 침묵했다.
//   · `git status --porcelain` — untracked 는 잡지만 **스테이징된 변경도** 잡는다.
//     즉 "커밋했는가"를 묻게 되는데, 그건 이 검사의 질문이 아니다. 커밋 전에
//     green 을 볼 수 없어 닭-달걀이 된다. git 상태가 아니라 **바이트**를 본다.
import { createHash } from 'node:crypto'
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { join, relative, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const DIST = join(ROOT, 'dist')

/**
 * dist/ 의 모든 파일을 상대경로 → sha256 으로 스냅샷한다.
 * @param {string} dir
 * @returns {Map<string, string>}
 */
function snapshot(dir) {
  /** @type {Map<string, string>} */
  const out = new Map()
  /** @param {string} d */
  const walk = (d) => {
    for (const name of readdirSync(d).sort()) {
      const p = join(d, name)
      if (statSync(p).isDirectory()) walk(p)
      else out.set(relative(dir, p).split('\\').join('/'), createHash('sha256').update(readFileSync(p)).digest('hex'))
    }
  }
  if (existsSync(dir)) walk(dir)
  return out
}

const before = snapshot(DIST)

execFileSync(process.execPath, [join(ROOT, 'scripts', 'build.mjs')], { stdio: ['ignore', 'ignore', 'inherit'] })

const after = snapshot(DIST)

/** @type {string[]} */
const problems = []
for (const [rel, hash] of after) {
  if (!before.has(rel)) problems.push(`  빌드가 새로 만듦 (디스크에 없던 파일)   ${rel}`)
  else if (before.get(rel) !== hash) problems.push(`  내용이 달라짐                        ${rel}`)
}
for (const rel of before.keys()) if (!after.has(rel)) problems.push(`  빌드가 만들지 않음 (남은 찌꺼기)     ${rel}`)

if (problems.length) {
  console.error('✗ dist/ 가 소스의 산출물이 아닙니다 — 재빌드 결과가 디스크의 것과 다릅니다.\n')
  for (const p of problems) console.error(p)
  console.error('\n원인은 둘 중 하나입니다:')
  console.error('  (a) dist/ 가 낡았다 — 소스를 고치고 `npm run build` 를 안 돌렸다. 돌리고 함께 커밋하세요.')
  console.error('  (b) 빌드가 비결정적이다 — 타임스탬프·난수·순회 순서에 의존한다. 그러면 벤더링된')
  console.error('      복사본의 출처를 증명할 수 없습니다(해시가 소스와 이어지지 않음).')
  process.exitCode = 1
} else {
  console.log(`✓ dist/ 가 소스의 결정론적 산출물 — ${after.size}개 파일 바이트 동일`)
}
