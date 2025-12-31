// ==========================================
// NAVIGATION & HELPER COMPONENT
// ==========================================

(function() {
    'use strict';

    // 1. SAFE NAVIGATION (Der globale Fix)
    // Wir hängen das an "window", damit alle HTML-Dateien es nutzen können
    window.navigateTo = function(url) {
        try {
            console.log('Navigiere zu:', url);
            // Versuch 1: Standard
            window.location.href = url;
        } catch (e) {
            console.warn('Navigation in Vorschau blockiert (Normal in App):', e);
            // Versuch 2: Replace (manchmal stabiler)
            try {
                window.location.replace(url);
            } catch (e2) {
                console.warn('Auch Replace fehlgeschlagen:', e2);
            }
        }
    };

    // 2. Navigation Render Logic
    function getCurrentPage() {
        var path = window.location.pathname;
        var filename = path.substring(path.lastIndexOf('/') + 1) || 'index.html';
        
        if (filename === 'dashboard.html' || filename === '') return 'home';
        if (filename === 'listing-details.html') return 'housing';
        if (filename === 'job-detail.html') return 'jobs';
        if (filename === 'coupon-detail.html') return 'coupons';
        
        var pageMap = {
            'dashboard.html': 'home',
            'wohnungen.html': 'housing',
            'wohnung.html': 'housing',
            'gegenstaende.html': 'marketplace',
            'gegenstand.html': 'marketplace',
            'jobs.html': 'jobs',
            'job-create.html': 'jobs',
            'coupons.html': 'coupons',
            'coupon-create.html': 'coupons',
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

    function getNavLabel(itemId) {
        var lang = localStorage.getItem('room8_language') || 'de';
        var labels = {
            de: {
                home: 'Home',
                housing: 'Wohnen',
                marketplace: 'Markt',
                jobs: 'Jobs',
                coupons: 'Deals',
                messages: 'Chat',
                profile: 'Profil'
            },
            en: {
                home: 'Home',
                housing: 'Housing',
                marketplace: 'Market',
                jobs: 'Jobs',
                coupons: 'Deals',
                messages: 'Chat',
                profile: 'Profile'
            }
        };
        return (labels[lang] || labels.de)[itemId] || itemId;
    }

    function getIcon(iconName) {
        var icons = {
            grid: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect></svg>',
            home: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><polyline points="9 22 9 12 15 12 15 22"></polyline></svg>',
            shopping: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"></path><line x1="3" y1="6" x2="21" y2="6"></line><path d="M16 10a4 4 0 0 1-8 0"></path></svg>',
            briefcase: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="7" width="20" height="14" rx="2" ry="2"></rect><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"></path></svg>',
            tag: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"></path><line x1="7" y1="7" x2="7.01" y2="7"></line></svg>',
            message: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"></path></svg>',
            user: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>'
        };
        return icons[iconName] || icons.grid;
    }

    function injectStyles() {
        if (document.getElementById('navigation-styles')) return;
        var css = [
            '.bottom-nav { position: fixed; bottom: 0; left: 0; right: 0; background: white; border-top: 1px solid #e5e7eb; display: flex; justify-content: space-around; padding: 0.3rem 0; z-index: 1000; box-shadow: 0 -2px 10px rgba(0,0,0,0.02); height: 60px; box-sizing: border-box; overflow-x:auto; }',
            '.nav-item { display: flex; flex-direction: column; align-items: center; gap: 2px; text-decoration: none; flex: 1; min-width: 50px; justify-content: center; position: relative; padding: 0.2rem; }',
            '.nav-icon { width: 22px; height: 22px; transition: transform 0.1s; }',
            '.nav-item:active .nav-icon { transform: scale(0.9); }',
            '.nav-label { font-size: 0.6rem; font-weight: 500; letter-spacing: 0.2px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }'
        ].join('');
        var style = document.createElement('style');
        style.id = 'navigation-styles';
        style.textContent = css;
        document.head.appendChild(style);
    }

    function renderNavigation() {
        var path = window.location.pathname;
        var filename = path.substring(path.lastIndexOf('/') + 1);
        if (filename === 'index.html' || filename === 'login.html' || filename === 'register.html' || filename === '') {
            return;
        }

        injectStyles();
        var currentPage = getCurrentPage();
        
        var navItems = [
            { id: 'home', href: 'dashboard.html', icon: 'grid', color: '#667eea' },
            { id: 'housing', href: 'wohnungen.html', icon: 'home', color: '#3b82f6' },
            { id: 'marketplace', href: 'gegenstaende.html', icon: 'shopping', color: '#10b981' },
            { id: 'jobs', href: 'jobs.html', icon: 'briefcase', color: '#8b5cf6' },
            { id: 'coupons', href: 'coupons.html', icon: 'tag', color: '#f59e0b' },
            { id: 'messages', href: 'nachrichten.html', icon: 'message', color: '#6366f1' },
            { id: 'profile', href: 'profile.html', icon: 'user', color: '#6b7280' }
        ];
        
        var navHTML = '<nav class="bottom-nav">';
        
        for (var i = 0; i < navItems.length; i++) {
            var item = navItems[i];
            var isActive = currentPage === item.id;
            var label = getNavLabel(item.id);
            var iconSVG = getIcon(item.icon);
            var color = isActive ? item.color : '#9ca3af'; 
            var activeClass = isActive ? 'active' : '';
            
            // WICHTIG: Nutze navigateTo() auch hier
            navHTML += `<a href="${item.href}" class="nav-item ${activeClass}" onclick="event.preventDefault(); window.navigateTo('${item.href}')">`;
            navHTML += '<div class="nav-icon" style="color: ' + color + '">' + iconSVG + '</div>';
            navHTML += '<span class="nav-label" style="color: ' + color + '">' + label + '</span>';
            navHTML += '</a>';
        }
        
        navHTML += '</nav>';
        
        var navContainer = document.getElementById('app-footer-nav') || document.getElementById('app-navigation');
        if (!navContainer) {
            navContainer = document.createElement('div');
            navContainer.id = 'app-footer-nav';
            document.body.appendChild(navContainer);
        }
        navContainer.innerHTML = navHTML;
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', renderNavigation);
    } else {
        renderNavigation();
    }
})();