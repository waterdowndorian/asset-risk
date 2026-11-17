(() => {
  'use strict';

  const evaluation = window.RiskEvaluation;
  const charts = window.RiskCharts;
  const data = window.RiskData;
  const dataPanel = window.RiskDataPanel;
  const byId = id => document.getElementById(id);
  const setText = (id, text) => { byId(id).textContent = text; };
  const search = byId('search');
  const type = byId('type');
  const grade = byId('grade');
  const chartSection = byId('charts');
  const scatter = byId('scatter');
  const ranking = byId('ranking');
  const tableBody = byId('rows');
  const weightInputs = [byId('w0'), byId('w1'), byId('w2')];

  const pages = {
    overview: ['위험도 종합', '상대 위험도 RI와 정량 위험도 Risk · 0~100점'],
    assets: ['설비 목록', '설비별 평가 지표와 전체 순위를 확인하고 비교합니다.'],
    data: ['데이터 업로드', '자산·상태·운전·고장이력 요약 자료'],
    model: ['평가지수 검토', '평가 절차, 시연용 가중치, 연구에서 검토할 평가 방식을 확인합니다.'],
  };

  const compareA = byId('compare-a');
  const compareB = byId('compare-b');
  const format = (value, digits = 1) => value == null ? '—' : value.toFixed(digits);
  const formatPoF = value => value == null ? '—' : format(value * 100, 2);
  let assets = evaluation.demoAssets;
  let weights = [...evaluation.defaultWeights];
  let evaluated = [];
  let visibleRows = [];
  let selected = null;
  let ascending = false;
  let sortKey = 'rank';
  let metric = 'risk';
  let scatterWidth = 0;

  function filterAssets() {
    const query = search.value.trim().toLowerCase();
    const rows = evaluated.filter(asset => {
      const label = [asset.id, asset.type, asset.office].join(' ').toLowerCase();
      return label.includes(query) && (!type.value || asset.type === type.value)
        && (!grade.value || asset.grade === grade.value);
    });
    return rows.sort((a, b) => {
      if (a[sortKey] === null) return b[sortKey] === null ? a.rank - b.rank : 1;
      if (b[sortKey] === null) return -1;
      return ascending ? b[sortKey] - a[sortKey] : a[sortKey] - b[sortKey];
    });
  }

  function averageRisk(rows) {
    if (!rows.length) return '—';
    const total = rows.reduce((sum, asset) => sum + asset.risk, 0);
    return (total / rows.length).toFixed(1);
  }

  function priorityCount(rows) {
    return rows.filter(asset => asset.priority).length;
  }

  function renderSummary() {
    const highest = visibleRows.reduce((current, asset) => {
      return !current || asset.risk > current.risk ? asset : current;
    }, null);
    setText('stat-count', visibleRows.length);
    setText('stat-priority', priorityCount(visibleRows));
    setText('stat-average', averageRisk(visibleRows));
    setText('stat-maximum', highest ? highest.risk.toFixed(1) : '—');
    setText('stat-maximum-asset', highest ? '점 · ' + highest.id : '');
  }

  function makeRow(asset) {
    const row = document.createElement('tr');
    row.dataset.assetRow = asset.id;
    row.toggleAttribute('data-selected', asset.id === selected);

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'asset-id';
    button.textContent = asset.id;
    button.dataset.selectAsset = asset.id;
    button.setAttribute('aria-label', asset.id + ' 상세');
    button.setAttribute('aria-pressed', String(asset.id === selected));

    const badge = document.createElement('span');
    badge.className = asset.priority ? 'grade priority' : 'grade';
    badge.textContent = asset.grade;

    const cells = [
      [asset.rank, ''], [button, ''], [asset.type, ''], [asset.office, ''],
      [asset.hi.toFixed(1), 'number-cell'], [asset.risk.toFixed(1), 'number-cell score'],
      [formatPoF(asset.pof), 'number-cell'], [format(asset.consequence), 'number-cell'],
      [format(asset.quantitativeRisk), 'number-cell score'], [asset.quantitativeRank ?? '—', ''],
      [badge, ''],
    ];
    for (const [value, className] of cells) {
      const cell = row.insertCell();
      cell.className = className;
      if (value instanceof HTMLElement) {
        cell.append(value);
      } else {
        cell.textContent = value;
      }
    }
    return row;
  }

  function renderTable() {
    setText('count', visibleRows.length + '개 설비');
    const sortControls = [
      ['rank', 'risk-header', 'sort'],
      ['quantitativeRank', 'quantitative-header', 'sort-quantitative'],
    ];
    for (const [key, header, button] of sortControls) {
      const active = key === sortKey;
      byId(header).setAttribute('aria-sort', active ? (ascending ? 'ascending' : 'descending') : 'none');
      byId(button).querySelector('span').textContent = active ? (ascending ? '↑' : '↓') : '';
    }

    if (visibleRows.length) {
      const fragment = document.createDocumentFragment();
      for (const asset of visibleRows) fragment.append(makeRow(asset));
      tableBody.replaceChildren(fragment);
    } else {
      tableBody.innerHTML = '<tr><td class="empty-message" colspan="11">검색 조건에 해당하는 설비가 없습니다.</td></tr>';
    }
  }

  function renderDetail() {
    const asset = visibleRows.find(row => row.id === selected);
    byId('detail-empty').hidden = Boolean(asset);
    byId('detail-content').hidden = !asset;
    setText('detail-rank', asset ? 'RI ' + asset.rank + '위' : '');
    if (!asset) return;

    setText('detail-id', asset.id);
    setText('detail-meta', [asset.type, asset.office, '사용 ' + asset.age + '년'].join(' · '));
    setText('detail-hi', asset.hi.toFixed(1));
    setText('detail-risk', asset.risk.toFixed(1));
    setText('detail-pof', asset.pof === null ? '—' : formatPoF(asset.pof) + '%');
    setText('detail-quantitative', format(asset.quantitativeRisk));
    setText('detail-action', asset.action);
    byId('detail-action').classList.toggle('priority', asset.priority);
    setText('detail-condition', asset.condition);
    setText('detail-operation', asset.operation);
    setText('detail-consequence', asset.consequence);
  }

  function updateComparisonOptions() {
    for (const [index, control] of [compareA, compareB].entries()) {
      control.replaceChildren();
      for (const asset of evaluated) control.add(new Option(asset.id, asset.id));
      control.selectedIndex = Math.min(index, evaluated.length - 1);
    }
  }

  function renderComparison() {
    const left = evaluated.find(asset => asset.id === compareA.value);
    const right = evaluated.find(asset => asset.id === compareB.value);
    if (!left || !right) return;
    setText('compare-a-name', left.id);
    setText('compare-b-name', right.id);

    const metrics = [
      ['상태지수 HI', asset => format(asset.hi)],
      ['1년 PoF (%)', asset => formatPoF(asset.pof)],
      ['고장영향 CoF', asset => format(asset.consequence)],
      ['상대 위험도 RI', asset => format(asset.risk)],
      ['RI 순위', asset => asset.rank],
      ['정량 위험도 Risk', asset => format(asset.quantitativeRisk)],
      ['Risk 순위', asset => asset.quantitativeRank ?? '—'],
    ];
    const rows = document.createDocumentFragment();
    for (const [label, value] of metrics) {
      const row = document.createElement('tr');
      const header = document.createElement('th');
      header.scope = 'row';
      header.textContent = label;
      row.append(header);
      row.insertCell().textContent = value(left);
      row.insertCell().textContent = value(right);
      rows.append(row);
    }
    byId('compare-result').replaceChildren(rows);
  }

  function renderScatter() {
    scatterWidth = scatter.clientWidth;
    charts.scatter(scatter, visibleRows, selected, evaluation.criteria.priority);
  }

  function renderRanking() {
    const count = charts.ranking(ranking, visibleRows, selected, metric);
    const label = metric === 'risk' ? '위험도가 높은' : 'HI가 낮은';
    setText('ranking-caption', count ? label + ' ' + count + '개 설비 · 막대를 선택해 상세 조회' : '');
  }

  function renderResults() {
    visibleRows = filterAssets();
    if (!visibleRows.some(asset => asset.id === selected)) {
      selected = visibleRows[0]?.id ?? null;
    }
    renderSummary();
    renderTable();
    renderDetail();
    if (!chartSection.hidden) {
      renderScatter();
      renderRanking();
    }
  }

  function selectAsset(id) {
    selected = id;
    document.querySelectorAll('[data-select-asset]').forEach(element => {
      element.setAttribute('aria-pressed', String(element.dataset.selectAsset === id));
    });
    tableBody.querySelectorAll('[data-asset-row]').forEach(row => {
      row.toggleAttribute('data-selected', row.dataset.assetRow === id);
    });
    renderDetail();
    if (matchMedia('(max-width: 890px)').matches) {
      byId('asset-detail').scrollIntoView({ block: 'nearest' });
    }
  }

  function showPage(page) {
    const [title, context] = pages[page];
    const overview = page === 'overview';
    const model = page === 'model';
    const input = page === 'data';
    document.querySelectorAll('[data-page]').forEach(button => {
      if (button.dataset.page === page) {
        button.setAttribute('aria-current', 'page');
      } else {
        button.removeAttribute('aria-current');
      }
    });
    setText('page-title', title);
    setText('page-context', context);
    byId('filters').hidden = model || input;
    byId('summary').hidden = !overview;
    chartSection.hidden = !overview;
    byId('results').hidden = model || input;
    byId('asset-compare').hidden = page !== 'assets';
    byId('data-panel').hidden = !input;
    byId('model').hidden = !model;
    byId('export').hidden = model || input;
    if (overview) {
      renderScatter();
      renderRanking();
    }
    window.scrollTo(0, 0);
  }

  function updateWeights(nextWeights, message = '') {
    weights = nextWeights;
    evaluated = evaluation.evaluate(assets, weights);
    const total = evaluation.totalWeight(weights);
    const terms = weights.map((weight, index) => {
      return (weight / total).toFixed(3) + ' × ' + evaluation.factors[index];
    });

    weightInputs.forEach((input, index) => { input.value = weights[index]; });
    setText('formula', 'RI = ' + terms.join(' + '));
    setText('model-outcome', '전체 평균 ' + averageRisk(evaluated) + '점 · 우선 검토 ' + priorityCount(evaluated) + '개');
    setText('weight-status', message);
    byId('weight-status').classList.remove('error');
    renderResults();
    renderComparison();
  }

  function exportResults() {
    const keys = [
      'ri_rank', 'id', 'type', 'office', 'hi', 'ri_score',
      'pof_1y', 'cof_score', 'risk_score', 'risk_rank', 'action',
    ];
    const rows = visibleRows.map(asset => [
      asset.rank, asset.id, asset.type, asset.office, asset.hi, asset.risk,
      asset.pof, asset.consequence, asset.quantitativeRisk, asset.quantitativeRank, asset.action,
    ]);
    dataPanel.downloadCSV('asset-risk-results.csv', data.toCSV([keys, ...rows]));
  }

  function clearFilters() {
    search.value = '';
    type.value = '';
    grade.value = '';
  }

  function setAssets(nextAssets, name) {
    assets = nextAssets;
    selected = null;
    sortKey = 'rank';
    ascending = false;
    type.replaceChildren(new Option('전체 설비', ''));
    for (const value of new Set(assets.map(asset => asset.type))) type.add(new Option(value, value));
    clearFilters();
    setText('data-source', name);
    updateWeights(weights);
    updateComparisonOptions();
    renderComparison();
  }

  document.querySelectorAll('[data-page]').forEach(button => {
    button.addEventListener('click', () => showPage(button.dataset.page));
  });
  byId('show-overview').addEventListener('click', () => showPage('overview'));

  search.addEventListener('input', renderResults);
  type.addEventListener('change', renderResults);
  grade.addEventListener('change', renderResults);
  byId('reset').addEventListener('click', () => {
    clearFilters();
    renderResults();
  });
  for (const [button, key] of [['sort', 'rank'], ['sort-quantitative', 'quantitativeRank']]) {
    byId(button).addEventListener('click', () => {
      ascending = sortKey === key && !ascending;
      sortKey = key;
      renderResults();
    });
  }
  for (const control of [compareA, compareB]) control.addEventListener('change', renderComparison);

  const metricButtons = document.querySelectorAll('[data-metric]');
  metricButtons.forEach(button => {
    button.addEventListener('click', () => {
      metric = button.dataset.metric;
      metricButtons.forEach(control => {
        control.setAttribute('aria-pressed', String(control === button));
      });
      renderRanking();
    });
  });

  for (const element of [scatter, ranking, tableBody]) {
    element.addEventListener('click', event => {
      const target = event.target.closest('[data-select-asset], [data-asset-row]');
      if (target) selectAsset(target.dataset.selectAsset ?? target.dataset.assetRow);
    });
  }
  scatter.addEventListener('keydown', event => {
    if ((event.key === 'Enter' || event.key === ' ') && event.target.dataset.selectAsset) {
      event.preventDefault();
      selectAsset(event.target.dataset.selectAsset);
    }
  });

  byId('weight-form').addEventListener('submit', event => {
    event.preventDefault();
    const nextWeights = weightInputs.map(input => input.valueAsNumber);
    if (!(evaluation.totalWeight(nextWeights) > 0)) {
      setText('weight-status', '가중치 합계는 0보다 커야 합니다.');
      byId('weight-status').classList.add('error');
      return;
    }
    updateWeights(nextWeights, '가중치를 적용해 평가 결과를 갱신했습니다.');
  });
  byId('reset-weights').addEventListener('click', () => {
    updateWeights([...evaluation.defaultWeights], '기본 가중치를 적용했습니다.');
  });

  byId('export').addEventListener('click', exportResults);
  byId('fullscreen').addEventListener('click', async () => {
    const notice = byId('screen-notice');
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await document.documentElement.requestFullscreen();
      }
      notice.hidden = true;
    } catch {
      notice.textContent = '브라우저의 전체화면 메뉴나 F11 키를 사용할 수 있습니다.';
      notice.hidden = false;
    }
  });
  document.addEventListener('fullscreenchange', () => {
    const fullscreen = Boolean(document.fullscreenElement);
    byId('fullscreen').setAttribute('aria-pressed', String(fullscreen));
    setText('fullscreen', fullscreen ? '전체화면 종료' : '전체화면');
  });

  if ('ResizeObserver' in window) {
    new ResizeObserver(() => {
      if (!chartSection.hidden && scatter.clientWidth !== scatterWidth) renderScatter();
    }).observe(scatter);
  }
  dataPanel.wireDataPanel(
    (imported, name) => {
      setAssets(imported, name);
      showPage('assets');
    },
    () => setAssets(evaluation.demoAssets, '시범 데이터'),
  );
  setAssets(evaluation.demoAssets, '시범 데이터');
})();
