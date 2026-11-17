// Token Radar frontend controller (static, no network).
(function () {
  'use strict';

  var DATA = window.RADAR_DATA;
  if (!DATA) return;

  var state = {
    q: '',
    category: 'all',
    chain: 'all',
    tab: 'pre-token',
    sort: 'rank',
    dir: 1,
    selectedSlug: null,
  };

  var usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return usd.format(n);
  }

  function fmtPct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }

  function fmtAge(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 365) return (days / 365).toFixed(1) + 'y';
    return Math.max(0, Math.round(days)) + 'd';
  }

  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'class') node.className = attrs[k];
        else if (k === 'text') node.textContent = attrs[k];
        else if (k === 'html') node.innerHTML = attrs[k];
        else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), attrs[k]);
        else if (attrs[k] !== null && attrs[k] !== undefined) node.setAttribute(k, attrs[k]);
      });
    }
    for (var i = 2; i < arguments.length; i++) {
      var child = arguments[i];
      if (child === null || child === undefined) continue;
      if (Array.isArray(child)) child.forEach(function (c) { if (c) node.appendChild(c); });
      else if (typeof child === 'string') node.appendChild(document.createTextNode(child));
      else node.appendChild(child);
    }
    return node;
  }

  // Handle URL query string hooks for screenshot generation
  function readQueryParams() {
    var params = new URLSearchParams(window.location.search);
    var shot = params.get('shot');
    var slug = params.get('slug');
    var cat = params.get('category');
    var chain = params.get('chain');
    var tab = params.get('tab');

    if (shot === 'detail' && slug) {
      state.selectedSlug = slug;
    } else if (shot === 'filtered') {
      if (cat) state.category = cat;
      if (chain) state.chain = chain;
    }
    if (tab === 'live' || tab === 'model' || tab === 'pre-token') {
      state.tab = tab;
    }
  }

  function initHeader() {
    document.getElementById('meta-date').textContent = 'Snapshot: ' + DATA.as_of;
    document.getElementById('meta-watchlist').textContent = 'Watchlist: ' + DATA.watchlist_size;
    document.getElementById('meta-board').textContent = 'Board: ' + DATA.board_size;
    document.getElementById('f-board').textContent = DATA.board_size;
    document.getElementById('f-live').textContent = DATA.live_size;
  }

  function initControls() {
    var cats = DATA.category_multiples.map(function(m) { return m.category; }).sort();
    var catSelect = document.getElementById('category');
    cats.forEach(function(c) {
      catSelect.appendChild(el('option', { value: c, text: c }));
    });

    var chainSet = new Set();
    DATA.rows.forEach(function(r) { (r.chains || []).forEach(function(ch) { chainSet.add(ch); }); });
    var chains = Array.from(chainSet).sort();
    var chainSelect = document.getElementById('chain');
    chains.forEach(function(ch) {
      chainSelect.appendChild(el('option', { value: ch, text: ch }));
    });

    document.getElementById('q').addEventListener('input', function(e) {
      state.q = e.target.value;
      render();
    });
    catSelect.addEventListener('change', function(e) {
      state.category = e.target.value;
      render();
    });
    chainSelect.addEventListener('change', function(e) {
      state.chain = e.target.value;
      render();
    });

    ['pre', 'live', 'model'].forEach(function(t) {
      var btn = document.getElementById('tab-' + t);
      btn.addEventListener('click', function() {
        state.tab = t === 'pre' ? 'pre-token' : t;
        document.querySelectorAll('.tabs button').forEach(function(b) { b.setAttribute('aria-selected', 'false'); });
        btn.setAttribute('aria-selected', 'true');
        render();
      });
    });

    if (state.tab === 'live') document.getElementById('tab-live').click();
    else if (state.tab === 'model') document.getElementById('tab-model').click();
  }

  function filteredRows() {
    var q = state.q.toLowerCase().trim();
    return DATA.rows.filter(function(r) {
      if (state.category !== 'all' && r.category !== state.category) return false;
      if (state.chain !== 'all' && !(r.chains || []).includes(state.chain)) return false;
      if (!q) return true;
      var text = [r.name, r.slug, r.category, (r.chains || []).join(' ')].join(' ').toLowerCase();
      return text.indexOf(q) >= 0;
    });
  }

  function sortedRows(list) {
    var key = state.sort;
    var dir = state.dir;
    return list.slice().sort(function(a, b) {
      var av, bv;
      if (key === 'name') { av = a.name.toLowerCase(); bv = b.name.toLowerCase(); }
      else if (key === 'tvl') { av = a.tvl_usd; bv = b.tvl_usd; }
      else if (key === 'growth') { av = a.change_7d === null ? -999 : a.change_7d; bv = b.change_7d === null ? -999 : b.change_7d; }
      else if (key === 'age') { av = a.age_days === null ? 9999 : a.age_days; bv = b.age_days === null ? 9999 : b.age_days; }
      else if (key === 'implied') { av = a.implied_value_usd; bv = b.implied_value_usd; }
      else { av = a.rank; bv = b.rank; }

      if (av < bv) return -dir;
      if (av > bv) return dir;
      return a.slug.localeCompare(b.slug);
    });
  }

  function renderTableHead(type) {
    var tr = document.getElementById('table-head');
    tr.innerHTML = '';
    if (type === 'pre-token') {
      tr.appendChild(thCol('rank', 'Rank'));
      tr.appendChild(thCol('name', 'Protocol'));
      tr.appendChild(thCol('category', 'Category'));
      tr.appendChild(thCol('chains', 'Chains'));
      tr.appendChild(thCol('tvl', 'TVL'));
      tr.appendChild(thCol('growth', '7d Growth'));
      tr.appendChild(thCol('age', 'Age'));
      tr.appendChild(thCol('implied', 'Implied Value'));
    } else {
      tr.appendChild(thCol('name', 'Live Protocol'));
      tr.appendChild(thCol('category', 'Category'));
      tr.appendChild(thCol('chains', 'Chains'));
      tr.appendChild(thCol('tvl', 'TVL'));
      tr.appendChild(thCol('mcap', 'Market Cap'));
      tr.appendChild(thCol('ratio', 'Mcap / TVL'));
      tr.appendChild(thCol('growth', '7d Growth'));
    }
  }

  function thCol(key, label) {
    var active = state.sort === key;
    var arrow = active ? (state.dir === 1 ? ' ▲' : ' ▼') : '';
    var btn = el('button', { type: 'button', text: label + arrow, onclick: function() {
      if (state.sort === key) state.dir = -state.dir;
      else { state.sort = key; state.dir = key === 'rank' ? 1 : -1; }
      render();
    }});
    return el('th', null, btn);
  }

  function renderTableBody() {
    var tbody = document.getElementById('table-body');
    tbody.innerHTML = '';

    if (state.tab === 'model') {
      document.getElementById('board').style.display = 'none';
      document.getElementById('model-section').style.display = 'grid';
      renderModelSection();
      document.getElementById('row-count').textContent = DATA.category_multiples.length + ' categories';
      return;
    }

    document.getElementById('model-section').style.display = 'none';
    document.getElementById('board').style.display = 'block';

    if (state.tab === 'live') {
      renderLiveTable(tbody);
      return;
    }

    var list = sortedRows(filteredRows());
    document.getElementById('row-count').textContent = list.length + ' of ' + DATA.board_size + ' rows';

    if (list.length === 0) {
      tbody.appendChild(el('tr', null, el('td', { colspan: '8', style: 'text-align:center; padding: 32px;', text: 'No protocols match the current filters.' })));
      return;
    }

    list.forEach(function(r) {
      var tr = el('tr', {
        'data-slug': r.slug,
        'aria-selected': state.selectedSlug === r.slug ? 'true' : 'false',
        onclick: function() { openDetail(r.slug); }
      });

      var growthClass = r.change_7d === null ? '' : (r.change_7d >= 0 ? 'pos' : 'neg');
      tr.appendChild(el('td', { class: 'num', text: '#' + r.rank }));
      tr.appendChild(el('td', null,
        el('div', { class: 'name' },
          el('b', { text: r.name }),
          el('span', { class: 'sub', text: r.slug })
        )
      ));
      tr.appendChild(el('td', null, r.category ? el('span', { class: 'tag', text: r.category }) : '—'));
      tr.appendChild(el('td', { class: 'sub', text: (r.chains || []).slice(0, 2).join(', ') + ((r.chains || []).length > 2 ? ' +' + (r.chains.length - 2) : '') }));
      tr.appendChild(el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }));
      tr.appendChild(el('td', { class: 'num ' + growthClass, text: fmtPct(r.change_7d) }));
      tr.appendChild(el('td', { class: 'num', text: fmtAge(r.age_days) }));
      tr.appendChild(el('td', { class: 'num', style: 'font-weight:600; color:var(--ink);', text: fmtUsd(r.implied_value_usd) }));

      tbody.appendChild(tr);
    });
  }

  function renderLiveTable(tbody) {
    document.getElementById('row-count').textContent = DATA.live.length + ' live protocols';
    DATA.live.forEach(function(l) {
      var tr = el('tr');
      var growthClass = l.change_7d === null ? '' : (l.change_7d >= 0 ? 'pos' : 'neg');
      tr.appendChild(el('td', null,
        el('div', { class: 'name' },
          el('b', { text: l.name }),
          el('span', { class: 'sub', text: l.slug })
        )
      ));
      tr.appendChild(el('td', null, l.category ? el('span', { class: 'tag', text: l.category }) : '—'));
      tr.appendChild(el('td', { class: 'sub', text: (l.chains || []).slice(0, 2).join(', ') }));
      tr.appendChild(el('td', { class: 'num', text: fmtUsd(l.tvl_usd) }));
      tr.appendChild(el('td', { class: 'num', style: 'font-weight:600;', text: fmtUsd(l.mcap_usd) }));
      tr.appendChild(el('td', { class: 'num', text: l.mcap_tvl_ratio.toFixed(2) + 'x' }));
      tr.appendChild(el('td', { class: 'num ' + growthClass, text: fmtPct(l.change_7d) }));
      tbody.appendChild(tr);
    });
  }

  function renderModelSection() {
    var tbody = document.getElementById('multiples-tbody');
    tbody.innerHTML = '';
    DATA.category_multiples.forEach(function(m) {
      var tr = el('tr');
      tr.appendChild(el('td', { text: m.category }));
      tr.appendChild(el('td', { text: String(m.live_count) }));
      tr.appendChild(el('td', { text: m.live_count > 0 ? m.median_ratio.toFixed(2) + 'x' : '— (fallback)' }));
      tr.appendChild(el('td', { style: 'font-weight:600; color:var(--accent);', text: m.assigned_multiple.toFixed(2) + 'x' }));
      tbody.appendChild(tr);
    });
  }

  function openDetail(slug) {
    state.selectedSlug = slug;
    var row = DATA.rows.find(function(r) { return r.slug === slug; });
    var drawer = document.getElementById('detail-drawer');
    if (!row) {
      drawer.hidden = true;
      return;
    }

    document.getElementById('detail-category').textContent = row.category || 'General';
    document.getElementById('detail-title').textContent = row.name;
    document.getElementById('detail-slug').textContent = 'slug: ' + row.slug + ' | rank #' + row.rank;

    var content = document.getElementById('detail-content');
    content.innerHTML = '';
    content.className = 'detail-body';

    // Model breakdown section
    var bSec = el('div', { class: 'detail-section' },
      el('h3', { text: 'Model Valuation Breakdown' }),
      el('div', { class: 'breakdown-grid' },
        breakItem('TVL Base', fmtUsd(row.tvl_usd)),
        breakItem('Category Multiple', row.category_multiple.toFixed(2) + 'x'),
        breakItem('7d Growth', fmtPct(row.change_7d) + ' (' + row.growth_multiplier.toFixed(2) + 'x)'),
        breakItem('Maturity Age', fmtAge(row.age_days) + ' (' + row.maturity_multiplier.toFixed(2) + 'x)'),
        breakItem('Chain Breadth', (row.chains || []).length + ' chains (' + row.chain_multiplier.toFixed(2) + 'x)'),
        breakItem('Implied Value', fmtUsd(row.implied_value_usd))
      )
    );
    content.appendChild(bSec);

    // Live peers comparison section
    var peers = DATA.live.filter(function(l) { return l.category === row.category; });
    if (peers.length === 0) peers = DATA.live.slice(0, 3);
    var pSec = el('div', { class: 'detail-section' },
      el('h3', { text: 'Live Market Peers in ' + (row.category || 'Category') }),
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('thead', null, el('tr', null, el('th', { text: 'Protocol' }), el('th', { text: 'TVL' }), el('th', { text: 'Mcap' }), el('th', { text: 'Ratio' }))),
          el('tbody', null, peers.slice(0, 4).map(function(p) {
            return el('tr', null,
              el('td', null, el('b', { text: p.name })),
              el('td', { class: 'num', text: fmtUsd(p.tvl_usd) }),
              el('td', { class: 'num', text: fmtUsd(p.mcap_usd) }),
              el('td', { class: 'num', text: (p.mcap_usd / p.tvl_usd).toFixed(2) + 'x' })
            );
          }))
        )
      )
    );
    content.appendChild(pSec);

    // Farm steps section
    var fSec = el('div', { class: 'detail-section' },
      el('h3', { text: 'Concrete Farm Plan (' + row.farm_steps.length + ' steps)' }),
      el('div', { class: 'farm-steps-list' },
        row.farm_steps.map(function(s, idx) {
          return el('div', { class: 'farm-step-card' },
            el('div', { class: 'farm-step-head' },
              el('span', { text: 'STEP ' + (idx + 1) }),
              el('span', { text: 'Action & Execution' })
            ),
            el('div', { class: 'farm-step-text', text: s })
          );
        })
      )
    );
    content.appendChild(fSec);

    drawer.hidden = false;
    document.querySelectorAll('tbody tr').forEach(function(tr) {
      tr.setAttribute('aria-selected', tr.getAttribute('data-slug') === slug ? 'true' : 'false');
    });

    if (window.history.replaceState) {
      var params = new URLSearchParams(window.location.search);
      params.set('shot', 'detail');
      params.set('slug', slug);
      window.history.replaceState(null, '', window.location.pathname + '?' + params.toString());
    }
  }

  function closeDetail() {
    state.selectedSlug = null;
    document.getElementById('detail-drawer').hidden = true;
    document.querySelectorAll('tbody tr').forEach(function(tr) { tr.setAttribute('aria-selected', 'false'); });
    if (window.history.replaceState) {
      window.history.replaceState(null, '', window.location.pathname);
    }
  }

  function breakItem(label, val) {
    return el('div', { class: 'breakdown-item' },
      el('span', { text: label }),
      el('b', { text: val })
    );
  }

  function render() {
    renderTableHead(state.tab);
    renderTableBody();
  }

  document.getElementById('detail-close').addEventListener('click', closeDetail);

  readQueryParams();
  initHeader();
  initControls();
  render();

  if (state.selectedSlug) {
    openDetail(state.selectedSlug);
  }
})();
