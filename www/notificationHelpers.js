// ==========================================
// NOTIFICATION HELPER FUNCTIONS - FIXED FOR ANDROID
// ==========================================
// Enthält ALLE Funktionen, aber ohne 'import/export', damit die App nicht abstürzt.

(function() {
    'use strict';

    // Hilfsfunktion: Supabase sicher holen
    function getSupabase() {
        if (window.supabase && window.supabase.createClient && typeof SUPABASE_URL !== 'undefined') {
            // Falls noch kein Client da ist, erstelle einen temporären
            if (!window.sbClient) {
                window.sbClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
            }
            return window.sbClient;
        }
        // Fallback: Versuchen, den globalen supabase zu finden
        if (typeof supabase !== 'undefined') return supabase;
        return null;
    }

    // Wir hängen alles an window.NotificationHelpers, damit es überall verfügbar ist
    window.NotificationHelpers = {

        /**
         * BASIS-FUNKTION: Erstelle eine Benachrichtigung + sende Push
         */
        createNotification: async function(userId, type, title, message, link, referenceId) {
            var sb = getSupabase();
            if (!sb) return null;

            try {
                var result = await sb
                    .from('notifications')
                    .insert({
                        user_id: userId,
                        type: type,
                        title: title,
                        message: message,
                        link: link || null,
                        reference_id: referenceId || null,
                        is_read: false
                    })
                    .select()
                    .single();

                if (result.error) throw result.error;

                // Push-Benachrichtigung senden (im Hintergrund, ohne auf Antwort zu warten)
                this.sendPushNotification(userId, title, message, link).catch(function(e) {
                    console.log('Push send failed (optional):', e);
                });

                return result.data;
            } catch (error) {
                console.error('Error creating notification:', error);
                return null;
            }
        },

        /**
         * Push-Benachrichtigung via Edge Function senden
         */
        sendPushNotification: async function(userId, title, body, url) {
            var sb = getSupabase();
            if (!sb) return { success: false };

            try {
                var result = await sb.functions.invoke('send-push', {
                    body: {
                        userId: userId,
                        title: title,
                        body: body,
                        data: { url: url || 'notifications.html' }
                    }
                });

                if (result.error) {
                    console.log('Push invoke error:', result.error);
                    return { success: false };
                }

                return result.data || { success: true };
            } catch (error) {
                console.log('Push error:', error);
                return { success: false };
            }
        },

        // ==========================================
        // 1. CHAT & KOMMUNIKATION
        // ==========================================

        notifyChatMessage: async function(recipientId, senderName, messagePreview) {
            var preview = messagePreview.length > 100 ? messagePreview.substring(0, 100) + '...' : messagePreview;
            return await this.createNotification(
                recipientId,
                'chat_message',
                '💬 Neue Nachricht von ' + senderName,
                preview,
                'nachrichten.html',
                null
            );
        },

        notifyReview: async function(userId, reviewerName, rating, listingId) {
            var stars = '';
            for (var i = 0; i < rating; i++) stars += '⭐';
            
            return await this.createNotification(
                userId,
                'review',
                '⭐ Neue Bewertung von ' + reviewerName,
                reviewerName + ' hat dir ' + rating + ' Sterne gegeben ' + stars,
                listingId ? 'detail.html?id=' + listingId : 'profile.html',
                listingId
            );
        },

        // ==========================================
        // 2. FAVORITEN
        // ==========================================

        notifyFavorite: async function(listingOwnerId, faverName, listingTitle, listingId) {
            return await this.createNotification(
                listingOwnerId,
                'favorite',
                '❤️ ' + faverName + ' hat dein Inserat favorisiert',
                '"' + listingTitle + '" wurde zu den Favoriten hinzugefügt',
                listingId ? 'listing-details.html?id=' + listingId : null,
                listingId
            );
        },

        addFavorite: async function(favoritableType, favoritableId) {
            var sb = getSupabase();
            if (!sb) return { success: false, error: 'Supabase not loaded' };

            try {
                var auth = await sb.auth.getUser();
                var user = auth.data.user;
                if (!user) throw new Error('Nicht eingeloggt');

                // Prüfe ob bereits favorisiert
                var check = await sb
                    .from('favorites')
                    .select('id')
                    .eq('user_id', user.id)
                    .eq('favoritable_type', favoritableType)
                    .eq('favoritable_id', favoritableId)
                    .single();

                if (check.data) {
                    return { success: false, message: 'Bereits favorisiert' };
                }

                var res = await sb
                    .from('favorites')
                    .insert({
                        user_id: user.id,
                        favoritable_type: favoritableType,
                        favoritable_id: favoritableId
                    })
                    .select()
                    .single();

                if (res.error) throw res.error;
                return { success: true, data: res.data };

            } catch (error) {
                console.error('Error adding favorite:', error);
                return { success: false, error: error.message };
            }
        },

        removeFavorite: async function(favoritableType, favoritableId) {
            var sb = getSupabase();
            if (!sb) return { success: false };

            try {
                var auth = await sb.auth.getUser();
                var user = auth.data.user;
                if (!user) throw new Error('Nicht eingeloggt');

                var res = await sb
                    .from('favorites')
                    .delete()
                    .eq('user_id', user.id)
                    .eq('favoritable_type', favoritableType)
                    .eq('favoritable_id', favoritableId);

                if (res.error) throw res.error;
                return { success: true };

            } catch (error) {
                console.error('Error removing favorite:', error);
                return { success: false, error: error.message };
            }
        },

        isFavorited: async function(favoritableType, favoritableId) {
            var sb = getSupabase();
            if (!sb) return false;

            try {
                var auth = await sb.auth.getUser();
                var user = auth.data.user;
                if (!user) return false;

                var res = await sb
                    .from('favorites')
                    .select('id')
                    .eq('user_id', user.id)
                    .eq('favoritable_type', favoritableType)
                    .eq('favoritable_id', favoritableId)
                    .single();

                // PGRST116 bedeutet "kein Ergebnis", das ist kein echter Fehler hier
                if (res.error && res.error.code !== 'PGRST116') throw res.error;

                return !!res.data;

            } catch (error) {
                // console.error('Error checking favorite:', error); // Optional loggen
                return false;
            }
        },

        getUserFavorites: async function(favoritableType) {
            var sb = getSupabase();
            if (!sb) return [];

            try {
                var auth = await sb.auth.getUser();
                var user = auth.data.user;
                if (!user) throw new Error('Nicht eingeloggt');

                var query = sb
                    .from('favorites')
                    .select('*')
                    .eq('user_id', user.id)
                    .order('created_at', { ascending: false });

                if (favoritableType) {
                    query = query.eq('favoritable_type', favoritableType);
                }

                var res = await query;
                if (res.error) throw res.error;

                return res.data;

            } catch (error) {
                console.error('Error getting favorites:', error);
                return [];
            }
        },

        // ==========================================
        // 3. INTERESSE AN LISTING
        // ==========================================

        showInterest: async function(listingId, message) {
            var sb = getSupabase();
            if (!sb) return { success: false };

            try {
                var auth = await sb.auth.getUser();
                var user = auth.data.user;
                if (!user) throw new Error('Nicht eingeloggt');

                var res = await sb
                    .from('listing_interests')
                    .insert({
                        listing_id: listingId,
                        interested_user_id: user.id,
                        message: message || null
                    })
                    .select()
                    .single();

                if (res.error) throw res.error;
                return { success: true, data: res.data };

            } catch (error) {
                console.error('Error showing interest:', error);
                return { success: false, error: error.message };
            }
        },

        getListingInterests: async function(listingId) {
            var sb = getSupabase();
            if (!sb) return [];

            try {
                // Supabase Join Syntax anpassen für JS
                var res = await sb
                    .from('listing_interests')
                    .select('*, interested_user:profiles!interested_user_id(id, username, avatar_url, city)')
                    .eq('listing_id', listingId)
                    .order('created_at', { ascending: false });

                if (res.error) throw res.error;
                return res.data;

            } catch (error) {
                console.error('Error getting interests:', error);
                return [];
            }
        },

        // ==========================================
        // 4. GESPEICHERTE SUCHEN
        // ==========================================

        addSavedSearch: async function(searchType, searchQuery, city, minPrice, maxPrice, additionalFilters) {
            var sb = getSupabase();
            if (!sb) return { success: false };

            try {
                var auth = await sb.auth.getUser();
                var user = auth.data.user;
                if (!user) throw new Error('Nicht eingeloggt');

                // search_type und search_query sind NOT NULL
                var insertData = {
                    user_id: user.id,
                    search_type: searchType || 'wohnung',
                    search_query: searchQuery || '',
                    city: city || '',
                    min_price: minPrice || null,
                    max_price: maxPrice || null,
                    is_active: true
                };

                // Filter hinzufügen
                if (additionalFilters) {
                    if (additionalFilters.category) insertData.category = additionalFilters.category;
                    if (additionalFilters.condition) insertData.condition = additionalFilters.condition;
                    if (additionalFilters.room_type) insertData.room_type = additionalFilters.room_type;
                    if (additionalFilters.number_of_rooms) insertData.number_of_rooms = additionalFilters.number_of_rooms;
                    if (additionalFilters.available_from) insertData.available_from = additionalFilters.available_from;
                    if (additionalFilters.available_to) insertData.available_to = additionalFilters.available_to;
                }

                var res = await sb
                    .from('saved_searches')
                    .insert(insertData)
                    .select()
                    .single();

                if (res.error) throw res.error;
                return { success: true, data: res.data };

            } catch (error) {
                console.error('Error adding saved search:', error);
                return { success: false, error: error.message };
            }
        },

        removeSavedSearch: async function(searchId) {
            var sb = getSupabase();
            if (!sb) return { success: false };

            try {
                var res = await sb
                    .from('saved_searches')
                    .delete()
                    .eq('id', searchId);

                if (res.error) throw res.error;
                return { success: true };

            } catch (error) {
                console.error('Error removing saved search:', error);
                return { success: false, error: error.message };
            }
        },

        getUserSavedSearches: async function() {
            var sb = getSupabase();
            if (!sb) return [];

            try {
                var auth = await sb.auth.getUser();
                var user = auth.data.user;
                if (!user) throw new Error('Nicht eingeloggt');

                var res = await sb
                    .from('saved_searches')
                    .select('*')
                    .eq('user_id', user.id)
                    .eq('is_active', true)
                    .order('created_at', { ascending: false });

                if (res.error) throw res.error;
                return res.data;

            } catch (error) {
                console.error('Error getting saved searches:', error);
                return [];
            }
        },

        // ==========================================
        // 5. ADMIN BENACHRICHTIGUNGEN
        // ==========================================

        notifyAdminMessage: async function(userId, title, message, link) {
            return await this.createNotification(
                userId,
                'admin_message',
                '📢 ' + title,
                message,
                link || null,
                null
            );
        },

        notifyAllUsers: async function(title, message, link) {
            var sb = getSupabase();
            if (!sb) return { success: false };

            try {
                var usersRes = await sb.from('profiles').select('id');
                if (usersRes.error) throw usersRes.error;

                var notifications = usersRes.data.map(function(user) {
                    return {
                        user_id: user.id,
                        type: 'admin_message',
                        title: '📢 ' + title,
                        message: message,
                        link: link || null,
                        is_read: false
                    };
                });

                var insRes = await sb.from('notifications').insert(notifications);
                if (insRes.error) throw insRes.error;

                return { success: true, count: usersRes.data.length };

            } catch (error) {
                console.error('Error notifying all users:', error);
                return { success: false, error: error.message };
            }
        },

        notifyUsersInCity: async function(city, title, message, link) {
            var sb = getSupabase();
            if (!sb) return { success: false };

            try {
                var usersRes = await sb
                    .from('profiles')
                    .select('id')
                    .ilike('city', city);

                if (usersRes.error) throw usersRes.error;

                var notifications = usersRes.data.map(function(user) {
                    return {
                        user_id: user.id,
                        type: 'admin_message',
                        title: '📢 ' + title,
                        message: message,
                        link: link || null,
                        is_read: false
                    };
                });

                var insRes = await sb.from('notifications').insert(notifications);
                if (insRes.error) throw insRes.error;

                return { success: true, count: usersRes.data.length };

            } catch (error) {
                console.error('Error notifying users in city:', error);
                return { success: false, error: error.message };
            }
        },

        // ==========================================
        // 6. EINSTELLUNGEN
        // ==========================================

        updateNotificationSettings: async function(settings) {
            var sb = getSupabase();
            if (!sb) return { success: false };

            try {
                var auth = await sb.auth.getUser();
                var user = auth.data.user;
                if (!user) throw new Error('Nicht eingeloggt');

                var res = await sb
                    .from('profiles')
                    .update({ notification_settings: settings })
                    .eq('id', user.id);

                if (res.error) throw res.error;
                return { success: true };

            } catch (error) {
                console.error('Error updating settings:', error);
                return { success: false, error: error.message };
            }
        },

        getNotificationSettings: async function() {
            var sb = getSupabase();
            if (!sb) return null;

            try {
                var auth = await sb.auth.getUser();
                var user = auth.data.user;
                if (!user) throw new Error('Nicht eingeloggt');

                var res = await sb
                    .from('profiles')
                    .select('notification_settings')
                    .eq('id', user.id)
                    .single();

                if (res.error) throw res.error;

                return res.data.notification_settings || {
                    chat_message: true,
                    review: true,
                    favorite: true,
                    interest: true,
                    new_listing_city: true,
                    new_coupon_city: true,
                    new_job_city: true,
                    saved_search_match: true
                };

            } catch (error) {
                console.error('Error getting settings:', error);
                return null;
            }
        },

        // ==========================================
        // 7. STATISTIKEN
        // ==========================================

        getUnreadCount: async function() {
            var sb = getSupabase();
            if (!sb) return 0;

            try {
                var auth = await sb.auth.getUser();
                var user = auth.data.user;
                if (!user) return 0;

                var res = await sb
                    .from('notifications')
                    .select('*', { count: 'exact', head: true })
                    .eq('user_id', user.id)
                    .eq('is_read', false);

                if (res.error) throw res.error;
                return res.count || 0;

            } catch (error) {
                console.error('Error getting unread count:', error);
                return 0;
            }
        },

        markAsRead: async function(notificationId) {
            var sb = getSupabase();
            if (!sb) return { success: false };

            try {
                var res = await sb
                    .from('notifications')
                    .update({ is_read: true })
                    .eq('id', notificationId);

                if (res.error) throw res.error;
                return { success: true };

            } catch (error) {
                console.error('Error marking read:', error);
                return { success: false, error: error.message };
            }
        },

        markAllAsRead: async function() {
            var sb = getSupabase();
            if (!sb) return { success: false };

            try {
                var auth = await sb.auth.getUser();
                var user = auth.data.user;
                if (!user) throw new Error('Nicht eingeloggt');

                var res = await sb
                    .from('notifications')
                    .update({ is_read: true })
                    .eq('user_id', user.id)
                    .eq('is_read', false);

                if (res.error) throw res.error;
                return { success: true };

            } catch (error) {
                console.error('Error marking all read:', error);
                return { success: false, error: error.message };
            }
        }
    };

    console.log('NotificationHelpers (Android Compatible) loaded successfully');
})();