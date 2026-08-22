/* ── Theme & Appearance Subsystem ────────────────────────────── */
const html = document.documentElement;
const themeToggle = document.getElementById('themeToggle');
const iconMoon = themeToggle ? themeToggle.querySelector('.icon-moon') : null;
const iconSun  = themeToggle ? themeToggle.querySelector('.icon-sun') : null;

const THEMES = [
  // ── Dark Themes (13 Chromatically Distinct Themes) ────────────
  { id: 'dark',             name: 'Nyx Dark',           desc: 'Signature deep obsidian with vibrant indigo accent',       mode: 'dark',  bg: '#0f0f13', surface: '#17171d', accent: '#6c63ff', text: '#e8e8f0' },
  { id: 'oled',             name: 'OLED Obsidian',      desc: 'True pitch black with electric cyan highlights',          mode: 'dark',  bg: '#000000', surface: '#0a0a0d', accent: '#00e5ff', text: '#ffffff' },
  { id: 'nord',             name: 'Nord Arctic',        desc: 'Calm Arctic polar night with frost cyan accents',         mode: 'dark',  bg: '#242933', surface: '#2e3440', accent: '#88c0d0', text: '#eceff4' },
  { id: 'abyss-navy',       name: 'Oceanic Abyss',      desc: 'Deep maritime navy trench with electric azure blue',       mode: 'dark',  bg: '#040d18', surface: '#081627', accent: '#0ea5e9', text: '#e0f2fe' },
  { id: 'tokyonight',       name: 'Tokyo Night',        desc: 'Tokyo storm twilight with lavender blue accents',         mode: 'dark',  bg: '#16161e', surface: '#1a1b26', accent: '#7aa2f7', text: '#c0caf5' },
  { id: 'dracula',          name: 'Dracula Gothic',     desc: 'Classic vampire purple & emerald green palette',          mode: 'dark',  bg: '#1e1f29', surface: '#282a36', accent: '#bd93f9', text: '#f8f8f2' },
  { id: 'catppuccin',       name: 'Catppuccin Mocha',   desc: 'Warm soothing dark palette with mauve & lavender',        mode: 'dark',  bg: '#181825', surface: '#1e1e2e', accent: '#cba6f7', text: '#cdd6f4' },
  { id: 'cyberpunk',        name: 'Cyberpunk Neon',     desc: 'High-tech midnight with hot magenta & neon mint',         mode: 'dark',  bg: '#0d0b18', surface: '#161228', accent: '#ff007f', text: '#f5f0ff' },
  { id: 'crimson-night',    name: 'Crimson Abyss',      desc: 'Deep velvet burgundy & dark cherry with ruby rose flame', mode: 'dark',  bg: '#12070a', surface: '#1c0d12', accent: '#f43f5e', text: '#ffe4e8' },
  { id: 'espresso-dark',    name: 'Amber Espresso',     desc: 'Toasted mahogany roast with glowing copper gold accents', mode: 'dark',  bg: '#120a05', surface: '#1a0f08', accent: '#f59e0b', text: '#fef3c7' },
  { id: 'solarized',        name: 'Solarized Dark',     desc: 'Precision cyan-teal Lab color space palette',            mode: 'dark',  bg: '#00212b', surface: '#002b36', accent: '#2aa198', text: '#93a1a1' },
  { id: 'moss-dark',        name: 'Moss Forest',        desc: 'Deep olive woodland canopy with glowing chartreuse lime',  mode: 'dark',  bg: '#0b1207', surface: '#131d0d', accent: '#84cc16', text: '#ecfccb' },
  { id: 'emerald',          name: 'Matrix Emerald',     desc: 'Deep terminal graphite with luminous mint green',         mode: 'dark',  bg: '#08100c', surface: '#0e1a14', accent: '#10b981', text: '#e2f6ec' },

  // ── Light Themes (Pastels Organized by Spectrum) ─────────────
  { id: 'light',            name: 'Nyx Light',          desc: 'Minimalist cool slate porcelain with bold indigo accents', mode: 'light', bg: '#edf0f7', surface: '#f8fafd', accent: '#584cf4', text: '#16192e' },
  { id: 'nord-light',       name: 'Nord Snow Storm',    desc: 'Pastel glacial ice blue with royal arctic cobalt',        mode: 'light', bg: '#d5e0ee', surface: '#e2ecf7', accent: '#2b6cb0', text: '#102235' },
  { id: 'tokyonight-day',   name: 'Tokyo Day',          desc: 'Pastel periwinkle twilight with electric cobalt blue',    mode: 'light', bg: '#ccd5f0', surface: '#dbe3fa', accent: '#1c52b8', text: '#0f1e42' },
  { id: 'catppuccin-latte', name: 'Catppuccin Latte',   desc: 'Pastel lavender mauve with soothing creamy undertones',   mode: 'light', bg: '#dbd4ec', surface: '#e7e1f5', accent: '#7e38db', text: '#221838' },
  { id: 'rose-pine-dawn',   name: 'Rosé Pine Dawn',     desc: 'Pastel blush rosé petal with deep berry highlights',      mode: 'light', bg: '#edd3cb', surface: '#f6e2dc', accent: '#b03859', text: '#331822' },
  { id: 'solarized-light',  name: 'Solarized Light',    desc: 'Pastel sunlit papyrus sand with deep oceanic teal',       mode: 'light', bg: '#eadebe', surface: '#f4ebd2', accent: '#00628f', text: '#243338' },
  { id: 'paper-sepia',      name: 'Vintage Manuscript', desc: 'Pastel toasted book parchment with rich roasted espresso',mode: 'light', bg: '#e2d2b8', surface: '#ede1cb', accent: '#8a3814', text: '#26160a' },
  { id: 'matcha-light',     name: 'Matcha Zen',         desc: 'Pastel sage mint green tea with rich forest emerald',     mode: 'light', bg: '#c8e4d2', surface: '#d8eedf', accent: '#157338', text: '#0a2616' }
];

