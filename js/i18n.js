import { translations } from './translation.js';
import './sprites.js';

let currentLang = localStorage.getItem('lang') || 'en';

/**
 * Translates a key (word) based on the current language
 * @param {string} key - the key from translation.js
 * @param {object} variables - the key-value pairs for replacing {variable} in strings
 */
export function t(key, variables = {}) {
    if (!translations[currentLang]) currentLang = 'en';
    
    // falls back to English, then to the key itself, so a missing translation never shows a raw key
    let text = translations[currentLang][key] || translations.en?.[key] || key;

    Object.keys(variables).forEach(v => {
        text = text.replace(`{${v}}`, variables[v]);
    });

    return text;
}

// Plural-aware t(): uses "<key>_one" when count is 1 (if the current language defines it),
// otherwise the normal key. Languages without a "_one" key just keep using the base key.
export function tn(key, count, variables = {}) {
    if (!translations[currentLang]) currentLang = 'en';
    const useOne = Number(count) === 1 && translations[currentLang][key + '_one'];
    return t(useOne ? key + '_one' : key, { count, ...variables });
}

export function applyTranslations() {
    const elements = document.querySelectorAll('[data-i18n]');
    elements.forEach(el => {
        const key = el.getAttribute('data-i18n');
        const translation = t(key);
        
        if (translation.includes('<')) {
            el.innerHTML = translation;
        } else {
            el.innerText = translation;
        }
    });
    
    // placeholders
    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
        const key = el.getAttribute('data-i18n-placeholder');
        el.placeholder = t(key);
    });
}

window.setLanguage = (lang) => {
    if (translations[lang]) {
        localStorage.setItem('lang', lang);
        window.location.reload();
    }
};

// --- Dark Mode System ---
window.toggleDarkMode = () => {
    const isDark = document.body.classList.toggle('dark-mode');
    localStorage.setItem('kaizo_theme', isDark ? 'dark' : 'light');
    updateThemeIcon(isDark);
};

function updateThemeIcon(isDark) {
    const icon = document.getElementById('theme-icon');
}

document.addEventListener('DOMContentLoaded', () => {
    const savedTheme = localStorage.getItem('kaizo_theme');
    const isDark = savedTheme === 'dark';
    
    if (isDark) {
        document.body.classList.add('dark-mode');
    }
    updateThemeIcon(isDark);
});


document.addEventListener('DOMContentLoaded', applyTranslations);

document.addEventListener('DOMContentLoaded', () => {
    if (document.getElementById('compare-btn')) return;
    if (location.pathname.toLowerCase().includes('/playercompare')) return; // already there

    const a = document.createElement('a');
    a.id = 'compare-btn';
    a.className = 'hub-button';
    a.href = '/PlayerCompare/';
    a.textContent = t('nav_player_compare');

    // same random pattern the other .hub-button elements get (see applyRandomPattern in utils.js)
    const idx = Math.floor(Math.random() * 13);
    Object.assign(a.style, {
        backgroundImage: `url('/images/pattern/pattern${idx}.png')`,
        backgroundRepeat: 'repeat',
        backgroundSize: '32px 32px',
        color: '#ffffff',
        border: '2px solid black',
        imageRendering: 'pixelated',
        textShadow: '1px 1px 0 #000',
    });

    document.body.appendChild(a);
});
