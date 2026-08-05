# Stage × Lane Process Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an accessible, document-only stage-by-lane process-flow table that supports 2–4 lanes, explicit empty/transition states, screen scrolling, and reliable A4 pagination.

**Architecture:** Build on native table semantics and existing Identity Chips with token-only CSS in `styles/doc.css`; do not add JavaScript or diagram rendering. Protect the public source contract with a dedicated Node checker and mutation tests, then verify computed layout and print/PDF behavior with Playwright against the built distribution.

**Tech Stack:** Semantic HTML tables, CSS custom properties and print media, Node.js ESM, Vitest, Playwright, deterministic bundle build.

## Global Constraints

- Stages are rows; lanes are columns.
- Support two through four lane columns plus the stage column.
- Scope every selector under `.doc`; do not add deck or `<crefle-chart>` rules.
- Add no JavaScript, dependency, automatic connector, or second item-chip API.
- Require `.process-flow-scroll > table.process-flow`, a non-empty caption, `scope="col"` lane headers, and `scope="row"` stage headers.
- Reuse `.identity-chip` inside `.process-flow-items`.
- Empty cells contain real `.process-flow-empty` text `—` with `aria-label="항목 없음"`.
- `data-transition="enter|exit"` requires real `.process-flow-transition` text `시작|종료`; CSS generated content is prohibited.
- Invalid transition values receive ordinary cell styling.
- Screen content scrolls inside the wrapper; the document itself must not overflow horizontally.
- Print resets width, repeats `<thead>`, prevents row splitting, wraps chip labels, and keeps transitions visible without backgrounds.
- Preserve the user's unrelated `README.md` and `skills/crefle-doc/SKILL.md` changes in the primary checkout.

---

### Task 1: Process Flow Contract Gate

**Files:**
- Create: `scripts/check-process-flow.mjs`
- Create: `scripts/check-process-flow.test.mjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: `styles/doc.css` and `examples/doc-minimal.html` under an optional root supplied as `process.argv[2]`.
- Produces: `npm run check:process-flow`, which is inactive before the first process-flow selector exists and enforces the full CSS contract once it does.

- [ ] **Step 1: Write failing checker mutation tests**

Create real temporary repositories by copying `styles/` and `examples/`, then execute the missing
checker with `execFileSync(process.execPath, [CHECKER, root])`. Add these initial cases:

```js
it('accepts the current repository contract', () => {
  expect(runCheck()).toMatchObject({ status: 0 })
})

it('rejects a process-flow selector outside .doc', () => {
  const root = makeFixture(COMPLETE_CSS + '\n.slide .process-flow { display:grid }')
  expect(runCheck(root).output).toContain('.doc')
})

it.each(['enter', 'exit'])(
  'rejects a missing %s transition selector', (transition) => {
    const root = makeFixture(COMPLETE_CSS.replace(transitionRule(transition), ''))
    expect(runCheck(root).output).toContain(transition)
  }
)

it('rejects generated transition text', () => {
  const root = makeFixture(COMPLETE_CSS +
    '\n.doc .process-flow-transition::before { content:"시작" }')
  expect(runCheck(root).output).toContain('generated content')
})

it('rejects absolute-positioned connectors', () => {
  const root = makeFixture(COMPLETE_CSS +
    '\n.doc .process-flow td::after { position:absolute }')
  expect(runCheck(root).output).toContain('connector')
})
```

`COMPLETE_CSS` must contain scoped wrapper/table/items/empty/transition selectors and both transition
rules. Each mutation names a real prohibited regression.

- [ ] **Step 2: Run the tests and confirm RED**

Run: `npm test -- scripts/check-process-flow.test.mjs`

Expected: FAIL because `scripts/check-process-flow.mjs` does not exist.

- [ ] **Step 3: Implement the minimal source checker**

Strip CSS comments, parse flat rule selector/body pairs, and identify selectors containing
`process-flow`. For every matching selector, require `.doc ` prefix. Once any process-flow selector
exists, require selectors for wrapper, table, items, empty, transition, enter, and exit.

Reject these bodies or selectors within the component:

```js
if (/\bcontent\s*:/.test(body))
  problems.push('process-flow 상태는 generated content 로 만들 수 없습니다.')
