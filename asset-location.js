(() => {
  'use strict';

  const gradeColors = { 우선검토: 'red', 관찰: 'gold', 일반: 'blue', 평가보류: 'gray' };
  const demoCenters = [[35.968, 126.976], [35.824, 127.148], [35.970, 126.727], [35.576, 126.856]];
  const number = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i;

  function readLocation(row) {
    const lat = row.lat?.trim() ?? '';
    const lon = row.lon?.trim() ?? '';
    if (!lat && !lon) return {};
    if (!lat || !lon) return { issue: '결측', field: lat ? 'lon' : 'lat' };
    if (!number.test(lat) || Math.abs(Number(lat)) > 90) return { issue: '범위 오류', field: 'lat' };
    if (!number.test(lon) || Math.abs(Number(lon)) > 180) return { issue: '범위 오류', field: 'lon' };
    return { point: [Number(lat), Number(lon)] };
  }

  function locationIssues(rows) {
    return rows.flatMap((row, index) => {
      const { issue, field } = readLocation(row);
      if (!issue) return [];
      return [{
        kind: 'assets', line: index + 2, field, category: issue,
        message: issue === '결측'
          ? '지도 표시용 위도(lat)와 경도(lon)는 함께 입력하세요.'
          : '지도 표시용 WGS84 십진도 범위를 확인하세요. 위도 −90~90, 경도 −180~180.',
      }];
    });
  }

  function assetLocation(asset, demo) {
    const submitted = readLocation(asset.input);
    if (!demo || submitted.point || submitted.issue) return submitted;
    const match = /^JB-(\d{4})$/.exec(asset.id);
    if (!match || asset.type === '지중케이블') return {};
    const index = Number(match[1]) - 1;
    if (index < 0 || index >= 48) return {};
    const [latitude, longitude] = demoCenters[index % demoCenters.length];
    const offset = Math.floor(index / demoCenters.length);
    return { point: [latitude + (offset % 4 - 1.5) * 0.012, longitude + (Math.floor(offset / 4) - 1) * 0.015] };
  }

  const oneDecimal = value => value == null ? '—' : value.toFixed(1);
  const percent = value => value == null ? '—' : oneDecimal(value * 100) + '%';

  function fitLocations(view, rows) {
    if (!rows.length) return;
    const bounds = L.latLngBounds(rows.map(row => row.point));
    view.fitBounds(bounds, { padding: [36, 36], maxZoom: 15, animate: false });
  }

  function makePopup(rows, select) {
    const body = document.createElement('div');
    body.className = 'asset-map-popup';
    for (const row of rows) {
      const label = document.createElement('button');
      label.type = 'button';
      label.className = 'asset-name';
      label.textContent = row.name + ' · ' + row.id;
      label.onclick = () => select(row.id);
      const line = document.createElement('p');
      line.textContent = row.grade + ' · Risk ' + oneDecimal(row.Risk);
      body.append(label, line);
    }
    return body;
  }

  function drawLocations(view, layer, rows, select) {
    view.closePopup();
    layer.clearLayers();
    const groups = new Map();
    for (const row of rows) {
      const key = row.point.join(',');
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(row);
    }

    const markers = new Map();
    for (const group of groups.values()) {
      group.sort((a, b) => (b.Risk ?? -1) - (a.Risk ?? -1) || a.id.localeCompare(b.id));
      const first = group[0];
      const count = group.length;
      const title = count > 1 ? '같은 위치의 설비 ' + count + '대'
        : first.name + ' · ' + first.id + ' · ' + first.grade;
      const size = count > 1 ? 28 : 19;
      const marker = L.marker(first.point, {
        title,
        icon: L.divIcon({
          className: 'asset-map-pin pin-' + gradeColors[first.grade],
          html: count > 1 ? String(count) : '',
          iconSize: [size, size],
        }),
      });
      marker.on('click', () => select(first.id));
      marker.bindPopup(makePopup(group, select), { maxHeight: 230, maxWidth: 260 }).addTo(layer);
      marker.getElement().setAttribute('aria-label', title);
      for (const row of group) markers.set(row.id, marker);
    }
    return markers;
  }

  function createPage(React) {
    const { createElement: h, useEffect, useMemo, useRef, useState } = React;

    function selectFilter(label, value, change, empty, items) {
      return h('select', { 'aria-label': label, value, onChange: event => change(event.target.value) },
        h('option', { value: '' }, empty),
        ...items.map(item => h('option', { key: item, value: item }, item)));
    }

    return function AssetLocationPage(props) {
      const { rows, demo, focusId, query, setQuery, type, setType, grade, setGrade,
        types, grades, onDetails, onRanking } = props;
      const [selectedId, select] = useState(focusId);
      const [showTiles, toggleTiles] = useState(true);
      const [tilesFailed, setTilesFailed] = useState(false);
      const node = useRef(null);
      const mapState = useRef(null);
      const pendingFocus = useRef(focusId);
      const canLoadTiles = location.protocol !== 'file:';
      const locations = useMemo(() => rows.map(row => ({ ...row, ...assetLocation(row, demo) })), [rows, demo]);
      const plotted = useMemo(() => locations.filter(row => row.point), [locations]);
      const invalid = locations.filter(row => row.issue).length;
      const missing = locations.length - plotted.length - invalid;
      const selected = plotted.find(row => row.id === selectedId);

      useEffect(() => {
        if (!window.L) return;
        const view = L.map(node.current, { scrollWheelZoom: false, fadeAnimation: false, maxZoom: 19 })
          .setView([35.85, 127.04], 10);
        view.attributionControl.setPrefix(false);
        L.control.scale({ imperial: false }).addTo(view);
        const resize = new ResizeObserver(() => view.invalidateSize({ pan: false }));
        resize.observe(node.current);
        mapState.current = { view, layer: L.layerGroup().addTo(view), markers: new Map() };
        return () => {
          resize.disconnect();
          view.remove();
          mapState.current = null;
        };
      }, []);

      useEffect(() => {
        if (!mapState.current || !canLoadTiles || !showTiles) return;
        const { view } = mapState.current;
        let loaded = false;
        const tiles = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
          maxZoom: 19, updateWhenIdle: true,
        });
        tiles.on('loading', () => { loaded = false; });
        tiles.on('tileerror', () => { if (!loaded) setTilesFailed(true); });
        tiles.on('tileload', () => { loaded = true; setTilesFailed(false); });
        tiles.addTo(view);
        return () => tiles.remove();
      }, [canLoadTiles, showTiles]);

      useEffect(() => {
        const state = mapState.current;
        if (!state) return;
        state.markers = drawLocations(state.view, state.layer, plotted, select);
        const initial = state.markers.get(pendingFocus.current);
        pendingFocus.current = null;
        if (initial) {
          state.view.setView(initial.getLatLng(), 15, { animate: false });
          initial.openPopup();
        } else {
          fitLocations(state.view, plotted);
        }
      }, [plotted]);

      useEffect(() => {
        const markers = mapState.current?.markers;
        if (!markers) return;
        const next = markers.get(selectedId)?.getElement();
        for (const marker of new Set(markers.values())) {
          const element = marker.getElement();
          element.classList.toggle('asset-map-pin-active', element === next);
        }
      }, [plotted, selectedId]);

      const empty = !window.L ? '지도 파일을 불러오지 못했습니다. ZIP을 모두 풀었는지 확인해 주세요.'
        : !rows.length ? '검색 조건에 해당하는 설비가 없습니다.'
        : '표시할 좌표가 없습니다. 자산정보의 lat, lon 연결을 확인해 주세요.';
      const tileNotice = !canLoadTiles ? '도로 배경지도를 보려면 로컬 서버에서 이 파일을 열어 주세요.'
        : showTiles && tilesFailed ? '배경지도를 불러오지 못했습니다. 설비 위치는 계속 확인할 수 있습니다.' : '';

      return h('div', { className: 'asset-map-grid' },
        h('section', { className: 'panel asset-map-panel', 'aria-labelledby': 'asset-map-heading' },
          h('div', { className: 'panel-heading asset-map-heading' },
            h('h2', { id: 'asset-map-heading' }, '설비 위치 지도'),
            h('button', {
              type: 'button', className: 'button small', disabled: !plotted.length || !window.L,
              onClick: () => {
                const { view } = mapState.current;
                view.closePopup();
                fitLocations(view, plotted);
              },
            }, '표시 설비 전체 보기')),
          h('div', { className: 'filters asset-map-filters' },
            h('label', { className: 'search' }, h('input', {
              type: 'search', 'aria-label': '설비 검색', placeholder: '설비명·ID·지역 검색', value: query,
              onChange: event => setQuery(event.target.value),
            })),
            selectFilter('설비유형', type, setType, '전체 설비', types),
            selectFilter('평가등급', grade, setGrade, '전체 등급', grades),
            h('button', { className: 'button small', onClick: () => {
              setQuery(''); setType(''); setGrade('');
            } }, '초기화')),
          h('div', { className: 'asset-map-meta' },
            h('div', { className: 'asset-map-legend', 'aria-label': '위험도 등급 범례' }, ...grades.map(name =>
              h('span', { key: name }, h('i', { className: 'pin-' + gradeColors[name], 'aria-hidden': true }), name))),
            h('p', { role: 'status' }, '지도 표시 ' + plotted.length + '대 · 좌표 미등록 ' + missing + '대'
              + (invalid ? ' · 좌표 오류 ' + invalid + '대' : ''))),
          h('div', { className: 'asset-map-frame' },
            h('div', { ref: node, className: 'asset-map-canvas', role: 'region', 'aria-label': '배전설비 위치 지도' }),
            (!plotted.length || !window.L) && h('p', { className: 'asset-map-empty' }, empty)),
          h('div', { className: 'asset-map-footer' },
            h('p', { role: 'status' }, tileNotice || (demo ? '마커는 검증용 가상 좌표입니다.' : '')),
            canLoadTiles && h('label', null, h('input', {
              type: 'checkbox', checked: showTiles, onChange: event => toggleTiles(event.target.checked),
            }), ' 배경지도 표시'))),
        h('section', { className: 'panel asset-map-details', 'aria-labelledby': 'asset-map-detail-heading' },
          h('h2', { id: 'asset-map-detail-heading' }, '선택 설비'),
          !selected ? h('p', null, '지도에서 설비를 선택하세요.') : h(React.Fragment, null,
            h('h3', { className: 'asset-map-name' }, selected.name),
            h('p', { className: 'subtext' }, [selected.id, selected.type, selected.region].join(' · ')),
            h('div', { className: 'detail-hero' },
              h('div', null, h('span', null, '위험도 평가지수'), h('strong', null, oneDecimal(selected.Risk))),
              h('span', { className: 'badge ' + gradeColors[selected.grade] }, h('i'), selected.grade)),
            h('div', { className: 'detail-kpis' }, ...[
              ['HI', oneDecimal(selected.HI)], ['연간 PoF', percent(selected.PoF)], ['CoF', oneDecimal(selected.CoF)],
            ].map(([label, value]) =>
              h('div', { key: label }, h('span', null, label), h('strong', null, value)))),
            h('p', { className: 'subtext' }, selected.point.map(value => value.toFixed(5) + '°').join(', ')),
            h('div', { className: 'actions asset-map-detail-actions' },
              h('button', { className: 'button small', onClick: () => onDetails(selected.id) }, '설비 상세'),
              h('button', { className: 'button small', onClick: () => onRanking(selected.id) }, '순위표에서 보기')))));
    };
  }

  window.GridAssetLocations = { createPage, assetLocation, locationIssues };
})();
