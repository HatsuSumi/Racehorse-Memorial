import { getRandomPreset } from './tooltip-theme.js';

export class TooltipService {
    static HOVER_DELAY = 300;
    static HIDE_DELAY = 100;
    static TOUCH_HOLD_DELAY = 450;
    static TOUCH_AUTO_HIDE_DELAY = 1800;
    static OFFSET_FROM_MOUSE = 12;
    static VIEWPORT_PADDING = 16;
    static BASE_Z_INDEX = 100000; 

    constructor() {
        this.template = null;
        this.tooltipStack = [];
        this.hoverTimer = null;
        this.hideTimer = null;

        // 触屏/笔：点击显示 Tooltip（可关闭、可自动消失）
        this.touchTrigger = null;
        this.touchShowTimer = null;
        this.touchHideTimer = null;
        this._touchShown = false;
    }

    init() {
        this._cacheTemplate();
        this._bindEvents();
    }

    _cacheTemplate() {
        this.template = document.getElementById('tooltip-template');
        if (!this.template) {
            console.error('TooltipService: #tooltip-template not found');
        }
    }

    _bindEvents() {
        // 移动端会把点击“模拟”为 mouseover/mouseout，但通常不会可靠触发 mouseout，
        // 导致 Tooltip 弹出后难以关闭。这里改用 PointerEvent，并且只对 mouse 启用 Tooltip。
        const handleEnter = (event) => {
            if (event && typeof event.pointerType === 'string' && event.pointerType !== 'mouse') return;
            this._handleMouseEnter(event);
        };

        const handleLeave = (event) => {
            if (event && typeof event.pointerType === 'string' && event.pointerType !== 'mouse') return;
            this._handleMouseLeave(event);
        };

        if (window.PointerEvent) {
            document.addEventListener('pointerover', handleEnter, true);
            document.addEventListener('pointerout', handleLeave, true);

            // 触屏/笔：按下时先收起（兜底，避免卡住）
            document.addEventListener('pointerdown', (event) => {
                if (!event || typeof event.pointerType !== 'string') return;
                if (event.pointerType === 'mouse') return;

                // 任何触屏按下：先把现有 Tooltip 收起（相当于“点空白关闭”）
                this._hide();
                this.touchTrigger = null;
                this._touchShown = false;

                if (this.touchShowTimer) {
                    clearTimeout(this.touchShowTimer);
                    this.touchShowTimer = null;
                }
                if (this.touchHideTimer) {
                    clearTimeout(this.touchHideTimer);
                    this.touchHideTimer = null;
                }

                // 触屏 Tooltip 改为“长按显示”，避免普通点击触发后立刻滚动导致一闪而过
                let tooltipTrigger = event.target;
                while (tooltipTrigger && tooltipTrigger !== document) {
                    if (tooltipTrigger.dataset && (tooltipTrigger.dataset.tooltip || tooltipTrigger.dataset.tooltipHtml)) break;
                    tooltipTrigger = tooltipTrigger.parentElement;
                }
                if (!tooltipTrigger || tooltipTrigger === document) return;

                const tooltipText = tooltipTrigger.dataset.tooltip;
                const tooltipHtml = tooltipTrigger.dataset.tooltipHtml;
                const content = tooltipHtml || tooltipText;
                if (!content) return;

                this.touchTrigger = tooltipTrigger;
                this.mouseX = event.clientX;
                this.mouseY = event.clientY;

                this.touchShowTimer = setTimeout(() => {
                    this.touchShowTimer = null;
                    if (!this.touchTrigger || this.touchTrigger !== tooltipTrigger) return;

                    this._touchShown = true;
                    this._show(content, tooltipTrigger);

                    // 自动消失：避免一直挡住屏幕
                    if (this.touchHideTimer) clearTimeout(this.touchHideTimer);
                    this.touchHideTimer = setTimeout(() => {
                        this.touchTrigger = null;
                        this._touchShown = false;
                        this._hide();
                        this.touchHideTimer = null;
                    }, TooltipService.TOUCH_AUTO_HIDE_DELAY);
                }, TooltipService.TOUCH_HOLD_DELAY);
            }, true);

            document.addEventListener('pointerup', (event) => {
                if (!event || typeof event.pointerType !== 'string') return;
                if (event.pointerType === 'mouse') return;

                // 如果只是普通点按（没有达到长按阈值），取消显示
                if (this.touchShowTimer) {
                    clearTimeout(this.touchShowTimer);
                    this.touchShowTimer = null;
                }
            }, true);

            // 滚动时收起（触屏常见场景）
            document.addEventListener('scroll', () => {
                if (this.tooltipStack.length === 0) return;
                this.touchTrigger = null;
                this._hide();
            }, true);
        } else {
            // 兼容极老浏览器：退化为 mouse 事件，但额外用 touchstart 兜底收起
            document.addEventListener('mouseover', this._handleMouseEnter.bind(this), true);
            document.addEventListener('mouseout', this._handleMouseLeave.bind(this), true);
            document.addEventListener('touchstart', () => this._hide(), { capture: true, passive: true });
        }
    }

