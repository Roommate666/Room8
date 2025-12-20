// ==========================================
// NAVIGATION COMPONENT - ES5 VERSION
// ==========================================

(function() {
    'use strict';

    function getCurrentPage() {
        var path = window.location.pathname;
        var filename = path.substring(path.lastIndexOf('/') + 1) || 'wohnungen.html';
        
        // Check for 'from' parameter in URL for detail.html
        if (filename === 'detail.html') {
            var urlParams = new URLSearchParams(window.location.search);
            var fromParam = urlParams.get('from');
            if (fromParam === 'marketplace') return 'marketplace';
            if (fromParam === 'housing') return 'housing';
        }
        
        // Map filenames to navigation IDs
        var pageMap = {
            'wohnungen.html': 'housing',
            'index.html': 'housing',
            'gegenstaende.html': 'marketplace',
            'gegenstand.html': 'marketplace',
            'jobs.html': 'jobs',
            'job-create.html': 'jobs',
            'coupons.html': 'coupons',
            'coupon-create.html': 'coupons',
            'coupon-detail.html': 'coupons',
            'nachrichten.html': 'messages',
            'notifications.html': 'messages',
            'chat.html': 'messages',
            'profile.html': 'profile',
            'edit-profile.html': 'profile',
            'public-profile.html': 'profile',
            'settings.html': 'profile',
            'favorites.html': 'profile',
            'saved-searches.html': 'profile',
            'verify-options.html': 'profile',
            'verification-status.html': 'profile'
        };
        
        return pageMap[filename] || 'housing';
    }

    function getLanguage() {
        return localStorage.getItem('room8_language') || localStorage.getItem('language') || 'de';
    }

    function getNavLabel(itemId) {
        var lang = getLanguage();
        
        var navTranslations = {
            de: {
                housing: 'Wohnungen',
                marketplace: 'Marktplatz',
                jobs: 'Jobs',
                coupons: 'Coupons',
                messages: 'Nachrichten',
                profile: 'Profil'
            },
            en: {
                housing: 'Housing',
                marketplace: 'Marketplace',
                jobs: 'Jobs',
                coupons: 'Coupons',
                messages: 'Messages',
                profile: 'Profile'
            }
        };
        
        if (navTranslations[lang] && navTranslations[lang][itemId]) {
            return navTranslations[lang][itemId];
        }
        
        return navTranslations.de[itemId] || itemId;
    }

    function getIcon(iconName) {
        var icons = {
            home: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><polyline points="9 22 9 12 15 12 15 22"></polyline></svg>',
            shopping: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="21" r="1"></circle><circle cx="20" cy="21" r="1"></circle><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path></svg>',
            briefcase: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="7" width="20" height="14" rx="2" ry="2"></rect><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"></path></svg>',
            tag: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"></path><line x1="7" y1="7" x2="7.01" y2="7"></line></svg>',
            messageCircle: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"></path></svg>',
            user: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>'
        };
        
        return icons[iconName] || icons.home;
    }

    function injectStyles() {
        if (document.getElementById('navigation-styles')) return;
        
        var css = [
            '.bottom-nav {',
            '    position: fixed;',
            '    bottom: 0;',
            '    left: 0;',
            '    right: 0;',
            '    background: white;',
            '    border-top: 1px solid #e5e7eb;',
            '    display: flex;',
            '    justify-content: space-around;',
            '    padding: 0.5rem 0;',
            '    z-index: 1000;',
            '    box-shadow: 0 -2px 10px rgba(0, 0, 0, 0.05);',
            '}',
            '.nav-item {',
            '    display: flex;',
            '    flex-direction: column;',
            '    align-items: center;',
            '    gap: 0.25rem;',
            '    padding: 0.5rem 0.75rem;',
            '    text-decoration: none;',
            '    flex: 1;',
            '    max-width: 80px;',
            '    cursor: pointer;',
            '}',
            '.nav-icon {',
            '    width: 24px;',
            '    height: 24px;',
            '}',
            '.nav-icon svg {',
            '    width: 100%;',
            '    height: 100%;',
            '}',
            '.nav-label {',
            '    font-size: 0.65rem;',
            '    font-weight: 500;',
            '}'
        ].join('\n');
        
        var style = document.createElement('style');
        style.id = 'navigation-styles';
        style.textContent = css;
        document.head.appendChild(style);
    }

    function renderNavigation() {
        injectStyles();
        
        var currentPage = getCurrentPage();
        
        var navItems = [
            { id: 'housing', href: 'wohnungen.html', icon: 'home', color: '#3b82f6' },
            { id: 'marketplace', href: 'gegenstaende.html', icon: 'shopping', color: '#10b981' },
            { id: 'jobs', href: 'jobs.html', icon: 'briefcase', color: '#8b5cf6' },
            { id: 'coupons', href: 'coupons.html', icon: 'tag', color: '#f59e0b' },
            { id: 'messages', href: 'nachrichten.html', icon: 'messageCircle', color: '#6366f1' },
            { id: 'profile', href: 'profile.html', icon: 'user', color: '#6b7280' }
        ];
        
        var navHTML = '<nav class="bottom-nav">';
        
        for (var i = 0; i < navItems.length; i++) {
            var item = navItems[i];
            var isActive = currentPage === item.id;
            var label = getNavLabel(item.id);
            var icon = getIcon(item.icon);
            var color = isActive ? item.color : '#9ca3af';
            var activeClass = isActive ? 'active' : '';
            
            navHTML += '<a href="' + item.href + '" class="nav-item ' + activeClass + '" data-page="' + item.id + '">';
            navHTML += '<div class="nav-icon" style="color: ' + color + '">' + icon + '</div>';
            navHTML += '<span class="nav-label" style="color: ' + color + '">' + label + '</span>';
            navHTML += '</a>';
        }
        
        navHTML += '</nav>';
        
        // Find container or create one
        var navContainer = document.getElementById('app-footer-nav') || document.getElementById('app-navigation');
        
        if (!navContainer) {
            navContainer = document.createElement('div');
            navContainer.id = 'app-navigation';
            document.body.appendChild(navContainer);
        }
        
        navContainer.innerHTML = navHTML;
    }

    // Initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', renderNavigation);
    } else {
        renderNavigation();
    }

    // Expose for updates
    window.renderNavigation = renderNavigation;

})();
