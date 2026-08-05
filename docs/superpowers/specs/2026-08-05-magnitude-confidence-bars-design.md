# Magnitude Meter & Confidence Bar Design

## Goal

Add two lightweight `.doc` components for compact quantitative communication without extending
`<crefle-chart>`:

- a neutral magnitude meter whose length alone encodes a value;
- an identity-colored confidence bar whose segment texture encodes confirmed, estimated, and
  unknown portions.

Both components must remain legible in light, dark, grayscale, and background-free print output.

## Scope

This change applies only inside `.doc`. It does not add deck styles, change `<crefle-chart>`, or
introduce JavaScript. The components are author-owned semantic HTML styled by the existing bundle.

## Public API

### Magnitude meter

Use the native `<meter>` element so the value, range, and accessible semantics exist without
JavaScript.

```html
<label for="blocked-screens">차단 화면</label>
<meter id="blocked-screens" class="magnitude-meter" min="0" max="12" value="8">8 / 12</meter>
```

Requirements:

- `min`, `max`, and `value` are mandatory authoring inputs.
- The meter must have an accessible name through `<label for>`, an enclosing `<label>`, or
  `aria-label`.
- The fill uses only neutral surface/ink tokens. Identity, brand, and semantic colors are invalid
  because length already carries the quantitative judgment.
- Native clamping handles values outside the range. Invalid or missing numeric attributes retain
  browser semantics; the design system does not invent a misleading fallback value.
- A textual value must remain available in nearby content or the element fallback text. The bar is
  a scan aid, not the sole source of the number.

### Confidence bar

Use a lightweight flex container with explicit segments. The identity slot belongs to the whole bar;
confidence belongs to each segment.

```html
<div class="confidence-bar" data-identity="2"
     role="img" aria-label="웹: 확정 60%, 추정 25%, 미확인 15%">
  <span class="confidence-segment" data-confidence="confirmed"
        style="--segment-size: 60"></span>
  <span class="confidence-segment" data-confidence="estimated"
        style="--segment-size: 25"></span>
  <span class="confidence-segment" data-confidence="unknown"
        style="--segment-size: 15"></span>
</div>
```

Requirements:

- `data-identity` accepts literal slots `1` through `8`, matching Identity Chip and chart identity.
- `data-confidence` accepts `confirmed`, `estimated`, or `unknown`.
- `--segment-size` is a non-negative unitless relative weight. Flex growth makes `60/25/15`,
  `6/2.5/1.5`, and other proportional totals render equivalently; authors do not need to normalize
  to 100.
- Zero-size segments may be omitted. Negative, missing, or non-numeric values are invalid authoring
  input and must not be documented as supported.
- The bar requires an explicit accessible summary through `aria-label` or `aria-labelledby`.
  Visible legends or adjacent text remain mandatory when the bar appears without a full written
  breakdown.

## Visual Encoding

### Magnitude meter

- Track: `--surface-container`.
- Fill: a neutral mix derived from `--on-surface-muted`; no categorical or semantic hue.
- Compact height, rounded ends, and full available width.
- `::-webkit-meter-bar`, `::-webkit-meter-optimum-value`, and corresponding Firefox pseudo-elements
  receive the same neutral contract.

### Confidence bar

- The whole bar maps `data-identity="N"` to the existing public `--chart-N-container` and
  `--chart-N-border` tokens introduced for Identity Chip.
- `confirmed`: identity container fill plus a solid identity border.
- `estimated`: the same identity surface with a diagonal neutral hatch overlay and double identity
  border as the background-free fallback.
- `unknown`: transparent/surface fill with an inset dashed identity border.
- Segments have a surface-colored separator so adjacent portions remain countable.
- Missing or invalid confidence uses a neutral inset outline and no confirmed fill.
- Missing or invalid identity falls back to neutral surface and outline tokens rather than slot 1.

Texture, outline, and accessible text carry confidence independently of hue. The design never uses
three different hues for confidence levels.

## Theme and Print Behavior

The patterns are token-based, so light and dark themes use the current surface and ink values rather
than separate hard-coded colors. The hatch is mixed from `--on-surface`, while identity surface and
border reuse the validated derivatives.

For print:

- segment borders, dash patterns, and hatch lines remain present even when background graphics are
  disabled;
- the meter track and value pseudo-elements retain neutral borders, so the filled extent remains
  visible even when their backgrounds are omitted;
- both components avoid internal page breaks;
- `print-color-adjust: exact` is a progressive enhancement, not the only carrier of meaning;
- grayscale output remains distinguishable through solid fill, hatch, and dashed outline.

## Authoring Guidance

Add a focused section to `skills/crefle-doc/references/authoring.md` and working examples to
`examples/doc-minimal.html`.

The guidance must state:

- use magnitude meter for compact relative size, not status or pass/fail;
- always provide the exact number in text;
- use confidence bar only for portions of one identity, not multiple categories;
- supply a visible or accessible confirmed/estimated/unknown breakdown;
- do not use semantic colors, arbitrary colors, generated status text, or deck scope;
- include an identity legend when slot meanings are not already established nearby.

## Contract and Regression Testing

Add a dedicated source contract checker and Vitest mutation tests that verify:

- both public component selectors remain `.doc`-scoped;
- all eight identity mappings reuse the existing container/border derivatives;
- all three confidence states exist and no semantic color token is used;
- the minimal example contains native meter attributes and accessible naming;
- the confidence example contains all three states, relative sizes, identity, and an accessible
  summary.

Add Playwright coverage over the built distribution that verifies:

- native meter value/range semantics and neutral computed colors;
- confidence segment relative widths for non-100 totals;
- eight identity slots and the three distinct fill/hatch/outline treatments;
- invalid identity/confidence cannot look confirmed;
- light, dark, print, and grayscale patterns remain distinguishable;
- hundreds of meters and bars wrap without horizontal overflow;
- no console errors, blocked network requests, or PDF generation failures.

The full `npm run check` gate must pass before PR creation.

## Alternatives Rejected

### Extend `<crefle-chart stacked>`

Rejected because categorical series and sequential confidence states have different data contracts.
Adding texture modes to the full chart would increase its API and rendering complexity for a compact
use case that needs no title, axes, legend engine, SVG, or JavaScript.

### Add an SVG-only confidence component

Rejected because authoring simple segments would require a renderer and data schema. Semantic HTML
and flex layout provide the required proportional behavior with less code and better direct
accessibility.

### Encode confidence with opacity alone

Rejected because opacity collapses in grayscale and background-free print. Texture and outline are
required secondary channels.
