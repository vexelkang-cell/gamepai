const searchInput = document.getElementById('gameSearch');
const cards = [...document.querySelectorAll('.game-card')];
const emptyState = document.getElementById('emptyState');
const categoryButtons = [...document.querySelectorAll('.category')];
let selectedCategory = 'Semua';

function filterGames() {
  const query = (searchInput.value || '').toLowerCase().trim();
  let visible = 0;
  cards.forEach(card => {
    const title = card.dataset.title.toLowerCase();
    const category = card.dataset.category;
    const matches = title.includes(query) && (selectedCategory === 'Semua' || category === selectedCategory);
    card.hidden = !matches;
    if (matches) visible++;
  });
  emptyState.hidden = visible !== 0;
}
searchInput.addEventListener('input', filterGames);
categoryButtons.forEach(button => button.addEventListener('click', () => {
  categoryButtons.forEach(item => item.classList.remove('active'));
  button.classList.add('active');
  selectedCategory = button.dataset.category;
  filterGames();
}));
document.getElementById('searchFocus').addEventListener('click', () => {
  document.getElementById('games').scrollIntoView({behavior:'smooth'});
  searchInput.focus({preventScroll:true});
});
document.getElementById('menuToggle').addEventListener('click', () => {
  document.querySelector('.main-nav').classList.toggle('open');
});
document.querySelectorAll('.main-nav a').forEach(link => link.addEventListener('click', () => {
  document.querySelector('.main-nav').classList.remove('open');
}));
document.addEventListener('keydown', event => {
  if (event.key === '/' && !['INPUT','TEXTAREA'].includes(document.activeElement.tagName)) {
    event.preventDefault();
    document.getElementById('games').scrollIntoView({behavior:'smooth'});
    searchInput.focus({preventScroll:true});
  }
});
document.getElementById('year').textContent = new Date().getFullYear();
