import { getTheme, setTheme } from '../shared/storage.js';

export function initThemeController({ updateThemeUI, themeToggleEl } = {}) {
    if (typeof updateThemeUI !== 'function') {
        throw new Error('[ThemeController] updateThemeUI must be a function');
    }
    if (!themeToggleEl) {
        throw new Error('[ThemeController] themeToggleEl is required');
    }

    let currentTheme = getTheme() || 'light';

    const apply = () => {
        document.documentElement.setAttribute('data-theme', currentTheme);
        updateThemeUI(currentTheme);
    };

    apply();

    themeToggleEl.addEventListener('click', () => {
        currentTheme = currentTheme === 'light' ? 'dark' : 'light';
        setTheme(currentTheme);
        apply();
    });

    return {
        getTheme: () => currentTheme
    };
}
