# Stage × Lane Process Flow Design

## Goal

Add a reusable `.doc` process-flow component for report content that shows ordered stages as rows
and two to four execution lanes as columns. Each stage/lane cell lists existing Identity Chips,
explicitly marks an empty lane, and can call out where a lane enters or exits the process.

## Decision and Scope

The repeated report pattern qualifies for the document design system even though one-off workflow,
radial, pattern, phase, and tree diagrams remain outside it. This component solves a constrained
matrix problem rather than becoming a general diagram engine.

The component is document-only. It adds no deck rules, JavaScript, connector drawing, automatic
layout, or new item-chip system.

## Orientation

Stages are table rows and lanes are table columns. This follows the two existing hand-built report
examples and allows long processes to paginate vertically on A4 paper. It intentionally supersedes
the issue prose that described stages on the horizontal axis; putting an unbounded number of stages
across the page would make reliable print pagination impossible.

## Public API

```html
<div class="process-flow-scroll">
  <table class="process-flow">
    <caption>화면 요청 처리 흐름</caption>
    <thead>
      <tr>
        <th scope="col">단계</th>
        <th scope="col">WEB</th>
        <th scope="col">POP</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <th scope="row">
          <strong>접수</strong>
          <small>요청 등록</small>
        </th>
        <td data-transition="enter">
          <span class="process-flow-transition">시작</span>
          <div class="process-flow-items">
            <span class="identity-chip" data-identity="2" data-confidence="confirmed">WEB-01</span>
          </div>
        </td>
        <td>
          <span class="process-flow-empty" aria-label="항목 없음">—</span>
        </td>
      </tr>
    </tbody>
  </table>
</div>
```

### Required structure

- `.process-flow-scroll` is the responsive boundary and immediate parent of the table.
- `.process-flow` is a semantic `<table>` with a non-empty `<caption>`.
- `<thead>` contains a stage header plus two to four lane headers, each with `scope="col"`.
- Every body row represents one ordered stage and starts with `<th scope="row">`.
- The stage header uses `<strong>` for its name and may use `<small>` for supporting information.
- Each lane cell contains `.process-flow-items` with one or more existing `.identity-chip` elements,
  or one `.process-flow-empty` containing a real em dash.
- The component never invents a second item-chip API. Identity, confidence, and lifecycle status
  continue to use the existing Identity Chip contract.

### Transitions

`data-transition` is optional on a lane `<td>` and accepts:

- `enter`: the lane becomes active at this stage;
- `exit`: the lane stops being active after this stage.

A transition cell must include real `.process-flow-transition` text: `시작` or `종료`. CSS does not
generate status content. The cell receives a strong neutral block-start or block-end line so the
transition remains visible without color. Missing or invalid values receive ordinary cell styling
and must not look like a valid transition.

## Screen Layout

The wrapper uses `overflow-x: auto` and `max-width: 100%`. The table uses `width: 100%` plus
`min-width: max-content`, so two to four compact lanes fill available space and longer labels scroll
instead of compressing into unreadable columns.

Stage headers remain visually distinct through typography and a low surface token. Lane headers,
grid lines, empty markers, and transition text use neutral document tokens. `.process-flow-items` is
an inline flex container that wraps multiple chips inside a cell.

No sticky positioning is added. Sticky headers behave inconsistently in nested print and capture
contexts and are unnecessary for the intended report-sized matrices.

## Print Behavior

Under print media:

- the scroll wrapper changes to `overflow: visible`;
- the table resets `min-width`, uses `width: 100%` and `table-layout: fixed`;
- `<thead>` uses `display: table-header-group` so Chromium repeats it after vertical page breaks;
- rows and individual chips avoid internal page breaks;
- `.process-flow-items` continues to wrap;
- Identity Chip labels may wrap inside this component so four lanes fit the A4 content width;
- transition lines and text remain visible when background graphics are disabled;
- `print-color-adjust: exact` is an enhancement, not the sole information channel.

The browser may move a whole row to the next page. It must not split one stage across pages.

## Accessibility

The component relies on native table semantics rather than ARIA grid reconstruction:

- caption names the matrix;
- `scope="col"` associates lane headers;
- `scope="row"` associates stage headers;
- empty cells expose `aria-label="항목 없음"` and visible `—` text;
- transitions are real visible text;
- Identity Chips retain their own data and accessible status contract.

DOM order is the reading order: caption, lane headers, then each stage and its lane contents.

## Authoring Guidance

Add a “프로세스 흐름 — 단계 × 레인” section to
`skills/crefle-doc/references/authoring.md` and a canonical example to
`examples/doc-minimal.html`.

The guidance must state:

- use this component for ordered stages crossed with two to four stable execution lanes;
- use ordinary tables for non-process matrices and bespoke figures for free-form diagrams;
- keep stages as rows and lanes as columns;
- provide a caption and proper header scopes;
- reuse Identity Chips for items;
- write empty and transition meanings as real text;
- avoid generated arrows, absolute-positioned connectors, raw colors, and deck usage.

## Contract and Regression Testing

Add a focused source checker plus Vitest mutation tests that verify machine-readable artifacts:

- every process-flow selector stays under `.doc`;
- no `content:` generated status, positioning connectors, raw color, or deck selector is added;
- the canonical example has a direct wrapper/table relationship, caption, two to four lane headers,
  row-scoped stages, Identity Chip reuse, an accessible empty marker, and both transition values with
  matching text;
- removing or corrupting any required structure fails the checker.

Add Playwright coverage against the built distribution that verifies:

- native table roles and header/caption text resolve;
- two-, three-, and four-lane tables lay out without overlap;
- long screen content scrolls within the wrapper rather than the document;
- multiple Identity Chips wrap within a cell;
- valid enter/exit cells have distinct block borders and invalid transitions do not;
- empty and transition text remains visible;
- a process with hundreds of stages has no horizontal page overflow;
- print media repeats the header after a page break and does not split rows;
- PDF generation succeeds with background graphics disabled;
- no console errors or network requests occur.

The full `npm run check` gate must pass before PR creation.

## Alternatives Rejected

### CSS Grid with generic `<div>` elements

Rejected because it would require recreating row/column relationships with ARIA and would lose
native repeated table-header behavior in print.

### Horizontal stages and vertical lanes

Rejected because stages are unbounded while lanes are explicitly limited to two through four.
Horizontal stages would force an ever-wider print surface and cannot paginate predictably across A4
pages.

### Custom element or diagram engine

Rejected because automatic rendering, connectors, and a JSON schema add runtime complexity without
improving this constrained report matrix. Author-owned semantic HTML is sufficient.
