(() => {
  'use strict';

  const escapes = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  const escapeHTML = value => String(value).replace(/[&<>"']/g, character => escapes[character]);
  const ticks = [0, 20, 40, 60, 80, 100];
  const limit = 8;

  function scatter(container, rows, selected, priority) {
    if (!rows.length) {
      container.innerHTML = '<p class="empty-message">표시할 설비가 없습니다.</p>';
      return;
    }

    const width = Math.max(260, container.clientWidth);
    const left = 57;
    const right = width - 20;
    const top = 15;
    const bottom = 186;
    const x = score => left + score / 100 * (right - left);
    const y = score => bottom - score / 100 * (bottom - top);

    const grid = ticks.map(score => `
      <line class="scatter-grid" x1="${left}" y1="${y(score)}" x2="${right}" y2="${y(score)}"/>
      <line class="scatter-grid" x1="${x(score)}" y1="${top}" x2="${x(score)}" y2="${bottom}"/>
      <text class="scatter-tick" x="${left - 9}" y="${y(score) + 5}" text-anchor="end">${score}</text>
      <text class="scatter-tick" x="${x(score)}" y="208" text-anchor="middle">${score}</text>
    `).join('');

    const points = rows.map(asset => {
      const id = escapeHTML(asset.id);
      const label = id + ' 상세 · HI ' + asset.hi.toFixed(1) + '점, 위험도 ' + asset.risk.toFixed(1) + '점';
      return `<circle class="scatter-point ${asset.priority ? 'priority' : ''}"
        cx="${x(asset.hi)}" cy="${y(asset.risk)}" r="${4 + asset.consequence / 18}"
        data-select-asset="${id}" tabindex="0" role="button" aria-pressed="${asset.id === selected}"
        aria-label="${label}"><title>${label}</title></circle>`;
    }).join('');

    container.innerHTML = `
      <svg viewBox="0 0 ${width} 232" role="group" aria-label="HI와 상대 위험도 산점도">
        ${grid}
        <path class="scatter-axis" d="M ${left},${top} V ${bottom} H ${right}" fill="none"/>
        <line class="scatter-threshold" x1="${left}" y1="${y(priority)}" x2="${right}" y2="${y(priority)}">
          <title>우선 검토 기준 ${priority}점</title>
        </line>
        <text class="scatter-axis-label" x="${(left + right) / 2}" y="229" text-anchor="middle">상태지수 HI (점)</text>
        <text class="scatter-axis-label" x="15" y="100" transform="rotate(-90 15 100)" text-anchor="middle">위험도 (점)</text>
        ${points}
      </svg>
    `;
  }

  function ranking(container, rows, selected, metric) {
    const byRisk = metric === 'risk';
    const ordered = [...rows].sort(byRisk
      ? (a, b) => a.rank - b.rank
      : (a, b) => a.hi - b.hi || a.rank - b.rank);
    const top = ordered.slice(0, limit);
    if (!top.length) {
      container.innerHTML = '<p class="empty-message">표시할 설비가 없습니다.</p>';
      return 0;
    }

    const metricLabel = byRisk ? '위험도' : 'HI';
    const items = top.map((asset, index) => {
      const id = escapeHTML(asset.id);
      const value = asset[metric];
      return `
        <li>
          <button type="button" class="rank-row ${asset.priority ? 'priority' : ''}"
            data-select-asset="${id}" aria-pressed="${asset.id === selected}"
            aria-label="${id} 상세 · ${metricLabel} ${value.toFixed(1)}점">
            <span class="rank-position">${index + 1}</span>
            <span>${id}</span>
            <span class="bar-track" aria-hidden="true"><i class="bar" style="width: ${value}%"></i></span>
            <strong class="rank-value">${value.toFixed(1)}</strong>
          </button>
        </li>
      `;
    }).join('');

    container.innerHTML = `<ol class="ranking-list" aria-label="${metricLabel} 기준 순서">${items}</ol>`;
    return top.length;
  }

  window.RiskCharts = { scatter, ranking };
})();
