(() => {
  'use strict';

  const sources = {
    assets: { label: '자산', fields: ['id', 'type', 'office', 'age'] },
    condition: { label: '상태', fields: ['id', 'condition'] },
    operation: { label: '운전', fields: ['id', 'operation'] },
    failures: { label: '고장이력 요약', fields: ['id', 'years_observed', 'failure_count', 'consequence'] },
  };

  const sample = {
    assets: 'id,type,office,age\nDEMO-01,배전변압기,가상지사,22\nDEMO-02,개폐기,가상지사,10\nDEMO-03,전선,가상지사,15\nDEMO-04,전선,가상지사,12\n',
    condition: 'id,condition\nDEMO-01,75\nDEMO-02,30\nDEMO-03,95\nDEMO-04,\n',
    operation: 'id,operation\nDEMO-01,65\nDEMO-02,25\nDEMO-03,58\nDEMO-04,125\n',
    failures: 'id,years_observed,failure_count,consequence\nDEMO-01,5,2,80\nDEMO-02,5,1,55\nDEMO-03,5,0,30\nDEMO-04,5,0,40\n',
  };

  function parseCSV(text) {
    const input = text.replace(/^\uFEFF/, '');
    const rows = [];
    let row = [];
    let value = '';
    let quoted = false;
    let closed = false;
    let line = 1;
    let start = 1;

    function addField() {
      row.push(value.trim());
      value = '';
      closed = false;
    }

    function addRow() {
      addField();
      if (row.some(Boolean) || row.length > 1) rows.push({ line: start, fields: row });
      row = [];
    }

    for (let i = 0; i < input.length; i += 1) {
      const char = input[i];
      if (quoted) {
        if (char === '"' && input[i + 1] === '"') {
          value += '"';
          i += 1;
        } else if (char === '"') {
          quoted = false;
          closed = true;
        } else {
          value += char;
          if (char === '\n' || (char === '\r' && input[i + 1] !== '\n')) line += 1;
        }
      } else if (char === ',') {
        addField();
      } else if (char === '\r' || char === '\n') {
        addRow();
        if (char === '\r' && input[i + 1] === '\n') i += 1;
        line += 1;
        start = line;
      } else if (char === '"' && value === '' && !closed) {
        quoted = true;
      } else if (char === '"' || (closed && !/^[ \t]$/.test(char))) {
        throw new Error(line + '행의 따옴표 형식을 확인해 주세요.');
      } else if (!closed) {
        value += char;
      }
    }

    if (quoted) throw new Error(start + '행의 따옴표가 닫히지 않았습니다.');
    addRow();
    return rows;
  }

  function score(value) {
    return Number.isFinite(value) && value >= 0 && value <= 100;
  }

  const validators = {
    age: value => Number.isFinite(value) && value >= 0,
    condition: score,
    operation: score,
    years_observed: value => Number.isFinite(value) && value > 0,
    failure_count: value => Number.isSafeInteger(value) && value >= 0,
    consequence: score,
  };

  function inspect(contents) {
    const problems = [];
    const tables = {};
    const counts = {};
    const add = (source, kind, location, detail) => problems.push({
      source: sources[source].label, kind, location, detail,
    });

    for (const [key, { fields }] of Object.entries(sources)) {
      const table = new Map();
      tables[key] = table;
      counts[key] = 0;
      let rows;
      try {
        rows = parseCSV(contents[key] ?? '');
      } catch (error) {
        add(key, '형식', '파일', error.message);
        continue;
      }

      const header = rows.shift()?.fields.map(field => field.toLowerCase()) ?? [];
      const missing = fields.filter(field => !header.includes(field));
      if (missing.length || new Set(header).size !== header.length) {
        const detail = missing.length ? '필수 열 누락 · ' + missing.join(', ') : '중복된 열 이름';
        add(key, '형식', '헤더', detail);
        continue;
      }
      counts[key] = rows.length;
      if (!rows.length) add(key, '결측', '파일', '자료 행이 없습니다.');
      const columns = fields.map(field => [field, header.indexOf(field)]);
      const seen = new Set();
      for (const row of rows) {
        const values = Object.fromEntries(columns.map(([field, index]) => [field, row.fields[index] ?? '']));
        const location = row.line + '행 · ' + (values.id || 'ID 없음');
        let valid = true;
        if (row.fields.length !== header.length) {
          add(key, '형식', location, '헤더와 열 개수가 다릅니다.');
          valid = false;
        }
        for (const field of fields) {
          const raw = values[field];
          if (raw === '') {
            add(key, '결측', location, field);
            valid = false;
          } else if (validators[field]) {
            const number = Number(raw);
            const decimal = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(raw);
            if (!decimal || !validators[field](number)) {
              add(key, '범위 오류', location, field + ' = ' + raw);
              valid = false;
            }
            values[field] = number;
          }
        }
        if (values.id && seen.has(values.id)) {
          add(key, '중복', location, '동일 ID의 모든 행을 제외합니다.');
          table.delete(values.id);
          valid = false;
        }
        if (values.id) seen.add(values.id);
        if (valid) table.set(values.id, values);
      }
    }

    const auxiliary = ['condition', 'operation', 'failures'];
    for (const key of auxiliary) {
      for (const id of tables[key].keys()) {
        if (!tables.assets.has(id)) add(key, '미연계', id, '유효한 자산 행이 없습니다.');
      }
    }

    const assets = [];
    for (const [id, asset] of tables.assets) {
      const related = auxiliary.map(key => tables[key].get(id));
      related.forEach((record, index) => {
        if (!record) add(auxiliary[index], '연계 누락', id, '연계할 유효한 행이 없습니다.');
      });
      if (related.every(Boolean)) assets.push(Object.assign({}, asset, ...related));
    }

    return { assets, counts, problems };
  }

  function toCSV(rows, protectFormulas = true) {
    return '\ufeff' + rows.map(row => row.map(value => {
      let field = String(value ?? '');
      if (protectFormulas && typeof value === 'string' && /^[\s\u0000-\u001f]*[=+@-]/.test(field)) {
        field = "'" + field;
      }
      return '"' + field.replace(/"/g, '""') + '"';
    }).join(',')).join('\r\n') + '\r\n';
  }

  window.RiskData = { sources, sample, inspect, toCSV };
})();
