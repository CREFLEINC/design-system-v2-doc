# Magnitude Meter & Confidence Bar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add lightweight, accessible `.doc` magnitude and confidence bars that remain legible across themes, grayscale, and print without changing `<crefle-chart>`.

**Architecture:** Implement both components as author-owned semantic HTML and token-only CSS in `styles/doc.css`. Protect the public API with a focused Node contract checker plus Vitest mutation tests, and protect computed screen/print behavior with Playwright against the built distribution.

**Tech Stack:** HTML, CSS custom properties and pseudo-elements, Node.js ESM, Vitest, Playwright, existing deterministic build scripts.

## Global Constraints

- Support both components only inside `.doc`; do not add deck or `<crefle-chart>` rules.
- Add no runtime JavaScript or dependencies.
- `.magnitude-meter` is a native `<meter>` with `min`, `max`, `value`, accessible naming, and nearby or fallback text.
- Magnitude uses only neutral surface/ink tokens; never identity, brand, or semantic colors.
- `.confidence-bar` accepts `data-identity="1"` through `"8"` and reuses `--chart-N-container` / `--chart-N-border`.
- `.confidence-segment` accepts `data-confidence="confirmed|estimated|unknown"` and a non-negative unitless `--segment-size` flex weight.
- Confidence is encoded as solid fill/border, diagonal hatch plus double border, or dashed inset outline, never three hues or opacity alone.
- Invalid identity or confidence must fall back to neutral styling and must not look confirmed.
- Accessible summaries and textual values are mandatory authoring requirements.
- Light, dark, grayscale, background-free print, high-density layout, and offline rendering must be verified.

---

### Task 1: Public Contract Gate

**Files:**
- Create: `scripts/check-compact-bars.mjs`
- Create: `scripts/check-compact-bars.test.mjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: `styles/doc.css`, `examples/doc-minimal.html`, and the eight existing chart derivative token pairs.
- Produces: `npm run check:compact-bars`, accepting an optional repository root as `process.argv[2]` for mutation fixtures.

- [ ] **Step 1: Write failing contract tests**

Create temporary fixtures by copying `styles/` and `examples/`, then invoke the checker with
`execFileSync(process.execPath, [CHECKER, root])`. Include these literal cases:

```js
it('accepts the repository compact bar contract', () => {
  expect(runCheck()).toMatchObject({ status: 0 })
})

it('rejects a compact bar selector outside .doc', () => {
  const root = makeFixture()
  appendFileSync(join(root, 'styles/doc.css'), '\n.slide .confidence-bar { display:flex }\n')
  expect(runCheck(root).output).toContain('.doc')
})

it.each(['confirmed', 'estimated', 'unknown'])(
  'rejects a missing %s confidence selector', (confidence) => {
    const root = makeFixture()
    removeConfidenceRule(root, confidence)
    expect(runCheck(root).output).toContain(confidence)
  }
)

it('rejects semantic color use in magnitude meter rules', () => {
  const root = makeFixture()
  appendFileSync(join(root, 'styles/doc.css'),
    '\n.doc .magnitude-meter { color: var(--semantic-success) }\n')
  expect(runCheck(root).output).toContain('neutral')
})
```

- [ ] **Step 2: Run tests and confirm the missing-checker failure**

Run: `npm test -- scripts/check-compact-bars.test.mjs`

Expected: FAIL because `scripts/check-compact-bars.mjs` does not exist.

- [ ] **Step 3: Implement the minimal checker**

Read CSS and example source from the supplied root. Strip CSS comments before scanning selectors.
Require `.doc` scope for every selector containing `magnitude-meter`, `confidence-bar`, or
`confidence-segment`. Require the eight exact identity mappings and the three confidence selectors.
Extract each magnitude rule block and reject `--primary`, `--chart-`, and `--semantic-` references.

```js
const ROOT = resolve(process.argv[2] ?? DEFAULT_ROOT)
const css = readFileSync(join(ROOT, 'styles/doc.css'), 'utf8')
const example = readFileSync(join(ROOT, 'examples/doc-minimal.html'), 'utf8')
const problems = []

