/* 寿命变长，是所有国家一起变好吗？
 * 1960–2019 世界银行国别数据 · 交互式可视化
 * 依赖 d3 v7（vendor/d3.min.js），无后端。
 */
(function () {
  'use strict';

  /* ------------------------------------------------------------------ */
  /* 0. 数据                                                             */
  /* ------------------------------------------------------------------ */

  const DATA = window.__LIFE_DATA__;
  if (!DATA) {
    document.getElementById('story').textContent = '数据未加载：请确认 data/countries.js 存在。';
    return;
  }

  const META = DATA.meta;
  const YEARS = META.years;
  const N = YEARS.length;
  const Y_MIN = YEARS[0];
  const Y_MAX = YEARS[N - 1];

  const COUNTRIES = DATA.countries;
  const BY_CODE = new Map(COUNTRIES.map((c) => [c.code, c]));
  // 点的大小是人口：按 2019 年人口从大到小画，大圆在下面，小圆不会被盖住
  const DRAW_ORDER = COUNTRIES.slice().sort((a, b) => (b.pop[N - 1] || 0) - (a.pop[N - 1] || 0));

  const REGION_COLOR = {
    'East Asia & Pacific': '#4E79A7',
    'Europe & Central Asia': '#B07AA1',
    'Latin America & Caribbean': '#F28E2B',
    'Middle East & North Africa': '#E15759',
    'North America': '#76B7B2',
    'South Asia': '#C9A227',
    'Sub-Saharan Africa': '#59A14F',
  };

  const isNum = (v) => v !== null && v !== undefined && Number.isFinite(v);
  const COARSE = !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches);

  function median(arr) {
    const a = arr.filter(isNum).sort((x, y) => x - y);
    if (!a.length) return null;
    const m = a.length >> 1;
    return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
  }

  /** 在年份之间线性插值；缺值年用相邻年补上。 */
  function valueAt(arr, t) {
    if (t <= Y_MIN) return arr[0];
    if (t >= Y_MAX) return arr[N - 1];
    const i = Math.floor(t - Y_MIN);
    const f = t - Y_MIN - i;
    const a = arr[i];
    const b = arr[i + 1];
    if (!isNum(a) && !isNum(b)) return null;
    if (!isNum(a)) return b;
    if (!isNum(b)) return a;
    return a + (b - a) * f;
  }

  /** 收入在对数轴上动，所以在对数空间插值，播放时不会忽快忽慢。 */
  function logValueAt(arr, t) {
    if (t <= Y_MIN) return arr[0];
    if (t >= Y_MAX) return arr[N - 1];
    const i = Math.floor(t - Y_MIN);
    const f = t - Y_MIN - i;
    const a = arr[i];
    const b = arr[i + 1];
    if (!isNum(a) && !isNum(b)) return null;
    if (!isNum(a)) return b;
    if (!isNum(b)) return a;
    if (a <= 0 || b <= 0) return a;
    return Math.pow(10, Math.log10(a) + (Math.log10(b) - Math.log10(a)) * f);
  }

  const METRICS = {
    fertility: {
      key: 'fertility',
      label: '生育率',
      title: '生育率与预期寿命',
      note: '实心点是这一年的位置，淡色小圈是 1960 年的起点；面积表示人口。',
      xLabel: '总和生育率（每名妇女生育数）',
      domain: [0.5, 9],
      ticks: [1, 2, 3, 4, 5, 6, 7, 8],
      from: 1960,
      tickLabels: [1960, 1975, 1990, 2005, 2019],
    },
    gdp: {
      key: 'gdp',
      label: '人均 GDP',
      title: '人均 GDP 与预期寿命',
      note: '实心点是这一年的位置，淡色小圈是 1990 年的起点；横轴为对数刻度。',
      xLabel: '人均 GDP（2017 年不变价国际元，对数）',
      domain: [400, 200000],
      ticks: [500, 1000, 2000, 5000, 10000, 20000, 50000, 100000],
      from: 1990,
      tickLabels: [1990, 1997, 2005, 2012, 2019],
    },
  };

  /** 各国的 (预期寿命, 横轴指标, 人口)；缺数据返回 null。 */
  function pointAt(c, t, metric) {
    const le = valueAt(c.le, t);
    if (!isNum(le)) return null;
    const x = metric === 'gdp' ? logValueAt(c.gdp, t) : valueAt(c.fertility, t);
    if (!isNum(x) || x <= 0) return null;
    const pop = valueAt(c.pop, t);
    return { le, x, pop: isNum(pop) ? pop : 0 };
  }

  /* 地区行：按 2019 年中位数从高到低固定排序 */
  const REGION_ROWS = [];
  (function buildRegionMeta() {
    const seen = new Map();
    for (const c of COUNTRIES) {
      if (!seen.has(c.region)) seen.set(c.region, []);
      seen.get(c.region).push(c);
    }
    for (const [region, cs] of seen) {
      REGION_ROWS.push({
        region,
        zh: cs[0].regionZh,
        color: REGION_COLOR[region] || '#8a8a8a',
        cs,
        m60: median(cs.map((c) => c.le[0])),
        m19: median(cs.map((c) => c.le[N - 1])),
      });
    }
    REGION_ROWS.sort((a, b) => (b.m19 == null ? -1 : b.m19) - (a.m19 == null ? -1 : a.m19));
  })();

  const MED_1960 = median(COUNTRIES.map((c) => c.le[0]).filter(isNum));

  /* ------------------------------------------------------------------ */
  /* 1. 状态                                                             */
  /* ------------------------------------------------------------------ */

  const state = {
    t: Y_MAX,
    playing: false,
    metric: 'fertility',
    hover: null,
    hoverRegion: null,
    focusRegion: null,
    selected: new Set(),
    recent: [],
    rows: [],
  };

  const els = {
    scatter: document.getElementById('scatter'),
    regions: document.getElementById('regions'),
    chips: document.getElementById('chips'),
    tip: document.getElementById('tip'),
    plot: document.querySelector('.chart-main'),
    chartTitle: document.getElementById('chart-title'),
    chartNote: document.getElementById('chart-note'),
    story: document.getElementById('story'),
    statMedian: document.getElementById('stat-median'),
    statOver70: document.getElementById('stat-over70'),
    statSpread: document.getElementById('stat-spread'),
    selCount: document.getElementById('sel-count'),
    play: document.getElementById('play'),
    year: document.getElementById('year'),
    yearLabel: document.getElementById('year-label'),
    ticks: document.querySelector('.ticks'),
    reset: document.getElementById('reset'),
    hint: document.querySelector('.hint'),
    nCountries: document.getElementById('n-countries'),
  };

  els.nCountries.textContent = COUNTRIES.length;
  if (COARSE) {
    els.hint.textContent = '单击圆点加入对比；点右上角的地区名可以只看一个地区。手机上没有拖框选择，以免影响滚动。';
  }

  const PLAY_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>';
  const PAUSE_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 5h4v14H7zM13 5h4v14h-4z"/></svg>';

  /* ------------------------------------------------------------------ */
  /* 2. 主图：气泡散点                                                    */
  /* ------------------------------------------------------------------ */

  let S = null;

  const fmtYearTick = (v) => (v >= 10000 ? v / 10000 + '万' : String(v));

  function buildScatter() {
    const node = els.scatter;
    const box = node.getBoundingClientRect();
    const W = Math.max(240, box.width);
    const H = Math.max(200, box.height);
    const svg = d3.select(node);
    svg.selectAll('*').remove();
    svg.attr('viewBox', '0 0 ' + W + ' ' + H);

    const m = { top: 16, right: 16, bottom: 46, left: 58 };
    const iw = W - m.left - m.right;
    const ih = H - m.top - m.bottom;
    if (iw < 40 || ih < 40) {
      S = null;
      return;
    }

    const spec = METRICS[state.metric];
    const x =
      state.metric === 'gdp'
        ? d3.scaleLog().domain(spec.domain).range([0, iw])
        : d3.scaleLinear().domain(spec.domain).range([0, iw]);
    const y = d3.scaleLinear().domain([15, 88]).range([ih, 0]);
    const r = d3.scaleSqrt().domain([3e4, 1.45e9]).range([2.2, 26]).clamp(true);

    const g = svg.append('g').attr('transform', 'translate(' + m.left + ',' + m.top + ')');

    const xTicks = spec.ticks;
    const yTicks = [20, 30, 40, 50, 60, 70, 80];

    const grid = g.append('g').attr('class', 'grid');
    grid
      .selectAll('line.h')
      .data(yTicks)
      .join('line')
      .attr('class', 'h')
      .attr('x1', 0)
      .attr('x2', iw)
      .attr('y1', (d) => y(d))
      .attr('y2', (d) => y(d));
    grid
      .selectAll('line.v')
      .data(xTicks)
      .join('line')
      .attr('class', 'v')
      .attr('y1', 0)
      .attr('y2', ih)
      .attr('x1', (d) => x(d))
      .attr('x2', (d) => x(d))
      .attr('opacity', 0.55);

    // 1960 年的国家中位数：一条参照线，看后来有多少国家从它下面走到上面
    const refG = g.append('g').attr('class', 'ref');
    refG
      .append('line')
      .attr('x1', 0)
      .attr('x2', iw)
      .attr('y1', y(MED_1960))
      .attr('y2', y(MED_1960))
      .attr('stroke', '#c6b9a3')
      .attr('stroke-width', 1)
      .attr('stroke-dasharray', '4 4');
    refG
      .append('text')
      .attr('x', state.metric === 'gdp' ? iw - 2 : 4)
      .attr('y', y(MED_1960) - 6)
      .attr('text-anchor', state.metric === 'gdp' ? 'end' : 'start')
      .attr('font-size', 10)
      .attr('fill', '#a2947f')
      .attr('paint-order', 'stroke')
      .attr('stroke', '#fffdf8')
      .attr('stroke-width', 3)
      .text('1960 年国家中位数 ' + MED_1960.toFixed(1) + ' 岁');

    g.append('g')
      .attr('class', 'axis')
      .attr('transform', 'translate(0,' + ih + ')')
      .call(d3.axisBottom(x).tickValues(xTicks).tickFormat(fmtYearTick).tickSizeOuter(0));
    g.append('g')
      .attr('class', 'axis')
      .call(d3.axisLeft(y).tickValues(yTicks).tickSizeOuter(0));

    g.append('text')
      .attr('class', 'axis-label')
      .attr('x', iw)
      .attr('y', ih + 38)
      .attr('text-anchor', 'end')
      .text(spec.xLabel);

    g.append('text')
      .attr('class', 'axis-label')
      .attr('x', 0)
      .attr('y', -5)
      .text('出生时预期寿命（岁）');

    const gTrails = g.append('g').attr('class', 'trails');
    const gGhosts = g.append('g').attr('class', 'ghosts');
    const gBrush = g.append('g').attr('class', 'brush');
    const gBubbles = g.append('g').attr('class', 'bubbles');
    const gLabels = g.append('g').attr('class', 'labels');
    // 参照线的文字放到最上层，免得被圆点盖住
    const gRefLabel = g.append('g').attr('class', 'ref-label');
    gRefLabel.node().appendChild(g.select('g.ref text').node());

    // 起点年份的“影子”：年份往后走时淡入，说明今天的位置是从哪里来的
    const ghostYear = spec.from;
    const ghosts = DRAW_ORDER.map((c) => {
      const p = pointAt(c, ghostYear, state.metric);
      return p ? { c, x: p.x, le: p.le } : null;
    }).filter(Boolean);
    gGhosts
      .selectAll('circle.ghost')
      .data(ghosts, (d) => d.c.code)
      .join('circle')
      .attr('class', 'ghost')
      .attr('cx', (d) => x(d.x))
      .attr('cy', (d) => y(d.le))
      .attr('r', 2.6)
      .attr('fill', 'none')
      .attr('stroke', (d) => REGION_COLOR[d.c.region] || '#8a8a8a')
      .attr('stroke-width', 1)
      .attr('pointer-events', 'none');

    const brush = d3
      .brush()
      .extent([
        [0, 0],
        [iw, ih],
      ])
      .on('end', onBrushEnd);
    // 触屏上不启用刷选：否则整块图会吃掉纵向滚动
    if (!COARSE) gBrush.call(brush);

    S = { W, H, m, iw, ih, x, y, r, spec, g, gTrails, gGhosts, gBubbles, gLabels, gBrush, brush, ghostYear };
  }

  function onBrushEnd(ev) {
    if (!ev.sourceEvent || !S) return;
    const sel = ev.selection;
    if (!sel) return;
    const [[x0, y0], [x1, y1]] = sel;
    if (x1 - x0 < 4 && y1 - y0 < 4) {
      S.gBrush.call(S.brush.move, null);
      return;
    }
    let added = 0;
    for (const d of state.rows) {
      const px = S.x(d.x);
      const py = S.y(d.le);
      if (px >= x0 && px <= x1 && py >= y0 && py <= y1) {
        state.selected.add(d.c.code);
        added++;
      }
    }
    S.gBrush.call(S.brush.move, null);
    if (added) {
      renderChips();
      renderAll();
    }
  }

  function opacityFor(d) {
    const code = d.c.code;
    if (state.hover && state.hover !== code) return 0.07;
    if (state.selected.has(code)) return 1;
    if (state.focusRegion && d.c.region !== state.focusRegion) return 0.06;
    if (state.hoverRegion && d.c.region !== state.hoverRegion) return 0.12;
    return 0.58;
  }

  function drawBubbles() {
    if (!S) return;
    const sel = S.gBubbles.selectAll('circle.bub').data(DRAW_ORDER.map((c) => {
      const p = pointAt(c, state.t, state.metric);
      return p ? { c, le: p.le, x: p.x, pop: p.pop } : null;
    }).filter(Boolean), (d) => d.c.code);

    sel
      .join(
        (enter) =>
          enter
            .append('circle')
            .attr('class', 'bub')
            .on('pointerenter', onBubEnter)
            .on('pointermove', onBubMove)
            .on('pointerleave', onBubLeave)
            .on('click', onBubClick),
        (update) => update,
        (exit) => exit.remove()
      )
      .attr('cx', (d) => S.x(d.x))
      .attr('cy', (d) => S.y(d.le))
      .attr('r', (d) => Math.max(2.2, S.r(d.pop)))
      .attr('fill', (d) => REGION_COLOR[d.c.region] || '#8a8a8a')
      .attr('fill-opacity', opacityFor)
      .attr('stroke', (d) => (state.selected.has(d.c.code) || state.hover === d.c.code ? '#201e1b' : 'none'))
      .attr('stroke-width', (d) => (state.selected.has(d.c.code) ? 1.4 : state.hover === d.c.code ? 1 : 0))
      .style('cursor', 'pointer');

    if (state.selected.size) {
      sel.filter((d) => state.selected.has(d.c.code)).raise();
    }
  }

  function drawLabels() {
    if (!S) return;
    const rows = state.rows;
    const byCode = new Map(rows.map((d) => [d.c.code, d]));
    const top = rows
      .slice()
      .sort((a, b) => (b.pop || 0) - (a.pop || 0))
      .slice(0, 4);
    const picked = new Map(top.map((d) => [d.c.code, d]));
    state.selected.forEach((code) => {
      const d = byCode.get(code);
      if (d) picked.set(code, d);
    });
    const arr = [...picked.values()];

    S.gLabels
      .selectAll('text.clab')
      .data(arr, (d) => d.c.code)
      .join('text')
      .attr('class', 'clab')
      .attr('x', (d) => S.x(d.x))
      .attr('y', (d) => S.y(d.le) - Math.max(2.2, S.r(d.pop)) - 4)
      .attr('text-anchor', 'middle')
      .attr('fill', '#5f584f')
      .attr('font-size', 10.5)
      .attr('paint-order', 'stroke')
      .attr('stroke', '#fffdf8')
      .attr('stroke-width', 2.5)
      .attr('stroke-linejoin', 'round')
      .attr('opacity', (d) => (state.hover && state.hover !== d.c.code ? 0.25 : 0.95))
      .text((d) => d.c.zh);
  }

  function trailPath(c) {
    if (!S) return null;
    const pts = [];
    const end = Math.min(Math.floor(state.t), Y_MAX);
    for (let yr = Y_MIN; yr <= end; yr++) {
      const p = pointAt(c, yr, state.metric);
      pts.push(p ? { x: S.x(p.x), y: S.y(p.le) } : null);
    }
    const cur = pointAt(c, state.t, state.metric);
    pts.push(cur ? { x: S.x(cur.x), y: S.y(cur.le) } : null);

    let d = '';
    let pen = false;
    for (const p of pts) {
      if (!p) {
        pen = false;
        continue;
      }
      d += (pen ? 'L' : 'M') + p.x.toFixed(1) + ',' + p.y.toFixed(1);
      pen = true;
    }
    return d || null;
  }

  function drawGhosts() {
    if (!S) return;
    const fade = Math.max(0, Math.min(1, (state.t - S.ghostYear - 4) / 16));
    S.gGhosts.attr('display', fade > 0.001 ? null : 'none');
    if (fade <= 0.001) return;
    S.gGhosts.selectAll('circle.ghost').attr('stroke-opacity', (d) => {
      let o = 0.34 * fade;
      if (state.hover && state.hover !== d.c.code) o *= 0.2;
      if (state.focusRegion && d.c.region !== state.focusRegion) o *= 0.2;
      return o;
    });
  }

  function drawTrails() {
    if (!S) return;
    const codes = new Set(state.selected);
    if (state.hover) codes.add(state.hover);
    const items = [...codes]
      .slice(0, 14)
      .map((code) => BY_CODE.get(code))
      .filter(Boolean)
      .map((c) => ({
        c,
        d: trailPath(c),
        strong: state.hover === c.code,
      }))
      .filter((d) => d.d);

    S.gTrails
      .selectAll('path.trail')
      .data(items, (d) => d.c.code)
      .join('path')
      .attr('class', 'trail')
      .attr('d', (d) => d.d)
      .attr('fill', 'none')
      .attr('stroke', (d) => REGION_COLOR[d.c.region] || '#8a8a8a')
      .attr('stroke-width', (d) => (d.strong ? 1.7 : 1.2))
      .attr('stroke-linejoin', 'round')
      .attr('stroke-linecap', 'round')
      .attr('opacity', (d) => (d.strong ? 0.75 : 0.42));
  }

  /* ------------------------------------------------------------------ */
  /* 3. 右上：按地区排列的寿命点                                          */
  /* ------------------------------------------------------------------ */

  let R = null;

  const hash01 = (str) => {
    let h = 0;
    for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) % 9973;
    return h / 9973;
  };

  function buildRegions() {
    const node = els.regions;
    const box = node.getBoundingClientRect();
    const W = Math.max(220, box.width);
    const H = Math.max(150, box.height);
    const svg = d3.select(node);
    svg.selectAll('*').remove();
    svg.attr('viewBox', '0 0 ' + W + ' ' + H);

    const m = { top: 12, right: 10, bottom: 20, left: 124 };
    const iw = W - m.left - m.right;
    const ih = H - m.top - m.bottom;
    if (iw < 40 || ih < 40) {
      R = null;
      return;
    }

    const x = d3.scaleLinear().domain([18, 88]).range([0, iw]);
    const rowH = ih / REGION_ROWS.length;
    const g = svg.append('g').attr('transform', 'translate(' + m.left + ',' + m.top + ')');

    g.append('g')
      .attr('class', 'axis')
      .attr('transform', 'translate(0,' + ih + ')')
      .call(d3.axisBottom(x).tickValues([20, 30, 40, 50, 60, 70, 80]).tickSizeOuter(0));

    const rows = REGION_ROWS.map((rg, i) => {
      const y0 = i * rowH;
      const cy = y0 + rowH / 2;
      const row = g.append('g').attr('class', 'rrow').datum(rg);

      row
        .append('rect')
        .attr('x', -m.left)
        .attr('y', y0)
        .attr('width', W)
        .attr('height', rowH)
        .attr('fill', 'transparent');

      if (i > 0) {
        row
          .append('line')
          .attr('x1', -m.left + 4)
          .attr('x2', iw)
          .attr('y1', y0)
          .attr('y2', y0)
          .attr('stroke', '#f1ece1');
      }

      const label = row
        .append('text')
        .attr('class', 'row-label')
        .attr('x', -10)
        .attr('y', cy + 4)
        .attr('text-anchor', 'end')
        .on('click', (ev, d) => {
          ev.stopPropagation();
          state.focusRegion = state.focusRegion === d.region ? null : d.region;
          renderAll();
        });
      label.append('tspan').text(rg.zh);
      label.append('tspan').attr('class', 'n').text(' ' + rg.cs.length);

      const dotSel = row
        .append('g')
        .selectAll('circle')
        .data(rg.cs, (c) => c.code)
        .join('circle')
        .attr('r', 2.6)
        .attr('fill', rg.color)
        .attr('cy', (c) => cy + (hash01(c.code) - 0.5) * rowH * 0.56)
        .attr('opacity', 0.55);

      const conn = row
        .append('line')
        .attr('x1', x(rg.m60))
        .attr('x2', x(rg.m19 == null ? rg.m60 : rg.m19))
        .attr('y1', cy)
        .attr('y2', cy)
        .attr('stroke', '#dcd2c0')
        .attr('stroke-width', 1);

      const baseRing = row
        .append('circle')
        .attr('cx', x(rg.m60))
        .attr('cy', cy)
        .attr('r', 3.1)
        .attr('fill', 'none')
        .attr('stroke', '#a99d89')
        .attr('stroke-width', 1.1);

      const tick = row
        .append('g')
        .append('line')
        .attr('y1', -7)
        .attr('y2', 7)
        .attr('stroke', '#3a352f')
        .attr('stroke-width', 2)
        .attr('stroke-linecap', 'round');

      row
        .on('pointerenter', (ev, d) => {
          state.hoverRegion = d.region;
          renderAll();
        })
        .on('pointerleave', () => {
          state.hoverRegion = null;
          renderAll();
        });

      return { rg, row, label, dotSel, conn, tick, cy };
    });

    R = { W, H, m, iw, ih, x, rowH, rows };
  }

  function drawRegions() {
    if (!R) return;
    const t = state.t;
    const hoverRegionOfCountry = state.hover ? (BY_CODE.get(state.hover) || {}).region : null;

    for (const row of R.rows) {
      const vals = [];
      row.dotSel
        .attr('cx', (c) => {
          const v = valueAt(c.le, t);
          if (!isNum(v)) return -100;
          vals.push(v);
          return R.x(v);
        })
        .attr('opacity', (c) => (isNum(valueAt(c.le, t)) ? 0.55 : 0))
        .attr('stroke', (c) => (state.selected.has(c.code) ? '#201e1b' : 'none'))
        .attr('stroke-width', (c) => (state.selected.has(c.code) ? 1.1 : 0));

      const med = median(vals);
      if (med == null) {
        row.tick.attr('opacity', 0);
      } else {
        row.tick.attr('opacity', 1).attr('transform', 'translate(' + R.x(med) + ',' + row.cy + ')');
      }
      row.conn.attr('x2', med == null ? R.x(row.rg.m60) : R.x(med));

      const dim =
        (state.focusRegion && state.focusRegion !== row.rg.region) ||
        (state.hoverRegion && state.hoverRegion !== row.rg.region) ||
        (hoverRegionOfCountry && hoverRegionOfCountry !== row.rg.region);
      row.row.attr('opacity', dim ? 0.25 : 1);
      row.label
        .classed('active', state.focusRegion === row.rg.region)
        .classed('hl', hoverRegionOfCountry === row.rg.region);
    }
  }

  /* ------------------------------------------------------------------ */
  /* 4. 右下：选中的国家                                                  */
  /* ------------------------------------------------------------------ */

  let chipMarks = [];

  const PRESET_HTML =
    '<div class="presets">' +
    '<p>还没有选国家。从这三个故事开始，或者直接在左图拖框：</p>' +
    '<button class="preset" type="button" data-preset="niger">尼日尔 · 收入几乎没变，寿命多了 27 年' +
    '<small>1960 年 35.1 岁 → 2019 年 62.4 岁；人均 GDP 只从 1,125 走到 1,225</small></button>' +
    '<button class="preset" type="button" data-preset="lesotho">莱索托与斯威士兰 · 收入涨了，寿命反而变短' +
    '<small>2005 年前后掉到 42 岁，后来回升，但仍低于自己的 1990 年</small></button>' +
    '<button class="preset" type="button" data-preset="korea">中国与韩国 · 收入和寿命一起往上' +
    '<small>1970 年代到现在，一路向右上角走</small></button>' +
    '</div>';

  function renderChips() {
    const host = d3.select(els.chips);
    host.selectAll('*').remove();
    chipMarks = [];
    els.selCount.textContent = state.selected.size;

    if (!state.selected.size) {
      host.html(PRESET_HTML);
      return;
    }

    const MAX_CHIPS = 12;
    const popOrder = [...state.selected].sort((a, b) => {
      const ca = BY_CODE.get(a);
      const cb = BY_CODE.get(b);
      return (cb ? cb.pop[N - 1] || 0 : 0) - (ca ? ca.pop[N - 1] || 0 : 0);
    });
    const visibleCodes = [...new Set([...state.recent, ...popOrder])]
      .filter((code) => state.selected.has(code) && BY_CODE.has(code))
      .slice(0, MAX_CHIPS);

    for (const code of visibleCodes) {
      const c = BY_CODE.get(code);
      if (!c) continue;

      const chip = host.append('div').attr('class', 'chip');

      const top = chip.append('div').attr('class', 'chip-top');
      top.append('span').attr('class', 'chip-name').text(c.zh);

      const first = c.le.find(isNum);
      const last = c.le[N - 1];
      const delta = isNum(first) && isNum(last) ? last - first : null;
      top
        .append('span')
        .attr('class', 'chip-delta')
        .classed('down', delta != null && delta < 0)
        .text(delta == null ? '' : (delta >= 0 ? '+' : '−') + Math.abs(delta).toFixed(1));

      top
        .append('button')
        .attr('class', 'chip-x')
        .attr('type', 'button')
        .attr('aria-label', '移除 ' + c.zh)
        .text('×')
        .on('click', (ev) => {
          ev.stopPropagation();
          state.selected.delete(code);
          renderChips();
          renderAll();
        });

      const spark = chip
        .append('svg')
        .attr('viewBox', '0 0 100 30')
        .attr('preserveAspectRatio', 'none')
        .attr('aria-hidden', 'true');
      const w = Math.max(60, spark.node().getBoundingClientRect().width || 100);
      spark.attr('viewBox', '0 0 ' + w + ' 30');

      const sx = d3.scaleLinear().domain([Y_MIN, Y_MAX]).range([2, w - 2]);
      const sy = d3.scaleLinear().domain([18, 88]).range([26, 4]);

      if (isNum(first)) {
        spark
          .append('line')
          .attr('x1', 2)
          .attr('x2', w - 2)
          .attr('y1', sy(first))
          .attr('y2', sy(first))
          .attr('stroke', '#e0d6c4')
          .attr('stroke-width', 1)
          .attr('stroke-dasharray', '2 3')
          .attr('vector-effect', 'non-scaling-stroke');
      }

      let dPath = '';
      let pen = false;
      for (let i = 0; i < N; i++) {
        const v = c.le[i];
        if (!isNum(v)) {
          pen = false;
          continue;
        }
        const px = sx(YEARS[i]);
        const py = sy(v);
        dPath += (pen ? 'L' : 'M') + px.toFixed(1) + ',' + py.toFixed(1);
        pen = true;
      }

      spark
        .append('path')
        .attr('d', dPath)
        .attr('fill', 'none')
        .attr('stroke', REGION_COLOR[c.region] || '#8a8a8a')
        .attr('stroke-width', 1.6)
        .attr('stroke-linejoin', 'round')
        .attr('stroke-linecap', 'round')
        .attr('vector-effect', 'non-scaling-stroke');

      const dot = spark
        .append('circle')
        .attr('r', 2.4)
        .attr('fill', '#fffdf8')
        .attr('stroke', REGION_COLOR[c.region] || '#8a8a8a')
        .attr('stroke-width', 1.6)
        .attr('vector-effect', 'non-scaling-stroke');

      chipMarks.push({ code, dot, sx, sy });

      const from = isNum(first) ? first.toFixed(1) : '—';
      const to = isNum(last) ? last.toFixed(1) : '—';
      chip
        .append('div')
        .attr('class', 'chip-note')
        .text(from + ' → ' + to + ' 岁 · ' + c.incomeZh);
    }

    if (state.selected.size > visibleCodes.length) {
      host
        .append('p')
        .attr('class', 'chips-more')
        .text(
          '另有 ' +
            (state.selected.size - visibleCodes.length) +
            ' 个国家已高亮；这里只列出人口最多的 ' +
            visibleCodes.length +
            ' 个，点 × 可以移除。'
        );
    }
  }

  function updateChipDots() {
    for (const m of chipMarks) {
      const c = BY_CODE.get(m.code);
      if (!c) continue;
      const v = valueAt(c.le, state.t);
      if (!isNum(v)) {
        m.dot.attr('opacity', 0);
      } else {
        m.dot.attr('opacity', 1).attr('cx', m.sx(state.t)).attr('cy', m.sy(v));
      }
    }
  }

  function applyPreset(name) {
    setPlaying(false);
    if (name === 'niger') {
      setMetric('gdp', { silent: true });
      state.selected = new Set(['NER']);
      state.recent = ['NER'];
      state.t = Y_MAX;
    } else if (name === 'lesotho') {
      setMetric('gdp', { silent: true });
      state.selected = new Set(['LSO', 'SWZ']);
      state.recent = ['LSO', 'SWZ'];
      state.t = 2005;
    } else if (name === 'korea') {
      setMetric('gdp', { silent: true });
      state.selected = new Set(['CHN', 'KOR']);
      state.recent = ['CHN', 'KOR'];
      state.t = Y_MAX;
    }
    syncSlider();
    renderChips();
    renderAll();
  }

  /* ------------------------------------------------------------------ */
  /* 5. 统计与叙述                                                        */
  /* ------------------------------------------------------------------ */

  function statsAt(t) {
    const vals = [];
    for (const c of COUNTRIES) {
      const v = valueAt(c.le, t);
      if (isNum(v)) vals.push(v);
    }
    return {
      vals,
      med: median(vals),
      lo: d3.min(vals),
      hi: d3.max(vals),
      over70: vals.filter((v) => v >= 70).length,
    };
  }

  /** 某一年的叙述文字。做成纯函数，好拿它预先量出这块需要的高度。 */
  function storyHTML(t, stats) {
    const s = stats || statsAt(t);
    const med = s.med;
    const y = Math.round(t);
    const medStr = med == null ? '—' : med.toFixed(1);

    if (y < 1990) {
      const head =
        Math.abs(t - Y_MIN) < 0.6
          ? '这是起点：1960 年，国家寿命中位数 <em>' + MED_1960.toFixed(1) + ' 岁</em>。'
          : '1960 年，国家寿命中位数是 ' +
            MED_1960.toFixed(1) +
            ' 岁；' +
            y +
            ' 年是 <em>' +
            medStr +
            ' 岁</em>。';
      return head + '整体在往上走，但曲线并不直：1970 年代末，柬埔寨一度跌到 19 岁。';
    }
    if (y <= 2005) {
      return (
        '1990 年代，南部非洲掉头向下：莱索托和斯威士兰比 1990 年更短命，卢旺达在 1994 年跌到 28 岁。这一年，国家中位数是 <em>' +
        medStr +
        ' 岁</em>。'
      );
    }
    let below90 = 0;
    for (const c of COUNTRIES) {
      const a = valueAt(c.le, 1990);
      const b = valueAt(c.le, t);
      if (isNum(a) && isNum(b) && b < a) below90++;
    }
    return (
      y +
      ' 年，国家中位数 <em>' +
      medStr +
      ' 岁</em>，比 1960 年高 ' +
      (med - MED_1960).toFixed(1) +
      ' 岁；' +
      s.vals.length +
      ' 个国家里，仍有 ' +
      below90 +
      ' 个低于自己的 1990 年。'
    );
  }

  /**
   * 叙述文字的长短随年份在 1 行和 2 行之间跳，而那会让整块 header 变高变矮、
   * 进而挤动下面的图表（播放时就是一顿一顿的抖动）。
   * 这里按当前宽度把 60 个年份的文字都量一遍，把这块的高度固定成最坏情况。
   */
  function lockStoryHeight() {
    const el = els.story;
    const w = el.clientWidth;
    if (!w) return;

    const probe = el.cloneNode(false);
    probe.removeAttribute('id');
    probe.setAttribute('aria-hidden', 'true');
    probe.style.position = 'absolute';
    probe.style.left = '-9999px';
    probe.style.top = '0';
    probe.style.width = w + 'px';
    probe.style.minHeight = '0';
    probe.style.visibility = 'hidden';
    document.body.appendChild(probe);

    let max = 0;
    for (let y = Y_MIN; y <= Y_MAX; y++) {
      probe.innerHTML = storyHTML(y);
      // offsetHeight 会四舍五入到整数，差零点几像素就会让下面的图表抖一像素
      max = Math.max(max, probe.getBoundingClientRect().height);
    }
    probe.remove();

    el.style.minHeight = Math.ceil(max) + 'px';
  }

  function updateStatsAndStory() {
    const s = statsAt(state.t);

    els.statMedian.textContent = s.med == null ? '—' : s.med.toFixed(1);
    els.statOver70.textContent = s.over70;
    els.statSpread.textContent = s.lo == null || s.hi == null ? '—' : (s.hi - s.lo).toFixed(1);

    els.story.innerHTML = storyHTML(state.t, s);
  }

  function syncSlider() {
    els.year.value = String(Math.round(state.t));
    els.yearLabel.textContent = String(Math.round(state.t));
  }

  /* ------------------------------------------------------------------ */
  /* 6. 提示框                                                            */
  /* ------------------------------------------------------------------ */

  const fmtInt = d3.format(',');

  function tipContent(c) {
    const y = Math.round(state.t);
    const le = valueAt(c.le, state.t);
    const gdp = valueAt(c.gdp, state.t);
    const fert = valueAt(c.fertility, state.t);
    const rows = [
      '<dt>预期寿命</dt><dd>' + (isNum(le) ? le.toFixed(1) + ' 岁' : '—') + '</dd>',
      '<dt>人均 GDP</dt><dd>' + (isNum(gdp) ? fmtInt(Math.round(gdp)) : '—') + '</dd>',
      '<dt>生育率</dt><dd>' + (isNum(fert) ? fert.toFixed(2) : '—') + '</dd>',
      '<dt>地区</dt><dd>' + c.regionZh + '</dd>',
      '<dt>收入组</dt><dd>' + c.incomeZh + '</dd>',
    ];
    return (
      '<div class="tip-head"><b>' +
      c.zh +
      '</b><span>' +
      c.name +
      ' · ' +
      y +
      '</span></div><dl>' +
      rows.join('') +
      '</dl>'
    );
  }

  function showTip(ev, c) {
    els.tip.innerHTML = tipContent(c);
    els.tip.classList.add('on');
    moveTip(ev);
  }

  function moveTip(ev) {
    const pad = 14;
    const box = els.tip.getBoundingClientRect();
    let x = ev.clientX + pad;
    let y = ev.clientY + pad;
    if (x + box.width > window.innerWidth - 8) x = ev.clientX - box.width - pad;
    if (y + box.height > window.innerHeight - 8) y = ev.clientY - box.height - pad;
    els.tip.style.left = Math.max(8, x) + 'px';
    els.tip.style.top = Math.max(8, y) + 'px';
  }

  function hideTip() {
    els.tip.classList.remove('on');
  }

  /* ------------------------------------------------------------------ */
  /* 7. 事件                                                              */
  /* ------------------------------------------------------------------ */

  function onBubEnter(ev, d) {
    state.hover = d.c.code;
    showTip(ev, d.c);
    renderAll();
  }

  function onBubMove(ev, d) {
    if (els.tip.classList.contains('on')) moveTip(ev);
  }

  function onBubLeave() {
    state.hover = null;
    hideTip();
    renderAll();
  }

  function onBubClick(ev, d) {
    ev.stopPropagation();
    const code = d.c.code;
    if (state.selected.has(code)) {
      state.selected.delete(code);
      state.recent = state.recent.filter((x) => x !== code);
    } else {
      state.selected.add(code);
      state.recent = [code, ...state.recent.filter((x) => x !== code)].slice(0, 24);
    }
    renderChips();
    renderAll();
  }

  els.chips.addEventListener('click', (ev) => {
    const btn = ev.target.closest('[data-preset]');
    if (btn) applyPreset(btn.dataset.preset);
  });

  let rafId = null;
  let lastTs = 0;
  const SPEED = 12; // 年 / 秒

  function setPlaying(on) {
    if (on) {
      if (state.t >= Y_MAX - 0.01) state.t = METRICS[state.metric].from;
      state.playing = true;
      lastTs = 0;
      els.play.innerHTML = PAUSE_ICON;
      els.play.setAttribute('aria-label', '暂停时间轴');
      els.play.setAttribute('aria-pressed', 'true');
      rafId = requestAnimationFrame(step);
    } else {
      state.playing = false;
      if (rafId) cancelAnimationFrame(rafId);
      rafId = null;
      els.play.innerHTML = PLAY_ICON;
      els.play.setAttribute('aria-label', '播放时间轴');
      els.play.setAttribute('aria-pressed', 'false');
    }
  }

  function step(ts) {
    if (!state.playing) return;
    if (!lastTs) lastTs = ts;
    const dt = Math.min(80, ts - lastTs) / 1000;
    lastTs = ts;
    state.t += dt * SPEED;
    if (state.t >= Y_MAX) {
      state.t = Y_MAX;
      renderAll();
      setPlaying(false);
      return;
    }
    renderAll();
    rafId = requestAnimationFrame(step);
  }

  els.play.addEventListener('click', () => setPlaying(!state.playing));

  els.year.addEventListener('input', (ev) => {
    setPlaying(false);
    state.t = Number(ev.target.value);
    renderAll();
  });

  els.reset.addEventListener('click', () => {
    setPlaying(false);
    state.selected.clear();
    state.recent = [];
    state.focusRegion = null;
    state.hover = null;
    state.hoverRegion = null;
    state.t = Y_MAX;
    setMetric('fertility', { silent: true });
    state.t = Y_MAX;
    syncSlider();
    renderChips();
    renderAll();
  });

  document.addEventListener('keydown', (ev) => {
    const tag = (ev.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'button') return;
    if (ev.code === 'Space') {
      ev.preventDefault();
      setPlaying(!state.playing);
    } else if (ev.key === 'Escape') {
      state.selected.clear();
      state.recent = [];
      renderChips();
      renderAll();
    }
  });

  /* 指标切换 */
  function setMetric(metric, opts) {
    const silent = opts && opts.silent;
    const spec = METRICS[metric];
    if (!spec) return;
    state.metric = metric;

    document.querySelectorAll('.toggle button').forEach((b) => {
      const on = b.dataset.metric === metric;
      b.classList.toggle('on', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });

    els.chartTitle.textContent = spec.title;
    els.chartNote.textContent = spec.note;

    els.year.min = String(spec.from);
    els.year.max = String(Y_MAX);
    els.ticks.innerHTML = spec.tickLabels.map((y) => '<span>' + y + '</span>').join('');

    if (state.t < spec.from) state.t = spec.from;
    if (state.t > Y_MAX) state.t = Y_MAX;

    buildScatter();
    if (!silent) {
      syncSlider();
      renderAll();
    }
  }

  document.querySelectorAll('.toggle button').forEach((b) => {
    b.addEventListener('click', () => setMetric(b.dataset.metric));
  });

  /* ------------------------------------------------------------------ */
  /* 8. 渲染总入口                                                        */
  /* ------------------------------------------------------------------ */

  function renderAll() {
    const t = state.t;
    state.rows = DRAW_ORDER.map((c) => {
      const p = pointAt(c, t, state.metric);
      return p ? { c, le: p.le, x: p.x, pop: p.pop } : null;
    }).filter(Boolean);

    drawBubbles();
    drawGhosts();
    drawLabels();
    drawTrails();
    drawRegions();
    updateStatsAndStory();
    updateChipDots();
    syncSlider();

    // 播放时悬停：提示框里的数字跟着年份走
    if (state.hover && els.tip.classList.contains('on')) {
      const c = BY_CODE.get(state.hover);
      if (c) els.tip.innerHTML = tipContent(c);
    }
  }

  /* ------------------------------------------------------------------ */
  /* 9. 启动                                                              */
  /* ------------------------------------------------------------------ */

  function buildAll() {
    lockStoryHeight();
    buildScatter();
    buildRegions();
    renderChips();
    renderAll();
  }

  let resizeTimer = null;
  function relayout() {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      lockStoryHeight();
      buildScatter();
      buildRegions();
      renderChips();
      renderAll();
    }, 140);
  }

  if (window.ResizeObserver) {
    const ro = new ResizeObserver(relayout);
    ro.observe(els.scatter.parentElement);
    ro.observe(els.regions.parentElement);
  }
  window.addEventListener('resize', relayout);

  lockStoryHeight();
  setMetric('fertility', { silent: true });
  buildRegions();
  renderChips();
  syncSlider();
  renderAll();

  // 字体加载完成后行高会变，再量一次
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(lockStoryHeight).catch(() => {});
  }

  // 调试/演示用：控制台里可以拿到状态，便于截图和验收
  window.__viz = { state, renderAll, setMetric, applyPreset, stop: () => setPlaying(false) };

  // 首次进入时从 1960 播放一遍，让人先看到“整片在动”
  const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!reduceMotion) {
    window.setTimeout(() => {
      if (!state.playing && state.t === Y_MAX && !state.selected.size) {
        state.t = Y_MIN;
        renderAll();
        setPlaying(true);
      }
    }, 600);
  }
})();