    _handleMouseEnter(event) {
        let target = event.target;
        let tooltipTrigger = target;
        while (tooltipTrigger && tooltipTrigger !== document) {
            if (tooltipTrigger.dataset && (tooltipTrigger.dataset.tooltip || tooltipTrigger.dataset.tooltipHtml)) {
                break;
            }
            tooltipTrigger = tooltipTrigger.parentElement;
        }
        
        const insideTooltip = this.tooltipStack.some(item => item.element.contains(target));
        
        if (insideTooltip) {
            if (this.hideTimer) {
                clearTimeout(this.hideTimer);
                this.hideTimer = null;
            }
            return;
        }
        
        if (!tooltipTrigger || tooltipTrigger === document) return;
        
        const alreadyShown = this.tooltipStack.some(item => item.trigger === tooltipTrigger);
        if (alreadyShown) {
            if (this.hideTimer) {
                clearTimeout(this.hideTimer);
                this.hideTimer = null;
            }
            return;
        }
        
        if (this.hoverTimer) {
            clearTimeout(this.hoverTimer);
            this.hoverTimer = null;
        }
        if (this.hideTimer) {
            clearTimeout(this.hideTimer);
            this.hideTimer = null;
        }
        
        if (this.tooltipStack.length > 0) {
            const isNested = this.tooltipStack.some(item => item.element.contains(tooltipTrigger));
            if (!isNested) this._hide();
        }
        
        const tooltipText = tooltipTrigger.dataset.tooltip;
        const tooltipHtml = tooltipTrigger.dataset.tooltipHtml;

        this.mouseX = event.clientX;
        this.mouseY = event.clientY;

        this.hoverTimer = setTimeout(() => {
            const content = tooltipHtml || tooltipText;
            this._show(content, tooltipTrigger);
        }, TooltipService.HOVER_DELAY);
    }

    _handleMouseLeave(event) {
        let target = event.target;
        let relatedTarget = event.relatedTarget;
        
        let leavingIndex = -1;
        for (let i = this.tooltipStack.length - 1; i >= 0; i--) {
            const item = this.tooltipStack[i];
            if (item.trigger.contains(target) || item.element.contains(target)) {
                leavingIndex = i;
                break;
            }
        }
        
        if (leavingIndex === -1) {
            if (this.hoverTimer) {
                clearTimeout(this.hoverTimer);
                this.hoverTimer = null;
            }
            return;
        }
        
        const leavingItem = this.tooltipStack[leavingIndex];
        
        if (leavingItem.trigger.contains(target)) {
            if (relatedTarget && leavingItem.trigger.contains(relatedTarget)) return;
            if (relatedTarget && leavingItem.element.contains(relatedTarget)) {
                if (this.hideTimer) {
                    clearTimeout(this.hideTimer);
                    this.hideTimer = null;
                }
                return;
            }
            if (this.hoverTimer) {
                clearTimeout(this.hoverTimer);
                this.hoverTimer = null;
            }
            
            if (this.hideTimer) clearTimeout(this.hideTimer);
            
            this.hideTimer = setTimeout(() => {
                this._hideFrom(leavingIndex);
                this.hideTimer = null;
            }, TooltipService.HIDE_DELAY);
            return;
        }
        
        if (leavingItem.element.contains(target)) {
            if (relatedTarget && leavingItem.trigger.contains(relatedTarget)) {
                if (this.hideTimer) {
                    clearTimeout(this.hideTimer);
                    this.hideTimer = null;
                }
                return;
            }
            if (relatedTarget && leavingItem.element.contains(relatedTarget)) return;
            
            this._hideFrom(leavingIndex);
            return;
        }
    }

