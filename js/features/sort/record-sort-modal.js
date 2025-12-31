export function createRecordSortModal({
    getCurrentData,
    getCurrentYear,
    onSelected
} = {}) {
    if (typeof getCurrentData !== 'function') throw new Error('[RecordSortModal] getCurrentData must be a function');
    if (typeof getCurrentYear !== 'function') throw new Error('[RecordSortModal] getCurrentYear must be a function');
    if (typeof onSelected !== 'function') throw new Error('[RecordSortModal] onSelected must be a function');

    let bound = false;

    function ensureModal() {
        let modal = document.getElementById('record-sort-modal');
        if (modal) return modal;

        const tpl = document.getElementById('record-sort-modal-template');
        if (!tpl) throw new Error('[RecordSortModal] #record-sort-modal-template not found');

        const frag = tpl.content.cloneNode(true);
        document.body.appendChild(frag);

        modal = document.getElementById('record-sort-modal');
        if (!modal) throw new Error('[RecordSortModal] clone failed: #record-sort-modal not found');

        // 关闭：点遮罩或点关闭按钮
        modal.addEventListener('click', (e) => {
            const closeBtn = e.target && e.target.closest ? e.target.closest('[data-action="close"]') : null;
            if (closeBtn) {
                close();
                return;
            }
            if (e.target === modal) {
                close();
            }
        });

        // Esc 关闭
        document.addEventListener('keydown', (e) => {
            if (e.key !== 'Escape') return;
            const m = document.getElementById('record-sort-modal');
            if (m && m.style.display === 'block') close();
        });

        return modal;
    }

    function open() {
        const modal = ensureModal();

        const optionsRoot = modal.querySelector('#record-sort-options');
        if (!optionsRoot) throw new Error('[RecordSortModal] #record-sort-options not found');

        const optionTpl = document.getElementById('record-sort-option-template');
        if (!optionTpl) throw new Error('[RecordSortModal] #record-sort-option-template not found');

        optionsRoot.replaceChildren();

        const items = [
            { metric: 'winRate', label: '胜率' },
            { metric: 'starts', label: '总场' },
            { metric: 'win', label: '1着次数' },
            { metric: 'second', label: '2着次数' },
            { metric: 'third', label: '3着次数' },
            { metric: 'placeRate', label: '连对率' },
            { metric: 'showRate', label: '三甲率' },
            { metric: 'unplaced', label: '未上名次数' }
        ];

        // 使用模板克隆生成选项
        items.forEach(item => {
            ['asc', 'desc'].forEach(direction => {
                const btn = optionTpl.content.firstElementChild.cloneNode(true);
                btn.dataset.metric = item.metric;
                btn.dataset.direction = direction;
                btn.textContent = `${item.label}（${direction === 'asc' ? '升序' : '降序'}）`;
                optionsRoot.appendChild(btn);
            });
        });

        if (!bound) {
            bound = true;
            modal.addEventListener('click', (e) => {
                const btn = e.target && e.target.closest ? e.target.closest('.sort-option-btn') : null;
                if (!btn) return;

                const metric = btn.dataset.metric;
                const direction = btn.dataset.direction;
                if (!metric || !direction) return;

                if (!getCurrentData()) return;

                onSelected({
                    year: getCurrentYear(),
                    metric,
                    direction
                });

                close();
            });
        }

        modal.classList.remove('closing');
        modal.style.display = 'block';
    }

    function close() {
        const modal = document.getElementById('record-sort-modal');
        if (!modal) return;

        const cleanup = () => {
            modal.style.display = 'none';
            modal.classList.remove('closing');
        };

        modal.classList.add('closing');
        const style = window.getComputedStyle(modal);
        if (style.animationName === 'none' || style.display === 'none') {
            cleanup();
        } else {
            modal.addEventListener('animationend', cleanup, { once: true });
        }
    }

    return { open, close };
}
