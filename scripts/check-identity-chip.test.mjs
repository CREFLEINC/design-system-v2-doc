import { execFileSync } from 'node:child_process'
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)))
const CHECKER = join(ROOT, 'scripts', 'check-identity-chip.mjs')
const temporaryRoots = []

function makeFixture() {
  const root = mkdtempSync(join(tmpdir(), 'crefle-identity-chip-'))
  temporaryRoots.push(root)
  cpSync(join(ROOT, 'styles'), join(root, 'styles'), { recursive: true })
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

describe('identity chip token contract', () => {
  it('accepts all sixteen exact chart derivative tokens', () => {
    expect(runCheck()).toMatchObject({ status: 0 })
  })

  it('rejects a missing derivative token', () => {
    const root = makeFixture()
    const file = join(root, 'styles', 'doc-tokens.css')
    const source = readFileSync(file, 'utf8')
    writeFileSync(
      file,
      source.replace(
        '  --chart-8-border: color-mix(in srgb, var(--chart-8) 55%, var(--on-surface));\n',
        ''
      )
    )

    const result = runCheck(root)

    expect(result.status).not.toBe(0)
    expect(result.output).toContain('--chart-8-border')
  })

  it.each([
    ['container', '14%', '15%'],
    ['border', '55%', '56%']
  ])('rejects a changed %s mix ratio', (_kind, expected, replacement) => {
    const root = makeFixture()
    const file = join(root, 'styles', 'doc-tokens.css')
    const source = readFileSync(file, 'utf8')
    writeFileSync(file, source.replace(expected, replacement))

    const result = runCheck(root)

    expect(result.status).not.toBe(0)
    expect(result.output).toContain('혼합 비율')
  })

  it('rejects identity-chip selectors outside the .doc scope', () => {
    const root = makeFixture()
    const file = join(root, 'styles', 'doc.css')
    writeFileSync(file, readFileSync(file, 'utf8') + '\n.slide .identity-chip { display: inline-flex; }\n')

    const result = runCheck(root)

    expect(result.status).not.toBe(0)
    expect(result.output).toContain('.doc')
  })
})