if (/\bposition\s*:\s*absolute\b/.test(body) || /::(?:before|after)/.test(selector))
  problems.push('process-flow 에 absolute connector 를 만들 수 없습니다.')
```

The example contract remains conditional until Task 3 so this first commit can be independently
green.

- [ ] **Step 4: Register and verify the gate**

Add to `package.json`:

```json
"check:process-flow": "node scripts/check-process-flow.mjs"
```

Insert it after `check:compact-bars` and before `check:dist` in the full `check` chain.

Run:

```bash
npm test -- scripts/check-process-flow.test.mjs
npm run check:process-flow
npm run typecheck
```

Expected: focused tests and typecheck pass.

- [ ] **Step 5: Commit**

```bash
git add package.json scripts/check-process-flow.mjs scripts/check-process-flow.test.mjs
git commit -m "test(doc): process flow 공개 계약 추가"
```

### Task 2: Responsive and Printable Process Flow Table

**Files:**
- Create: `tests/e2e/process-flow.spec.mjs`
- Modify: `styles/doc.css`
- Modify generated: `dist/crefle-doc/crefle-doc.css`
- Modify generated: `dist/crefle-doc/crefle-doc.lock.json`

**Interfaces:**
- Consumes: the approved table markup, existing `.identity-chip`, and `data-transition="enter|exit"`.
- Produces: responsive `.doc .process-flow-scroll`, `.process-flow`, `.process-flow-items`, `.process-flow-empty`, and `.process-flow-transition` behavior.

- [ ] **Step 1: Write failing screen-layout browser tests**

Load `examples/doc-minimal.html` and inject two-, three-, and four-lane tables. The four-lane fixture
uses long labels and a constrained wrapper; another row contains six Identity Chips. Assert:

```js
const columns = await page.locator('#four-lanes thead th').count()
expect(columns).toBe(5)

const scroll = await page.locator('#narrow-wrapper').evaluate((wrapper) => ({
  internalOverflow: wrapper.scrollWidth > wrapper.clientWidth,
  documentOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth
}))
expect(scroll).toEqual({ internalOverflow: true, documentOverflow: false })

