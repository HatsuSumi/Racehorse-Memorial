export function initQuickNavController({ smoothScrollTo, topBtn, midBtn, botBtn } = {}) {
    if (typeof smoothScrollTo !== 'function') throw new Error('[QuickNavController] smoothScrollTo must be a function');
    if (!topBtn || !midBtn || !botBtn) throw new Error('[QuickNavController] topBtn/midBtn/botBtn are required');

    topBtn.addEventListener('click', () => smoothScrollTo(0));

    midBtn.addEventListener('click', () => {
        const middle = (document.documentElement.scrollHeight - window.innerHeight) / 2;
        smoothScrollTo(middle);
    });

    botBtn.addEventListener('click', () => smoothScrollTo(document.documentElement.scrollHeight));
}
