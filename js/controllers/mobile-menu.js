export function initMobileMenuController({ sidebarEl, overlayEl, menuToggleEl } = {}) {
    if (!sidebarEl) throw new Error('[MobileMenuController] sidebarEl is required');
    if (!overlayEl) throw new Error('[MobileMenuController] overlayEl is required');
    if (!menuToggleEl) throw new Error('[MobileMenuController] menuToggleEl is required');

    const toggleMenu = () => {
        sidebarEl.classList.toggle('active');
        overlayEl.classList.toggle('active');
    };

    menuToggleEl.addEventListener('click', toggleMenu);
    overlayEl.addEventListener('click', toggleMenu);

    return { toggleMenu };
}
