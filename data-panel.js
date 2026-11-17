(() => {
  'use strict';

  const data = window.RiskData;
  const byId = id => document.getElementById(id);

  function downloadCSV(filename, csv) {
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function wireDataPanel(apply, restore) {
    const form = byId('data-form');
    const status = byId('data-status');
    const quality = byId('quality-report');
    const applyButton = byId('apply-data');
    const inputs = {};
    let pending;

    function show(contents, name) {
      const report = data.inspect(contents);
      pending = { report, name };
      quality.hidden = false;
      applyButton.disabled = report.assets.length === 0;
      status.textContent = name + ' 검사 완료';
      const counts = Object.entries(report.counts).map(([key, count]) => {
        return data.sources[key].label + ' ' + count + '행';
      });
      byId('quality-summary').textContent = counts.join(' · ')
        + ' | 평가 가능 ' + report.assets.length + '개 설비 · 이슈 ' + report.problems.length + '건';
      const rows = document.createDocumentFragment();
      for (const problem of report.problems) {
        const row = document.createElement('tr');
        for (const value of Object.values(problem)) row.insertCell().textContent = value;
        rows.append(row);
      }
      if (!report.problems.length) {
        const row = document.createElement('tr');
        const cell = row.insertCell();
        cell.colSpan = 4;
        cell.textContent = '입력 규칙 위반이 없습니다.';
        rows.append(row);
      }
      byId('quality-rows').replaceChildren(rows);
    }

    for (const [key, source] of Object.entries(data.sources)) {
      const entry = document.createElement('div');
      entry.className = 'data-field';
      const label = document.createElement('label');
      label.textContent = source.label;
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.csv,text/csv';
      input.required = true;
      inputs[key] = input;
      label.append(input);
      const columns = document.createElement('small');
      columns.textContent = source.fields.join(', ');
      const sampleButton = document.createElement('button');
      sampleButton.type = 'button';
      sampleButton.className = 'outline-button';
      sampleButton.textContent = source.label + ' 예제 CSV';
      sampleButton.addEventListener('click', () => {
        downloadCSV(key + '-example.csv', '\ufeff' + data.sample[key]);
      });
      entry.append(label, columns, sampleButton);
      byId('data-fields').append(entry);
    }

    form.addEventListener('submit', async event => {
      event.preventDefault();
      pending = undefined;
      quality.hidden = true;
      const fileControls = [...Object.values(inputs), byId('inspect-files'),
        byId('inspect-sample'), byId('restore-demo')];
      fileControls.forEach(control => { control.disabled = true; });
      status.textContent = 'CSV를 읽는 중입니다.';
      try {
        const entries = await Promise.all(Object.entries(inputs).map(async ([key, input]) => {
          const bytes = await input.files[0].arrayBuffer();
          const contents = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
          return [key, contents];
        }));
        show(Object.fromEntries(entries), '선택한 CSV');
      } catch {
        status.textContent = '파일을 읽지 못했습니다. 네 파일의 UTF-8 인코딩을 확인해 주세요.';
      } finally {
        fileControls.forEach(control => { control.disabled = false; });
      }
    });

    byId('inspect-sample').addEventListener('click', () => show(data.sample, '가상 예제 CSV'));
    byId('restore-demo').addEventListener('click', () => {
      form.reset();
      pending = undefined;
      quality.hidden = true;
      status.textContent = '기본 시범 데이터를 적용했습니다.';
      restore();
    });
    form.addEventListener('change', () => {
      pending = undefined;
      quality.hidden = true;
      status.textContent = '';
    });
    applyButton.addEventListener('click', () => {
      if (!pending?.report.assets.length) return;
      apply(pending.report.assets, pending.name);
    });
    byId('export-quality').addEventListener('click', () => {
      if (!pending) return;
      const rows = pending.report.problems.map(problem => Object.values(problem));
      downloadCSV('asset-quality.csv', data.toCSV([['자료', '구분', '위치', '내용'], ...rows]));
    });
  }

  window.RiskDataPanel = { wireDataPanel, downloadCSV };
})();