const wraps = await page.locator('#multi-items .identity-chip').evaluateAll((chips) =>
  new Set(chips.map((chip) => chip.getBoundingClientRect().top)).size > 1
)
expect(wraps).toBe(true)
```

Use `getByRole('table', { name: '화면 요청 처리 흐름' })`, column headers, and row headers to verify
native table semantics. Assert the empty marker exposes `항목 없음` and visible `—`.

- [ ] **Step 2: Write failing transition and print tests**

Inject enter, exit, and invalid transition cells plus a 240-stage table. Assert computed
`borderBlockStartStyle` / `borderBlockEndStyle` are solid for valid values and absent for invalid.
Verify `시작` / `종료` text is visible.

Under print media assert:

```js
const print = await page.evaluate(() => ({
  wrapperOverflow: getComputedStyle(document.querySelector('.process-flow-scroll')).overflowX,
  tableLayout: getComputedStyle(document.querySelector('.process-flow')).tableLayout,
  theadDisplay: getComputedStyle(document.querySelector('.process-flow thead')).display,
  rowBreak: getComputedStyle(document.querySelector('.process-flow tbody tr')).breakInside,
  chipWhiteSpace: getComputedStyle(document.querySelector('.process-flow .identity-chip')).whiteSpace
}))
expect(print).toEqual({
  wrapperOverflow: 'visible', tableLayout: 'fixed', theadDisplay: 'table-header-group',
  rowBreak: 'avoid', chipWhiteSpace: 'normal'
})
```

Generate a PDF with `printBackground: false`; use `pdfinfo` to prove it has multiple pages and
`pdftotext` to prove the lane header appears more than once. Assert no console errors, network
requests, row split, or horizontal page overflow.

- [ ] **Step 3: Run the focused E2E and confirm RED**

Run: `npx playwright test tests/e2e/process-flow.spec.mjs`

Expected: FAIL because process-flow layout, transition, responsive, and print rules do not exist.

- [ ] **Step 4: Implement minimal screen CSS**

Add `.doc`-scoped rules after the compact bars:

```css
.doc .process-flow-scroll {
  max-width: 100%;
  overflow-x: auto;
}
.doc .process-flow {
  width: 100%;
  min-width: max-content;
}
.doc .process-flow tbody th {
  min-width: var(--grid-min-3);
  background: var(--surface-container-low);
}
.doc .process-flow tbody th strong,
.doc .process-flow tbody th small {
  display: block;
}
.doc .process-flow-items {
  display: flex;
  flex-wrap: wrap;
  gap: var(--s-1);
}
.doc .process-flow-empty,
.doc .process-flow-transition {
  color: var(--on-surface-muted);
  font-size: var(--text-small);
}
.doc .process-flow td[data-transition='enter'] {
  border-block-start: 2px solid var(--on-surface);
}
.doc .process-flow td[data-transition='exit'] {
  border-block-end: 2px solid var(--on-surface);
}
```

Use neutral tokens only. Do not add pseudo-elements or positioning.

- [ ] **Step 5: Implement print CSS**

Inside `styles/doc.css` print media add:

```css
.doc .process-flow-scroll { overflow: visible; }
.doc .process-flow { width: 100%; min-width: 0; table-layout: fixed; }
.doc .process-flow thead { display: table-header-group; }
.doc .process-flow tbody tr { break-inside: avoid; }
.doc .process-flow .identity-chip { max-width: 100%; white-space: normal; }
.doc .process-flow,
.doc .process-flow td,
.doc .process-flow th { print-color-adjust: exact; }
```

- [ ] **Step 6: Build and verify GREEN**

Run:

```bash
npm run build
npx playwright test tests/e2e/process-flow.spec.mjs
npm run lint:tokens
npm run check:process-flow
npm run check:dist
git diff --check
```

Expected: focused E2E and all static gates pass.

- [ ] **Step 7: Commit**

```bash
git add tests/e2e/process-flow.spec.mjs styles/doc.css \
  dist/crefle-doc/crefle-doc.css dist/crefle-doc/crefle-doc.lock.json
git commit -m "feat(doc): stage·lane process flow 추가"
```

### Task 3: Canonical Authoring Contract

**Files:**
- Modify: `skills/crefle-doc/references/authoring.md`
- Modify: `examples/doc-minimal.html`
- Modify: `scripts/check-process-flow.mjs`
- Modify: `scripts/check-process-flow.test.mjs`

**Interfaces:**
- Consumes: the Process Flow CSS API and Identity Chip API.
- Produces: a canonical three-lane example and strict machine-verifiable markup contract.

- [ ] **Step 1: Add failing example mutation tests**

Create a fixture helper that replaces the canonical process-flow section, then test these controlled
mutations:

```js
it('rejects a table without a non-empty caption', () => {
  const root = canonicalFixture((html) => html.replace('<caption>화면 요청 처리 흐름</caption>', '<caption></caption>'))
  expect(runCheck(root).output).toContain('caption')
})

it.each([1, 5])('rejects %s lane headers', (laneCount) => {
  const root = fixtureWithLaneCount(laneCount)
  expect(runCheck(root).output).toContain('2..4 lanes')
})

it('rejects a stage header without scope=row', () => {
  const root = canonicalFixture((html) => html.replace('scope="row"', ''))
  expect(runCheck(root).output).toContain('scope="row"')
})

it('rejects an empty marker without accessible text', () => {
  const root = canonicalFixture((html) => html.replace('aria-label="항목 없음"', ''))
  expect(runCheck(root).output).toContain('항목 없음')
})

