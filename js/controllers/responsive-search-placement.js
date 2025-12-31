export function initResponsiveSearchPlacementController({ breakpoint = '(max-width: 768px)' } = {}) {
    const searchContainer = document.getElementById('search-container');
    const mobileHost = document.getElementById('mobile-search-host');
    const yearNav = document.getElementById('year-nav');

    if (!searchContainer) throw new Error('[ResponsiveSearchPlacement] #search-container not found');
    if (!mobileHost) throw new Error('[ResponsiveSearchPlacement] #mobile-search-host not found');
    if (!yearNav) throw new Error('[ResponsiveSearchPlacement] #year-nav not found');

    const mq = window.matchMedia(breakpoint);

    const applyPlacement = () => {
        const isMobile = mq.matches;
        if (isMobile) {
            if (searchContainer.parentElement !== mobileHost) {
                mobileHost.appendChild(searchContainer);
            }
            searchContainer.classList.add('is-in-main');
        } else {
            yearNav.after(searchContainer);
            searchContainer.classList.remove('is-in-main');
        }
    };

    applyPlacement();

    if (typeof mq.addEventListener === 'function') {
        mq.addEventListener('change', applyPlacement);
    } else if (typeof mq.addListener === 'function') {
        mq.addListener(applyPlacement);
    }

    return { applyPlacement };
}
