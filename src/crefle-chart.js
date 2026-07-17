/**
 * <crefle-chart> — 문서용 차트 웹컴포넌트. 원형 · 막대 · 꺾은선.
 *
 * ## 사용
 *
 *   <crefle-chart type="bar" title="난이도별 품질 개선" caption="출처: Hwang (2026)">
 *     {"series":[{"name":"품질 점수","data":[
 *       {"label":"Basic","value":23.8},{"label":"Expert","value":36.2}]}]}
 *   </crefle-chart>
 *
 * JSON 이 **인라인**인 것은 스타일 선택이 아니다. 문서는 file:// 로 열리고,
 * file:// 는 opaque origin 이라 fetch()/XHR 이 차단된다. 유일하게 작동하는 방법이다.
 *
 * ## 이 파일이 IIFE 인 이유
 *
 * Chromium 은 모듈 스크립트를 CORS 의미론으로 가져온다. file:// 페이지는 opaque
 * origin 이라 <script type="module"> 이 통째로 차단된다. 클래식 스크립트만 면제다.
 * → top-level import/export 금지. build.mjs 가 이걸 강제한다.
 *
 * 수학은 src/chart-math.mjs 에 순수 함수로 있고(vitest 가 30개 테스트로 검증),
 * build.mjs 가 export 를 떼어 이 파일 앞에 **결정적으로 concat** 한다.
 * 그래서 아래 코드는 resolveDomain/yToPx/... 를 자유 변수로 참조한다.
 *
 * ## 색만으로 시리즈를 구분하지 않는다 — 세 가지 의무
 *
 * 팔레트 검증(dataviz validate_palette.js)이 남긴 의무이고, 전부 여기서 갚는다:
 *
 *   1. CVD floor band — slot 6↔7 ΔE 6.1 (deutan). 6~8 구간은 **2차 인코딩이 있을
 *      때만 합법**이다.
 *   2. 대비 relief — slot 3·6·7 이 표면 대비 3:1 미만. WARN 은 무시 가능한 게 아니라
 *      "값이 다른 방법으로 읽혀야 한다"는 의무다.
 *   3. 흑백 인쇄 — 레드↔블루 상대명도 차 0.049. 보고서는 흑백으로 인쇄된다.
 *      dataviz 스킬 밖의, 문서 DS 고유 요구.
 *
 * 그래서 항상 함께 나간다:
 *   · 범례 (시리즈 2개 이상이면 **항상**)
 *   · 직접 라벨 (단일 시리즈 막대 · 원형 조각)
 *   · 마크 사이 2px 표면 간격 (인접 채움의 경계)
 *   · 시각적 숨김 <table> (클립으로 숨긴다 — display:none 은 접근성 트리에서 사라진다)
 *   · role="img" + 자동 aria-label
 *
 * ## light 표면 전용
 * 팔레트는 다크에서 검증되지 않았다(lightness band 를 4개 벗어난다).
 * .slide.dark 위에 놓으면 콘솔에 경고한다.
 */
