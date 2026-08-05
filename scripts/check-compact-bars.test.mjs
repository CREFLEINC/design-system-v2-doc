import { execFileSync } from 'node:child_process'
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)))
const CHECKER = join(ROOT, 'scripts', 'check-compact-bars.mjs')
/** @type {string[]} */
const temporaryRoots = []

const COMPLETE_CSS = `
.doc .magnitude-meter { color: var(--on-surface-muted); }
.doc .confidence-bar { display: flex; }
.doc .confidence-segment { flex: var(--segment-size, 0) 1 0; }
${Array.from({ length: 8 }, (_, index) => {
  const slot = index + 1
  return `.doc .confidence-bar[data-identity='${slot}'] { --confidence-container: var(--chart-${slot}-container); --confidence-border: var(--chart-${slot}-border); }`
}).join('\n')}
.doc .confidence-segment[data-confidence='confirmed'] { border-style: solid; }
.doc .confidence-segment[data-confidence='estimated'] { border-style: double; }
.doc .confidence-segment[data-confidence='unknown'] { border-style: dashed; }
`

function makeFixture(css = '') {
  const root = mkdtempSync(join(tmpdir(), 'crefle-compact-bars-'))
  temporaryRoots.push(root)
  cpSync(join(ROOT, 'styles'), join(root, 'styles'), { recursive: true })
  cpSync(join(ROOT, 'examples'), join(root, 'examples'), { recursive: true })
  const file = join(root, 'styles', 'doc.css')
  writeFileSync(file, readFileSync(file, 'utf8') + css)
  return root
}

function runCheck(root = ROOT) {
  try {
    return {
      status: 0,
      output: execFileSync(process.execPath, [CHECKER, root], { encoding: 'utf8', stdio: 'pipe' })
    }
  } catch (error) {
    return {
      status: /** @type {{ status?: number }} */ (error).status,
      output:
        /** @type {{ stderr?: Buffer, stdout?: Buffer }} */ (error).stderr?.toString() ||
        /** @type {{ stderr?: Buffer, stdout?: Buffer }} */ (error).stdout?.toString() ||
        String(error)
    }
  }
}

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) rmSync(root, { recursive: true, force: true })
})

describe('compact bar public contract', () => {
  it('accepts the repository compact bar contract', () => {
    expect(runCheck()).toMatchObject({ status: 0 })
  })

  it('accepts a complete component contract', () => {
    expect(runCheck(makeFixture(COMPLETE_CSS))).toMatchObject({ status: 0 })
  })

  it('rejects a compact bar selector outside .doc', () => {
    const result = runCheck(makeFixture(`${COMPLETE_CSS}\n.slide .confidence-bar { display: flex; }\n`))

    expect(result.status).not.toBe(0)
    expect(result.output).toContain('.doc')
  })

  it.each(['confirmed', 'estimated', 'unknown'])(
    'rejects a missing %s confidence selector',
    (confidence) => {
      const rule = new RegExp(
        `\\.doc \\.confidence-segment\\[data-confidence='${confidence}'\\] \\{[^}]+\\}`
      )
      const result = runCheck(makeFixture(COMPLETE_CSS.replace(rule, '')))

      expect(result.status).not.toBe(0)
      expect(result.output).toContain(confidence)
    }
  )

  it('rejects semantic color use in magnitude meter rules', () => {
    const result = runCheck(
      makeFixture(`${COMPLETE_CSS}\n.doc .magnitude-meter { color: var(--semantic-success); }\n`)
    )

    expect(result.status).not.toBe(0)
    expect(result.output).toContain('neutral')
  })

  it('rejects a missing identity derivative mapping', () => {
    const result = runCheck(
      makeFixture(COMPLETE_CSS.replace('--chart-8-border', '--outline-variant'))
    )

    expect(result.status).not.toBe(0)
    expect(result.output).toContain('--chart-8-border')
  })
})
