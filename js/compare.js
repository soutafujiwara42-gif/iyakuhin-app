const ComparePage = (() => {
  let insertsData = null;
  let medicinesData = null;
  let selectedDrugs = []; // [{xml_id, generic, brands}]

  const SECTIONS = [
    { key: 'contraindications', label: '禁忌', type: 'list' },
    { key: 'indications',       label: '効能・効果', type: 'list' },
    { key: 'serious_adverse',   label: '重大な副作用', type: 'list' },
    { key: 'important_precautions', label: '重要な基本的注意', type: 'list' },
    { key: 'pregnant',  label: '妊婦', type: 'text' },
    { key: 'nursing',   label: '授乳婦', type: 'text' },
    { key: 'elderly',   label: '高齢者', type: 'text' },
    { key: 'pediatric', label: '小児', type: 'text' },
    { key: 'renal',     label: '腎機能障害', type: 'text' },
    { key: 'hepatic',   label: '肝機能障害', type: 'text' },
  ];

  async function loadData() {
    if (insertsData) return;
    const [ins, med] = await Promise.all([
      fetch('data/inserts.json').then(r => r.json()),
      fetch('data/medicines.json').then(r => r.json()),
    ]);
    insertsData = ins;
    medicinesData = med;
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
    if (!q) { el.innerHTML = ''; return; }
    const ql = q.toLowerCase();
    const senpatsuOnly = document.getElementById('cmp-senpatsu-only')?.checked;

    const results = Object.entries(insertsData)
      .filter(([, d]) => {
        if (senpatsuOnly && !d.senpatsu) return false;
        return d.generic.toLowerCase().includes(ql) ||
               d.brands.some(b => b.toLowerCase().includes(ql));
      })
      .slice(0, 40);

    if (results.length === 0) {
      el.innerHTML = `<div style="color:var(--text-muted);font-size:0.875rem;padding:0.5rem">見つかりませんでした</div>`;
      return;
    }

    el.innerHTML = results.map(([xml_id, d]) => {
      const alreadySelected = selectedDrugs.some(s => s.xml_id === xml_id);
      const full = selectedDrugs.length >= 4;
      const disabled = alreadySelected || full;
      const badge = d.senpatsu
        ? `<span class="drug-type-badge senpatsu">先発</span>`
        : `<span class="drug-type-badge generic">後発</span>`;
      return `
        <div class="search-result-item ${disabled ? 'disabled' : ''}" data-id="${xml_id}">
          <div style="display:flex;align-items:center;gap:0.4rem;font-weight:600">
            ${badge}${d.generic}
          </div>
          <div style="font-size:0.8rem;color:var(--text-muted);margin-top:0.15rem">
            ${d.brands.slice(0,3).join('、')}${d.brands.length>3?'…':''}
          </div>
          ${alreadySelected ? '<span class="badge-added">追加済</span>' : ''}
        </div>
      `;
    }).join('');

    el.querySelectorAll('.search-result-item:not(.disabled)').forEach(item => {
      item.addEventListener('click', () => {
        const xml_id = item.dataset.id;
        const d = insertsData[xml_id];
        if (selectedDrugs.length < 4 && !selectedDrugs.some(s => s.xml_id === xml_id)) {
          selectedDrugs.push({ xml_id, generic: d.generic, brands: d.brands, senpatsu: d.senpatsu });
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
              <span>${d.generic}</span>
              <button class="chip-remove" data-idx="${i}">✕</button>
            </div>
          `).join('')}
        </div>
        ${selectedDrugs.length >= 2 ? `
          <div style="margin-top:1rem">
            <div style="font-size:0.875rem;font-weight:600;margin-bottom:0.5rem">比較する項目：</div>
            <div class="section-tabs">
              ${SECTIONS.map((s, i) => `
                <button class="section-tab ${i===0?'active':''}" data-sec="${s.key}">${s.label}</button>
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
      tab.addEventListener('click', () => {
        el.querySelectorAll('.section-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
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
      renderListComparison(el, key, secDef.label);
    } else {
      renderTextComparison(el, key, secDef.label);
    }
  }

  function renderListComparison(el, key, label) {
    // 全薬品の全項目を集める（重複除去）
    const allItems = new Set();
    selectedDrugs.forEach(d => {
      const items = insertsData[d.xml_id]?.[key] || [];
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
              </th>`).join('')}
            </tr>
          </thead>
          <tbody>
    `;

    Array.from(allItems).forEach(item => {
      // 何割の薬に含まれるか
      const presences = drugs.map(d => {
        const items = insertsData[d.xml_id]?.[key] || [];
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

  function renderTextComparison(el, key, label) {
    const drugs = selectedDrugs;
    let html = `
      <div class="card" style="overflow-x:auto">
        <div style="font-weight:700;font-size:1rem;margin-bottom:1rem">📋 ${label}の比較</div>
        <div class="cmp-text-grid" style="grid-template-columns:repeat(${drugs.length},1fr)">
          ${drugs.map((d,i) => {
            const text = insertsData[d.xml_id]?.[key] || '';
            return `
              <div class="cmp-text-col" style="border-top:3px solid ${COLORS[i]}">
                <div class="cmp-drug-header2" style="color:${COLORS[i]}">薬${i+1}（${d.senpatsu?'先発':'後発'}）: ${d.generic}</div>
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
