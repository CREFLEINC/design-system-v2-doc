# Identity Chip Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a lightweight, accessible `.doc` identity chip that encodes identity, confidence, and lifecycle change through independent visual channels.

**Architecture:** Publish container/border derivatives for the eight existing chart slots, then map them to a CSS-only `.identity-chip` API through data attributes. Protect the public API with a source contract gate and protect visible screen/print behavior with a dedicated Playwright suite over the built distribution.

**Tech Stack:** HTML5, CSS Color 5 `color-mix()`, Node.js 20.19+ ES modules, Vitest, Playwright

## Global Constraints

- Work on Issue #7 only; do not begin Issue #9 or #8 before #7 is merged and cleaned up.
- Support `.identity-chip` only inside `.doc`; do not add deck rules.
- `data-identity` accepts the literal slots `1` through `8`.
- `data-confidence` accepts `confirmed`, `estimated`, or `unknown`; invalid/missing values must not look confirmed.
- Confidence uses border style only: solid, dashed, double.
- Status glyphs are real `.identity-chip-status` child text with `aria-label`, never generated content.
- Standard statuses are 신설 `✦`, 폐기 `×`, 통합 `⊕`, 이관 `↗`, 격하 `↓`.
- Deprecation uses `data-change="deprecated"` and strikes only the label content, not the status glyph.
- Publish exactly `--chart-1..8-container` and `--chart-1..8-border`.
- Container tokens mix 14% chart color with `--surface`; border tokens mix 55% chart color with `--on-surface`.
- Use existing spacing, type, radius, and color tokens; no raw colors, arbitrary pixels, unsupported weights, JavaScript component, or new dependency.
- Preserve unrelated existing changes in `README.md` and `skills/crefle-doc/SKILL.md`; never stage or modify them.

---

### Task 1: Derived Identity Tokens and Contract Gate

**Files:**
- Create: `scripts/check-identity-chip.mjs`
- Create: `scripts/check-identity-chip.test.mjs`
- Modify: `styles/doc-tokens.css`
- Modify: `package.json`

**Interfaces:**
- Consumes: existing `--chart-1..8`, `--surface`, and `--on-surface` tokens.
- Produces: sixteen public derivative tokens and `npm run check:identity-chip`, which rejects missing, extra, reordered, or incorrectly derived token declarations.

- [ ] **Step 1: Write the failing checker tests**

Create a checker that accepts an optional root argument so tests can copy real files to a temporary root:

```js
// scripts/check-identity-chip.mjs
const ROOT = resolve(process.argv[2] ?? join(dirname(fileURLToPath(import.meta.url)), '..'))
const tokenCss = readFileSync(join(ROOT, 'styles', 'doc-tokens.css'), 'utf8')
const componentCss = readFileSync(join(ROOT, 'styles', 'doc.css'), 'utf8')
const authoring = readFileSync(join(ROOT, 'skills', 'crefle-doc', 'references', 'authoring.md'), 'utf8')
const example = readFileSync(join(ROOT, 'examples', 'doc-minimal.html'), 'utf8')
```

In `scripts/check-identity-chip.test.mjs`, copy those four artifacts into a temporary root and run the checker with `execFileSync(process.execPath, [checker, tempRoot])`. Add literal tests proving:

- current source fails because all sixteen derivatives are absent;
- removing one `--chart-8-border` declaration from a complete fixture fails;
- changing `14%` or `55%` in a derivative fails;
- adding `.slide .identity-chip` fails the doc-only scope rule.

- [ ] **Step 2: Verify RED**

Run: `npm test -- scripts/check-identity-chip.test.mjs`

Expected: FAIL because `check-identity-chip.mjs` and the public tokens do not exist.

- [ ] **Step 3: Implement the token contract**

Add these literal patterns for slots 1 through 8 to `styles/doc-tokens.css`:

```css
--chart-1-container: color-mix(in srgb, var(--chart-1) 14%, var(--surface));
--chart-1-border: color-mix(in srgb, var(--chart-1) 55%, var(--on-surface));
```

