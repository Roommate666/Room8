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

        // PRIORITAET: existierender Page-Client wiederverwenden — er traegt
        // die Auth-Session vom angemeldeten User. Sonst entstehen zwei
        // GoTrueClient-Instanzen ("Multiple GoTrueClient instances detected")
        // und unsere RPCs liefen anonym -> "permission denied" beim Melden/Blocken.
        if (window.sb && typeof window.sb.from === 'function') {
            _supabase = window.sb;
            return _supabase;
        }

        // Fallback: eigenen Client bauen (Pages ohne window.sb)
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
            // Tabelle heisst seit Mig 20260504000009 'user_blocks'
            // (vorher 'blocked_users' — die Tabelle gab es nie, Helper war stillschweigend tot)
            var result = await sb
                .from('user_blocks')
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
    // IMAGE OPTIMIZATION
    // ============================================

    /**
     * Liefert eine Supabase Storage URL mit Server-seitiger Bild-Transformation.
     * Reduziert Datenvolumen massiv (Originalbilder oft 3-5 MB -> 30-80 KB).
     *
     * @param {string} bucket - Storage Bucket Name (z.B. 'listing-images')
     * @param {string} path - Pfad im Bucket
     * @param {object} opts - { width, height, quality, resize }
     * @returns {string|null} Optimierte Public URL
     */
    function getOptimizedImageUrl(bucket, path, opts) {
        if (!bucket || !path) return null;
        var sb = getSupabase();
        if (!sb) return null;

        opts = opts || {};
        // DPR-Aware: Auf Retina-Geraeten (iPhone DPR=3) liefern wir N×width Pixel,
        // damit das Browser-Downscaling sauber wird. Cap bei 4x sonst riesige Files.
        var dpr = (typeof window !== 'undefined' && window.devicePixelRatio) ? window.devicePixelRatio : 1;
        var dprCapped = Math.min(Math.max(dpr, 1), 3);
        var baseWidth = opts.width || 400;
        var actualWidth = opts.skipDpr ? baseWidth : Math.round(baseWidth * dprCapped);

        var transform = {
            width: actualWidth,
            quality: opts.quality || 70,
            resize: opts.resize || 'cover'
        };
        if (opts.height) transform.height = opts.skipDpr ? opts.height : Math.round(opts.height * dprCapped);

        try {
            var result = sb.storage.from(bucket).getPublicUrl(path, { transform: transform });
            if (result && result.data && result.data.publicUrl) {
                return result.data.publicUrl;
            }
        } catch (e) {
            // Fallback ohne Transform falls Plan kein Image-Render unterstuetzt
        }

        try {
            var fallback = sb.storage.from(bucket).getPublicUrl(path);
            return fallback && fallback.data ? fallback.data.publicUrl : null;
        } catch (e) {
            return null;
        }
    }

    /**
     * Convenience-Helper fuer Listing-Cards (kleine Vorschau).
     */
    function getCardImageUrl(path) {
        return getOptimizedImageUrl('listing-images', path, { width: 400, height: 300, quality: 70 });
    }

    /**
     * Convenience-Helper fuer Detail-Seiten (groessere Anzeige).
     */
    function getDetailImageUrl(path) {
        return getOptimizedImageUrl('listing-images', path, { width: 900, quality: 80 });
    }

    /**
     * Convenience-Helper fuer Avatare/Profile.
     */
    function getAvatarUrl(bucket, path) {
        return getOptimizedImageUrl(bucket || 'avatars', path, { width: 120, height: 120, quality: 75 });
    }

    /**
     * Komprimiert ein Image-File browser-side bevor es zu Supabase hochgeladen wird.
     * iPhone-Fotos sind typischerweise 3-5 MB und enthalten viel mehr Pixel als
     * fuer eine App noetig. Compress reduziert auf max 1600px Kante + JPEG q80.
     *
     * @param {File} file - Image-File aus <input type="file">
     * @param {object} opts - { maxDim, quality, mimeType }
     * @returns {Promise<File>} Komprimierte File (oder Original falls nicht komprimierbar)
     */
    function compressImage(file, opts) {
        opts = opts || {};
        var maxDim = opts.maxDim || 1600;
        var quality = opts.quality || 0.82;
        var outputMime = opts.mimeType || 'image/jpeg';

        return new Promise(function(resolve) {
            // Nicht-Bilder unveraendert zurueckgeben
            if (!file || !file.type || !file.type.startsWith('image/')) {
                return resolve(file);
            }
            // SVG nicht komprimieren (Vector + XSS-Risiko)
            if (file.type === 'image/svg+xml') {
                return resolve(file);
            }
            // Wenn Datei schon klein genug: nichts tun
            if (file.size < 200 * 1024) {
                return resolve(file);
            }

            var reader = new FileReader();
            reader.onerror = function() { resolve(file); };
            reader.onload = function(e) {
                var img = new Image();
                img.onerror = function() { resolve(file); };
                img.onload = function() {
                    try {
                        var w = img.width;
                        var h = img.height;

                        // Skalieren wenn groesser als maxDim
                        if (w > maxDim || h > maxDim) {
                            if (w > h) {
                                h = Math.round(h * (maxDim / w));
                                w = maxDim;
                            } else {
                                w = Math.round(w * (maxDim / h));
                                h = maxDim;
                            }
                        }

                        var canvas = document.createElement('canvas');
                        canvas.width = w;
                        canvas.height = h;
                        var ctx = canvas.getContext('2d');
                        ctx.fillStyle = '#FFFFFF';
                        ctx.fillRect(0, 0, w, h); // weisser Hintergrund (verhindert PNG-Transparenz-Fehler bei JPEG)
                        ctx.drawImage(img, 0, 0, w, h);

                        canvas.toBlob(function(blob) {
                            if (!blob) { return resolve(file); }
                            // Wenn Compression schlechter macht (selten bei Screenshots): Original nehmen
                            if (blob.size >= file.size) {
                                return resolve(file);
                            }
                            var newName = file.name.replace(/\.[^.]+$/, '') + '.jpg';
                            var compressed = new File([blob], newName, {
                                type: outputMime,
                                lastModified: Date.now()
                            });
                            resolve(compressed);
                        }, outputMime, quality);
                    } catch (err) {
                        console.warn('compressImage error:', err);
                        resolve(file);
                    }
                };
                img.src = e.target.result;
            };
            reader.readAsDataURL(file);
        });
    }

    /**
     * Liefert HTML fuer ein optimiertes Bild mit Lazy Loading + Skeleton.
     * Verhindert Layout-Shift (CLS) durch width/height + aspect-ratio.
     *
     * @param {string} url - Bild-URL (oder null)
     * @param {string} alt - Alt-Text
     * @param {object} opts - { width, height, className, fallback }
     * @returns {string} HTML-String
     */
    function renderImage(url, alt, opts) {
        opts = opts || {};
        var width = opts.width || 400;
        var height = opts.height || 300;
        var className = opts.className || '';
        var fallback = opts.fallback || 'no-image.svg';
        var safeAlt = escapeHtml(alt || '');
        var src = url || fallback;

        return '<img src="' + escapeHtml(src) + '" ' +
               'alt="' + safeAlt + '" ' +
               'width="' + width + '" height="' + height + '" ' +
               'loading="lazy" decoding="async" ' +
               (className ? 'class="' + escapeHtml(className) + '" ' : '') +
               'onerror="this.onerror=null;this.src=\'' + fallback + '\';">';
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
    // TRUST-LAYER (Block + Report)
    // ============================================
    // Backend: Migration 20260504000009 — RPCs block_user / unblock_user /
    // is_blocked_between / report_content. Anti-Trolling Rate-Limit 5/h, 30/d.

    var TRUST_REPORT_REASONS = [
        { key: 'spam',          de: 'Spam / Werbung',                en: 'Spam / Advertising' },
        { key: 'harassment',    de: 'Belaestigung / Hass',           en: 'Harassment / Hate' },
        { key: 'inappropriate', de: 'Anstoessiger Inhalt',           en: 'Inappropriate content' },
        { key: 'fraud',         de: 'Betrug / Scam',                 en: 'Fraud / Scam' },
        { key: 'fake',          de: 'Fake-Profil / Fake-Inserat',    en: 'Fake profile / Fake listing' },
        { key: 'other',         de: 'Sonstiges',                     en: 'Other' }
    ];

    function _trustT(de, en) {
        return getLang() === 'en' ? en : de;
    }

    /**
     * Block a user. Backend bidirectional via is_blocked_between.
     * @param {string} blockedId
     * @param {string} [reason]
     */
    async function blockUser(blockedId, reason) {
        var sb = getSupabase();
        if (!sb) throw new Error('Supabase not initialized');
        var res = await sb.rpc('block_user', {
            p_blocked_id: blockedId,
            p_reason: reason || null
        });
        if (res.error) throw res.error;
        clearBlockedUsersCache();
        return res.data;
    }

    /**
     * Remove a block.
     * @param {string} blockedId
     */
    async function unblockUser(blockedId) {
        var sb = getSupabase();
        if (!sb) throw new Error('Supabase not initialized');
        var res = await sb.rpc('unblock_user', { p_blocked_id: blockedId });
        if (res.error) throw res.error;
        clearBlockedUsersCache();
        return true;
    }

    /**
     * Report content (user/listing/message).
     * @param {string} targetType - 'user' | 'listing' | 'message' | 'job' | 'coupon' | 'event' | 'item'
     * @param {string} targetId
     * @param {string} reasonKey - one of TRUST_REPORT_REASONS.key
     * @param {string} [message] - optional details
     */
    async function reportContent(targetType, targetId, reasonKey, message) {
        var sb = getSupabase();
        if (!sb) throw new Error('Supabase not initialized');
        var res = await sb.rpc('report_content', {
            p_target_type: String(targetType),
            p_target_id: String(targetId),
            p_reason: String(reasonKey || 'other'),
            p_message: message || null
        });
        if (res.error) throw res.error;
        return res.data;
    }

    /**
     * Build a generic centered modal with overlay. Returns {modal, close}.
     * Caller appends content to modal (the inner card).
     */
    function _trustOpenModal() {
        var overlay = document.createElement('div');
        overlay.setAttribute('role', 'dialog');
        overlay.setAttribute('aria-modal', 'true');
        overlay.style.cssText =
            'position:fixed;top:0;right:0;bottom:0;left:0;background:rgba(0,0,0,0.55);z-index:10010;' +
            'display:flex;align-items:center;justify-content:center;padding:16px;' +
            'animation:r8FadeIn .15s ease-out;';

        var card = document.createElement('div');
        card.style.cssText =
            'background:#fff;color:#111;border-radius:14px;max-width:420px;width:100%;' +
            'box-shadow:0 20px 50px rgba(0,0,0,0.25);padding:20px 20px 16px;' +
            'font-family:-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;';
        overlay.appendChild(card);

        function close() {
            if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
            document.removeEventListener('keydown', onKey);
        }
        function onKey(e) { if (e.key === 'Escape') close(); }
        overlay.addEventListener('click', function(e) {
            if (e.target === overlay) close();
        });
        document.addEventListener('keydown', onKey);
        document.body.appendChild(overlay);

        return { modal: card, close: close };
    }

    /**
     * Open Block-confirmation modal. Resolves true if blocked.
     * @param {string} blockedId
     * @param {string} [displayName]
     */
    function confirmAndBlock(blockedId, displayName) {
        return new Promise(function(resolve) {
            var dialog = _trustOpenModal();
            var fallback = _trustT('diesen Nutzer', 'this user');
            var name = (displayName && String(displayName).trim()) || fallback;

            var h = document.createElement('h3');
            h.textContent = _trustT('Nutzer blockieren?', 'Block user?');
            h.style.cssText = 'margin:0 0 8px;font-size:18px;';

            // Name als separater textNode — keine String-Concat ins Markup,
            // damit auch bei spaeterem Refactor auf innerHTML kein XSS entsteht.
            var p = document.createElement('p');
            p.style.cssText = 'margin:0 0 16px;font-size:14px;line-height:1.45;color:#444;';
            var nameSpan = document.createElement('strong');
            nameSpan.textContent = name;
            if (getLang() === 'en') {
                p.appendChild(document.createTextNode('You will no longer see listings, messages or the profile of '));
                p.appendChild(nameSpan);
                p.appendChild(document.createTextNode('. This person will also no longer see yours.'));
            } else {
                p.appendChild(document.createTextNode('Du siehst keine Inserate, Nachrichten oder Profile von '));
                p.appendChild(nameSpan);
                p.appendChild(document.createTextNode(' mehr. Diese Person sieht deine Inserate ebenfalls nicht mehr.'));
            }

            var actions = document.createElement('div');
            actions.style.cssText = 'display:flex;gap:8px;justify-content:flex-end;';

            var cancel = document.createElement('button');
            cancel.type = 'button';
            cancel.textContent = _trustT('Abbrechen', 'Cancel');
            cancel.style.cssText = 'padding:10px 16px;border:1px solid #ddd;background:#fff;border-radius:8px;cursor:pointer;font-size:14px;';
            cancel.onclick = function() { dialog.close(); resolve(false); };

            var confirm = document.createElement('button');
            confirm.type = 'button';
            confirm.textContent = _trustT('Blockieren', 'Block');
            confirm.style.cssText = 'padding:10px 16px;border:none;background:#EF4444;color:#fff;border-radius:8px;cursor:pointer;font-size:14px;font-weight:600;';
            confirm.onclick = async function() {
                confirm.disabled = true;
                confirm.textContent = '...';
                try {
                    await blockUser(blockedId);
                    dialog.close();
                    showToast(_trustT('Nutzer blockiert', 'User blocked'), 'success');
                    resolve(true);
                } catch (e) {
                    confirm.disabled = false;
                    confirm.textContent = _trustT('Blockieren', 'Block');
                    showToast(getErrorMessage(e) || _trustT('Fehler beim Blockieren', 'Block failed'), 'error');
                }
            };

            actions.appendChild(cancel);
            actions.appendChild(confirm);
            dialog.modal.appendChild(h);
            dialog.modal.appendChild(p);
            dialog.modal.appendChild(actions);
        });
    }

    /**
     * Open Report-modal. Resolves true if report submitted.
     * @param {string} targetType
     * @param {string} targetId
     */
    function openReportSheet(targetType, targetId) {
        return new Promise(function(resolve) {
            var dialog = _trustOpenModal();
            var lang = getLang();

            var h = document.createElement('h3');
            h.textContent = _trustT('Inhalt melden', 'Report content');
            h.style.cssText = 'margin:0 0 6px;font-size:18px;';

            var sub = document.createElement('p');
            sub.textContent = _trustT('Bitte waehle einen Grund. Unser Team prueft die Meldung.', 'Please choose a reason. Our team will review the report.');
            sub.style.cssText = 'margin:0 0 14px;font-size:13px;color:#666;line-height:1.45;';

            var radioWrap = document.createElement('div');
            radioWrap.style.cssText = 'display:flex;flex-direction:column;gap:6px;margin-bottom:12px;';
            var selected = null;

            TRUST_REPORT_REASONS.forEach(function(r, i) {
                var label = document.createElement('label');
                label.style.cssText = 'display:flex;align-items:center;gap:10px;padding:8px 10px;border:1px solid #e5e7eb;border-radius:8px;cursor:pointer;font-size:14px;';
                var input = document.createElement('input');
                input.type = 'radio';
                input.name = 'r8-trust-reason';
                input.value = r.key;
                input.style.cssText = 'margin:0;';
                input.onchange = function() {
                    selected = r.key;
                    submit.disabled = false;
                    Array.prototype.forEach.call(radioWrap.querySelectorAll('label'), function(l) {
                        l.style.background = '#fff';
                        l.style.borderColor = '#e5e7eb';
                    });
                    label.style.background = '#EFF6FF';
                    label.style.borderColor = '#3B82F6';
                };
                var span = document.createElement('span');
                span.textContent = lang === 'en' ? r.en : r.de;
                label.appendChild(input);
                label.appendChild(span);
                radioWrap.appendChild(label);
                if (i === 0) input.focus();
            });

            var details = document.createElement('textarea');
            details.placeholder = _trustT('Optional: Details (max. 500 Zeichen)', 'Optional: details (max 500 chars)');
            details.maxLength = 500;
            details.style.cssText = 'width:100%;min-height:70px;padding:8px 10px;border:1px solid #e5e7eb;border-radius:8px;font-size:14px;resize:vertical;font-family:inherit;box-sizing:border-box;margin-bottom:14px;';

            var actions = document.createElement('div');
            actions.style.cssText = 'display:flex;gap:8px;justify-content:flex-end;';

            var cancel = document.createElement('button');
            cancel.type = 'button';
            cancel.textContent = _trustT('Abbrechen', 'Cancel');
            cancel.style.cssText = 'padding:10px 16px;border:1px solid #ddd;background:#fff;border-radius:8px;cursor:pointer;font-size:14px;';
            cancel.onclick = function() { dialog.close(); resolve(false); };

            var submit = document.createElement('button');
            submit.type = 'button';
            submit.disabled = true;
            submit.textContent = _trustT('Senden', 'Submit');
            submit.style.cssText = 'padding:10px 16px;border:none;background:#3B82F6;color:#fff;border-radius:8px;cursor:pointer;font-size:14px;font-weight:600;';
            submit.onclick = async function() {
                if (!selected) return;
                submit.disabled = true;
                submit.textContent = '...';
                try {
                    await reportContent(targetType, targetId, selected, details.value);
                    dialog.close();
                    showToast(_trustT('Meldung gesendet — Danke!', 'Report submitted — thanks!'), 'success');
                    resolve(true);
                } catch (e) {
                    submit.disabled = false;
                    submit.textContent = _trustT('Senden', 'Submit');
                    showToast(getErrorMessage(e) || _trustT('Fehler beim Senden', 'Submit failed'), 'error');
                }
            };

            actions.appendChild(cancel);
            actions.appendChild(submit);
            dialog.modal.appendChild(h);
            dialog.modal.appendChild(sub);
            dialog.modal.appendChild(radioWrap);
            dialog.modal.appendChild(details);
            dialog.modal.appendChild(actions);
        });
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

        // Trust-Layer (Block + Report)
        trust: {
            block: blockUser,
            unblock: unblockUser,
            confirmAndBlock: confirmAndBlock,
            report: reportContent,
            openReportSheet: openReportSheet,
            REPORT_REASONS: TRUST_REPORT_REASONS
        },

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

        // Image optimization
        getOptimizedImageUrl: getOptimizedImageUrl,
        getCardImageUrl: getCardImageUrl,
        getDetailImageUrl: getDetailImageUrl,
        getAvatarUrl: getAvatarUrl,
        renderImage: renderImage,
        compressImage: compressImage,

        // Storage
        getLang: getLang,
        setLang: setLang
    };
})();

// Make available globally
window.Room8 = Room8;
