import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const ROOT = join(fileURLToPath(new URL('..', import.meta.url)))
const REPORT_TEMPLATE = join(ROOT, 'templates', 'report.html')

function runSkillCheck() {
  try {
    return {
      status: 0,
      output: execFileSync('node', ['scripts/check-skill.mjs'], { cwd: ROOT, encoding: 'utf8', stdio: 'pipe' })
    }
  } catch (error) {
    return {
      status: /** @type {{ status?: number }} */ (error).status,
      output: /** @type {{ stderr?: Buffer, stdout?: Buffer }} */ (error).stderr?.toString() || ''
    }
  }
}

describe('check-skill document information contract', () => {
  it('accepts the completed examples with confirmed HH:mm times and approved audiences', () => {
    expect(runSkillCheck().status).toBe(0)
  })

  it('rejects an HH:mm annotation placed on the author row instead of the time row', () => {
    const original = readFileSync(REPORT_TEMPLATE, 'utf8')
    const misplaced = original
      .replace(
        '<tr><th>작성자</th><td><!-- 사용자 확인 전 기입 금지 -->[사용자 확인 필요]</td></tr>',
        '<tr><th>작성자</th><td><!-- 사용자 확인 전 기입 금지 · 24시간제 HH:mm -->[사용자 확인 필요]</td></tr>'
      )
      .replace(
        '<tr><th>작성시간</th><td><!-- 사용자 확인 전 기입 금지 · 24시간제 HH:mm -->[사용자 확인 필요]</td></tr>',
        '<tr><th>작성시간</th><td><!-- 사용자 확인 전 기입 금지 -->[사용자 확인 필요]</td></tr>'
      )

    try {
      writeFileSync(REPORT_TEMPLATE, misplaced)
      const result = runSkillCheck()
      expect(result.status).not.toBe(0)
      expect(result.output).toContain('작성시간')
    } finally {
      writeFileSync(REPORT_TEMPLATE, original)
    }
  })

  it('rejects a document information table with a sixth malformed row', () => {
    const original = readFileSync(REPORT_TEMPLATE, 'utf8')
    const withExtraRow = original.replace(
      '    </tbody>',
      '      <tr><td>잘못된 여섯 번째 행</td></tr>\n    </tbody>'
    )

    try {
      writeFileSync(REPORT_TEMPLATE, withExtraRow)
      const result = runSkillCheck()
      expect(result.status).not.toBe(0)
      expect(result.output).toContain('5개')
    } finally {
      writeFileSync(REPORT_TEMPLATE, original)
    }
  })
})