The checker must build the exact expected declaration string for every slot, require each once, and reject `identity-chip` selectors outside `.doc`. Task 1 checks only tokens and scope so its focused suite is fully green; Task 3 extends the same checker with authoring/example contracts.

Add:

```json
"check:identity-chip": "node scripts/check-identity-chip.mjs"
```

to `package.json`, and insert `npm run check:identity-chip` before `npm run check:dist` in the full `check` chain.

- [ ] **Step 4: Verify the token checks**

Run: `npm test -- scripts/check-identity-chip.test.mjs`

Expected: all token and scope tests pass with pristine output.

- [ ] **Step 5: Commit**

```bash
git add scripts/check-identity-chip.mjs scripts/check-identity-chip.test.mjs styles/doc-tokens.css package.json
git commit -m "feat(tokens): identity 색 파생 토큰 추가"
```

---

### Task 2: Identity Chip Rendering

**Files:**
- Create: `tests/e2e/identity-chip.spec.mjs`
- Modify: `styles/doc.css`
- Modify: `styles/print.css`
- Regenerate: `dist/crefle-doc/crefle-doc.css`
- Regenerate: `dist/crefle-doc/crefle-doc.lock.json`

**Interfaces:**
- Consumes: the sixteen derivative tokens from Task 1.
- Produces: `.doc .identity-chip[data-identity][data-confidence]` visual behavior and real screen/print regression coverage.

- [ ] **Step 1: Write the failing Playwright matrix**

Create a file-based test page in a temporary directory using `tests/e2e/fixtures.mjs`’s `ROOT`, copy `dist/crefle-doc`, and generate:

```html
<body class="doc">
  <div id="matrix"></div>
  <div id="bulk"></div>
</body>
```

Populate `#matrix` with the literal 24 combinations (8 identity slots × 3 confidence values), five status examples, one invalid-confidence chip, and a deprecated chip whose label is wrapped in `<span class="identity-chip-label">`.

For each combination assert:

```js
expect(style.borderStyle).toBe(
  confidence === 'confirmed' ? 'solid' :
  confidence === 'estimated' ? 'dashed' : 'double'
)
expect(style.backgroundColor).not.toBe('rgba(0, 0, 0, 0)')
```

Also assert the invalid value is neither `solid` nor visually identical to confirmed; status children expose the exact glyph and accessible name; only `.identity-chip-label` is struck through for deprecated.

- [ ] **Step 2: Verify RED**

Run: `npx playwright test tests/e2e/identity-chip.spec.mjs`

Expected: FAIL because the identity chip styles do not exist.

- [ ] **Step 3: Implement minimal component CSS**

Add the base rule:

```css
.doc .identity-chip {
  --identity-container: var(--surface-container-low);
  --identity-border: var(--outline-variant);
  display: inline-flex;
  align-items: center;
  gap: var(--s-1);
  padding: var(--s-1) var(--s-2);
  border: 1px solid var(--identity-border);
  border-radius: var(--radius-sm);
  background: var(--identity-container);
  color: var(--on-surface);
  font-size: var(--text-small);
  font-weight: var(--w-medium);
  line-height: var(--leading-snug);
  white-space: nowrap;
  break-inside: avoid;
}
```

Map each `[data-identity='N']` to its two derivative tokens. Map confidence values to `solid`, `dashed`, and `double`. The base invalid/missing confidence style must be `none` plus an inset neutral outline, so it cannot be mistaken for confirmed. Style `.identity-chip-status` without generated content. Apply line-through only to
`[data-change='deprecated'] > .identity-chip-label`.

In `styles/print.css`, preserve border style and avoid splitting; do not rely on background printing.

- [ ] **Step 4: Add print and bulk assertions**

After `page.emulateMedia({ media: 'print' })`, assert all three computed border styles remain distinct. Fill `#bulk` with 700 chips and assert:

- exactly 700 rendered elements;
- the final chip’s top coordinate is greater than the first chip’s;
- no chip exceeds the bulk container’s right edge;
- page and console error arrays are empty.

- [ ] **Step 5: Build and verify GREEN**

Run:

```bash
npm run build
npx playwright test tests/e2e/identity-chip.spec.mjs
npm run lint:tokens
npm run check:dist
```

