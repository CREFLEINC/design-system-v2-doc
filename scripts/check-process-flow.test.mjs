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

const CANONICAL_EXAMPLE = `
<div class="process-flow-scroll">
  <table class="process-flow">
    <caption>화면 요청 처리 흐름</caption>
    <thead><tr><th scope="col">단계</th><th scope="col">WEB</th><th scope="col">POP</th><th scope="col">API</th></tr></thead>
    <tbody>
      <tr>
        <th scope="row"><strong>접수</strong><small>요청 등록</small></th>
        <td data-transition="enter"><span class="process-flow-transition">시작</span><div class="process-flow-items"><span class="identity-chip" data-identity="2" data-confidence="confirmed">WEB-01</span></div></td>
        <td><span class="process-flow-empty" aria-label="항목 없음">—</span></td>
        <td><div class="process-flow-items"><span class="identity-chip" data-identity="5" data-confidence="estimated">API-01</span></div></td>
      </tr>
      <tr>
        <th scope="row"><strong>종료</strong></th>
        <td data-transition="exit"><span class="process-flow-transition">종료</span><div class="process-flow-items"><span class="identity-chip" data-identity="2" data-confidence="confirmed">WEB-02</span></div></td>
        <td><span class="process-flow-empty" aria-label="항목 없음">—</span></td>
        <td><span class="process-flow-empty" aria-label="항목 없음">—</span></td>
      </tr>
    </tbody>
  </table>
</div>
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

/** @param {string} root @param {string} example */
function setProcessFlowExample(root, example = CANONICAL_EXAMPLE) {
  const file = join(root, 'examples', 'doc-minimal.html')
  const source = readFileSync(file, 'utf8')
  const currentExample = /<h3>프로세스 흐름 — 단계 × 레인<\/h3>[\s\S]*?(?=<h3>차트<\/h3>)/
  writeFileSync(
    file,
    currentExample.test(source)
      ? source.replace(currentExample, `${example.trim()}\n\n`)
      : source.replace('</body>', `${example}\n</body>`)
  )
}

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) rmSync(root, { recursive: true, force: true })
})

describe('process flow public contract', () => {
  it('accepts the current repository contract', () => {
    expect(runCheck()).toMatchObject({ status: 0 })
  })

  it('accepts a complete process flow CSS contract', () => {
    expect(runCheck(makeFixture())).toMatchObject({ status: 0 })
  })

  it('rejects a process-flow selector outside .doc', () => {
    const result = runCheck(makeFixture('\n.slide .process-flow { display: grid; }'))

    expect(result.status).not.toBe(0)
    expect(result.output).toContain('.doc')
  })

  it.each(['enter', 'exit'])('rejects a missing %s transition selector', (transition) => {
    const rule = new RegExp(
      `\\.doc \\.process-flow td\\[data-transition='${transition}'\\] \\{[^}]+\\}`
    )
    const root = makeFixture()
    const file = join(root, 'styles', 'doc.css')
    writeFileSync(file, readFileSync(file, 'utf8').replace(rule, ''))
    const result = runCheck(root)

    expect(result.status).not.toBe(0)
    expect(result.output).toContain(transition)
  })

  it('rejects generated transition text', () => {
    const result = runCheck(
      makeFixture('\n.doc .process-flow-transition::before { content: "시작"; }')
    )

    expect(result.status).not.toBe(0)
    expect(result.output).toContain('generated content')
  })

  it('rejects absolute-positioned connectors', () => {
    const result = runCheck(
      makeFixture('\n.doc .process-flow td::after { position: absolute; }')
    )

    expect(result.status).not.toBe(0)
    expect(result.output).toContain('connector')
  })

  it('rejects a table without a non-empty caption', () => {
    const root = makeFixture()
    setProcessFlowExample(root, CANONICAL_EXAMPLE.replace('화면 요청 처리 흐름', ''))
    const result = runCheck(root)

    expect(result.status).not.toBe(0)
    expect(result.output).toContain('caption')
  })

  it.each([
    ['1', CANONICAL_EXAMPLE.replace('<th scope="col">POP</th><th scope="col">API</th>', '')],
    ['5', CANONICAL_EXAMPLE.replace('<th scope="col">API</th>', '<th scope="col">API</th><th scope="col">DATA</th><th scope="col">ERP</th>')]
  ])('rejects %s lane headers', (_count, example) => {
    const root = makeFixture()
    setProcessFlowExample(root, example)
    const result = runCheck(root)

    expect(result.status).not.toBe(0)
    expect(result.output).toContain('2..4 lanes')
  })

  it('rejects a stage header without scope="row"', () => {
    const root = makeFixture()
    setProcessFlowExample(root, CANONICAL_EXAMPLE.replace('scope="row"', ''))
    const result = runCheck(root)

    expect(result.status).not.toBe(0)
    expect(result.output).toContain('scope="row"')
  })

  it('rejects a lane header without scope="col"', () => {
    const root = makeFixture()
    setProcessFlowExample(root, CANONICAL_EXAMPLE.replace('<th scope="col">WEB</th>', '<th>WEB</th>'))
    const result = runCheck(root)

    expect(result.status).not.toBe(0)
    expect(result.output).toContain('scope="col"')
  })

  it('rejects an empty marker without accessible text', () => {
    const root = makeFixture()
    setProcessFlowExample(root, CANONICAL_EXAMPLE.replaceAll(' aria-label="항목 없음"', ''))
    const result = runCheck(root)

    expect(result.status).not.toBe(0)
    expect(result.output).toContain('항목 없음')
  })

  it.each([['enter', '시작'], ['exit', '종료']])(
    'rejects %s without matching transition text',
    (value, text) => {
      const root = makeFixture()
      setProcessFlowExample(
        root,
        CANONICAL_EXAMPLE.replace(`class="process-flow-transition">${text}<`, 'class="process-flow-transition">전환<')
      )
      const result = runCheck(root)

      expect(result.status).not.toBe(0)
      expect(result.output).toContain(value)
    }
  )

  it('rejects a process flow that does not reuse identity-chip', () => {
    const root = makeFixture()
    setProcessFlowExample(root, CANONICAL_EXAMPLE.replaceAll('identity-chip', 'item-chip'))
    const result = runCheck(root)

    expect(result.status).not.toBe(0)
    expect(result.output).toContain('identity-chip')
  })

  it('rejects a non-direct wrapper and table relationship', () => {
    const root = makeFixture()
    setProcessFlowExample(root, CANONICAL_EXAMPLE.replace('<table class="process-flow">', '<section><table class="process-flow">'))
    const result = runCheck(root)

    expect(result.status).not.toBe(0)
    expect(result.output).toContain('direct child')
  })
})
