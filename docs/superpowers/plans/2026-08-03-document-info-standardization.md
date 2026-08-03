# Document Info Standardization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Standardize five user-confirmed document metadata fields across all authoring templates and examples without allowing plausible guessed defaults.

**Architecture:** Extend the existing `check:skill` contract gate to validate metadata structure in source artifacts, then update the four templates and authoring skill to satisfy that contract. Keep semantic tables as the shared markup; add only a deck-scoped visual treatment and use Playwright to protect the title-slide layout.

**Tech Stack:** HTML5, CSS, Node.js 20.19+ ES modules, Vitest/Playwright, npm scripts

## Global Constraints

- Metadata order is exactly: `작성자`, `작성일`, `작성시간`, `문서 버전`, `열람 대상`.
- `작성시간` is a separate row and uses 24-hour `HH:mm`.
- Author, document version, and audience are asked directly; date and time may be proposed from the system only after explicit user confirmation.
- Audience suggestions are `사내 한정`, `프로젝트 관련자`, `고객사 제출`, and `대외 공개`, with free-form input allowed.
- No metadata value may be inferred or filled with a plausible default.
- Unconfirmed template values render as `[사용자 확인 필요]` and carry an adjacent `<!-- 사용자 확인 전 기입 금지 -->` comment.
- Research-note `기간`/`상태` and minutes `일시`/`장소` remain separate subject-information tables.
- Reporter metadata, report revision history, and automatic metadata extraction remain out of scope.

---

### Task 1: Metadata Contract Gate and Authoring Workflow

**Files:**
- Modify: `scripts/check-skill.mjs`
- Modify: `skills/crefle-doc/SKILL.md`
- Modify: `templates/report.html`
- Modify: `templates/research-note.html`
- Modify: `templates/minutes.html`
- Modify: `templates/deck.html`

**Interfaces:**
- Consumes: source HTML under `templates/` and the authoring instructions in `skills/crefle-doc/SKILL.md`.
- Produces: `npm run check:skill` exits non-zero when a template lacks the ordered metadata contract or uses plausible defaults; all four templates expose `table[data-document-info]`.

- [ ] **Step 1: Add the failing contract checks**

In `scripts/check-skill.mjs`, define literal requirements and validate real source artifacts:

```js
const DOCUMENT_INFO_LABELS = ['작성자', '작성일', '작성시간', '문서 버전', '열람 대상']
const DOCUMENT_INFO_PLACEHOLDER = '[사용자 확인 필요]'
const DOCUMENT_INFO_COMMENT = '사용자 확인 전 기입 금지'

for (const f of readdirSync(tplDir).sort()) {
  const t = readFileSync(join(tplDir, f), 'utf8')
  const block = t.match(/<table data-document-info>[\s\S]*?<\/table>/)?.[0]
  if (!block) {
    problems.push(`templates/${f} 에 data-document-info 표가 없습니다.`)
    continue
  }
  const labels = [...block.matchAll(/<th>([^<]+)<\/th>/g)].map((m) => m[1])
  if (JSON.stringify(labels) !== JSON.stringify(DOCUMENT_INFO_LABELS))
    problems.push(`templates/${f} 의 문서 정보 항목 또는 순서가 표준과 다릅니다.`)
  if ((block.match(/\[사용자 확인 필요\]/g) || []).length !== DOCUMENT_INFO_LABELS.length)
    problems.push(`templates/${f} 의 문서 정보 placeholder가 5개가 아닙니다.`)
  if ((block.match(/사용자 확인 전 기입 금지/g) || []).length !== DOCUMENT_INFO_LABELS.length)
    problems.push(`templates/${f} 의 문서 정보 금지 주석이 5개가 아닙니다.`)
}
```

Also validate that the skill contains the ordered confirmation step, `추측·유추·기본값` prohibition, `HH:mm`, system date/time proposal requiring confirmation, and all four audience suggestions. Use clear `problems.push(...)` messages for each missing contract.

