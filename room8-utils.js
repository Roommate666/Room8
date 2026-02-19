/**
 * Room8 Shared Utilities
 * Zentrale Funktionen für Sicherheit, Auth und wiederverwendbare Logik
 */

var Room8 = (function() {
    'use strict';

    // ============================================
    // SECURITY UTILITIES
    // ============================================

    /**
     * Escapes HTML to prevent XSS attacks
     * @param {string} text - The text to escape
     * @returns {string} - Escaped HTML-safe string
     */
    function escapeHtml(text) {
        if (text === null || text === undefined) return '';
        var str = String(text);
        var map = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#039;',
            '/': '&#x2F;',
            '`': '&#x60;',
            '=': '&#x3D;'
        };
        return str.replace(/[&<>"'`=\/]/g, function(s) {
            return map[s];
        });
    }

    /**
     * Sanitizes a URL to prevent javascript: and data: attacks
     * @param {string} url - The URL to sanitize
     * @returns {string} - Safe URL or empty string
     */
    function sanitizeUrl(url) {
        if (!url) return '';
        var str = String(url).trim().toLowerCase();
        if (str.startsWith('javascript:') || str.startsWith('data:') || str.startsWith('vbscript:')) {
            return '';
        }
        return url;
    }

    /**
     * Creates safe HTML element with text content (not innerHTML)
     * @param {string} tag - HTML tag name
     * @param {string} text - Text content
     * @param {object} attrs - Optional attributes
     * @returns {HTMLElement}
     */
    function createElement(tag, text, attrs) {
        var el = document.createElement(tag);
        if (text) el.textContent = text;
        if (attrs) {
            Object.keys(attrs).forEach(function(key) {
                if (key === 'className') {
                    el.className = attrs[key];
                } else if (key === 'style' && typeof attrs[key] === 'object') {
                    Object.assign(el.style, attrs[key]);
                } else if (key.startsWith('data-')) {
                    el.setAttribute(key, attrs[key]);
                } else {
                    el[key] = attrs[key];
                }
            });
        }
        return el;
    }

    // ============================================
    // SUPABASE INITIALIZATION
    // ============================================

    var _supabase = null;

    /**
     * Get or initialize Supabase client
     * @returns {object|null} Supabase client
     */
    function getSupabase() {
        if (_supabase) return _supabase;

        // Check for global config
        var url = (typeof SUPABASE_URL !== 'undefined') ? SUPABASE_URL : 'https://tvnvmogaqmduzcycmvby.supabase.co';
        var key = (typeof SUPABASE_ANON_KEY !== 'undefined') ? SUPABASE_ANON_KEY : 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR2bnZtb2dhcW1kdXpjeWNtdmJ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ5NTA4MTksImV4cCI6MjA3MDUyNjgxOX0.MuLv9AdclVZZYZpUFv6Bc2Jn1Z9cmmcarHwBHlHkvZw';

        if (typeof window.supabase !== 'undefined' && window.supabase.createClient) {
            _supabase = window.supabase.createClient(url, key);
        }
        return _supabase;
    }

    // ============================================
    // AUTH UTILITIES
    // ============================================

    /**
     * Get current authenticated user
     * @returns {Promise<object|null>} User object or null
     */
    async function getCurrentUser() {
        var sb = getSupabase();
        if (!sb) return null;

        try {
            var result = await sb.auth.getUser();
            return result.data.user || null;
        } catch (e) {
            console.error('Auth error:', e);
            return null;
        }
    }

    /**
     * Require authentication - redirects to login if not authenticated
     * @param {string} redirectUrl - URL to redirect to after login
     * @returns {Promise<object|null>} User object or null (after redirect)
     */
    async function requireAuth(redirectUrl) {
        var user = await getCurrentUser();
        if (!user) {
            var returnUrl = redirectUrl || window.location.href;
            window.location.href = 'login.html?redirect=' + encodeURIComponent(returnUrl);
            return null;
        }
        return user;
    }

    /**
     * Check if user is admin
     * @param {string} userId - User ID to check
     * @returns {Promise<boolean>}
     */
    async function isAdmin(userId) {
        var sb = getSupabase();
        if (!sb || !userId) return false;

        try {
            var result = await sb
                .from('profiles')
                .select('is_admin')
                .eq('id', userId)
                .single();
            return result.data?.is_admin === true;
        } catch (e) {
            return false;
        }
    }

    // ============================================
    // BLOCKED USERS
    // ============================================

    var _blockedUserIds = null;

    /**
     * Load blocked user IDs for current user
     * @returns {Promise<string[]>} Array of blocked user IDs
     */
    async function loadBlockedUsers() {
        if (_blockedUserIds !== null) return _blockedUserIds;

        var user = await getCurrentUser();
        if (!user) {
            _blockedUserIds = [];
            return _blockedUserIds;
        }

        var sb = getSupabase();
        try {
            var result = await sb
                .from('blocked_users')
                .select('blocked_id')
                .eq('blocker_id', user.id);

            _blockedUserIds = result.data ? result.data.map(function(b) { return b.blocked_id; }) : [];
        } catch (e) {
            console.error('Error loading blocked users:', e);
            _blockedUserIds = [];
        }
        return _blockedUserIds;
    }

    /**
     * Clear blocked users cache (call after blocking/unblocking)
     */
    function clearBlockedUsersCache() {
        _blockedUserIds = null;
    }

    /**
     * Check if a user is blocked
     * @param {string} userId - User ID to check
     * @returns {Promise<boolean>}
     */
    async function isUserBlocked(userId) {
        var blocked = await loadBlockedUsers();
        return blocked.includes(userId);
    }

    /**
     * Filter array to exclude items from blocked users
     * @param {Array} items - Array of items with owner_id property
     * @returns {Promise<Array>} Filtered array
     */
    async function filterBlockedUsers(items) {
        var blocked = await loadBlockedUsers();
        if (blocked.length === 0) return items;

        return items.filter(function(item) {
            var ownerId = item.owner_id || item.user_id || item.sender_id;
            return !blocked.includes(ownerId);
        });
    }

    // ============================================
    // FORMATTING UTILITIES
    // ============================================

    /**
     * Format price with currency
     * @param {number} price - Price value
     * @param {string} currency - Currency code (default: EUR)
     * @returns {string} Formatted price
     */
    function formatPrice(price, currency) {
        if (price === null || price === undefined) return '';
        currency = currency || 'EUR';

        try {
            return new Intl.NumberFormat('de-DE', {
                style: 'currency',
                currency: currency
            }).format(price);
        } catch (e) {
            return price + ' ' + currency;
        }
    }

    /**
     * Format date relative or absolute
     * @param {string|Date} date - Date to format
     * @param {boolean} relative - Use relative format (default: false)
     * @returns {string} Formatted date
     */
    function formatDate(date, relative) {
        if (!date) return '';

        var d = date instanceof Date ? date : new Date(date);
        if (isNaN(d.getTime())) return '';

        if (relative) {
            var now = new Date();
            var diff = now - d;
            var seconds = Math.floor(diff / 1000);
            var minutes = Math.floor(seconds / 60);
            var hours = Math.floor(minutes / 60);
            var days = Math.floor(hours / 24);

            var lang = localStorage.getItem('room8_language') || 'de';

            if (days > 7) {
                return d.toLocaleDateString(lang === 'de' ? 'de-DE' : 'en-US');
            } else if (days > 0) {
                return lang === 'de' ? 'vor ' + days + ' Tag' + (days > 1 ? 'en' : '') : days + ' day' + (days > 1 ? 's' : '') + ' ago';
            } else if (hours > 0) {
                return lang === 'de' ? 'vor ' + hours + ' Stunde' + (hours > 1 ? 'n' : '') : hours + ' hour' + (hours > 1 ? 's' : '') + ' ago';
            } else if (minutes > 0) {
                return lang === 'de' ? 'vor ' + minutes + ' Minute' + (minutes > 1 ? 'n' : '') : minutes + ' minute' + (minutes > 1 ? 's' : '') + ' ago';
            } else {
                return lang === 'de' ? 'gerade eben' : 'just now';
            }
        }

        return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
    }

    /**
     * Truncate text with ellipsis
     * @param {string} text - Text to truncate
     * @param {number} maxLength - Maximum length
     * @returns {string} Truncated text
     */
    function truncate(text, maxLength) {
        if (!text) return '';
        maxLength = maxLength || 100;
        if (text.length <= maxLength) return text;
        return text.substring(0, maxLength - 3) + '...';
    }

    // ============================================
    // NAVIGATION UTILITIES
    // ============================================

    /**
     * Safe navigation (handles preview mode)
     * @param {string} url - URL to navigate to
     */
    function navigateTo(url) {
        try {
            window.location.href = url;
        } catch (e) {
            console.warn('Navigation error:', e);
        }
    }

    /**
     * Get URL parameter value
     * @param {string} name - Parameter name
     * @returns {string|null} Parameter value
     */
    function getUrlParam(name) {
        var params = new URLSearchParams(window.location.search);
        return params.get(name);
    }

    // ============================================
    // ERROR HANDLING
    // ============================================

    /**
     * Get user-friendly error message
     * @param {Error|object} error - Error object
     * @param {string} lang - Language code (default: from localStorage)
     * @returns {string} User-friendly error message
     */
    function getErrorMessage(error, lang) {
        lang = lang || localStorage.getItem('room8_language') || 'de';

        var messages = {
            de: {
                network: 'Netzwerkfehler. Bitte überprüfe deine Internetverbindung.',
                auth: 'Bitte melde dich erneut an.',
                permission: 'Du hast keine Berechtigung für diese Aktion.',
                notFound: 'Der angeforderte Inhalt wurde nicht gefunden.',
                default: 'Ein Fehler ist aufgetreten. Bitte versuche es später erneut.'
            },
            en: {
                network: 'Network error. Please check your internet connection.',
                auth: 'Please log in again.',
                permission: 'You do not have permission for this action.',
                notFound: 'The requested content was not found.',
                default: 'An error occurred. Please try again later.'
            }
        };

        var m = messages[lang] || messages.de;

        // Analyze error type
        if (error && error.message) {
            var msg = error.message.toLowerCase();
            if (msg.includes('network') || msg.includes('fetch')) return m.network;
            if (msg.includes('auth') || msg.includes('jwt') || msg.includes('token')) return m.auth;
            if (msg.includes('permission') || msg.includes('policy')) return m.permission;
            if (msg.includes('not found') || msg.includes('404')) return m.notFound;
        }

        // Log actual error for debugging (not shown to user)
        console.error('Error details:', error);

        return m.default;
    }

    /**
     * Show toast notification
     * @param {string} message - Message to show
     * @param {string} type - Type: 'success', 'error', 'info' (default: 'info')
     * @param {number} duration - Duration in ms (default: 3000)
     */
    function showToast(message, type, duration) {
        type = type || 'info';
        duration = duration || 3000;

        // Remove existing toast
        var existing = document.getElementById('room8-toast');
        if (existing) existing.remove();

        // Create toast
        var toast = document.createElement('div');
        toast.id = 'room8-toast';
        toast.textContent = message;
        toast.style.cssText =
            'position: fixed; bottom: 100px; left: 50%; transform: translateX(-50%); ' +
            'padding: 12px 24px; border-radius: 8px; font-size: 14px; z-index: 10000; ' +
            'box-shadow: 0 4px 12px rgba(0,0,0,0.15); transition: opacity 0.3s; ' +
            'max-width: 90%; text-align: center;';

        if (type === 'success') {
            toast.style.background = '#10B981';
            toast.style.color = 'white';
        } else if (type === 'error') {
            toast.style.background = '#EF4444';
            toast.style.color = 'white';
        } else {
            toast.style.background = '#3B82F6';
            toast.style.color = 'white';
        }

        document.body.appendChild(toast);

        // Auto-remove
        setTimeout(function() {
            toast.style.opacity = '0';
            setTimeout(function() {
                toast.remove();
            }, 300);
        }, duration);
    }

    // ============================================
    // STORAGE UTILITIES
    // ============================================

    /**
     * Get language setting
     * @returns {string} Language code ('de' or 'en')
     */
    function getLang() {
        return localStorage.getItem('room8_language') || 'de';
    }

    /**
     * Set language
     * @param {string} lang - Language code
     */
    function setLang(lang) {
        if (lang === 'de' || lang === 'en') {
            localStorage.setItem('room8_language', lang);
        }
    }

    // ============================================
    // PUBLIC API
    // ============================================

    return {
        // Security
        escapeHtml: escapeHtml,
        sanitizeUrl: sanitizeUrl,
        createElement: createElement,

        // Supabase
        getSupabase: getSupabase,

        // Auth
        getCurrentUser: getCurrentUser,
        requireAuth: requireAuth,
        isAdmin: isAdmin,

        // Blocked users
        loadBlockedUsers: loadBlockedUsers,
        clearBlockedUsersCache: clearBlockedUsersCache,
        isUserBlocked: isUserBlocked,
        filterBlockedUsers: filterBlockedUsers,

        // Formatting
        formatPrice: formatPrice,
        formatDate: formatDate,
        truncate: truncate,

        // Navigation
        navigateTo: navigateTo,
        getUrlParam: getUrlParam,

        // Error handling
        getErrorMessage: getErrorMessage,
        showToast: showToast,

        // Storage
        getLang: getLang,
        setLang: setLang
    };
})();

// Make available globally
window.Room8 = Room8;