Expected: all commands pass with no warnings or errors.

- [ ] **Step 6: Commit**

```bash
git add tests/e2e/identity-chip.spec.mjs styles/doc.css styles/print.css dist/crefle-doc/crefle-doc.css dist/crefle-doc/crefle-doc.lock.json
git commit -m "feat(doc): identity chip 컴포넌트 추가"
```

---

### Task 3: Authoring Documentation and Example

**Files:**
- Modify: `skills/crefle-doc/references/authoring.md`
- Modify: `examples/doc-minimal.html`
- Modify: `scripts/check-identity-chip.mjs`
- Modify: `scripts/check-identity-chip.test.mjs`

**Interfaces:**
- Consumes: the HTML/CSS contract from Tasks 1 and 2.
- Produces: author-facing API guidance, a completed example, and a green source contract gate.

- [ ] **Step 1: Add failing documentation contract tests**

Extend the checker tests with controlled mutations proving rejection when:

- authoring docs omit any of `data-identity`, `data-confidence`, `identity-chip-status`, or the five glyph/name pairs;
- authoring docs omit the requirement to publish a slot-to-domain legend;
- the example lacks one of confirmed/estimated/unknown;
- a status child lacks `aria-label`;
- deprecated markup lacks `.identity-chip-label`.

- [ ] **Step 2: Verify RED**

Run: `npm test -- scripts/check-identity-chip.test.mjs`

Expected: FAIL against current `authoring.md` and `doc-minimal.html`.

- [ ] **Step 3: Document the exact public API**

Add an “정체성·확신도·상태 칩” section to `authoring.md` containing:

- the approved HTML example;
- an 8-slot identity explanation and mandatory domain legend;
- the three confidence values and border meanings;
- the five literal glyph/`aria-label` mappings;
- deprecated markup using `data-change="deprecated"` and `.identity-chip-label`;
- prohibitions against semantic colors, color-only confidence, generated glyphs, missing `aria-label`, arbitrary symbols, and deck usage.

- [ ] **Step 4: Add the completed example**

In `examples/doc-minimal.html`, add a compact legend and examples for all three confidence states plus the five statuses. Use existing slot numbers and explicit `aria-label` values. Include deprecated markup with the label wrapper.

- [ ] **Step 5: Verify GREEN and full suite**

Run:

```bash
npm test -- scripts/check-identity-chip.test.mjs
npm run check:identity-chip
npm run check
git diff --check
```

Expected: Vitest, Playwright, build/dist, token, skill, and identity-chip gates all pass; `git diff --check` exits 0.

- [ ] **Step 6: Commit**

```bash
git add skills/crefle-doc/references/authoring.md examples/doc-minimal.html scripts/check-identity-chip.mjs scripts/check-identity-chip.test.mjs
git commit -m "docs(skill): identity chip 저작 계약 추가"
```

---

### Task 4: Review, PR, Merge, and Cleanup

**Files:**
- No product files.

**Interfaces:**
- Consumes: a clean, fully verified `feat/identity-chip` branch.
- Produces: a reviewed squash merge that closes Issue #7, followed by updated local `main` and removal of the completed branch/worktree.

- [ ] **Step 1: Audit the branch**

Run:

```bash
git status --short
git diff origin/main...HEAD --check
git log --oneline origin/main..HEAD
```

Expected: only Issue #7 commits; unrelated `README.md` and `skills/crefle-doc/SKILL.md` changes are absent from the branch diff.

- [ ] **Step 2: Create the PR**

Push the branch and create a PR titled:

```text
feat(doc): identity·confidence·status chip 추가
```

The body must list the three independent visual channels, token derivatives, fresh verification, and `Closes #7`.

- [ ] **Step 3: Review and merge**

Apply the CREFLE PR-review rubric. Merge only with Blocker 0, Major 0, CI green, `MERGEABLE`, `CLEAN`, base `main`, and non-draft state. Use squash merge and delete the remote branch.

- [ ] **Step 4: Update and clean local state**

Fast-forward local `main`, run `npm test`, remove the completed worktree and local branch, prune remote refs, and verify `HEAD == origin/main` with a clean status.