    _show(content, trigger) {
        if (!content || !this.template) return;

        const clone = this.template.content.cloneNode(true);
        const container = clone.querySelector('.tooltip-container');
        const contentElement = container.querySelector('.tooltip-content');

        contentElement.textContent = content;

        // 使用拆分出的主题模块获取样式
        const preset = getRandomPreset();
        
        container.style.background = preset.background;
        container.style.color = preset.textColor;
        container.style.zIndex = TooltipService.BASE_Z_INDEX + this.tooltipStack.length;
        container.classList.add(`tooltip-anim-${preset.animation}`);

        document.body.appendChild(container);
        
        const computedStyle = getComputedStyle(container);
        const transitionDuration = computedStyle.transitionDuration;
        const durations = transitionDuration.split(',').map(d => parseFloat(d.trim()));
        const maxDuration = Math.max(...durations) * 1000;
        
        this.tooltipStack.push({
            element: container,
            trigger: trigger,
            animationDuration: maxDuration
        });

        this._positionTooltip(container);

        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                container.classList.add('show');
            });
        });
    }

    _hide() {
        this._hideFrom(0);
    }

    _hideFrom(fromIndex) {
        if (fromIndex >= this.tooltipStack.length) return;
        const itemsToHide = this.tooltipStack.splice(fromIndex);
        
        itemsToHide.forEach(item => {
            const tooltip = item.element;
            tooltip.classList.remove('show');
            setTimeout(() => {
                if (tooltip.parentNode) tooltip.parentNode.removeChild(tooltip);
            }, item.animationDuration);
        });
    }

    _positionTooltip(tooltip) {
        if (!tooltip) return;
        const tooltipRect = tooltip.getBoundingClientRect();
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;
        let left, top;

        if (this.mouseX + TooltipService.OFFSET_FROM_MOUSE + tooltipRect.width + TooltipService.VIEWPORT_PADDING <= viewportWidth) {
            left = this.mouseX + TooltipService.OFFSET_FROM_MOUSE;
            top = this.mouseY - tooltipRect.height / 2;
        } else if (this.mouseX - TooltipService.OFFSET_FROM_MOUSE - tooltipRect.width >= TooltipService.VIEWPORT_PADDING) {
            left = this.mouseX - TooltipService.OFFSET_FROM_MOUSE - tooltipRect.width;
            top = this.mouseY - tooltipRect.height / 2;
        } else if (this.mouseY + TooltipService.OFFSET_FROM_MOUSE + tooltipRect.height + TooltipService.VIEWPORT_PADDING <= viewportHeight) {
            left = this.mouseX - tooltipRect.width / 2;
            top = this.mouseY + TooltipService.OFFSET_FROM_MOUSE;
        } else {
            left = this.mouseX - tooltipRect.width / 2;
            top = this.mouseY - TooltipService.OFFSET_FROM_MOUSE - tooltipRect.height;
        }

        left = Math.max(TooltipService.VIEWPORT_PADDING, Math.min(left, viewportWidth - tooltipRect.width - TooltipService.VIEWPORT_PADDING));
        top = Math.max(TooltipService.VIEWPORT_PADDING, Math.min(top, viewportHeight - tooltipRect.height - TooltipService.VIEWPORT_PADDING));

        tooltip.style.left = `${left}px`;
        tooltip.style.top = `${top}px`;
    }
}
