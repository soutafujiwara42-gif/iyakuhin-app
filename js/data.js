// Data loader — fetches medicines.json and caches it
const DataStore = (() => {
  let _data = null;
  let _categories = null;

  async function load() {
    if (_data) return _data;
    const res = await fetch('data/medicines.json');
    _data = await res.json();
    return _data;
  }

  async function getAll() {
    return load();
  }

  async function getCategories() {
    if (_categories) return _categories;
    const data = await load();
    const set = new Set(data.map(d => d.c).filter(Boolean));
    _categories = ['すべて', ...Array.from(set).sort()];
    return _categories;
  }

  async function getByCategory(cat) {
    const data = await load();
    if (!cat || cat === 'すべて') return data;
    return data.filter(d => d.c === cat);
  }

  return { getAll, getCategories, getByCategory };
})();
