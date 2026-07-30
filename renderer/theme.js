/* ── Theme ────────────────────────────────────────────────── */
const html = document.documentElement;
const themeToggle = document.getElementById('themeToggle');
const iconMoon = themeToggle.querySelector('.icon-moon');
const iconSun  = themeToggle.querySelector('.icon-sun');

function setTheme(theme) {
  html.setAttribute('data-theme', theme);
  localStorage.setItem('theme', theme);
  if (theme === 'dark') {
    iconMoon.style.display = '';
    iconSun.style.display  = 'none';
  } else {
    iconMoon.style.display = 'none';
    iconSun.style.display  = '';
  }
}
setTheme(localStorage.getItem('theme') || 'dark');
themeToggle.addEventListener('click', () =>
  setTheme(html.getAttribute('data-theme') === 'dark' ? 'light' : 'dark')
);
