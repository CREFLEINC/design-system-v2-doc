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

const CANONICAL_EXAMPLE = `
<label for="blocked-screens">차단 화면: 8 / 12</label>
<meter id="blocked-screens" class="magnitude-meter" min="0" max="12" value="8">8 / 12</meter>
<div class="confidence-bar" data-identity="2" role="img"
     aria-label="웹: 확정 60%, 추정 25%, 미확인 15%">
  <span class="confidence-segment" data-confidence="confirmed" style="--segment-size: 60"></span>
  <span class="confidence-segment" data-confidence="estimated" style="--segment-size: 25"></span>
  <span class="confidence-segment" data-confidence="unknown" style="--segment-size: 15"></span>
</div>
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

/** @param {string} root @param {string} example */
function setCompactExample(root, example = CANONICAL_EXAMPLE) {
  const file = join(root, 'examples', 'doc-minimal.html')
  const source = readFileSync(file, 'utf8')
  writeFileSync(
    file,
    source.replace(/<h3>경량 크기 미터<\/h3>[\s\S]*?<\/div>/, example)
  )
}

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) rmSync(root, { recursive: true, force: true })
})

describe('compact bar public contract', () => {
  it('accepts the repository compact bar contract', () => {
    expect(runCheck()).toMatchObject({ status: 0 })
  })

  it('accepts a complete component contract', () => {
    expect(runCheck(makeFixture())).toMatchObject({ status: 0 })
  })

  it('rejects a compact bar selector outside .doc', () => {
    const result = runCheck(makeFixture('\n.slide .confidence-bar { display: flex; }\n'))

    expect(result.status).not.toBe(0)
    expect(result.output).toContain('.doc')
  })

  it.each(['confirmed', 'estimated', 'unknown'])(
    'rejects a missing %s confidence selector',
    (confidence) => {
      const rule = new RegExp(
        `\\.doc \\.confidence-segment\\[data-confidence='${confidence}'\\] \\{[^}]+\\}`
      )
      const root = makeFixture()
      const file = join(root, 'styles', 'doc.css')
      writeFileSync(file, readFileSync(file, 'utf8').replace(rule, ''))
      const result = runCheck(root)

      expect(result.status).not.toBe(0)
      expect(result.output).toContain(confidence)
    }
  )

  it('rejects semantic color use in magnitude meter rules', () => {
    const result = runCheck(
      makeFixture('\n.doc .magnitude-meter { color: var(--semantic-success); }\n')
    )

    expect(result.status).not.toBe(0)
    expect(result.output).toContain('neutral')
  })

  it('rejects a missing identity derivative mapping', () => {
    const root = makeFixture()
    const file = join(root, 'styles', 'doc.css')
    writeFileSync(file, readFileSync(file, 'utf8').replaceAll('--chart-8-border', '--outline-variant'))
    const mutatedResult = runCheck(root)

    expect(mutatedResult.status).not.toBe(0)
    expect(mutatedResult.output).toContain('--chart-8-border')
  })

  it.each(['min="0"', 'max="12"', 'value="8"'])(
    'rejects a magnitude example without %s',
    (attribute) => {
      const root = makeFixture()
      setCompactExample(root, CANONICAL_EXAMPLE.replace(attribute, ''))
      const result = runCheck(root)

      expect(result.status).not.toBe(0)
      expect(result.output).toContain(attribute.split('=')[0])
    }
  )

  it('rejects a magnitude example without a label association', () => {
    const root = makeFixture()
    setCompactExample(root, CANONICAL_EXAMPLE.replace('for="blocked-screens"', ''))
    const result = runCheck(root)

    expect(result.status).not.toBe(0)
    expect(result.output).toContain('label')
  })

  it('rejects a confidence example without an accessible summary', () => {
    const root = makeFixture()
    setCompactExample(root, CANONICAL_EXAMPLE.replace(/\s+aria-label="[^"]+"/, ''))
    const result = runCheck(root)

    expect(result.status).not.toBe(0)
    expect(result.output).toContain('accessible summary')
  })

  it('rejects a confidence example without the unknown state', () => {
    const root = makeFixture()
    setCompactExample(root, CANONICAL_EXAMPLE.replace('data-confidence="unknown"', 'data-confidence="estimated"'))
    const result = runCheck(root)

    expect(result.status).not.toBe(0)
    expect(result.output).toContain('unknown')
  })

  it('rejects a confidence segment without --segment-size', () => {
    const root = makeFixture()
    setCompactExample(root, CANONICAL_EXAMPLE.replace('style="--segment-size: 15"', ''))
    const result = runCheck(root)

    expect(result.status).not.toBe(0)
    expect(result.output).toContain('--segment-size')
  })
})
