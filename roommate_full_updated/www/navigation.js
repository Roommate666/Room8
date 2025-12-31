// ==========================================
// NAVIGATION COMPONENT
// ==========================================
// Dynamic bottom navigation that works on all pages

class NavigationComponent {
    constructor() {
        this.currentPage = this.getCurrentPage();
        this.language = localStorage.getItem('room8_language') || localStorage.getItem('language') || APP_CONFIG.defaultLanguage;
    }
    
    // Determine current page from URL
    getCurrentPage() {
        const path = window.location.pathname;
        const filename = path.substring(path.lastIndexOf('/') + 1) || 'wohnungen.html';
        
        // Check for 'from' parameter in URL for detail.html
        if (filename === 'detail.html') {
            const urlParams = new URLSearchParams(window.location.search);
            const fromParam = urlParams.get('from');
            if (fromParam === 'marketplace') return 'marketplace';
            if (fromParam === 'housing') return 'housing';
        }
        
        // Map filenames to navigation IDs
        const pageMap = {
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
            'profile.html': 'profile',
            'edit-profile.html': 'profile',
            'public-profile.html': 'profile',
            'settings.html': 'profile'
        };
        
        return pageMap[filename] || 'housing';
    }
    
    // Get translation for navigation labels
    getNavLabel(item) {
        // First check if room8_language is set (from translations.js)
        const lang = localStorage.getItem('room8_language') || this.language;
        
        // Custom translations for navigation
        const navTranslations = {
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
        
        // Try to get from our custom translations first
        if (navTranslations[lang] && navTranslations[lang][item.id]) {
            return navTranslations[lang][item.id];
        }
        
        // Fallback to item's label
        return item.label[lang] || item.label.de || item.label.en;
    }
    
    // Generate navigation HTML
    generateHTML() {
        const navItems = APP_CONFIG.navigation.map(item => {
            const isActive = this.currentPage === item.id;
            const label = this.getNavLabel(item);
            const icon = APP_CONFIG.icons[item.icon] || '';
            
            return `
                <a href="${item.href}" class="nav-item ${isActive ? 'active' : ''}" data-page="${item.id}">
                    <div class="nav-icon" style="color: ${isActive ? item.color : '#9ca3af'}">
                        ${icon}
                    </div>
                    <span class="nav-label" style="color: ${isActive ? item.color : '#9ca3af'}">${label}</span>
                </a>
            `;
        }).join('');
        
        return `
            <nav class="bottom-nav">
                ${navItems}
            </nav>
        `;
    }
    
    // Inject CSS styles
    injectStyles() {
        const styles = `
            <style id="navigation-styles">
                .bottom-nav {
                    position: fixed;
                    bottom: 0;
                    left: 0;
                    right: 0;
                    background: white;
                    border-top: 1px solid #e5e7eb;
                    display: flex;
                    justify-content: space-around;
                    padding: 0.5rem 0;
                    z-index: 1000;
                    box-shadow: 0 -2px 10px rgba(0, 0, 0, 0.05);
                }
                
                .nav-item {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    gap: 0.25rem;
                    padding: 0.5rem 0.75rem;
                    text-decoration: none;
                    transition: all 0.2s ease;
                    flex: 1;
                    max-width: 100px;
                    cursor: pointer;
                }
                
                .nav-item:hover {
                    background: #f9fafb;
                    border-radius: 8px;
                }
                
                .nav-icon {
                    width: 24px;
                    height: 24px;
                    transition: transform 0.2s ease;
                }
                
                .nav-item.active .nav-icon {
                    transform: scale(1.1);
                }
                
                .nav-icon svg {
                    width: 100%;
                    height: 100%;
                }
                
                .nav-label {
                    font-size: 0.7rem;
                    font-weight: 500;
                    transition: all 0.2s ease;
                }
                
                .nav-item.active .nav-label {
                    font-weight: 600;
                }
                
                /* Add padding to main content to account for fixed nav */
                .main-content {
                    padding-bottom: 80px !important;
                }
                
                /* Mobile optimization */
                @media (max-width: 640px) {
                    .nav-label {
                        font-size: 0.65rem;
                    }
                    
                    .nav-icon {
                        width: 22px;
                        height: 22px;
                    }
                }
            </style>
        `;
        
        // Remove old styles if they exist
        const oldStyles = document.getElementById('navigation-styles');
        if (oldStyles) {
            oldStyles.remove();
        }
        
        // Inject new styles
        document.head.insertAdjacentHTML('beforeend', styles);
    }
    
    // Render navigation
    render() {
        // Inject styles first
        this.injectStyles();
        
        // Find or create navigation container
        let navContainer = document.getElementById('app-navigation');
        
        if (!navContainer) {
            // Create container if it doesn't exist
            navContainer = document.createElement('div');
            navContainer.id = 'app-navigation';
            document.body.appendChild(navContainer);
        }
        
        // Inject navigation HTML
        navContainer.innerHTML = this.generateHTML();
        
        // Make sure main content has proper padding
        const mainContent = document.querySelector('.main-content') || 
                          document.querySelector('.app-container') || 
                          document.querySelector('main');
        
        if (mainContent && !mainContent.style.paddingBottom) {
            mainContent.style.paddingBottom = '80px';
        }
    }
    
    // Update language
    updateLanguage(lang) {
        this.language = lang;
        localStorage.setItem('room8_language', lang);
        localStorage.setItem('language', lang);
        this.render();
    }
}

// Auto-initialize on page load
document.addEventListener('DOMContentLoaded', () => {
    const nav = new NavigationComponent();
    nav.render();
    
    // Make navigation instance globally available
    window.navigationComponent = nav;
});

// Listen for language changes from translations.js
window.addEventListener('languageChanged', (e) => {
    if (window.navigationComponent) {
        window.navigationComponent.language = e.detail.language;
        window.navigationComponent.render();
    }
});