it.each([['enter', '시작'], ['exit', '종료']])(
  'rejects %s without matching transition text', (value, text) => {
    const root = canonicalFixture((html) => html.replace(`>${text}<`, '>전환<'))
    expect(runCheck(root).output).toContain(value)
  }
)
```

Also mutate away `.process-flow-scroll > table.process-flow`, one `scope="col"`,
`.process-flow-items`, and `.identity-chip` reuse. Assert non-zero exit and a targeted error.

- [ ] **Step 2: Run the focused suite and confirm RED**

Run: `npm test -- scripts/check-process-flow.test.mjs`

Expected: FAIL because strict example validation and canonical markup are absent.

- [ ] **Step 3: Add authoring guidance and canonical example**

Add the approved guidance and a compact three-lane, three-stage example. It must include a caption,
column/row scopes, existing Identity Chips, an accessible em dash, enter/start, and exit/end:

```html
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
    </tbody>
  </table>
</div>
```

Add later rows containing a POP chip and an `exit` / `종료` transition.

- [ ] **Step 4: Implement strict structural checking**

Parse the canonical wrapper and table block from example HTML. Count `scope="col"` headers minus the
stage header and require 2–4 lanes. Require a non-empty caption, every body row to start with
`scope="row"`, item cells to reuse Identity Chips, the exact accessible empty marker, and both valid
transition/text pairs. Do not test human guidance prose.

- [ ] **Step 5: Verify and commit**

Run:

```bash
npm test -- scripts/check-process-flow.test.mjs
npm run check:process-flow
npm run check:skill
npm run typecheck
npm run lint:tokens
git diff --check
```

Expected: all focused and static gates pass.

```bash
git add skills/crefle-doc/references/authoring.md examples/doc-minimal.html \
  scripts/check-process-flow.mjs scripts/check-process-flow.test.mjs
git commit -m "docs(skill): process flow 저작 계약 추가"
```

### Task 4: Full Verification, Review, PR, and Cleanup

**Files:**
- Verify only: all changed source, generated, documentation, and test files.

**Interfaces:**
- Consumes: a clean `feat/process-flow` branch with Tasks 1–3 committed.
- Produces: a reviewed, green, Squash-merged PR closing issue #8 and a cleaned local worktree/branch.

- [ ] **Step 1: Run the complete repository gate**

Run:

```bash
npm run check
git diff --check origin/main...HEAD
git status --short
```

Expected: Vitest, TypeScript, token, build/dist, skill, process-flow, and all Playwright gates pass;
the branch worktree is clean.

- [ ] **Step 2: Review the complete diff**

Apply CREFLE review criteria in order: correctness, security, tests, conventions/readability. Confirm
no secret, dependency, JavaScript, chart/deck change, raw color, generated content, absolute
connector, or unrelated edit. Fix every Blocker/Major before proceeding.

- [ ] **Step 3: Push and create the PR**

```bash
git push -u origin feat/process-flow
gh pr create --base main --head feat/process-flow \
  --title "feat(doc): stage·lane process flow 추가" \
  --body-file /tmp/design-system-v2-doc-issue8-pr.md
```

The body summarizes semantic table, responsive/print behavior, and test counts, ending with
`Closes #8`.

- [ ] **Step 4: Enforce review and merge gates**

Wait for CI. Merge only with Blocker/Major zero, green checks, `MERGEABLE`, `CLEAN`, `main` base, and
non-draft status. Post the standard Korean review comment and run:

```bash
gh pr merge <PR_NUMBER> --repo CREFLEINC/design-system-v2-doc --squash --delete-branch
```

- [ ] **Step 5: Verify closure and clean owned local state**

Verify the PR merge commit and closed issue #8. From the primary checkout, preserve user changes in
`README.md` and `skills/crefle-doc/SKILL.md`; remove only `.worktrees/process-flow`, prune/fetch,
fast-forward `main`, and delete `feat/process-flow`. Run `gh issue list --assignee @me --state open`
to confirm no assigned open issues remain, then mark the overall goal complete.
