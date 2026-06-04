const FlashcardPage = (() => {
  let insertsData = null;
  let medicinesData = null;

  // カードデッキ（{front, back, drug}の配列）
  let deck = [];
  let deckIdx = 0;
  let flipped = false;
  let stats = { know: 0, unknown: 0 };
  let unknownCards = []; // 「知らなかった」カードを後で再出題

  // 設定
  let settings = {
    cardType: 'generic',   // generic / contraindications / composition
    category: 'すべて',
    senpatsuOnly: true,
  };

  const CARD_TYPES = [
    { key: 'generic',          label: '一般名',     icon: '💊' },
    { key: 'contraindications',label: '禁忌',       icon: '⛔' },
    { key: 'composition',      label: '組成・性状', icon: '🔬' },
  ];

  async function loadData() {
    if (insertsData) return;
    const DATA_VERSION = '20260604b';
    const [ins, med] = await Promise.all([
      fetch(`data/inserts.json?v=${DATA_VERSION}`, { cache: 'no-cache' }).then(r => r.json()),
      fetch('data/medicines.json').then(r => r.json()),
    ]);
    insertsData = ins;
    medicinesData = med;
  }

  async function render(container) {
    container.innerHTML = `<div class="loading"><div class="spinner"></div>データ読み込み中…</div>`;
    await loadData();
    renderSettings(container);
  }

  // =========== カテゴリ一覧 ===========
  function getCategories() {
    const cats = new Set();
    medicinesData.forEach(d => { if (d.c) cats.add(d.c); });
    return ['すべて', ...Array.from(cats).sort()];
  }

  // =========== 設定画面 ===========
  function renderSettings(container) {
    const categories = getCategories();
    const catOptions = categories.map(c =>
      `<option value="${c}" ${c === settings.category ? 'selected' : ''}>${c}</option>`
    ).join('');

    container.innerHTML = `
      <div class="card fc-settings-card">
        <h2 class="fc-title">🃏 暗記カード</h2>

        <div class="fc-setting-group">
          <div class="fc-setting-label">カードの種類</div>
          <div class="fc-card-type-row">
            ${CARD_TYPES.map(t => `
              <button class="fc-type-btn ${settings.cardType === t.key ? 'active' : ''}"
                      data-type="${t.key}">
                <span class="fc-type-icon">${t.icon}</span>
                <span>${t.label}</span>
              </button>
            `).join('')}
          </div>
        </div>

        <div class="fc-setting-group">
          <div class="fc-setting-label">薬効群</div>
          <select class="fc-select" id="fc-cat-select">${catOptions}</select>
        </div>

        <div class="fc-setting-group">
          <div class="fc-setting-label">対象</div>
          <div class="fc-toggle-row">
            <label class="fc-toggle-label">
              <input type="checkbox" id="fc-senpatsu-only" ${settings.senpatsuOnly ? 'checked' : ''}>
              <span class="fc-toggle-text">先発品のみ（OFFにすると後発品も含む）</span>
            </label>
          </div>
        </div>

        <div id="fc-deck-count" class="fc-deck-count"></div>

        <button class="btn btn-primary fc-start-btn" id="fc-start-btn" style="width:100%;padding:0.75rem;font-size:1rem;margin-top:0.5rem">
          ▶ 開始
        </button>
      </div>
    `;

    // カード種類選択
    container.querySelectorAll('.fc-type-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        settings.cardType = btn.dataset.type;
        container.querySelectorAll('.fc-type-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        updateDeckCount(container);
      });
    });

    document.getElementById('fc-cat-select').addEventListener('change', e => {
      settings.category = e.target.value;
      updateDeckCount(container);
    });

    document.getElementById('fc-senpatsu-only').addEventListener('change', e => {
      settings.senpatsuOnly = e.target.checked;
      updateDeckCount(container);
    });

    document.getElementById('fc-start-btn').addEventListener('click', () => startDeck(container));

    updateDeckCount(container);
  }

  function updateDeckCount(container) {
    const cards = buildDeck(true);
    const el = document.getElementById('fc-deck-count');
    if (el) {
      el.textContent = cards > 0
        ? `📚 ${cards} 枚のカードが見つかりました`
        : '⚠ 条件に合うカードがありません';
      el.style.color = cards > 0 ? 'var(--success)' : 'var(--danger)';
    }
    const startBtn = document.getElementById('fc-start-btn');
    if (startBtn) startBtn.disabled = cards === 0;
  }

  // =========== デッキ構築 ===========
  function buildDeck(countOnly = false) {
    const cards = [];

    if (settings.cardType === 'generic') {
      // 一般名カード：medicines.jsonから
      const pool = medicinesData.filter(d => {
        if (settings.senpatsuOnly && d.b.some(b => b.includes('「'))) return false;
        if (!settings.senpatsuOnly && false) return false; // 後発品含む=全部OK
        if (settings.category !== 'すべて' && d.c !== settings.category) return false;
        return true;
      });
      if (countOnly) return pool.length;
      pool.forEach(d => {
        const brand = d.b[Math.floor(Math.random() * d.b.length)];
        cards.push({
          front: brand,
          frontLabel: '商品名',
          back: d.g,
          backLabel: '一般名',
          sub: d.c,
          type: 'generic',
        });
      });

    } else if (settings.cardType === 'contraindications') {
      // 禁忌カード：inserts.jsonから、1薬品につき1カード（全禁忌を裏面に）
      let count = 0;
      for (const [xml_id, d] of Object.entries(insertsData)) {
        if (settings.senpatsuOnly && !d.senpatsu) continue;
        const brand = d.brands[0];
        if (!brand) continue;
        // カテゴリフィルタ
        if (settings.category !== 'すべて') {
          const medEntry = medicinesData.find(m => m.g === d.generic);
          if (!medEntry || medEntry.c !== settings.category) continue;
        }
        const items = d.contraindications || [];
        if (items.length === 0) continue;
        count++;
        if (countOnly) continue;
        cards.push({
          front: brand,
          frontLabel: '商品名',
          back: items,  // 配列
          backLabel: '禁忌',
          sub: d.generic,
          type: 'list',
        });
      }
      if (countOnly) return count;

    } else if (settings.cardType === 'composition') {
      // 組成・性状カード
      let count = 0;
      for (const [xml_id, d] of Object.entries(insertsData)) {
        if (settings.senpatsuOnly && !d.senpatsu) continue;
        const brand = d.brands[0];
        if (!brand) continue;
        if (settings.category !== 'すべて') {
          const medEntry = medicinesData.find(m => m.g === d.generic);
          if (!medEntry || medEntry.c !== settings.category) continue;
        }
        const comp = d.composition || [];
        if (comp.length === 0) continue;
        count++;
        if (countOnly) continue;
        const back = [...comp];
        if (d.property) back.push(`【性状】${d.property.slice(0, 100)}`);
        cards.push({
          front: brand,
          frontLabel: '商品名',
          back: back,
          backLabel: '組成・性状',
          sub: d.generic,
          type: 'list',
        });
      }
      if (countOnly) return count;
    }

    // シャッフル
    for (let i = cards.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [cards[i], cards[j]] = [cards[j], cards[i]];
    }
    return cards;
  }

  // =========== デッキ開始 ===========
  function startDeck(container) {
    deck = buildDeck(false);
    if (deck.length === 0) return;
    deckIdx = 0;
    flipped = false;
    stats = { know: 0, unknown: 0 };
    unknownCards = [];
    renderCard(container);
  }

  // =========== カード表示 ===========
  function renderCard(container) {
    if (deckIdx >= deck.length) {
      renderFinish(container);
      return;
    }
    const card = deck[deckIdx];
    flipped = false;

    const progress = Math.round((deckIdx / deck.length) * 100);

    container.innerHTML = `
      <div class="fc-progress-row">
        <div class="fc-progress-bar-wrap">
          <div class="fc-progress-bar" style="width:${progress}%"></div>
        </div>
        <div class="fc-progress-text">${deckIdx + 1} / ${deck.length}</div>
      </div>

      <div class="fc-stats-row">
        <span class="score-badge badge-correct">✓ 知ってた ${stats.know}</span>
        <span class="score-badge badge-wrong">✗ 知らなかった ${stats.unknown}</span>
        <button class="btn btn-outline fc-settings-link" id="fc-settings-link" style="font-size:0.75rem;padding:0.3rem 0.6rem">⚙ 設定</button>
      </div>

      <div class="fc-card-wrap">
        <div class="fc-card" id="fc-card">
          <div class="fc-card-face fc-card-front">
            <div class="fc-face-label">${card.frontLabel}</div>
            <div class="fc-face-main">${card.front}</div>
            ${card.sub ? `<div class="fc-face-sub">${card.sub}</div>` : ''}
            <div class="fc-flip-hint">タップして答えを見る 👆</div>
          </div>
          <div class="fc-card-face fc-card-back" style="display:none">
            <div class="fc-face-label">${card.backLabel}</div>
            <div class="fc-face-main fc-back-content" id="fc-back-content"></div>
            ${card.sub ? `<div class="fc-face-sub">${card.sub}</div>` : ''}
          </div>
        </div>
      </div>

      <div class="fc-action-row" id="fc-action-row" style="display:none">
        <button class="btn fc-btn-unknown" id="fc-unknown-btn">✗ 知らなかった</button>
        <button class="btn fc-btn-know" id="fc-know-btn">✓ 知ってた</button>
      </div>

      <div class="fc-nav-row">
        <button class="btn btn-outline" id="fc-prev-btn" ${deckIdx === 0 ? 'disabled' : ''}>← 前へ</button>
        <button class="btn btn-outline" id="fc-skip-btn">スキップ →</button>
      </div>
    `;

    // 裏面コンテンツをセット
    setBackContent(card);

    // カードフリップ
    document.getElementById('fc-card').addEventListener('click', () => {
      if (!flipped) flipCard(card);
    });

    document.getElementById('fc-know-btn')?.addEventListener('click', () => {
      stats.know++;
      deckIdx++;
      renderCard(container);
    });
    document.getElementById('fc-unknown-btn')?.addEventListener('click', () => {
      stats.unknown++;
      unknownCards.push(card);
      deckIdx++;
      renderCard(container);
    });
    document.getElementById('fc-skip-btn')?.addEventListener('click', () => {
      deckIdx++;
      renderCard(container);
    });
    document.getElementById('fc-prev-btn')?.addEventListener('click', () => {
      if (deckIdx > 0) { deckIdx--; renderCard(container); }
    });
    document.getElementById('fc-settings-link')?.addEventListener('click', () => {
      renderSettings(container);
    });
  }

  function setBackContent(card) {
    const el = document.getElementById('fc-back-content');
    if (!el) return;
    if (Array.isArray(card.back)) {
      el.innerHTML = `<ul class="fc-back-list">${card.back.map(item =>
        `<li>${item}</li>`).join('')}</ul>`;
    } else {
      el.textContent = card.back;
    }
  }

  function flipCard(card) {
    flipped = true;
    const cardEl = document.getElementById('fc-card');
    const front = cardEl?.querySelector('.fc-card-front');
    const back = cardEl?.querySelector('.fc-card-back');
    const actions = document.getElementById('fc-action-row');
    if (front) front.style.display = 'none';
    if (back) back.style.display = 'flex';
    if (actions) actions.style.display = 'flex';
    if (cardEl) cardEl.style.cursor = 'default';
  }

  // =========== 終了画面 ===========
  function renderFinish(container) {
    const total = stats.know + stats.unknown;
    const acc = total > 0 ? Math.round((stats.know / total) * 100) : 0;
    const emoji = acc >= 80 ? '🎉' : acc >= 60 ? '👍' : '💪';

    container.innerHTML = `
      <div class="card" style="text-align:center;padding:2.5rem 1.5rem">
        <div style="font-size:3rem">${emoji}</div>
        <div class="result-score">${acc}%</div>
        <div class="result-label">${stats.know} / ${total} 枚 知ってた</div>

        ${unknownCards.length > 0 ? `
          <div style="margin:1.5rem 0;padding:1rem;background:#fff7ed;border-radius:8px;font-size:0.9rem;color:var(--warning)">
            「知らなかった」カードが <strong>${unknownCards.length} 枚</strong> あります
          </div>
          <button class="btn btn-primary" id="fc-retry-unknown" style="margin-right:0.5rem;margin-bottom:0.5rem">
            🔁 知らなかった分を復習
          </button>
        ` : ''}
        <button class="btn btn-primary" id="fc-retry-all" style="margin-right:0.5rem;margin-bottom:0.5rem">もう一度</button>
        <button class="btn btn-outline" id="fc-back-settings" style="margin-bottom:0.5rem">⚙ 設定に戻る</button>
      </div>
    `;

    document.getElementById('fc-retry-unknown')?.addEventListener('click', () => {
      deck = unknownCards;
      deckIdx = 0; flipped = false;
      stats = { know: 0, unknown: 0 };
      unknownCards = [];
      renderCard(container);
    });
    document.getElementById('fc-retry-all')?.addEventListener('click', () => startDeck(container));
    document.getElementById('fc-back-settings')?.addEventListener('click', () => renderSettings(container));
  }

  return { render };
})();
