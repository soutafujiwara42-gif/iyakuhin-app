const QuizPage = (() => {
  let pool = [];
  let current = null;
  let answered = false;
  let stats = { correct: 0, wrong: 0, total: 0 };
  let sessionItems = [];
  let sessionIdx = 0;
  const SESSION_SIZE = 20;

  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  function normalize(s) {
    return s.trim()
      .replace(/\s+/g, '')
      .replace(/[Ａ-Ｚａ-ｚ０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0))
      .toLowerCase();
  }

  async function render(container) {
    container.innerHTML = `<div class="loading"><div class="spinner"></div>データ読み込み中...</div>`;

    const categories = await DataStore.getCategories();
    pool = await DataStore.getAll();

    const catOptions = categories.map(c =>
      `<option value="${c}">${c}</option>`
    ).join('');

    container.innerHTML = `
      <div class="card">
        <div class="quiz-controls">
          <select id="cat-select">${catOptions}</select>
          <button class="btn btn-primary" id="start-btn">▶ 開始</button>
        </div>
        <div id="quiz-body"></div>
      </div>
    `;

    document.getElementById('cat-select').addEventListener('change', resetSession);
    document.getElementById('start-btn').addEventListener('click', startSession);

    renderIdle();
  }

  function renderIdle() {
    const body = document.getElementById('quiz-body');
    if (!body) return;
    body.innerHTML = `
      <div style="text-align:center;padding:2rem;color:var(--text-muted)">
        <div style="font-size:3rem;margin-bottom:0.5rem">💊</div>
        <div>カテゴリを選んで「開始」を押してください</div>
        <div style="font-size:0.85rem;margin-top:0.5rem">商品名から一般名を答えるクイズです</div>
      </div>
    `;
  }

  async function resetSession() {
    const cat = document.getElementById('cat-select')?.value;
    pool = await DataStore.getByCategory(cat);
    renderIdle();
  }

  async function startSession() {
    const cat = document.getElementById('cat-select')?.value;
    pool = await DataStore.getByCategory(cat);
    stats = { correct: 0, wrong: 0, total: 0 };
    sessionItems = shuffle([...pool]).slice(0, Math.min(SESSION_SIZE, pool.length));
    sessionIdx = 0;
    answered = false;
    nextQuestion();
  }

  function nextQuestion() {
    if (sessionIdx >= sessionItems.length) {
      renderResult();
      return;
    }
    current = sessionItems[sessionIdx];
    answered = false;
    // pick one brand name randomly
    const brand = current.b[Math.floor(Math.random() * current.b.length)];
    current._shownBrand = brand;
    renderQuestion();
  }

  function renderQuestion() {
    const body = document.getElementById('quiz-body');
    if (!body) return;
    const pct = Math.round((sessionIdx / sessionItems.length) * 100);

    body.innerHTML = `
      <div class="progress-wrap">
        <div class="progress-bar"><div class="progress-fill" style="width:${pct}%"></div></div>
        <div class="progress-text">${sessionIdx + 1} / ${sessionItems.length} 問</div>
      </div>

      <div class="score-bar">
        <span class="score-badge badge-correct">✓ ${stats.correct}</span>
        <span class="score-badge badge-wrong">✗ ${stats.wrong}</span>
        <span class="score-badge badge-total">計 ${stats.total}</span>
      </div>

      <div class="question-label">この商品名の一般名は？</div>
      <div class="brand-name">${current._shownBrand}</div>
      ${current.b.length > 1 ? `<div class="brand-sub">（同一薬 ${current.b.length} 品目）</div>` : ''}
      <div class="category-tag">${current.c || '分類なし'}</div>

      <div class="answer-row">
        <input type="text" class="answer-input" id="answer-input" placeholder="一般名を入力..." autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false">
        <button class="btn btn-primary" id="check-btn">答え合わせ</button>
      </div>
      <div class="feedback" id="feedback"></div>

      <div class="quiz-actions">
        <button class="btn btn-outline" id="skip-btn">スキップ →</button>
        <button class="btn btn-outline" id="hint-btn">ヒント 💡</button>
      </div>
    `;

    const input = document.getElementById('answer-input');
    input.focus();
    input.addEventListener('keydown', e => { if (e.key === 'Enter') checkAnswer(); });
    document.getElementById('check-btn').addEventListener('click', checkAnswer);
    document.getElementById('skip-btn').addEventListener('click', skip);
    document.getElementById('hint-btn').addEventListener('click', showHint);
  }

  function checkAnswer() {
    if (answered) { advanceQuestion(); return; }
    const input = document.getElementById('answer-input');
    const fb = document.getElementById('feedback');
    if (!input || !fb) return;

    const userAns = normalize(input.value);
    const correct = normalize(current.g);
    if (!userAns) return;

    answered = true;
    stats.total++;

    const allBrands = current.b.join('、');

    if (userAns === correct) {
      stats.correct++;
      input.classList.add('correct');
      fb.className = 'feedback show correct';
      fb.innerHTML = `✅ 正解！ <span class="correct-answer">${current.g}</span>
        <div class="all-brands">同一成分の商品名: ${allBrands}</div>`;
    } else {
      stats.wrong++;
      input.classList.add('wrong');
      fb.className = 'feedback show wrong';
      fb.innerHTML = `❌ 不正解。正解は…<br><span class="correct-answer">${current.g}</span>
        <div class="all-brands">同一成分の商品名: ${allBrands}</div>`;
    }

    document.getElementById('check-btn').textContent = '次の問題 →';
    document.getElementById('skip-btn').style.display = 'none';
  }

  function skip() {
    stats.total++;
    stats.wrong++;
    sessionIdx++;
    nextQuestion();
  }

  function advanceQuestion() {
    sessionIdx++;
    nextQuestion();
  }

  function showHint() {
    const g = current.g;
    const hintLen = Math.ceil(g.length / 3);
    const hint = g.slice(0, hintLen) + '…（' + g.length + '文字）';
    const btn = document.getElementById('hint-btn');
    if (btn) btn.textContent = `💡 ${hint}`;
  }

  function renderResult() {
    const body = document.getElementById('quiz-body');
    if (!body) return;
    const acc = stats.total > 0 ? Math.round((stats.correct / stats.total) * 100) : 0;
    const emoji = acc >= 80 ? '🎉' : acc >= 60 ? '👍' : '💪';
    body.innerHTML = `
      <div class="result-screen">
        <div style="font-size:3rem">${emoji}</div>
        <div class="result-score">${acc}%</div>
        <div class="result-label">${stats.correct} / ${stats.total} 正解</div>
        <button class="btn btn-primary" id="retry-btn" style="margin-right:0.5rem">もう一度</button>
        <button class="btn btn-outline" id="change-cat-btn">カテゴリ変更</button>
      </div>
    `;
    document.getElementById('retry-btn').addEventListener('click', startSession);
    document.getElementById('change-cat-btn').addEventListener('click', renderIdle);
  }

  return { render };
})();
