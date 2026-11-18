(() => {
  'use strict';

  const gradeColors = { 우선검토: 'red', 관찰: 'gold', 일반: 'blue', 평가보류: 'gray' };
  const osmAttribution = '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
  const demoArea = '대전 유성구';
  // Road centerlines adapted from OpenStreetMap. Feeder and roadside assets are fictional.
  const demoFeeder = [
    {
      road: '대학로',
      path: [
        [36.362271, 127.345001], [36.361342, 127.347630], [36.360738, 127.349395],
        [36.360478, 127.350610], [36.360373, 127.351326], [36.360345, 127.351724],
        [36.360361, 127.352591], [36.360443, 127.353218], [36.360616, 127.353822],
        [36.361245, 127.355882], [36.361558, 127.356718],
      ],
      points: [
        [36.362095, 127.345275], [36.361911, 127.345740], [36.361679, 127.346481],
        [36.361473, 127.347008], [36.361298, 127.347532], [36.361118, 127.348000],
        [36.360892, 127.348744], [36.360692, 127.349274], [36.360570, 127.349834],
        [36.360445, 127.350329], [36.360339, 127.351120], [36.360265, 127.351706],
        [36.360283, 127.352283], [36.360299, 127.352813], [36.360482, 127.353589],
        [36.360629, 127.354148], [36.360799, 127.354674], [36.360930, 127.355165],
        [36.361182, 127.355896], [36.361366, 127.356442],
      ],
    },
    {
      road: '궁동로',
      path: [
        [36.361342, 127.347630], [36.362834, 127.347406], [36.363197, 127.347492],
        [36.363246, 127.347553], [36.363256, 127.348547], [36.363507, 127.348549],
        [36.363567, 127.348871], [36.363934, 127.350150],
      ],
      points: [
        [36.361641, 127.347675], [36.362086, 127.347630], [36.362763, 127.347495],
        [36.363178, 127.347611], [36.363180, 127.348143], [36.363375, 127.348660],
        [36.363604, 127.349233], [36.363756, 127.349830],
      ],
    },
    {
      road: '농대로',
      path: [
        [36.360616, 127.353822], [36.361742, 127.353191], [36.363493, 127.353010],
        [36.364598, 127.352829], [36.364957, 127.352658], [36.365775, 127.351963],
        [36.366257, 127.351927],
      ],
      points: [
        [36.361010, 127.353699], [36.361574, 127.353408], [36.362459, 127.353195],
        [36.363149, 127.353146], [36.363818, 127.353047], [36.364426, 127.352969],
        [36.365297, 127.352464], [36.365848, 127.352058],
      ],
    },
  ];
  const demoLocations = demoFeeder.flatMap(({ road, points }) =>
    points.map(point => ({ point, road, area: demoArea })));
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
    // Every third item in each group of four demo records is an underground cable.
    return demoLocations[index - Math.floor((index + 1) / 4)] ?? {};
  }

  function assetSearchText(asset, demo) {
    const { road, area } = demo ? assetLocation(asset, true) : {};
    const fields = [asset.id, asset.name, asset.region];
    if (road) fields.push(area, road);
    return fields.join(' ').toLowerCase();
  }

  const oneDecimal = value => value == null ? '—' : value.toFixed(1);
  const percent = value => value == null ? '—' : oneDecimal(value * 100) + '%';

  function fitLocations(view, rows, fullDemo) {
    if (!rows.length) return;
    const bounds = L.latLngBounds(rows.map(row => row.point));
    if (fullDemo) {
      for (const { path } of demoFeeder) bounds.extend(L.latLngBounds(path));
    }
    view.fitBounds(bounds, {
      padding: [29, 29], maxZoom: rows.some(row => row.road) ? 17 : 15, animate: false,
    });
  }

  function drawDemoFeeder(layer) {
    for (const [index, { path }] of demoFeeder.entries()) {
      const style = { interactive: false, lineJoin: 'round' };
      L.polyline(path, { ...style, color: '#fff', weight: 7, opacity: 0.92 }).addTo(layer);
      L.polyline(path, {
        ...style, color: index === 0 ? '#153e80' : '#278090', weight: 4,
        dashArray: index === 0 ? null : '7 6',
      }).addTo(layer);
    }
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
      const size = count > 1 ? 28 : first.road ? 16 : 19;
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
      const hasDemoFeeder = plotted.some(row => row.road);
      const fullDemo = hasDemoFeeder && !query && !type && !grade;

      useEffect(() => {
        if (!window.L) return;
        const view = L.map(node.current, {
          scrollWheelZoom: true, wheelPxPerZoomLevel: 100, fadeAnimation: false, maxZoom: 19,
        }).setView([35.85, 127.04], 10);
        view.attributionControl.setPrefix(false);
        L.control.scale({ imperial: false }).addTo(view);
        const resize = new ResizeObserver(() => view.invalidateSize({ pan: false }));
        resize.observe(node.current);
        mapState.current = {
          view, feeder: L.layerGroup().addTo(view), layer: L.layerGroup().addTo(view), markers: new Map(),
        };
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
          attribution: osmAttribution,
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
        if (!state || !hasDemoFeeder) return;
        drawDemoFeeder(state.feeder);
        state.view.attributionControl.addAttribution(osmAttribution);
        return () => {
          state.feeder.clearLayers();
          state.view.attributionControl.removeAttribution(osmAttribution);
        };
      }, [hasDemoFeeder]);

      useEffect(() => {
        const state = mapState.current;
        if (!state) return;
        state.markers = drawLocations(state.view, state.layer, plotted, select);
        const initial = state.markers.get(pendingFocus.current);
        pendingFocus.current = null;
        if (initial) {
          state.view.setView(initial.getLatLng(), hasDemoFeeder ? 17 : 15, { animate: false });
          initial.openPopup();
        } else {
          fitLocations(state.view, plotted, fullDemo);
        }
      }, [plotted, fullDemo, hasDemoFeeder]);

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
                fitLocations(view, plotted, fullDemo);
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
          hasDemoFeeder && h('div', { className: 'asset-feeder-legend', 'aria-label': '가상 선로 범례' },
            h('strong', null, demoArea + ' · 배전선로 시연'),
            h('span', { className: 'asset-feeder-main' }, '가상 주선로'),
            h('span', { className: 'asset-feeder-branch' }, '가상 분기선')),
          h('div', { className: 'asset-map-frame' },
            h('div', { ref: node, className: 'asset-map-canvas', role: 'region', 'aria-label': '배전설비 위치 지도' }),
            (!plotted.length || !window.L) && h('p', { className: 'asset-map-empty' }, empty)),
          h('div', { className: 'asset-map-footer' },
            h('p', null, '지도 위 마우스 휠로 확대·축소'),
            hasDemoFeeder && h('p', null, '선로·설비 위치는 도로를 참고한 가상 배치입니다.'),
            tileNotice && h('p', { className: 'asset-map-notice', role: 'status' }, tileNotice),
            canLoadTiles && h('label', null, h('input', {
              type: 'checkbox', checked: showTiles, onChange: event => toggleTiles(event.target.checked),
            }), ' 배경지도 표시'))),
        h('section', { className: 'panel asset-map-details', 'aria-labelledby': 'asset-map-detail-heading' },
          h('h2', { id: 'asset-map-detail-heading' }, '선택 설비'),
          !selected ? h('p', null, '지도에서 설비를 선택하세요.') : h(React.Fragment, null,
            h('h3', { className: 'asset-map-name' }, selected.name),
            h('p', { className: 'subtext' }, [selected.id, selected.type, selected.road ?? selected.region].join(' · ')),
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

  window.GridAssetLocations = { createPage, assetLocation, assetSearchText, locationIssues };
})();
