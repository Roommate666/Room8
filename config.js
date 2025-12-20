// ==========================================
// ROOMMATE APP - CENTRAL CONFIGURATION
// ==========================================

var SUPABASE_URL = 'https://tvnvmogaqmduzcycmvby.supabase.co';
var SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR2bnZtb2dhcW1kdXpjeWNtdmJ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ5NTA4MTksImV4cCI6MjA3MDUyNjgxOX0.MuLv9AdclVVZYZpUFv6Bc2Jn1Z9cmmcarHwBHlHkvZw';

var APP_CONFIG = {
    // App Info
    name: 'Room8',
    version: '1.0.0',
    
    // Supabase Configuration
    supabase: {
        url: SUPABASE_URL,
        anonKey: SUPABASE_ANON_KEY
    },
    
    // Navigation Items
    navigation: [
        {
            id: 'housing',
            icon: 'home',
            label: {
                de: 'Wohnungen',
                en: 'Housing'
            },
            href: 'wohnungen.html',
            color: '#3b82f6'
        },
        {
            id: 'marketplace',
            icon: 'shopping-bag',
            label: {
                de: 'Marktplatz',
                en: 'Marketplace'
            },
            href: 'gegenstaende.html',
            color: '#10b981'
        },
        {
            id: 'jobs',
            icon: 'briefcase',
            label: {
                de: 'Jobs',
                en: 'Jobs'
            },
            href: 'jobs.html',
            color: '#f59e0b'
        },
        {
            id: 'coupons',
            icon: 'ticket',
            label: {
                de: 'Coupons',
                en: 'Coupons'
            },
            href: 'coupons.html',
            color: '#8b5cf6'
        },
        {
            id: 'messages',
            icon: 'message-circle',
            label: {
                de: 'Nachrichten',
                en: 'Messages'
            },
            href: 'nachrichten.html',
            color: '#ef4444'
        },
        {
            id: 'profile',
            icon: 'user',
            label: {
                de: 'Profil',
                en: 'Profile'
            },
            href: 'profile.html',
            color: '#6b7280'
        }
    ],
    
    // SVG Icons (Lucide-style)
    icons: {
        home: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>',
        'shopping-bag': '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" x2="21" y1="6" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>',
        'briefcase': '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="14" x="2" y="7" rx="2" ry="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>',
        'ticket': '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z"/><path d="M13 5v2"/><path d="M13 17v2"/><path d="M13 11v2"/></svg>',
        'message-circle': '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m3 21 1.9-5.7a8.5 8.5 0 1 1 3.8 3.8z"/></svg>',
        'user': '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>'
    },
    
    // Default Language
    defaultLanguage: 'de'
};

// Export for use in other scripts
if (typeof window !== 'undefined') {
    window.APP_CONFIG = APP_CONFIG;
    window.SUPABASE_URL = SUPABASE_URL;
    window.SUPABASE_ANON_KEY = SUPABASE_ANON_KEY;
}