for (let slot = 1; slot <= 8; slot++) {
  for (const token of [`--chart-${slot}-container`, `--chart-${slot}-border`])
    if (!css.includes(token)) problems.push(`data-identity="${slot}" must reuse ${token}`)
}
```

The initial example checks may report missing markup until Task 4; keep them behind checks for an
existing `.magnitude-meter` example so Tasks 1–3 can independently pass.

- [ ] **Step 4: Register and run the gate**

Add:

```json
"check:compact-bars": "node scripts/check-compact-bars.mjs"
```

Insert it after `check:identity-chip` and before `check:dist` in `npm run check`.

Run:

```bash
npm test -- scripts/check-compact-bars.test.mjs
npm run check:compact-bars
```

Expected: all focused tests pass and the checker prints a compact-bar contract success summary.

- [ ] **Step 5: Commit**

```bash
git add package.json scripts/check-compact-bars.mjs scripts/check-compact-bars.test.mjs
git commit -m "test(doc): compact bar 공개 계약 추가"
```

### Task 2: Neutral Magnitude Meter

**Files:**
- Create: `tests/e2e/magnitude-meter.spec.mjs`
- Modify: `styles/doc.css`
- Modify generated: `dist/crefle-doc/crefle-doc.css`
- Modify generated: `dist/crefle-doc/crefle-doc.lock.json`

**Interfaces:**
- Consumes: native `<meter min max value>` and neutral tokens from `doc-tokens.css`.
- Produces: `.doc meter.magnitude-meter` with Chromium and Firefox pseudo-element styling.

- [ ] **Step 1: Write failing browser tests**

Load `examples/doc-minimal.html`, inject labeled meters for `0/12`, `8/12`, `12/12`, an
`aria-label` case, and 500 meters. Assert:

```js
await expect(page.locator('#meter-eight')).toHaveJSProperty('value', 8)
await expect(page.locator('#meter-eight')).toHaveJSProperty('max', 12)
await expect(page.getByRole('meter', { name: '차단 화면' })).toBeVisible()

const widthRatio = await page.locator('#meter-eight').evaluate((meter) => {
  const value = getComputedStyle(meter, '::-webkit-meter-optimum-value')
  const track = getComputedStyle(meter, '::-webkit-meter-bar')
  return { valueBackground: value.backgroundColor, trackBackground: track.backgroundColor }
})
expect(widthRatio.valueBackground).not.toBe(widthRatio.trackBackground)
```

Also assert no horizontal overflow, no console/network failures, print media retains track/value
borders, and `page.pdf()` returns bytes.

- [ ] **Step 2: Run the focused E2E test and confirm RED**

Run: `npx playwright test tests/e2e/magnitude-meter.spec.mjs`

Expected: FAIL because the native meter does not yet have the compact dimensions, neutral fill, or
print borders.

- [ ] **Step 3: Implement token-only meter CSS**

Add `.doc`-scoped base and engine pseudo-elements:

```css
.doc .magnitude-meter {
  display: block;
  width: 100%;
  height: var(--s-2);
  border: 0;
  background: none;
  break-inside: avoid;
}
.doc .magnitude-meter::-webkit-meter-bar {
  border: 1px solid var(--outline-variant);
  border-radius: var(--radius-pill);
  background: var(--surface-container);
}
.doc .magnitude-meter::-webkit-meter-optimum-value {
  border-right: 1px solid var(--on-surface-muted);
  border-radius: var(--radius-pill);
  background: color-mix(in srgb, var(--on-surface-muted) 55%, var(--surface));
}
```

Add corresponding `::-moz-meter-bar`. In `@media print`, retain neutral borders and use
`print-color-adjust: exact` as enhancement.

- [ ] **Step 4: Build and verify GREEN**

Run:

```bash
npm run build
npx playwright test tests/e2e/magnitude-meter.spec.mjs
npm run lint:tokens
npm run check:compact-bars
npm run check:dist
```

Expected: focused E2E and all static gates pass.

- [ ] **Step 5: Commit**

```bash
git add tests/e2e/magnitude-meter.spec.mjs styles/doc.css \
  dist/crefle-doc/crefle-doc.css dist/crefle-doc/crefle-doc.lock.json
git commit -m "feat(doc): neutral magnitude meter 추가"
```

### Task 3: Identity-Preserving Confidence Bar

**Files:**
- Create: `tests/e2e/confidence-bar.spec.mjs`
- Modify: `styles/doc.css`
- Modify generated: `dist/crefle-doc/crefle-doc.css`
- Modify generated: `dist/crefle-doc/crefle-doc.lock.json`

**Interfaces:**
- Consumes: `data-identity="1..8"`, `data-confidence="confirmed|estimated|unknown"`, and inline unitless `--segment-size`.
- Produces: `.doc .confidence-bar` and `.doc .confidence-segment` with proportional flex layout and three texture states.

- [ ] **Step 1: Write failing browser tests**

Inject bars covering eight identities, all confidence states, a `6/2.5/1.5` non-100 total, invalid
identity/confidence, dark theme, and 500 dense bars. Use explicit `role="img" aria-label="…"`.

Assert:

```js
const widths = await page.locator('#relative .confidence-segment').evaluateAll(
  (segments) => segments.map((segment) => segment.getBoundingClientRect().width)
)
expect(widths[0] / widths[1]).toBeCloseTo(6 / 2.5, 1)
expect(widths[1] / widths[2]).toBeCloseTo(2.5 / 1.5, 1)

