// ==========================================
// ROOM8 BOTTOM TAB BAR NAVIGATION
// Fixed at bottom, always visible
// ==========================================

(function() {
    'use strict';

    // 1. SAFE NAVIGATION
    window.navigateTo = function(url) {
        try {
            console.log('Navigiere zu:', url);
            window.location.href = url;
        } catch (e) {
            console.warn('Navigation blockiert:', e);
            try {
                window.location.replace(url);
            } catch (e2) {
                console.warn('Replace fehlgeschlagen:', e2);
            }
        }
    };

    // 2. Get current page
    function getCurrentPage() {
        var path = window.location.pathname;
        var href = window.location.href;
        var filename = path.substring(path.lastIndexOf('/') + 1);

        if (!filename && href) {
            filename = href.substring(href.lastIndexOf('/') + 1);
            if (filename.indexOf('?') !== -1) {
                filename = filename.substring(0, filename.indexOf('?'));
            }
        }
        filename = filename || 'index.html';

        if (filename === 'dashboard.html' || filename === '') return 'home';
        // listing-details.html: Typ wird dynamisch gesetzt via window.currentListingType
        if (filename === 'listing-details.html') {
            if (window.currentListingType === 'gegenstand') return 'marketplace';
            return 'housing'; // default für wohnung
        }
        if (filename === 'job-detail.html') return 'jobs';
        if (filename === 'coupon-detail.html') return 'coupons';
        if (filename === 'detail.html') return 'marketplace';

        var pageMap = {
            'dashboard.html': 'home',
            'wohnungen.html': 'housing',
            'wohnung.html': 'housing',
            'gegenstaende.html': 'marketplace',
            'gegenstand.html': 'marketplace',
            'detail.html': 'marketplace',
            'jobs.html': 'jobs',
            'job-create.html': 'jobs',
            'coupons.html': 'coupons',
            'coupon-create.html': 'coupons',
            'coupon-detail.html': 'coupons',
            'nachrichten.html': 'messages',
            'chat.html': 'messages',
            'profile.html': 'profile',
            'edit-profile.html': 'profile',
            'settings.html': 'profile',
            'favorites.html': 'profile',
            'saved-searches.html': 'profile',
            'verify-options.html': 'profile'
        };

        return pageMap[filename] || '';
    }

    function getIcon(iconName) {
        var icons = {
            grid: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect></svg>',
            home: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><polyline points="9 22 9 12 15 12 15 22"></polyline></svg>',
            shopping: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"></path><line x1="3" y1="6" x2="21" y2="6"></line><path d="M16 10a4 4 0 0 1-8 0"></path></svg>',
            briefcase: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="7" width="20" height="14" rx="2" ry="2"></rect><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"></path></svg>',
            tag: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"></path><line x1="7" y1="7" x2="7.01" y2="7"></line></svg>',
            message: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"></path></svg>',
            user: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>',
            plus: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>'
        };
        return icons[iconName] || icons.grid;
    }

    function renderBottomNav() {
        var path = window.location.pathname;
        var href = window.location.href;
        var filename = path.substring(path.lastIndexOf('/') + 1);

        if (!filename && href) {
            filename = href.substring(href.lastIndexOf('/') + 1);
            if (filename.indexOf('?') !== -1) {
                filename = filename.substring(0, filename.indexOf('?'));
            }
        }

        // Nicht auf Login/Register/Index anzeigen
        if (filename === 'index.html' || filename === 'login.html' || filename === 'register.html' || filename === '' || !filename) {
            return;
        }

        var currentPage = getCurrentPage();

        var navItems = [
            { id: 'home', href: 'dashboard.html', icon: 'grid', label: 'Home' },
            { id: 'housing', href: 'wohnungen.html', icon: 'home', label: 'Wohnen' },
            { id: 'marketplace', href: 'gegenstaende.html', icon: 'shopping', label: 'Markt' },
            { id: 'jobs', href: 'jobs.html', icon: 'briefcase', label: 'Jobs' },
            { id: 'coupons', href: 'coupons.html', icon: 'tag', label: 'Coupons' },
            { id: 'messages', href: 'nachrichten.html', icon: 'message', label: 'Chat' }
        ];

        // Build nav items
        var itemsHTML = '';
        for (var i = 0; i < navItems.length; i++) {
            var item = navItems[i];
            var isActive = currentPage === item.id;

            // Farbige aktive Klasse je nach Seite
            var activeClass = '';
            if (isActive) {
                if (item.id === 'housing') {
                    activeClass = 'active-housing';
                } else if (item.id === 'marketplace') {
                    activeClass = 'active-marketplace';
                } else if (item.id === 'jobs') {
                    activeClass = 'active-jobs';
                } else if (item.id === 'coupons') {
                    activeClass = 'active-coupons';
                } else {
                    activeClass = 'active';
                }
            }

            itemsHTML += '<a href="' + item.href + '" class="bottom-nav-item ' + activeClass + '" data-href="' + item.href + '">';
            itemsHTML += '<div class="bottom-nav-icon">' + getIcon(item.icon) + '</div>';
            itemsHTML += '<span class="bottom-nav-label">' + item.label + '</span>';
            itemsHTML += '</a>';
        }

        // Create bottom nav HTML
        var navHTML = '<nav class="bottom-nav" id="bottomNav">' + itemsHTML + '</nav>';

        // Remove old navigation elements
        var oldNav = document.getElementById('app-footer-nav');
        if (oldNav) oldNav.innerHTML = '';

        var oldBottomNav = document.getElementById('bottomNav');
        if (oldBottomNav) oldBottomNav.remove();

        var oldSidebar = document.getElementById('sidebarNav');
        if (oldSidebar) oldSidebar.remove();

        var oldToggle = document.getElementById('sidebarToggle');
        if (oldToggle) oldToggle.remove();

        // Append to body
        var container = document.createElement('div');
        container.innerHTML = navHTML;
        document.body.appendChild(container.firstChild);

        // Add click handlers to nav items
        var navLinks = document.querySelectorAll('.bottom-nav-item');
        navLinks.forEach(function(link) {
            link.addEventListener('click', function(e) {
                e.preventDefault();
                var targetHref = link.getAttribute('data-href');
                window.navigateTo(targetHref);
            });
        });

        // Add bottom padding to content to prevent overlap with floating nav
        var appContent = document.querySelector('.app-content');
        if (appContent) {
            appContent.style.paddingBottom = '100px';
        }

        var appContainer = document.querySelector('.app-container');
        if (appContainer) {
            appContainer.style.paddingBottom = '95px';
        }

        // Move FAB above floating nav
        var fab = document.querySelector('.fab');
        if (fab) {
            fab.style.position = 'fixed';
            fab.style.bottom = 'calc(100px + env(safe-area-inset-bottom, 0px))';
            fab.style.right = '20px';
            fab.style.zIndex = '10000';
        }
    }

    // Fix back-arrow links
    function fixBackArrowLinks() {
        var backArrows = document.querySelectorAll('.back-arrow');
        backArrows.forEach(function(arrow) {
            arrow.addEventListener('click', function(e) {
                e.preventDefault();
                var href = arrow.getAttribute('href');
                if (href && href !== '#' && href !== 'javascript:void(0)') {
                    if (href.indexOf('javascript:history.back') !== -1) {
                        window.history.back();
                    } else {
                        window.navigateTo(href);
                    }
                } else {
                    window.history.back();
                }
            });
        });
    }

    // Inject CSS for bottom navigation
    function injectBottomNavStyles() {
        var styleId = 'bottom-nav-styles';
        if (document.getElementById(styleId)) return;

        var css = `
            /* Bottom Navigation Bar - Floating Style */
            .bottom-nav {
                position: fixed;
                bottom: calc(12px + env(safe-area-inset-bottom, 0px));
                left: 16px;
                right: 16px;
                height: 65px;
                background: #ffffff;
                backdrop-filter: blur(20px);
                -webkit-backdrop-filter: blur(20px);
                display: flex;
                justify-content: space-around;
                align-items: center;
                padding: 8px 12px;
                box-shadow: 0 4px 24px rgba(0, 0, 0, 0.12);
                z-index: 9999;
                border-radius: 20px;
                border: 1px solid rgba(0, 0, 0, 0.04);
            }

            .bottom-nav-item {
                position: relative;
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                text-decoration: none;
                color: #6b7280;
                padding: 6px 8px;
                border-radius: 12px;
                transition: all 0.2s ease;
                min-width: 48px;
                flex: 1;
                gap: 2px;
            }

            .bottom-nav-item:active {
                transform: scale(0.92);
            }

            /* Default Active (Home, Chat, Profile) */
            .bottom-nav-item.active {
                color: #6366f1;
            }
            .bottom-nav-item.active .bottom-nav-icon {
                background: linear-gradient(135deg, #6366f1 0%, #4f46e5 100%);
                color: white;
                box-shadow: 0 2px 8px rgba(99, 102, 241, 0.3);
            }

            /* Wohnen - Blau */
            .bottom-nav-item.active-housing {
                color: #3b82f6;
            }
            .bottom-nav-item.active-housing .bottom-nav-icon {
                background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
                color: white;
                box-shadow: 0 2px 8px rgba(59, 130, 246, 0.4);
            }

            /* Marktplatz - Grün */
            .bottom-nav-item.active-marketplace {
                color: #10b981;
            }
            .bottom-nav-item.active-marketplace .bottom-nav-icon {
                background: linear-gradient(135deg, #10b981 0%, #059669 100%);
                color: white;
                box-shadow: 0 2px 8px rgba(16, 185, 129, 0.4);
            }

            /* Jobs - Lila */
            .bottom-nav-item.active-jobs {
                color: #8b5cf6;
            }
            .bottom-nav-item.active-jobs .bottom-nav-icon {
                background: linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%);
                color: white;
                box-shadow: 0 2px 8px rgba(139, 92, 246, 0.4);
            }

            /* Coupons - Orange */
            .bottom-nav-item.active-coupons {
                color: #f59e0b;
            }
            .bottom-nav-item.active-coupons .bottom-nav-icon {
                background: linear-gradient(135deg, #f59e0b 0%, #ea580c 100%);
                color: white;
                box-shadow: 0 2px 8px rgba(245, 158, 11, 0.4);
            }

            .bottom-nav-icon {
                width: 36px;
                height: 36px;
                display: flex;
                align-items: center;
                justify-content: center;
                border-radius: 10px;
                margin-bottom: 2px;
                transition: all 0.2s ease;
            }

            .bottom-nav-icon svg {
                width: 20px;
                height: 20px;
            }

            .bottom-nav-label {
                font-size: 9px;
                font-weight: 600;
                letter-spacing: 0.01em;
            }

            .bottom-nav-badge {
                position: absolute;
                top: 0;
                right: 2px;
                background: #EF4444;
                color: white;
                font-size: 0.6rem;
                font-weight: 700;
                min-width: 16px;
                height: 16px;
                border-radius: 8px;
                display: flex;
                align-items: center;
                justify-content: center;
                padding: 0 4px;
                box-shadow: 0 2px 4px rgba(239,68,68,0.4);
            }
        `;

        var style = document.createElement('style');
        style.id = styleId;
        style.textContent = css;
        document.head.appendChild(style);
    }

    // Update unread message badge on Chat nav item
    var _navClient = null;
    var _navUserId = null;
    var _realtimeSubscribed = false;

    function getNavClient() {
        if (_navClient) return _navClient;
        if (window.supabase && window.supabase.createClient && typeof SUPABASE_URL !== 'undefined') {
            _navClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
        }
        return _navClient;
    }

    function setBadgeCount(count) {
        var chatLink = document.querySelector('.bottom-nav-item[data-href="nachrichten.html"]');
        if (!chatLink) return;
        var old = chatLink.querySelector('.bottom-nav-badge');
        if (old) old.remove();
        if (count && count > 0) {
            var badge = document.createElement('span');
            badge.className = 'bottom-nav-badge';
            badge.textContent = count > 99 ? '99+' : count;
            chatLink.appendChild(badge);
        }
    }

    function updateChatBadge() {
        var client = getNavClient();
        if (!client) return;
        try {
            client.auth.getSession().then(function(result) {
                if (!result.data || !result.data.session) return;
                _navUserId = result.data.session.user.id;
                client.from('messages')
                    .select('*', { count: 'exact', head: true })
                    .eq('receiver_id', _navUserId)
                    .eq('is_read', false)
                    .then(function(res) {
                        setBadgeCount(res.count);
                    });
                // Subscribe to realtime updates (once)
                subscribeToMessageUpdates();
            });
        } catch(e) { console.warn('Badge update failed:', e); }
    }

    // Real-time subscription for chat badge
    function subscribeToMessageUpdates() {
        if (_realtimeSubscribed || !_navUserId) return;
        var client = getNavClient();
        if (!client) return;
        _realtimeSubscribed = true;
        try {
            client.channel('nav-badge-messages')
                .on('postgres_changes', {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'messages',
                    filter: 'receiver_id=eq.' + _navUserId
                }, function() {
                    // New message received - refresh badge count
                    client.from('messages')
                        .select('*', { count: 'exact', head: true })
                        .eq('receiver_id', _navUserId)
                        .eq('is_read', false)
                        .then(function(res) {
                            setBadgeCount(res.count);
                        });
                })
                .on('postgres_changes', {
                    event: 'UPDATE',
                    schema: 'public',
                    table: 'messages',
                    filter: 'receiver_id=eq.' + _navUserId
                }, function() {
                    // Message marked as read - refresh badge count
                    client.from('messages')
                        .select('*', { count: 'exact', head: true })
                        .eq('receiver_id', _navUserId)
                        .eq('is_read', false)
                        .then(function(res) {
                            setBadgeCount(res.count);
                        });
                })
                .subscribe();
        } catch(e) { console.warn('Realtime badge subscription failed:', e); }
    }

    // Dynamically load push-logic.js on every page (if not already loaded)
    function loadPushLogic() {
        if (window.PushService) return; // already loaded
        if (!document.querySelector('script[src="push-logic.js"]')) {
            var s = document.createElement('script');
            s.src = 'push-logic.js';
            s.async = true;
            document.body.appendChild(s);
        }
    }

    // Render on DOM ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function() {
            injectBottomNavStyles();
            renderBottomNav();
            fixBackArrowLinks();
            setTimeout(updateChatBadge, 500);
            setTimeout(loadPushLogic, 800);
        });
    } else {
        injectBottomNavStyles();
        renderBottomNav();
        fixBackArrowLinks();
        setTimeout(updateChatBadge, 500);
        setTimeout(loadPushLogic, 800);
    }
})();
