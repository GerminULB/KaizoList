import { translations } from './translation.js';

let currentLang = localStorage.getItem('lang') || 'en';

/**
 * Translates a key (word) based on the current language
 * @param {string} key - the key from translation.js
 * @param {object} variables - the key-value pairs for replacing {variable} in strings
 */
export function t(key, variables = {}) {
    if (!translations[currentLang]) currentLang = 'en';
    
    let text = translations[currentLang][key] || key;

    Object.keys(variables).forEach(v => {
        text = text.replace(`{${v}}`, variables[v]);
    });

    return text;
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