const themeToggle = document.getElementById('theme-toggle');
const htmlEl = document.documentElement;

// Перевірка системної теми
const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
if (prefersDark) {
  htmlEl.setAttribute('data-theme', 'dark');
}

themeToggle.addEventListener('click', () => {
  const currentTheme = htmlEl.getAttribute('data-theme');
  htmlEl.setAttribute('data-theme', currentTheme === 'light' ? 'dark' : 'light');
});
