// ==========================================
// ROOM8 UI COMPONENTS
// Toast Notifications, Skeleton Loading, Animations
// ==========================================

(function() {
    'use strict';

    // ==========================================
    // 1. TOAST NOTIFICATIONS (ersetzt alert())
    // ==========================================

    var toastContainer = null;

    function createToastContainer() {
        if (toastContainer) return toastContainer;

        toastContainer = document.createElement('div');
        toastContainer.id = 'room8-toast-container';
        toastContainer.style.cssText = `
            position: fixed;
            top: calc(20px + env(safe-area-inset-top, 0px));
            left: 50%;
            transform: translateX(-50%);
            z-index: 99999;
            display: flex;
            flex-direction: column;
            gap: 10px;
            width: 90%;
            max-width: 400px;
            pointer-events: none;
        `;
        document.body.appendChild(toastContainer);
        return toastContainer;
    }

    function showToast(message, type, duration) {
        type = type || 'info';
        duration = duration || 3000;

        var container = createToastContainer();

        var toast = document.createElement('div');
        toast.className = 'room8-toast room8-toast-' + type;

        var icons = {
            success: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M20 6L9 17l-5-5"/></svg>',
            error: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>',
            warning: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
            info: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>'
        };

        var colors = {
            success: { bg: '#ECFDF5', border: '#10B981', text: '#065F46', icon: '#10B981' },
            error: { bg: '#FEF2F2', border: '#EF4444', text: '#991B1B', icon: '#EF4444' },
            warning: { bg: '#FFFBEB', border: '#F59E0B', text: '#92400E', icon: '#F59E0B' },
            info: { bg: '#EFF6FF', border: '#3B82F6', text: '#1E40AF', icon: '#3B82F6' }
        };

        var color = colors[type] || colors.info;

        toast.style.cssText = `
            display: flex;
            align-items: center;
            gap: 12px;
            padding: 14px 18px;
            background: ${color.bg};
            border: 1px solid ${color.border};
            border-radius: 12px;
            box-shadow: 0 4px 20px rgba(0,0,0,0.15);
            color: ${color.text};
            font-size: 0.9rem;
            font-weight: 500;
            pointer-events: auto;
            animation: toastSlideIn 0.3s ease;
            backdrop-filter: blur(10px);
            -webkit-backdrop-filter: blur(10px);
        `;

        toast.innerHTML = '<span style="color: ' + color.icon + '; flex-shrink: 0;">' + (icons[type] || icons.info) + '</span><span style="flex: 1;">' + escapeHtml(message) + '</span>';

        container.appendChild(toast);

        // Auto-remove
        setTimeout(function() {
            toast.style.animation = 'toastSlideOut 0.3s ease forwards';
            setTimeout(function() {
                if (toast.parentNode) toast.parentNode.removeChild(toast);
            }, 300);
        }, duration);

        return toast;
    }

    function escapeHtml(text) {
        if (!text) return '';
        var div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // Inject Toast CSS
    function injectToastStyles() {
        if (document.getElementById('room8-toast-styles')) return;

        var style = document.createElement('style');
        style.id = 'room8-toast-styles';
        style.textContent = `
            @keyframes toastSlideIn {
                from { opacity: 0; transform: translateY(-20px); }
                to { opacity: 1; transform: translateY(0); }
            }
            @keyframes toastSlideOut {
                from { opacity: 1; transform: translateY(0); }
                to { opacity: 0; transform: translateY(-20px); }
            }

            /* Skeleton Loading */
            .skeleton {
                background: linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%);
                background-size: 200% 100%;
                animation: skeletonShimmer 1.5s infinite;
                border-radius: 8px;
            }
            @keyframes skeletonShimmer {
                0% { background-position: 200% 0; }
                100% { background-position: -200% 0; }
            }
            .skeleton-text { height: 14px; margin-bottom: 8px; }
            .skeleton-text.short { width: 60%; }
            .skeleton-title { height: 20px; width: 80%; margin-bottom: 12px; }
            .skeleton-avatar { width: 50px; height: 50px; border-radius: 50%; }
            .skeleton-image { width: 100%; padding-top: 75%; }
            .skeleton-card {
                background: white;
                border-radius: 16px;
                padding: 16px;
                box-shadow: 0 2px 8px rgba(0,0,0,0.05);
            }

            /* Favorite Heart Animation */
            @keyframes heartPop {
                0% { transform: scale(1); }
                25% { transform: scale(1.3); }
                50% { transform: scale(0.95); }
                75% { transform: scale(1.1); }
                100% { transform: scale(1); }
            }
            .favorite-btn.animating svg {
                animation: heartPop 0.4s ease;
            }
            .favorite-btn.favorited svg {
                fill: #EF4444 !important;
                stroke: #EF4444 !important;
            }

            /* Empty State Improvements */
            .empty-state-modern {
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                padding: 3rem 1.5rem;
                text-align: center;
            }
            .empty-state-modern .empty-icon {
                width: 120px;
                height: 120px;
                margin-bottom: 1.5rem;
                opacity: 0.6;
            }
            .empty-state-modern h3 {
                font-size: 1.2rem;
                font-weight: 700;
                color: #374151;
                margin-bottom: 0.5rem;
            }
            .empty-state-modern p {
                font-size: 0.9rem;
                color: #6B7280;
                margin-bottom: 1.5rem;
                max-width: 280px;
            }
            .empty-state-modern .empty-action {
                padding: 0.75rem 1.5rem;
                background: linear-gradient(135deg, #6366f1, #4f46e5);
                color: white;
                border: none;
                border-radius: 12px;
                font-weight: 600;
                font-size: 0.9rem;
                cursor: pointer;
                text-decoration: none;
                display: inline-flex;
                align-items: center;
                gap: 8px;
                transition: transform 0.2s, box-shadow 0.2s;
            }
            .empty-state-modern .empty-action:hover {
                transform: translateY(-2px);
                box-shadow: 0 4px 15px rgba(99, 102, 241, 0.4);
            }

            /* Pull to Refresh Indicator */
            .pull-indicator {
                position: fixed;
                top: 0;
                left: 50%;
                transform: translateX(-50%) translateY(-100%);
                padding: 12px 20px;
                background: white;
                border-radius: 0 0 16px 16px;
                box-shadow: 0 4px 15px rgba(0,0,0,0.1);
                font-size: 0.85rem;
                color: #6B7280;
                z-index: 9998;
                transition: transform 0.3s;
            }
            .pull-indicator.visible {
                transform: translateX(-50%) translateY(0);
            }

            /* Button Loading State */
            .btn-loading {
                position: relative;
                color: transparent !important;
                pointer-events: none;
            }
            .btn-loading::after {
                content: '';
                position: absolute;
                width: 20px;
                height: 20px;
                top: 50%;
                left: 50%;
                margin-left: -10px;
                margin-top: -10px;
                border: 2px solid rgba(255,255,255,0.3);
                border-top-color: white;
                border-radius: 50%;
                animation: btnSpin 0.6s linear infinite;
            }
            @keyframes btnSpin {
                to { transform: rotate(360deg); }
            }
        `;
        document.head.appendChild(style);
    }

    // ==========================================
    // 2. SKELETON LOADING HELPERS
    // ==========================================

    function createSkeletonCard() {
        return `
            <div class="skeleton-card">
                <div class="skeleton skeleton-image"></div>
                <div style="padding-top: 12px;">
                    <div class="skeleton skeleton-title"></div>
                    <div class="skeleton skeleton-text"></div>
                    <div class="skeleton skeleton-text short"></div>
                </div>
            </div>
        `;
    }

    function createSkeletonList(count) {
        count = count || 3;
        var html = '';
        for (var i = 0; i < count; i++) {
            html += `
                <div class="skeleton-card" style="display: flex; gap: 12px; align-items: center;">
                    <div class="skeleton skeleton-avatar"></div>
                    <div style="flex: 1;">
                        <div class="skeleton skeleton-title" style="width: 60%;"></div>
                        <div class="skeleton skeleton-text short"></div>
                    </div>
                </div>
            `;
        }
        return html;
    }

    // ==========================================
    // 3. EMPTY STATE GENERATOR
    // ==========================================

    function createEmptyState(icon, title, message, actionText, actionUrl) {
        var actionHtml = '';
        if (actionText && actionUrl) {
            actionHtml = '<a href="' + actionUrl + '" class="empty-action">' + actionText + '</a>';
        }

        return `
            <div class="empty-state-modern">
                <div class="empty-icon">${icon || getDefaultEmptyIcon()}</div>
                <h3>${escapeHtml(title) || 'Nichts gefunden'}</h3>
                <p>${escapeHtml(message) || 'Hier gibt es noch keine Einträge.'}</p>
                ${actionHtml}
            </div>
        `;
    }

    function getDefaultEmptyIcon() {
        return '<svg viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" stroke-width="1.5"><path d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"/></svg>';
    }

    // ==========================================
    // 4. FAVORITE ANIMATION
    // ==========================================

    function animateFavorite(button) {
        button.classList.add('animating');
        setTimeout(function() {
            button.classList.remove('animating');
        }, 400);
    }

    // ==========================================
    // 5. HAPTIC FEEDBACK (iOS)
    // ==========================================

    function hapticFeedback(type) {
        type = type || 'light';

        // Try Capacitor Haptics
        if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Haptics) {
            try {
                if (type === 'success') {
                    window.Capacitor.Plugins.Haptics.notification({ type: 'SUCCESS' });
                } else if (type === 'error') {
                    window.Capacitor.Plugins.Haptics.notification({ type: 'ERROR' });
                } else if (type === 'warning') {
                    window.Capacitor.Plugins.Haptics.notification({ type: 'WARNING' });
                } else {
                    window.Capacitor.Plugins.Haptics.impact({ style: 'LIGHT' });
                }
            } catch (e) {
                // Haptics not available
            }
        }
    }

    // ==========================================
    // INIT
    // ==========================================

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', injectToastStyles);
    } else {
        injectToastStyles();
    }

    // ==========================================
    // GLOBAL EXPORTS
    // ==========================================

    window.Room8UI = {
        toast: showToast,
        success: function(msg, duration) { return showToast(msg, 'success', duration); },
        error: function(msg, duration) { return showToast(msg, 'error', duration); },
        warning: function(msg, duration) { return showToast(msg, 'warning', duration); },
        info: function(msg, duration) { return showToast(msg, 'info', duration); },

        skeleton: {
            card: createSkeletonCard,
            list: createSkeletonList
        },

        emptyState: createEmptyState,
        animateFavorite: animateFavorite,
        haptic: hapticFeedback
    };

    // Override alert() with toast (optional - aktivieren mit Room8UI.overrideAlert())
    window.Room8UI.overrideAlert = function() {
        window._originalAlert = window.alert;
        window.alert = function(msg) {
            showToast(msg, 'info', 4000);
        };
    };

    console.log('Room8 UI Components loaded');
})();