const treatments = await page.locator('#states .confidence-segment').evaluateAll((segments) =>
  segments.map((segment) => {
    const style = getComputedStyle(segment)
    return { backgroundImage: style.backgroundImage, borderStyle: style.borderStyle }
  })
)
expect(treatments[0].borderStyle).toBe('solid')
expect(treatments[1].backgroundImage).toContain('repeating-linear-gradient')
expect(treatments[1].borderStyle).toBe('double')
expect(treatments[2].borderStyle).toBe('dashed')
```

Also verify unique identity computed colors, invalid values differ from confirmed, print and grayscale
retain the three treatments, accessibility names resolve, dense bars do not overflow, and PDF output
succeeds without console/network failures.

- [ ] **Step 2: Run the focused E2E test and confirm RED**

Run: `npx playwright test tests/e2e/confidence-bar.spec.mjs`

Expected: FAIL because confidence bar layout and visual treatments do not exist.

- [ ] **Step 3: Implement the confidence bar CSS**

Add a neutral default and explicit identity mappings:

```css
.doc .confidence-bar {
  --confidence-container: var(--surface-container-low);
  --confidence-border: var(--outline-variant);
  display: flex;
  width: 100%;
  height: var(--s-4);
  overflow: hidden;
  border-radius: var(--radius-sm);
  background: var(--surface-container);
  break-inside: avoid;
}
.doc .confidence-segment {
  flex: var(--segment-size, 0) 1 0;
  min-width: 0;
  border: 1px none var(--outline-variant);
  box-shadow: inset 0 0 0 1px var(--outline-variant);
}
.doc .confidence-segment[data-confidence='confirmed'] {
  border-style: solid;
  border-color: var(--confidence-border);
  background: var(--confidence-container);
  box-shadow: none;
}
```

Map all eight identities to the existing derivative token pairs. Add a diagonal neutral
`repeating-linear-gradient` plus double border for estimated and a transparent/surface fill with
dashed inset border for unknown. Keep invalid defaults neutral. Separate adjacent segments with a
surface-colored edge.

- [ ] **Step 4: Build and verify GREEN**

Run:

```bash
npm run build
npx playwright test tests/e2e/confidence-bar.spec.mjs
npm run lint:tokens
npm run check:compact-bars
npm run check:dist
```

Expected: focused E2E and all static gates pass.

- [ ] **Step 5: Commit**

```bash
git add tests/e2e/confidence-bar.spec.mjs styles/doc.css \
  dist/crefle-doc/crefle-doc.css dist/crefle-doc/crefle-doc.lock.json
git commit -m "feat(doc): confidence segment bar 추가"
```

### Task 4: Authoring Guidance and Executable Examples

**Files:**
- Modify: `skills/crefle-doc/references/authoring.md`
- Modify: `examples/doc-minimal.html`
- Modify: `scripts/check-compact-bars.mjs`
- Modify: `scripts/check-compact-bars.test.mjs`

**Interfaces:**
- Consumes: the two public HTML/CSS APIs from Tasks 2 and 3.
- Produces: canonical examples and a source gate for machine-verifiable markup contracts.

- [ ] **Step 1: Add failing example mutation tests**

Require controlled mutations to fail when:

```js
it.each(['min="0"', 'max="12"', 'value="8"'])(
  'rejects magnitude example without %s', (attribute) => {
    const root = makeFixture()
    mutateExample(root, (html) => html.replace(attribute, ''))
    expect(runCheck(root).output).toContain(attribute.split('=')[0])
  }
)