let lastDarkTheme  = localStorage.getItem('lastDarkTheme')  || 'dark';
let lastLightTheme = localStorage.getItem('lastLightTheme') || 'light';
let rgbPartyInterval = null;

function stopRgbParty() {
  if (rgbPartyInterval) {
    clearInterval(rgbPartyInterval);
    rgbPartyInterval = null;
  }
}

function startRgbParty() {
  stopRgbParty();
  const darkThemes = THEMES.filter(t => t.mode === 'dark');
  if (!darkThemes.length) return;

  let curId = html.getAttribute('data-theme');
  let idx = darkThemes.findIndex(t => t.id === curId);
  if (idx === -1) idx = 0;

  rgbPartyInterval = setInterval(() => {
    idx = (idx + 1) % darkThemes.length;
    const t = darkThemes[idx];
    html.setAttribute('data-theme', t.id);

    // Update active highlight in real-time
    document.querySelectorAll('.theme-card').forEach(card => {
      card.classList.toggle('active', card.dataset.theme === t.id);
    });

    if (iconMoon && iconSun) {
      iconMoon.style.display = '';
      iconSun.style.display  = 'none';
    }
  }, 220);
}

function getThemeObj(themeId) {
  return THEMES.find(t => t.id === themeId) || THEMES[0];
}

function applyTheme(themeId) {
  // Disables RGB cycling whenever any specific theme is selected
  stopRgbParty();

  const themeObj = getThemeObj(themeId);
  const finalId = themeObj.id;
  
  html.setAttribute('data-theme', finalId);
  localStorage.setItem('theme', finalId);

  if (themeObj.mode === 'light') {
    lastLightTheme = finalId;
    localStorage.setItem('lastLightTheme', finalId);
  } else {
    lastDarkTheme = finalId;
    localStorage.setItem('lastDarkTheme', finalId);
  }

  if (iconMoon && iconSun) {
    if (themeObj.mode === 'light') {
      iconMoon.style.display = 'none';
      iconSun.style.display  = '';
    } else {
      iconMoon.style.display = '';
      iconSun.style.display  = 'none';
    }
  }

  // Update active state in Appearance tab cards
  document.querySelectorAll('.theme-card').forEach(card => {
    card.classList.toggle('active', card.dataset.theme === finalId);
  });
}

