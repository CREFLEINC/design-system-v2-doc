import { execFileSync } from 'node:child_process'
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)))
const CHECKER = join(ROOT, 'scripts', 'check-process-flow.mjs')
/** @type {string[]} */
const temporaryRoots = []

const COMPLETE_CSS = `
.doc .process-flow-scroll { overflow-x: auto; }
.doc .process-flow { width: 100%; }
.doc .process-flow-items { display: flex; }
.doc .process-flow-empty { color: var(--on-surface-muted); }
.doc .process-flow-transition { color: var(--on-surface-muted); }
.doc .process-flow td[data-transition='enter'] { border-block-start: 2px solid var(--on-surface); }
.doc .process-flow td[data-transition='exit'] { border-block-end: 2px solid var(--on-surface); }
`

function makeFixture(css = '') {
  const root = mkdtempSync(join(tmpdir(), 'crefle-process-flow-'))
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

describe('process flow public contract', () => {
  it('accepts the current repository contract', () => {
    expect(runCheck()).toMatchObject({ status: 0 })
  })

  it('accepts a complete process flow CSS contract', () => {
    expect(runCheck(makeFixture(COMPLETE_CSS))).toMatchObject({ status: 0 })
  })

  it('rejects a process-flow selector outside .doc', () => {
    const result = runCheck(makeFixture(`${COMPLETE_CSS}\n.slide .process-flow { display: grid; }`))

    expect(result.status).not.toBe(0)
    expect(result.output).toContain('.doc')
  })

  it.each(['enter', 'exit'])('rejects a missing %s transition selector', (transition) => {
    const rule = new RegExp(
      `\\.doc \\.process-flow td\\[data-transition='${transition}'\\] \\{[^}]+\\}`
    )
    const result = runCheck(makeFixture(COMPLETE_CSS.replace(rule, '')))

    expect(result.status).not.toBe(0)
    expect(result.output).toContain(transition)
  })

  it('rejects generated transition text', () => {
    const result = runCheck(
      makeFixture(`${COMPLETE_CSS}\n.doc .process-flow-transition::before { content: "시작"; }`)
    )

    expect(result.status).not.toBe(0)
    expect(result.output).toContain('generated content')
  })

  it('rejects absolute-positioned connectors', () => {
    const result = runCheck(
      makeFixture(`${COMPLETE_CSS}\n.doc .process-flow td::after { position: absolute; }`)
    )

    expect(result.status).not.toBe(0)
    expect(result.output).toContain('connector')
  })
})