it('rejects a confidence example without an accessible summary', () => {
  const root = makeFixture()
  mutateExample(root, (html) => html.replace(/ aria-label="[^"]+"/, ''))
  expect(runCheck(root).output).toContain('accessible summary')
})

it('rejects a confidence example without unknown state', () => {
  const root = makeFixture()
  mutateExample(root, (html) => html.replace('data-confidence="unknown"', 'data-confidence="estimated"'))
  expect(runCheck(root).output).toContain('unknown')
})

it('rejects a segment without --segment-size', () => {
  const root = makeFixture()
  mutateExample(root, (html) => html.replace('style="--segment-size: 15"', ''))
  expect(runCheck(root).output).toContain('--segment-size')
})
```

Do not assert exact human prose. Test only executable HTML/API artifacts.

- [ ] **Step 2: Run tests and confirm RED**

Run: `npm test -- scripts/check-compact-bars.test.mjs`

Expected: FAIL because the canonical examples and strict example checks are absent.

- [ ] **Step 3: Add guidance and canonical examples**

Document purpose, required attributes, accessible naming, textual values, three confidence states,
identity legend requirements, invalid inputs, and prohibited semantic/arbitrary colors. Add to the
minimal example:

```html
<label for="blocked-screens">차단 화면: 8 / 12</label>
<meter id="blocked-screens" class="magnitude-meter" min="0" max="12" value="8">8 / 12</meter>

<div class="confidence-bar" data-identity="2" role="img"
     aria-label="웹: 확정 60%, 추정 25%, 미확인 15%">
  <span class="confidence-segment" data-confidence="confirmed" style="--segment-size: 60"></span>
  <span class="confidence-segment" data-confidence="estimated" style="--segment-size: 25"></span>
  <span class="confidence-segment" data-confidence="unknown" style="--segment-size: 15"></span>
</div>
```

- [ ] **Step 4: Tighten the checker and verify**

Remove the temporary conditional example gate from Task 1. Require native meter attributes and an
accessible label association; require identity, three segment states, `--segment-size`, and
`role="img"` with `aria-label` or `aria-labelledby` in the confidence example.

Run:

```bash
npm test -- scripts/check-compact-bars.test.mjs
npm run check:compact-bars
npm run check:skill
git diff --check
```

Expected: all focused gates pass.

- [ ] **Step 5: Commit**

```bash
git add skills/crefle-doc/references/authoring.md examples/doc-minimal.html \
  scripts/check-compact-bars.mjs scripts/check-compact-bars.test.mjs
git commit -m "docs(skill): compact bar 저작 계약 추가"
```

### Task 5: Full Verification, Review, PR, and Cleanup

**Files:**
- Verify only: all changed source, generated, documentation, and test files.

**Interfaces:**
- Consumes: a clean `feat/magnitude-confidence-bars` branch with Tasks 1–4 committed.
- Produces: a reviewed, green, Squash-merged PR closing issue #9 and a cleaned local worktree/branch.

- [ ] **Step 1: Run the full repository gate**

Run:

```bash
npm run check
git diff --check origin/main...HEAD
git status --short
```

Expected: Vitest, TypeScript, token, build/dist, skill, compact-bar, and all Playwright gates pass;
the branch worktree is clean.

- [ ] **Step 2: Review the complete diff**

Apply CREFLE PR review criteria in order: bugs/correctness, security, tests, conventions/readability.
Confirm no secrets, dependencies, chart/deck scope changes, raw colors, or unrelated edits. Classify
every finding as Blocker/Major/Minor/Nit and fix Blocker/Major findings before proceeding.

- [ ] **Step 3: Push and create the PR**

```bash
git push -u origin feat/magnitude-confidence-bars
gh pr create --base main --head feat/magnitude-confidence-bars \
  --title "feat(doc): magnitude·confidence bar 추가" \
  --body-file /tmp/design-system-v2-doc-issue9-pr.md
```

The PR body must summarize both components, list `npm run check`, and end with `Closes #9`.

- [ ] **Step 4: Wait for CI and apply the merge gate**

Run:

```bash
gh pr checks <PR_NUMBER> --watch
gh pr view <PR_NUMBER> --json mergeable,mergeStateStatus,isDraft,baseRefName
```

Merge only when Blocker/Major are zero, CI is green, `mergeable` is `MERGEABLE`,
`mergeStateStatus` is `CLEAN`, base is `main`, and the PR is not a draft. Post the standard Korean
review comment, then:

```bash
gh pr merge <PR_NUMBER> --squash --delete-branch
```

- [ ] **Step 5: Verify issue closure and clean local state**

Verify the PR is merged and issue #9 is closed. From the primary checkout, preserve the user's
existing `README.md` and `skills/crefle-doc/SKILL.md` modifications, remove only the owned
`.worktrees/magnitude-confidence-bars` worktree, prune, fetch remote refs, update `main`, and delete
the completed local feature branch. Report the merge commit and preserved dirty files.