function renderThemeGrid() {
  const darkContainer  = document.getElementById('theme-grid-dark');
  const lightContainer = document.getElementById('theme-grid-light');
  const allContainer   = document.getElementById('theme-grid-container');
  const current = localStorage.getItem('theme') || 'dark';

  const makeCardHtml = (t) => `
    <div class="theme-card ${t.id === current ? 'active' : ''}" data-theme="${t.id}">
      <div class="theme-card-header">
        <span class="theme-card-name">${t.name}</span>
        <span class="theme-card-badge">Active</span>
      </div>
      <div class="theme-card-desc">${t.desc}</div>
      <div class="theme-swatches">
        <div class="theme-swatch" style="background: ${t.bg}" title="Background"></div>
        <div class="theme-swatch" style="background: ${t.surface}" title="Surface"></div>
        <div class="theme-swatch" style="background: ${t.accent}" title="Accent"></div>
        <div class="theme-swatch" style="background: ${t.text}" title="Text"></div>
      </div>
    </div>
  `;

  if (darkContainer && lightContainer) {
    const darkCards = THEMES.filter(t => t.mode === 'dark').map(makeCardHtml).join('');
    // Invisible easter egg slot next to Matrix Emerald
    const easterEggSlot = `<div class="theme-card-easter-egg" id="easterEggDarkSlot" title=""></div>`;
    darkContainer.innerHTML  = darkCards + easterEggSlot;
    lightContainer.innerHTML = THEMES.filter(t => t.mode === 'light').map(makeCardHtml).join('');
  } else if (allContainer) {
    allContainer.innerHTML = THEMES.map(makeCardHtml).join('');
  }

  document.querySelectorAll('.theme-card').forEach(card => {
    card.addEventListener('click', () => {
      applyTheme(card.dataset.theme);
    });
  });

  // Wire Easter Egg click listener on the invisible slot
  const eggSlot = document.getElementById('easterEggDarkSlot');
  if (eggSlot) {
    let clickCount = 0;
    let resetTimer = null;

    eggSlot.addEventListener('click', (e) => {
      e.stopPropagation();
      clickCount++;
      clearTimeout(resetTimer);
      resetTimer = setTimeout(() => {
        clickCount = 0;
      }, 3500);

      if (clickCount >= 10) {
        clickCount = 0;
        clearTimeout(resetTimer);
        startRgbParty();
      }
    });
  }
}

// Initial theme load
applyTheme(localStorage.getItem('theme') || 'dark');

if (themeToggle) {
  // Left-click: toggle between active dark theme and active light theme
  themeToggle.addEventListener('click', () => {
    stopRgbParty();
    const curId = html.getAttribute('data-theme');
    const curTheme = getThemeObj(curId);
    if (curTheme.mode === 'light') {
      applyTheme(lastDarkTheme || 'dark');
    } else {
      applyTheme(lastLightTheme || 'light');
    }
  });

  // Right-click: open Appearance tab
  themeToggle.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    const appNavBtn = document.querySelector('.nav-item[data-tab="appearance"]');
    if (appNavBtn) {
      appNavBtn.click();
    }
  });

  themeToggle.title = 'Left-click: Toggle dark/light · Right-click: Appearance & Themes';
}

document.addEventListener('DOMContentLoaded', () => {
  renderThemeGrid();
});

window.setTheme = applyTheme;
window.getThemes = () => THEMES;
window.startRgbParty = startRgbParty;
window.stopRgbParty = stopRgbParty;