- [ ] **Step 2: Run the contract gate and verify RED**

Run: `npm run check:skill`

Expected: FAIL because each template lacks `table[data-document-info]` and the skill lacks the confirmation contract.

- [ ] **Step 3: Add the authoring confirmation step**

In `skills/crefle-doc/SKILL.md`, insert a step before “내용을 채운다” that:

- asks for all five fields before writing content;
- allows system date and time only as proposals that require confirmation;
- bans guessed/inferred/default metadata at the same strength as the existing prohibitions;
- gives the four audience suggestions while preserving free-form input;
- says unresolved values remain `[사용자 확인 필요]` in a draft or block completion.

Renumber the following content and browser verification steps.

- [ ] **Step 4: Implement the shared template contract**

Use this exact structure in each template:

```html
<table data-document-info>
  <caption>문서 정보</caption>
  <tbody>
    <tr><th>작성자</th><td><!-- 사용자 확인 전 기입 금지 -->[사용자 확인 필요]</td></tr>
    <tr><th>작성일</th><td><!-- 사용자 확인 전 기입 금지 -->[사용자 확인 필요]</td></tr>
    <tr><th>작성시간</th><td><!-- 사용자 확인 전 기입 금지 · 24시간제 HH:mm -->[사용자 확인 필요]</td></tr>
    <tr><th>문서 버전</th><td><!-- 사용자 확인 전 기입 금지 -->[사용자 확인 필요]</td></tr>
    <tr><th>열람 대상</th><td><!-- 사용자 확인 전 기입 금지 -->[사용자 확인 필요]</td></tr>
  </tbody>
</table>
```

For research-note and minutes, move their subject-specific rows into a second table with a descriptive caption. Replace the deck title slide’s `.capsule-row` with the same metadata table.

- [ ] **Step 5: Run the contract gate and verify GREEN**

Run: `npm run check:skill`

Expected: PASS with the existing skill/code consistency success message.

- [ ] **Step 6: Commit the contract**

```bash
git add scripts/check-skill.mjs skills/crefle-doc/SKILL.md templates/report.html templates/research-note.html templates/minutes.html templates/deck.html
git commit -m "feat(skill): 문서 정보 확인 계약 표준화"
```

---

### Task 2: Deck Metadata Layout

**Files:**
- Modify: `tests/e2e/templates.spec.mjs`
- Modify: `styles/deck.css`
- Regenerate: `dist/crefle-doc/crefle-doc.css`

**Interfaces:**
- Consumes: `table[data-document-info]` on the first `.slide.dark`.
- Produces: a compact dark-title-slide table that remains within the 1920×1080 authored canvas and prints one slide per page.

- [ ] **Step 1: Add the failing title-slide layout test**

Extend the deck template test’s page evaluation:

```js
const info = document.querySelector('.slide.dark table[data-document-info]')
const slide = document.querySelector('.slide.dark')
const infoRect = info?.getBoundingClientRect()
const slideRect = slide?.getBoundingClientRect()

return {
  // existing fields
  hasDocumentInfo: !!info,
  documentInfoFits:
    !!infoRect && !!slideRect &&
    infoRect.left >= slideRect.left &&
    infoRect.right <= slideRect.right &&
    infoRect.top >= slideRect.top &&
    infoRect.bottom <= slideRect.bottom,
  documentInfoWidth: infoRect?.width,
  documentInfoRows: info?.querySelectorAll('tbody tr').length
}
```

Add literal assertions:

```js
expect(d.hasDocumentInfo, '덱 표지에 문서 정보 표가 없다').toBe(true)
expect(d.documentInfoRows).toBe(5)
expect(d.documentInfoFits, '덱 표지의 문서 정보 표가 슬라이드 밖으로 넘친다').toBe(true)
expect(d.documentInfoWidth, '덱 표지 문서 정보가 너무 좁어 값이 과도하게 줄바꿈된다').toBeGreaterThanOrEqual(640)
expect(d.documentInfoWidth, '덱 표지 문서 정보가 제목 영역을 잠식한다').toBeLessThanOrEqual(900)
```

