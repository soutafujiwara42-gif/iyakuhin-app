const App = (() => {
  const pages = { quiz: QuizPage, search: SearchPage };
  let currentPage = 'quiz';

  function navigate(page) {
    currentPage = page;
    document.querySelectorAll('.nav-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.page === page);
    });
    const container = document.getElementById('app');
    pages[page].render(container);
  }

  function init() {
    document.querySelectorAll('.nav-btn').forEach(btn => {
      btn.addEventListener('click', () => navigate(btn.dataset.page));
    });
    navigate('quiz');
  }

  return { init };
})();

document.addEventListener('DOMContentLoaded', App.init);
