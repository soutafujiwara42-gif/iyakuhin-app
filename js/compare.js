const ComparePage = (() => {
  let insertsData = null;
  let detailCache = {};   // { カテゴリ名: {xml_id: {...}} }
  let selectedDrugs = [];

  // source:'slim' = inserts.json収録済み / source:'detail' = カテゴリ別ファイルから遅延ロード
  const SECTIONS = [
    // ── slim ──────────────────────────────────────────
    { key: 'contraindications',      label: '禁忌',          type: 'list', source: 'slim' },
    { key: 'indications',            label: '効能・効果',      type: 'list', source: 'slim' },
    { key: 'serious_adverse',        label: '重大な副作用',    type: 'list', source: 'slim' },
    { key: 'important_precautions',  label: '重要な基本的注意', type: 'list', source: 'slim' },
    { key: 'pregnant',   label: '妊婦',     type: 'text', source: 'slim' },
    { key: 'nursing',    label: '授乳婦',   type: 'text', source: 'slim' },
    { key: 'elderly',    label: '高齢者',   type: 'text', source: 'slim' },
    { key: 'pediatric',  label: '小児',     type: 'text', source: 'slim' },
    { key: 'renal',      label: '腎機能障害', type: 'text', source: 'slim' },
    { key: 'hepatic',    label: '肝機能障害', type: 'text', source: 'slim' },
    // ── detail（遅延ロード）───────────────────────────
    { key: 'dosage',                 label: '用法・用量',          type: 'text', source: 'detail' },
    { key: 'dosage_precautions',     label: '用法・用量の注意',     type: 'list', source: 'detail' },
    { key: 'complications',          label: '合併症・既往歴',       type: 'list', source: 'detail' },
    { key: 'application_precautions',label: '適用上の注意',        type: 'list', source: 'detail' },
    { key: 'interactions',           label: '相互作用',            type: 'text', source: 'detail' },
    { key: 'adverse_events',         label: '副作用（全般）',       type: 'list', source: 'detail' },
    { key: 'other_adverse',          label: 'その他の副作用',       type: 'text', source: 'detail' },
    { key: 'pharmacology',           label: '薬効薬理',            type: 'text', source: 'detail' },
    { key: 'pharmacokinetics',       label: '薬物動態',            type: 'text', source: 'detail' },
    { key: 'physicochemical',        label: '理化学的知見',         type: 'text', source: 'detail' },
    { key: 'handling',               label: '取扱い上の注意',       type: 'text', source: 'detail' },
    { key: 'package',                label: '包装',                type: 'text', source: 'detail' },
  ];

  // 後発品の 商品名「メーカー」から メーカー名を抽出
  function extractMaker(brands) {
    for (const b of brands) {
      const m = b.match(/「(.+?)」/);
      if (m) return m[1];
    }
    return '';
  }

  // 全角→半角・大文字→小文字に正規化
  function normalize(s) {
    return s
      .replace(/[Ａ-Ｚａ-ｚ０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0))
      .replace(/[‐－―]/g, '-')
      .toLowerCase();
  }

  // クエリをトークン化（全角・半角スペース両対応）
  function tokenize(q) {
    return normalize(q).split(/[\s　]+/).filter(Boolean);
  }

  const DATA_VERSION = '20260604d';
  let searchIndex = null; // [{ xml_id, d, text }]  textは正規化済み検索文字列

  async function loadData() {
    if (insertsData) return;
    const res = await fetch(`data/inserts.json?v=${DATA_VERSION}`, { cache: 'no-cache' });
    if (!res.ok) throw new Error(`inserts.json load failed: ${res.status}`);
    insertsData = await res.json();
    buildSearchIndex();
  }

  // 検索インデックスを事前計算（一般名・商品名・メーカー名を正規化して連結）
  function buildSearchIndex() {
    searchIndex = Object.entries(insertsData).map(([xml_id, d]) => {
      const maker = extractMaker(d.brands);
      const text = normalize([d.generic, ...d.brands, maker].join(' '));
      return { xml_id, d, text };
    });
  }

  // 選択薬品に必要なカテゴリのdetailファイルをまとめてロード
  async function loadDetailForDrugs(drugs) {
    const cats = [...new Set(drugs.map(d => insertsData[d.xml_id]?.cat).filter(Boolean))];
    await Promise.all(cats.map(async cat => {
      if (detailCache[cat]) return; // キャッシュ済み
      const res = await fetch(`data/detail/${encodeURIComponent(cat)}.json?v=${DATA_VERSION}`, { cache: 'no-cache' });
      if (res.ok) detailCache[cat] = await res.json();
    }));
  }

  // xml_idのdetailデータを取得（キャッシュから）
  function getDetail(xml_id) {
    const cat = insertsData[xml_id]?.cat;
    return cat ? (detailCache[cat]?.[xml_id] || {}) : {};
  }

  // slim または detail から値を取得
  function getValue(xml_id, key, source) {
    if (source === 'slim') return insertsData[xml_id]?.[key];
    return getDetail(xml_id)[key];
  }

  async function render(container) {
    container.innerHTML = `<div class="loading"><div class="spinner"></div>添付文書データ読み込み中…（初回のみ時間がかかります）</div>`;
    await loadData();

    container.innerHTML = `
      <div class="card" id="cmp-search-card">
        <div style="font-weight:700;font-size:1rem;margin-bottom:0.75rem">薬品を選択（最大4つ）</div>
        <div class="cmp-filter-row">
          <div class="search-box" style="flex:1;margin-bottom:0">
            <input type="text" class="search-input" id="cmp-search" placeholder="商品名または一般名で検索...">
          </div>
          <label class="toggle-label">
            <input type="checkbox" id="cmp-senpatsu-only"> 先発品のみ
          </label>
        </div>
        <div id="cmp-search-results" style="margin-top:0.75rem"></div>
        <div class="cmp-hint">💡 同一一般名の先発品・後発品を選ぶと適応の差異を確認できます</div>
      </div>

      <div id="cmp-selected-area"></div>
      <div id="cmp-result-area"></div>
    `;

    document.getElementById('cmp-search').addEventListener('input', onSearchInput);
    document.getElementById('cmp-senpatsu-only').addEventListener('change', onSearchInput);
    renderSelected();
  }

  let searchTimer = null;
  function onSearchInput(e) {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => doSearch(e.target.value.trim()), 200);
  }

  function doSearch(q) {
    const el = document.getElementById('cmp-search-results');
    if (!el) return;
    if (!q.trim()) { el.innerHTML = ''; return; }

    // 全角半角・大小文字を正規化してトークン化（部分一致 AND 検索）
    const tokens = tokenize(q);
    const senpatsuOnly = document.getElementById('cmp-senpatsu-only')?.checked;

    // 事前計算済みインデックスに対してトークンAND部分一致
    const results = [];
    for (const entry of searchIndex) {
      if (senpatsuOnly && !entry.d.senpatsu) continue;
      if (tokens.every(tok => entry.text.includes(tok))) {
        results.push([entry.xml_id, entry.d]);
        if (results.length >= 50) break;
      }
    }

    if (results.length === 0) {
      // 先発品のみON時は、後発品なら見つかる可能性を案内
      let hint = '';
      if (senpatsuOnly) {
        const foundIfAll = searchIndex.some(e => tokens.every(tok => e.text.includes(tok)));
        if (foundIfAll) {
          hint = `<div style="margin-top:0.4rem;color:var(--warning)">💡「先発品のみ」をOFFにすると後発品が見つかります</div>`;
        }
      }
      el.innerHTML = `<div style="color:var(--text-muted);font-size:0.875rem;padding:0.5rem 0">見つかりませんでした${hint}</div>`;
      return;
    }

    el.innerHTML = results.map(([xml_id, d]) => {
      const alreadySelected = selectedDrugs.some(s => s.xml_id === xml_id);
      const full = selectedDrugs.length >= 4;
      const disabled = alreadySelected || full;
      const maker = extractMaker(d.brands);
      const badge = d.senpatsu
        ? `<span class="drug-type-badge senpatsu">先発</span>`
        : `<span class="drug-type-badge generic">後発</span>`;

      return `
        <div class="search-result-item ${disabled ? 'disabled' : ''}" data-id="${xml_id}">
          <div class="result-main-row">
            ${badge}
            <span class="result-generic">${d.generic}</span>
            ${alreadySelected ? '<span class="badge-added">追加済</span>' : ''}
          </div>
          <div class="result-brand-row">
            ${d.senpatsu
              ? d.brands.slice(0,2).join('、') + (d.brands.length>2?'…':'')
              : `<span class="maker-chip">${maker || d.brands[0]}</span> ${d.brands.slice(0,2).map(b=>b.replace(/「.+?」/,'')).join('、')}`
            }
          </div>
        </div>
      `;
    }).join('');

    el.querySelectorAll('.search-result-item:not(.disabled)').forEach(item => {
      item.addEventListener('click', () => {
        const xml_id = item.dataset.id;
        const d = insertsData[xml_id];
        if (selectedDrugs.length < 4 && !selectedDrugs.some(s => s.xml_id === xml_id)) {
          const maker = extractMaker(d.brands);
          selectedDrugs.push({
            xml_id,
            generic: d.generic,
            brands: d.brands,
            senpatsu: d.senpatsu,
            maker
          });
          renderSelected();
          renderComparison();
          const inp = document.getElementById('cmp-search');
          if (inp) { inp.value = ''; }
          el.innerHTML = '';
        }
      });
    });
  }

  function renderSelected() {
    const el = document.getElementById('cmp-selected-area');
    if (!el) return;
    if (selectedDrugs.length === 0) {
      el.innerHTML = `
        <div style="text-align:center;padding:2.5rem;color:var(--text-muted)">
          <div style="font-size:2.5rem;margin-bottom:0.5rem">⚖️</div>
          <div>薬品を2つ以上選択すると比較が表示されます</div>
        </div>`;
      return;
    }

    el.innerHTML = `
      <div class="card" style="margin-bottom:1rem">
        <div style="font-weight:700;margin-bottom:0.75rem">選択中の薬品</div>
        <div class="selected-drugs-row">
          ${selectedDrugs.map((d, i) => `
            <div class="selected-drug-chip" style="--chip-color:${COLORS[i]}">
              <span class="chip-type">${d.senpatsu ? '先発' : '後発'}</span>
              <span>${d.generic}${!d.senpatsu && d.maker ? `「${d.maker}」` : ''}</span>
              <button class="chip-remove" data-idx="${i}">✕</button>
            </div>
          `).join('')}
        </div>
        ${selectedDrugs.length >= 2 ? `
          <div style="margin-top:1rem">
            <div style="font-size:0.875rem;font-weight:600;margin-bottom:0.3rem">比較する項目：</div>
            <div style="font-size:0.75rem;color:var(--text-muted);margin-bottom:0.5rem">
              🔵 基本項目（即座に表示） ／ 🟠 詳細項目（初回のみ読み込み）
            </div>
            <div class="section-tabs">
              ${SECTIONS.map((s, i) => `
                <button class="section-tab ${i===0?'active':''} ${s.source==='detail'?'tab-detail':''}"
                        data-sec="${s.key}" data-source="${s.source}">
                  ${s.source==='detail'?'🟠 ':''}${s.label}
                </button>
              `).join('')}
            </div>
          </div>
        ` : '<div style="font-size:0.875rem;color:var(--text-muted);margin-top:0.5rem">もう1つ以上追加してください</div>'}
      </div>
    `;

    el.querySelectorAll('.chip-remove').forEach(btn => {
      btn.addEventListener('click', () => {
        selectedDrugs.splice(parseInt(btn.dataset.idx), 1);
        renderSelected();
        renderComparison();
      });
    });

    el.querySelectorAll('.section-tab').forEach(tab => {
      tab.addEventListener('click', async () => {
        el.querySelectorAll('.section-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        if (tab.dataset.source === 'detail') {
          await loadDetailForDrugs(selectedDrugs);
        }
        renderComparison(tab.dataset.sec);
      });
    });
  }

  const COLORS = ['#3b82f6','#ef4444','#16a34a','#d97706'];
  const LIGHT_COLORS = ['#dbeafe','#fee2e2','#dcfce7','#fef3c7'];

  function getActiveSectionKey() {
    const active = document.querySelector('.section-tab.active');
    return active ? active.dataset.sec : SECTIONS[0].key;
  }

  function renderComparison(sectionKey) {
    const el = document.getElementById('cmp-result-area');
    if (!el) return;
    if (selectedDrugs.length < 2) { el.innerHTML = ''; return; }

    const key = sectionKey || getActiveSectionKey();
    const secDef = SECTIONS.find(s => s.key === key) || SECTIONS[0];

    if (secDef.type === 'list') {
      renderListComparison(el, key, secDef.label, secDef.source);
    } else {
      renderTextComparison(el, key, secDef.label, secDef.source);
    }
  }

  function renderListComparison(el, key, label, source) {
    // 全薬品の全項目を集める（重複除去）
    const allItems = new Set();
    selectedDrugs.forEach(d => {
      const items = getValue(d.xml_id, key, source) || [];
      items.forEach(item => allItems.add(item));
    });

    if (allItems.size === 0) {
      el.innerHTML = `<div class="card" style="color:var(--text-muted);text-align:center;padding:2rem">選択中の薬品にこの項目のデータがありません</div>`;
      return;
    }

    const drugs = selectedDrugs;
    const n = drugs.length;

    // ヘッダー
    let html = `
      <div class="card" style="overflow-x:auto">
        <div style="font-weight:700;font-size:1rem;margin-bottom:1rem">📋 ${label}の比較</div>
        <div class="cmp-legend">
          ${drugs.map((d,i) => `<span class="cmp-legend-item" style="background:${LIGHT_COLORS[i]};border-left:3px solid ${COLORS[i]}">
            <b>薬${i+1}</b> ${d.generic}
          </span>`).join('')}
        </div>
        <table class="cmp-table">
          <thead>
            <tr>
              <th class="cmp-item-col">項目</th>
              ${drugs.map((d,i) => `<th style="background:${LIGHT_COLORS[i]}">
                <div class="cmp-drug-header" style="color:${COLORS[i]}">薬${i+1} <span style="font-size:0.7rem;opacity:0.8">${d.senpatsu?'先発':'後発'}</span></div>
                <div class="cmp-drug-name">${d.generic}</div>
                ${!d.senpatsu && d.maker ? `<div style="font-size:0.7rem;color:var(--text-muted)">「${d.maker}」</div>` : ''}
              </th>`).join('')}
            </tr>
          </thead>
          <tbody>
    `;

    Array.from(allItems).forEach(item => {
      // 何割の薬に含まれるか
      const presences = drugs.map(d => {
        const items = getValue(d.xml_id, key, source) || [];
        return items.some(i => normalize(i) === normalize(item));
      });
      const presentCount = presences.filter(Boolean).length;
      const isDiff = presentCount > 0 && presentCount < n; // 差異あり

      html += `<tr class="${isDiff ? 'row-diff' : ''}">
        <td class="cmp-item-col">${item.length > 120 ? item.slice(0,120)+'…' : item}</td>
        ${presences.map((has, i) => `
          <td class="cmp-cell" style="background:${has ? LIGHT_COLORS[i]+'80' : 'transparent'}">
            ${has
              ? `<span class="cmp-check" style="color:${COLORS[i]}">✔</span>`
              : `<span class="cmp-none">—</span>`
            }
          </td>
        `).join('')}
      </tr>`;
    });

    html += `</tbody></table>
        <div class="cmp-diff-note">🔶 オレンジ行は薬品間で差異がある項目です</div>
      </div>`;
    el.innerHTML = html;
  }

  function renderTextComparison(el, key, label, source) {
    const drugs = selectedDrugs;
    let html = `
      <div class="card" style="overflow-x:auto">
        <div style="font-weight:700;font-size:1rem;margin-bottom:1rem">📋 ${label}の比較</div>
        <div class="cmp-text-grid" style="grid-template-columns:repeat(${drugs.length},1fr)">
          ${drugs.map((d,i) => {
            const text = getValue(d.xml_id, key, source) || '';
            return `
              <div class="cmp-text-col" style="border-top:3px solid ${COLORS[i]}">
                <div class="cmp-drug-header2" style="color:${COLORS[i]}">薬${i+1}（${d.senpatsu?'先発':'後発'}）: ${d.generic}${!d.senpatsu&&d.maker?`「${d.maker}」`:''}</div>
                <div class="cmp-text-body">${text || '<span style="color:var(--text-muted)">記載なし</span>'}</div>
              </div>
            `;
          }).join('')}
        </div>
      </div>`;
    el.innerHTML = html;
  }

  function normalize(s) {
    return s.replace(/\s+/g,'').toLowerCase();
  }

  return { render };
})();