;(() => {
  'use strict'

  const NS = 'http://www.w3.org/2000/svg'

  /** @param {string} tag @param {Record<string,string|number>} [attrs] @returns {SVGElement} */
  const svg = (tag, attrs) => {
    const el = document.createElementNS(NS, tag)
    if (attrs) for (const k in attrs) el.setAttribute(k, String(attrs[k]))
    return el
  }
  /** @param {string} tag @param {string} [cls] @param {string} [text] @returns {HTMLElement} */
  const h = (tag, cls, text) => {
    const el = document.createElement(tag)
    if (cls) el.className = cls
    if (text != null) el.textContent = text
    return el
  }

  class CrefleChart extends HTMLElement {
    /** 인라인 JSON 원본. render() 가 textContent 를 지우므로 먼저 보관한다. @type {string|undefined} */
    _raw
    /** 중복 렌더 방지 — connectedCallback 은 DOM 이동 시 다시 불린다. @type {boolean|undefined} */
    _rendered

    connectedCallback() {
      // 이미 렌더했으면 다시 하지 않는다 — 원본 JSON 은 _raw 에 보관한다.
      if (this._rendered) return
      this._rendered = true
      try {
        this.render()
      } catch (e) {
        this.renderError(e)
      }
    }

    /** 인라인 JSON 을 읽는다. textContent 가 페이로드다. @returns {any} */
    readPayload() {
      const raw = (this._raw ??= this.textContent || '')
      const t = raw.trim()
      if (!t) throw new Error('<crefle-chart> 안에 JSON 이 없습니다. 페이로드는 인라인이어야 합니다 (file:// 에서 fetch 는 차단됩니다).')
      try {
        return JSON.parse(t)
      } catch (e) {
        throw new Error(`<crefle-chart> 의 JSON 을 읽지 못했습니다: ${e instanceof Error ? e.message : String(e)}`)
      }
    }

    /** @param {unknown} e */
    renderError(e) {
      this.textContent = ''
      const box = h('div', 'crefle-chart-error')
      box.setAttribute('role', 'alert')
      box.textContent = `차트를 그리지 못했습니다 — ${e instanceof Error ? e.message : String(e)}`
      this.appendChild(box)
      // 조용히 죽지 않는다. 문서에 빈 자리가 남는 것보다 낫다.
      console.error('[crefle-chart]', e)
    }

    render() {
      const data = this.readPayload()
      const type = (this.getAttribute('type') || 'bar').toLowerCase()
      const title = this.getAttribute('title') || undefined
      const caption = this.getAttribute('caption') || undefined
      const unit = this.getAttribute('unit') || ''
      const width = Number(this.getAttribute('width')) || DEFAULT_WIDTH
      const height = Number(this.getAttribute('height')) || DEFAULT_HEIGHT
      const stacked = this.hasAttribute('stacked')
      const fmt = unit ? (/** @type {number} */ v) => `${v}${unit}` : defaultFormatValue

      // 다크 표면 위 차트는 검증되지 않았다 — 조용히 넘기지 않는다.
      if (this.closest('.slide.dark, .slide.divider'))
        console.warn(
          '[crefle-chart] 다크 슬라이드 위에 차트가 있습니다. categorical 팔레트는 light 표면에서만 ' +
            '검증됐습니다(다크에서 lightness band 를 4개 벗어남). light 슬라이드로 옮기세요.'
        )

      /** @type {any[]} */
      const series = type === 'pie' ? [{ name: title || '', data: data.data || data.series?.[0]?.data || [] }] : data.series || []
      if (!series.length || !series[0].data?.length) throw new Error('series 가 비었습니다.')

      this.textContent = ''
      const fig = h('figure', 'crefle-chart')

      if (title) fig.appendChild(h('figcaption', 'crefle-chart-title', title))

      const legendItems = type === 'pie' ? null : buildLegendItems(series)
      const body = svg('svg', {
        viewBox: `0 0 ${width} ${height}`,
        role: 'img',
        'aria-label': this.getAttribute('aria-label') || (type === 'pie' ? summarizePie(series[0].data, fmt, title) : summarize(series, fmt, title))
      })
      body.setAttribute('class', 'crefle-chart-svg')

      if (type === 'pie') this.drawPie(body, series[0].data, width, height, fmt)
      else if (type === 'line') this.drawCartesian(body, series, width, height, fmt, 'line', false)
      else this.drawCartesian(body, series, width, height, fmt, 'bar', stacked)

      fig.appendChild(body)

      // 범례 — 시리즈 2개 이상이면 **항상**. 정체성이 색만으로 전달되면
      // CVD·흑백 인쇄에서 사라진다. 단일 시리즈는 제목이 이름을 대신하므로 범례 없음.
      if (type === 'pie') fig.appendChild(this.buildPieLegend(series[0].data, fmt))
      else if (series.length > 1 && legendItems) fig.appendChild(this.buildLegend(legendItems))

      if (caption) fig.appendChild(h('figcaption', 'crefle-chart-caption', caption))

      // 시각적 숨김 표 — 대비 relief 의무를 갚는 "table view".
      fig.appendChild(this.buildSrTable(series, fmt, title, type))

      this.appendChild(fig)
    }

    /** @param {any[]} items @returns {HTMLElement} */
    buildLegend(items) {
      const ul = h('ul', 'crefle-chart-legend')
      for (const it of items) {
        const li = h('li')
        const sw = h('span', 'crefle-chart-swatch')
        sw.setAttribute('data-slot', String(it.slot))
        if (it.color) sw.style.setProperty('--series-color', it.color)
        li.appendChild(sw)
        li.appendChild(h('span', undefined, it.name))
        ul.appendChild(li)
      }
      return ul
    }

    /** @param {any[]} data @param {(v:number)=>string} fmt @returns {HTMLElement} */
    buildPieLegend(data, fmt) {
      const ul = h('ul', 'crefle-chart-legend')
      pieSlices(data).forEach((s, i) => {
        const li = h('li')
        const sw = h('span', 'crefle-chart-swatch')
        sw.setAttribute('data-slot', String(seriesSlot(i)))
        li.appendChild(sw)
        // 값과 비율을 범례에 직접 쓴다 — 조각 안에 넣으면 작은 조각에서 넘친다.
        li.appendChild(h('span', undefined, `${s.point.label} · ${fmt(s.point.value)} (${Math.round(s.frac * 100)}%)`))
        ul.appendChild(li)
      })
      return ul
    }

    /**
     * 시각적으로 숨긴 표. **display:none 이 아니라 클립**으로 숨긴다 —
     * display:none 은 접근성 트리에서 통째로 사라진다.
     * @param {any[]} series @param {(v:number)=>string} fmt @param {string|undefined} title @param {string} type
     * @returns {HTMLElement}
     */
    buildSrTable(series, fmt, title, type) {
      const wrap = h('div', 'crefle-sr-only')
      const table = h('table')
      if (title) table.appendChild(h('caption', undefined, title))
      const thead = h('thead')
      const hr = h('tr')
      hr.appendChild(h('th', undefined, type === 'pie' ? '항목' : '구간'))
      for (const s of series) hr.appendChild(h('th', undefined, s.name || '값'))
      thead.appendChild(hr)
      table.appendChild(thead)
      const tb = h('tbody')
      for (const row of buildSrRows(series, fmt)) {
        const tr = h('tr')
        tr.appendChild(h('th', undefined, row.label))
        for (const v of row.values) tr.appendChild(h('td', undefined, v))
        tb.appendChild(tr)
      }
      table.appendChild(tb)
      wrap.appendChild(table)
      return wrap
    }

    /**
     * @param {SVGElement} root @param {any[]} data @param {number} w @param {number} hgt
     * @param {(v:number)=>string} fmt
     */
    drawPie(root, data, w, hgt, fmt) {
      if (data.length > PIE_MAX_SLICES)
        console.warn(
          `[crefle-chart] 원형 조각이 ${data.length}개입니다. all-pairs 검증을 통과한 것은 앞 ${PIE_MAX_SLICES}슬롯뿐입니다 ` +
            `— 원형은 모든 조각이 나란히 비교되므로 더 어려운 검사를 받습니다. 작은 항목을 "기타"로 접으세요.`
        )
      const cx = w / 2
      const cy = hgt / 2
      const r = Math.min(w, hgt) / 2 - PADDING.top
      const inner = r * DONUT_RING_RATIO

      pieSlices(data).forEach((s, i) => {
        const path = svg('path', { d: donutSlicePath(cx, cy, r, inner, s.start, s.end) })
        path.setAttribute('class', 'crefle-chart-slice')
        path.setAttribute('data-slot', String(seriesSlot(i)))
        // 조각 사이 간격 — 표면색 stroke 로 만든다. path 를 줄이면 각도가 왜곡되어
        // 면적이 값과 어긋난다(차트가 거짓말을 한다).
        path.setAttribute('stroke-width', String(MARK_GAP))
        root.appendChild(path)
      })
    }

    /**
     * @param {SVGElement} root @param {any[]} series @param {number} w @param {number} hgt
     * @param {(v:number)=>string} fmt @param {'bar'|'line'} kind @param {boolean} stacked
     */
    drawCartesian(root, series, w, hgt, fmt, kind, stacked) {
      const n = Math.max(1, ...series.map((s) => s.data.length))
      const plotLeft = PADDING.left
      const plotRight = w - PADDING.right
      // 직접 라벨은 막대 **위**에 붙는다. 최댓값 막대는 꼭대기가 plotTop 이므로
      // 머리 공간이 없으면 라벨이 viewBox 밖으로 나가 잘린다 — 차트에서 가장 중요한
      // 숫자가 사라진다. 실측: 위쪽 2.1px 초과 (bbox y=-2.1..13.6, viewBox 0..320).
      // 라벨을 그리는 경우(단일 시리즈 막대)에만 확보한다 — 꺾은선엔 라벨이 없다.
      const plotTop = PADDING.top + (kind === 'bar' && series.length === 1 ? LABEL_HEADROOM : 0)
      const plotBottom = hgt - PADDING.bottom
      const plotW = plotRight - plotLeft
      const plotH = plotBottom - plotTop

      const domain = resolveDomain(series, kind, undefined, stacked ? stackedMax(series, n) : undefined)

      // ── 격자 + 축. 눈에 띄지 않아야 한다(dataviz §recessive grid/axes).
      const g = svg('g', { 'aria-hidden': 'true' })
      for (let t = 0; t < DEFAULT_Y_TICKS; t++) {
        const value = domain.min + ((domain.max - domain.min) * t) / (DEFAULT_Y_TICKS - 1)
        const y = yToPx(value, domain, plotTop, plotBottom)
        const line = svg('line', { x1: plotLeft, y1: y, x2: plotRight, y2: y })
        line.setAttribute('class', 'crefle-chart-grid')
        g.appendChild(line)
        const tx = svg('text', { x: plotLeft - 8, y, dy: '0.32em' })
        tx.setAttribute('class', 'crefle-chart-tick')
        // 눈금은 **맨 숫자**다 — 단위를 붙이지 않는다.
        //   (a) 관례: 단위는 축이나 제목에 한 번 쓰고 눈금마다 반복하지 않는다.
        //   (b) 실제 버그였다: unit="점" 일 때 "56.2점" 이 text-anchor:end 로 x=36 에
        //       놓여 viewBox 왼쪽(-9)으로 삐져나가 "5" 가 잘렸다. 스크린샷을 보고서야
        //       발견했다 — dataviz §7 "validator 는 색을 보지 레이아웃을 보지 않는다".
        // 단위는 <figcaption> 의 제목과 직접 라벨이 나른다.
        tx.textContent = String(Math.round(value * 10) / 10)
        g.appendChild(tx)
      }
      const axis = svg('line', { x1: plotLeft, y1: plotBottom, x2: plotRight, y2: plotBottom })
      axis.setAttribute('class', 'crefle-chart-axis')
      g.appendChild(axis)

      const band = plotW / n
      for (let i = 0; i < n; i++) {
        const label = series[0]?.data[i]?.label ?? ''
        const x = kind === 'bar' ? plotLeft + i * band + band / 2 : xToPx(i, n, plotLeft, plotW)
        const tx = svg('text', { x, y: plotBottom + 20 })
        tx.setAttribute('class', 'crefle-chart-axis-label')
        tx.textContent = label
        g.appendChild(tx)
      }
      root.appendChild(g)

      if (kind === 'bar') this.drawBars(root, series, { n, band, plotLeft, plotBottom, plotH, domain, stacked, fmt })
      else this.drawLines(root, series, { n, plotLeft, plotW, plotTop, plotBottom, domain })
    }

    /** @param {SVGElement} root @param {any[]} series @param {any} m */
    drawBars(root, series, m) {
      const { n, band, plotLeft, plotBottom, plotH, domain, stacked, fmt } = m
      const groupW = band * BAR_GROUP_GAP_RATIO
      const barW = stacked ? groupW : groupW / series.length
      const heightFor = (/** @type {number} */ v) => Math.max(0, (plotH * (v - domain.min)) / (domain.max - domain.min))
      const offsets = new Array(n).fill(0)
      const single = series.length === 1

      series.forEach((s, si) => {
        const grp = svg('g', { 'data-slot': String(seriesSlot(si)) })
        if (s.color) grp.setAttribute('style', `--series-color:${s.color}`)
        s.data.forEach((/** @type {any} */ p, /** @type {number} */ i) => {
          const bh = heightFor(p.value)
          const gx = plotLeft + i * band + (band - groupW) / 2
          const x = stacked ? gx : gx + si * barW
          let y
          if (stacked) {
            y = plotBottom - offsets[i] - bh
            offsets[i] += bh
          } else y = plotBottom - bh

          const rect = svg('rect', {
            x,
            y,
            // 인접 채움 사이 2px 표면 간격 — 붙으면 경계가 사라진다.
            width: Math.max(1, barW - (single ? 0 : MARK_GAP)),
            height: bh,
            rx: 4 // dataviz §marks: 4px rounded data-ends
          })
          rect.setAttribute('class', 'crefle-chart-bar')
          rect.setAttribute('data-label', p.label)
          rect.setAttribute('data-value', String(p.value))
          grp.appendChild(rect)

          // 직접 라벨 — 단일 시리즈에만. 대비 relief 와 흑백 인쇄 의무를 갚는다.
          // 다중 시리즈에 다 붙이면 "a number on every point" 가 되어 dataviz 가 금지한다.
          if (single && bh > 0) {
            const t = svg('text', { x: x + barW / 2, y: y - 6 })
            t.setAttribute('class', 'crefle-chart-value')
            t.textContent = fmt(p.value)
            grp.appendChild(t)
          }
        })
        root.appendChild(grp)
      })
    }

    /** @param {SVGElement} root @param {any[]} series @param {any} m */
    drawLines(root, series, m) {
      const { n, plotLeft, plotW, plotTop, plotBottom, domain } = m
      series.forEach((s, si) => {
        const grp = svg('g', { 'data-slot': String(seriesSlot(si)) })
        if (s.color) grp.setAttribute('style', `--series-color:${s.color}`)
        const pts = s.data.map((/** @type {any} */ p, /** @type {number} */ i) => [
          xToPx(i, n, plotLeft, plotW),
          yToPx(p.value, domain, plotTop, plotBottom)
        ])
        const path = svg('path', { d: pts.map((/** @type {number[]} */ p, /** @type {number} */ i) => `${i ? 'L' : 'M'} ${p[0]} ${p[1]}`).join(' ') })
        path.setAttribute('class', 'crefle-chart-line')
        grp.appendChild(path)
        // 마커 ≥8px (dataviz §marks) — 겹치는 마크에 2px 표면 링.
        pts.forEach((/** @type {number[]} */ p, /** @type {number} */ i) => {
          const c = svg('circle', { cx: p[0], cy: p[1], r: POINT_RADIUS })
          c.setAttribute('class', 'crefle-chart-point')
          c.setAttribute('data-label', s.data[i].label)
          c.setAttribute('data-value', String(s.data[i].value))
          grp.appendChild(c)
        })
        root.appendChild(grp)
      })
    }
  }

  if (!customElements.get('crefle-chart')) customElements.define('crefle-chart', CrefleChart)
})()
