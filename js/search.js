const SearchPage = (() => {
  let allData = null;
  let timer = null;

  async function render(container) {
    container.innerHTML = `<div class="loading"><div class="spinner"></div>データ読み込み中...</div>`;
    allData = await DataStore.getAll();

    container.innerHTML = `
      <div class="card">
        <div class="search-box">
          <input type="text" class="search-input" id="search-input" placeholder="商品名または一般名で検索...">
        </div>
        <div class="result-count" id="result-count">キーワードを入力してください</div>
        <div id="search-results"></div>
      </div>
    `;

    const input = document.getElementById('search-input');
    input.focus();
    input.addEventListener('input', () => {
      clearTimeout(timer);
      timer = setTimeout(doSearch, 200);
    });
  }

  function doSearch() {
    const q = document.getElementById('search-input')?.value.trim();
    const countEl = document.getElementById('result-count');
    const resultsEl = document.getElementById('search-results');
    if (!q || !allData) {
      if (countEl) countEl.textContent = 'キーワードを入力してください';
      if (resultsEl) resultsEl.innerHTML = '';
      return;
    }

    const ql = q.toLowerCase();
    const results = allData.filter(d =>
      d.g.toLowerCase().includes(ql) ||
      d.b.some(b => b.toLowerCase().includes(ql))
    ).slice(0, 100);

    if (countEl) countEl.textContent = `${results.length} 件${results.length === 100 ? '（上位100件）' : ''}`;

    if (!resultsEl) return;
    if (results.length === 0) {
      resultsEl.innerHTML = `<div style="text-align:center;padding:2rem;color:var(--text-muted)">見つかりませんでした</div>`;
      return;
    }

    resultsEl.innerHTML = results.map(d => `
      <div class="medicine-card">
        <div class="medicine-generic">${highlight(d.g, q)}</div>
        <div style="font-size:0.75rem;color:var(--text-muted);margin-bottom:0.4rem">${d.c || ''}</div>
        <div class="medicine-brands">
          ${d.b.map(b => `<span>${highlight(b, q)}</span>`).join('')}
        </div>
      </div>
    `).join('');
  }

  function highlight(text, query) {
    if (!query) return text;
    const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return text.replace(new RegExp(escaped, 'gi'), m => `<mark style="background:#fef08a;border-radius:2px">${m}</mark>`);
  }

  return { render };
})();
