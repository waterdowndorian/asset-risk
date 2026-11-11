(() => {
  'use strict';

  const evaluation = window.RiskEvaluation;
  const charts = window.RiskCharts;
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
    overview: ['위험도 종합', '시범 상대 위험도 평가 · 100점 척도'],
    assets: ['설비 목록', '전체 위험도 순위와 설비별 검토 방향을 확인합니다.'],
    model: ['평가지수 검토', '평가 절차, 시연용 가중치, 연구에서 검토할 평가 방식을 확인합니다.'],
  };

  let weights = [...evaluation.defaultWeights];
  let evaluated = [];
  let visibleRows = [];
  let selected = null;
  let ascending = false;
  let metric = 'risk';
  let scatterWidth = 0;

  function filterAssets() {
    const query = search.value.trim().toLowerCase();
    const rows = evaluated.filter(asset => {
      const label = [asset.id, asset.type, asset.office].join(' ').toLowerCase();
      return label.includes(query) && (!type.value || asset.type === type.value)
        && (!grade.value || asset.grade === grade.value);
    });
    return ascending ? rows.reverse() : rows;
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
    const highest = visibleRows[ascending ? visibleRows.length - 1 : 0];
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
    byId('risk-header').setAttribute('aria-sort', ascending ? 'ascending' : 'descending');
    byId('sort').querySelector('span').textContent = ascending ? '↑' : '↓';

    if (visibleRows.length) {
      tableBody.replaceChildren(...visibleRows.map(makeRow));
    } else {
      tableBody.innerHTML = '<tr><td class="empty-message" colspan="7">검색 조건에 해당하는 설비가 없습니다.</td></tr>';
    }
  }

  function renderDetail() {
    const asset = visibleRows.find(row => row.id === selected);
    byId('detail-empty').hidden = Boolean(asset);
    byId('detail-content').hidden = !asset;
    setText('detail-rank', asset ? '전체 ' + asset.rank + '위' : '');
    if (!asset) return;

    setText('detail-id', asset.id);
    setText('detail-meta', [asset.type, asset.office, '사용 ' + asset.age + '년'].join(' · '));
    setText('detail-hi', asset.hi.toFixed(1));
    setText('detail-risk', asset.risk.toFixed(1));
    setText('detail-action', asset.action);
    byId('detail-action').classList.toggle('priority', asset.priority);
    setText('detail-condition', asset.condition);
    setText('detail-operation', asset.operation);
    setText('detail-consequence', asset.consequence);
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
    document.querySelectorAll('[data-page]').forEach(button => {
      if (button.dataset.page === page) {
        button.setAttribute('aria-current', 'page');
      } else {
        button.removeAttribute('aria-current');
      }
    });
    setText('page-title', title);
    setText('page-context', context);
    byId('filters').hidden = model;
    byId('summary').hidden = !overview;
    chartSection.hidden = !overview;
    byId('results').hidden = model;
    byId('model').hidden = !model;
    byId('export').hidden = model;
    if (overview) {
      renderScatter();
      renderRanking();
    }
    window.scrollTo(0, 0);
  }

  function updateWeights(nextWeights, message = '') {
    weights = nextWeights;
    evaluated = evaluation.evaluate(evaluation.demoAssets, weights);
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
  }

  function exportResults() {
    const keys = ['rank', 'id', 'type', 'office', 'hi', 'risk', 'action'];
    const rows = [keys, ...visibleRows.map(asset => keys.map(key => asset[key]))];
    const csv = '\ufeff' + rows.map(row => {
      return row.map(value => '"' + String(value).replace(/"/g, '""') + '"').join(',');
    }).join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'presentation-demo-results.csv';
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  for (const value of new Set(evaluation.demoAssets.map(asset => asset.type))) {
    type.add(new Option(value));
  }

  document.querySelectorAll('[data-page]').forEach(button => {
    button.addEventListener('click', () => showPage(button.dataset.page));
  });
  byId('show-overview').addEventListener('click', () => showPage('overview'));

  search.addEventListener('input', renderResults);
  type.addEventListener('change', renderResults);
  grade.addEventListener('change', renderResults);
  byId('reset').addEventListener('click', () => {
    search.value = '';
    type.value = '';
    grade.value = '';
    renderResults();
  });
  byId('sort').addEventListener('click', () => {
    ascending = !ascending;
    renderResults();
  });

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
  updateWeights(weights);
})();