- [ ] **Step 2: Run the focused E2E test and verify RED**

Run: `npx playwright test tests/e2e/templates.spec.mjs --grep "deck 템플릿"`

Expected: FAIL because the unstyled table shrinks to its content and is narrower than 640px.

- [ ] **Step 3: Add minimal deck-scoped styling**

In `styles/deck.css`, style only `.slide table[data-document-info]`: width between 640px and 900px, collapsed borders, compact cell padding, subdued label color, readable dark-slide borders and text, and no document-scale margins. Do not introduce a general component class.

- [ ] **Step 4: Build and verify GREEN**

Run:

```bash
npm run build
npx playwright test tests/e2e/templates.spec.mjs --grep "deck 템플릿"
```

Expected: build succeeds and the focused Playwright test passes.

- [ ] **Step 5: Commit the layout**

```bash
git add tests/e2e/templates.spec.mjs styles/deck.css dist/crefle-doc/crefle-doc.css
git commit -m "feat(deck): 표지 문서 정보 표 추가"
```

---

### Task 3: Examples and Full Verification

**Files:**
- Modify: `scripts/check-skill.mjs`
- Modify: `examples/deck-minimal.html`
- Modify: `examples/doc-minimal.html`

**Interfaces:**
- Consumes: the five-field metadata order established by Task 1.
- Produces: complete examples that demonstrate the same contract and a gate that prevents template/example drift.

- [ ] **Step 1: Add failing example contract checks**

Extend `scripts/check-skill.mjs` to validate `examples/deck-minimal.html` and `examples/doc-minimal.html`. Require a `table[data-document-info]` whose five `<th>` labels match `DOCUMENT_INFO_LABELS` in exact order. Do not apply the unconfirmed-placeholder rule to examples because they are completed demonstrations.

- [ ] **Step 2: Run the contract gate and verify RED**

Run: `npm run check:skill`

Expected: FAIL because both examples lack the five-field document information table.

- [ ] **Step 3: Update examples with explicit sample values**

Replace the title capsules in `examples/deck-minimal.html` and add a representative metadata block near the document introduction in `examples/doc-minimal.html`. Use explicit example values in all five rows, including `HH:mm` time and one approved audience value.

- [ ] **Step 4: Run the contract gate and verify GREEN**

Run: `npm run check:skill`

Expected: PASS.

- [ ] **Step 5: Run full verification**

Run: `npm run check`

Expected: all foundation, license, font, palette, comment, typecheck, Vitest, token, dist, skill, and Playwright checks pass with exit code 0.

Run: `git diff --check`

Expected: exit code 0 with no output.

- [ ] **Step 6: Commit examples and verification gate**

```bash
git add scripts/check-skill.mjs examples/deck-minimal.html examples/doc-minimal.html
git commit -m "test(skill): 문서 정보 예제 계약 검증"
```

---

### Task 4: Issue and Pull Request Handoff

**Files:**
- No product files.

**Interfaces:**
- Consumes: verified commits on `feat/document-info-standardization`.
- Produces: a PR linked to GitHub Issue #10 and issue state transitioned to review.

- [ ] **Step 1: Review the final diff and commit list**

Run:

```bash
git status --short
git diff origin/main...HEAD --check
git log --oneline origin/main..HEAD
```

Expected: clean worktree, no whitespace errors, and only the design plus three implementation commits.

- [ ] **Step 2: Push and create the PR**

Push `feat/document-info-standardization` and create a Conventional Commits PR titled:

```text
feat(skill): 문서 정보 5개 항목 표준화
```

The PR body must summarize the metadata contract and verification and include `Closes #10`.

- [ ] **Step 3: Update issue tracking**

Set the issue’s status label to `status:in-review` if the repository provides it. Do not close the issue manually; let the linked PR close it on merge.
