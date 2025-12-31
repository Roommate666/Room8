// ==========================================
// NOTIFICATION HELPER FUNCTIONS - ERWEITERT
// ==========================================
// Alle Funktionen zum Erstellen von Benachrichtigungen

import { supabase } from './supabaseClient.js';

/**
 * BASIS-FUNKTION: Erstelle eine Benachrichtigung
 */
export async function createNotification(userId, type, title, message, link = null, referenceId = null) {
    try {
        const { data, error } = await supabase
            .from('notifications')
            .insert({
                user_id: userId,
                type: type,
                title: title,
                message: message,
                link: link,
                reference_id: referenceId,
                is_read: false
            })
            .select()
            .single();

        if (error) throw error;
        return data;
    } catch (error) {
        console.error('Error creating notification:', error);
        return null;
    }
}

// ==========================================
// 1. CHAT & KOMMUNIKATION
// ==========================================

/**
 * Benachrichtigung: Neue Chat-Nachricht
 */
export async function notifyChatMessage(recipientId, senderName, messagePreview) {
    return await createNotification(
        recipientId,
        'chat_message',
        `💬 Neue Nachricht von ${senderName}`,
        messagePreview.length > 100 ? messagePreview.substring(0, 100) + '...' : messagePreview,
        'nachrichten.html',
        null
    );
}

/**
 * Benachrichtigung: Neue Bewertung erhalten
 */
export async function notifyReview(userId, reviewerName, rating, listingId = null) {
    const stars = '⭐'.repeat(rating);
    return await createNotification(
        userId,
        'review',
        `⭐ Neue Bewertung von ${reviewerName}`,
        `${reviewerName} hat dir ${rating} Sterne gegeben ${stars}`,
        listingId ? `detail.html?id=${listingId}` : 'profile.html',
        listingId
    );
}

// ==========================================
// 2. FAVORITEN
// ==========================================

/**
 * FAVORIT HINZUFÃƒÅ“GEN + Benachrichtigung senden
 * Diese Funktion fÃƒÂ¼gt das Favorit in die DB ein UND sendet die Benachrichtigung
 */
export async function addFavorite(favoritableType, favoritableId) {
    try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error('Nicht eingeloggt');

        // PrÃƒÂ¼fe ob bereits favorisiert
        const { data: existing } = await supabase
            .from('favorites')
            .select('id')
            .eq('user_id', user.id)
            .eq('favoritable_type', favoritableType)
            .eq('favoritable_id', favoritableId)
            .single();

        if (existing) {
            return { success: false, message: 'Bereits favorisiert' };
        }

        // FÃƒÂ¼ge Favorit hinzu (Trigger sendet automatisch Benachrichtigung!)
        const { data, error } = await supabase
            .from('favorites')
            .insert({
                user_id: user.id,
                favoritable_type: favoritableType,
                favoritable_id: favoritableId
            })
            .select()
            .single();

        if (error) throw error;

        return { success: true, data };

    } catch (error) {
        console.error('Error adding favorite:', error);
        return { success: false, error: error.message };
    }
}

/**
 * FAVORIT ENTFERNEN
 */
export async function removeFavorite(favoritableType, favoritableId) {
    try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error('Nicht eingeloggt');

        const { error } = await supabase
            .from('favorites')
            .delete()
            .eq('user_id', user.id)
            .eq('favoritable_type', favoritableType)
            .eq('favoritable_id', favoritableId);

        if (error) throw error;

        return { success: true };

    } catch (error) {
        console.error('Error removing favorite:', error);
        return { success: false, error: error.message };
    }
}

/**
 * PRÃƒÅ“FE OB FAVORISIERT
 */
export async function isFavorited(favoritableType, favoritableId) {
    try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return false;

        const { data, error } = await supabase
            .from('favorites')
            .select('id')
            .eq('user_id', user.id)
            .eq('favoritable_type', favoritableType)
            .eq('favoritable_id', favoritableId)
            .single();

        if (error && error.code !== 'PGRST116') throw error;

        return !!data;

    } catch (error) {
        console.error('Error checking favorite:', error);
        return false;
    }
}

/**
 * HOLE ALLE FAVORITEN EINES USERS
 */
export async function getUserFavorites(favoritableType = null) {
    try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error('Nicht eingeloggt');

        let query = supabase
            .from('favorites')
            .select('*')
            .eq('user_id', user.id)
            .order('created_at', { ascending: false });

        if (favoritableType) {
            query = query.eq('favoritable_type', favoritableType);
        }

        const { data, error } = await query;
        if (error) throw error;

        return data;

    } catch (error) {
        console.error('Error getting favorites:', error);
        return [];
    }
}

// ==========================================
// 3. INTERESSE AN LISTING
// ==========================================

/**
 * INTERESSE ZEIGEN + Benachrichtigung senden
 */
export async function showInterest(listingId, message = null) {
    try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error('Nicht eingeloggt');

        // FÃƒÂ¼ge Interesse hinzu (Trigger sendet automatisch Benachrichtigung!)
        const { data, error } = await supabase
            .from('listing_interests')
            .insert({
                listing_id: listingId,
                interested_user_id: user.id,
                message: message
            })
            .select()
            .single();

        if (error) throw error;

        return { success: true, data };

    } catch (error) {
        console.error('Error showing interest:', error);
        return { success: false, error: error.message };
    }
}

/**
 * HOLE ALLE INTERESSENTEN FÃƒÅ“R EIN LISTING (fÃƒÂ¼r Owner)
 */
export async function getListingInterests(listingId) {
    try {
        const { data, error } = await supabase
            .from('listing_interests')
            .select(`
                *,
                interested_user:profiles!interested_user_id(
                    id,
                    username,
                    avatar_url,
                    city
                )
            `)
            .eq('listing_id', listingId)
            .order('created_at', { ascending: false });

        if (error) throw error;

        return data;

    } catch (error) {
        console.error('Error getting interests:', error);
        return [];
    }
}

// ==========================================
// 4. GESPEICHERTE SUCHEN
// ==========================================

/**
 * GESPEICHERTE SUCHE HINZUFÃœGEN - ERWEITERT
 */
export async function addSavedSearch(searchType, searchQuery, city = null, minPrice = null, maxPrice = null, additionalFilters = {}) {
    try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error('Nicht eingeloggt');

        // Baue das Insert-Objekt mit allen Spalten
        const insertData = {
            user_id: user.id,
            search_type: searchType,
            search_query: searchQuery,
            city: city,
            min_price: minPrice,
            max_price: maxPrice,
            is_active: true
        };

        // FÃ¼ge die neuen Spalten hinzu (falls vorhanden)
        if (additionalFilters && additionalFilters.category) {
            insertData.category = additionalFilters.category;
        }
        if (additionalFilters && additionalFilters.condition) {
            insertData.condition = additionalFilters.condition;
        }
        if (additionalFilters && additionalFilters.room_type) {
            insertData.room_type = additionalFilters.room_type;
        }
        if (additionalFilters && additionalFilters.number_of_rooms) {
            insertData.number_of_rooms = additionalFilters.number_of_rooms;
        }
        if (additionalFilters && additionalFilters.available_from) {
            insertData.available_from = additionalFilters.available_from;
        }
        if (additionalFilters && additionalFilters.available_to) {
            insertData.available_to = additionalFilters.available_to;
        }

        const { data, error } = await supabase
            .from('saved_searches')
            .insert(insertData)
            .select()
            .single();

        if (error) throw error;

        return { success: true, data };

    } catch (error) {
        console.error('Error adding saved search:', error);
        return { success: false, error: error.message };
    }
}

/**
 * GESPEICHERTE SUCHE LÃƒâ€“SCHEN
 */
export async function removeSavedSearch(searchId) {
    try {
        const { error } = await supabase
            .from('saved_searches')
            .delete()
            .eq('id', searchId);

        if (error) throw error;

        return { success: true };

    } catch (error) {
        console.error('Error removing saved search:', error);
        return { success: false, error: error.message };
    }
}

/**
 * HOLE ALLE GESPEICHERTEN SUCHEN
 */
export async function getUserSavedSearches() {
    try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error('Nicht eingeloggt');

        const { data, error } = await supabase
            .from('saved_searches')
            .select('*')
            .eq('user_id', user.id)
            .eq('is_active', true)
            .order('created_at', { ascending: false });

        if (error) throw error;

        return data;

    } catch (error) {
        console.error('Error getting saved searches:', error);
        return [];
    }
}

// ==========================================
// 5. ADMIN BENACHRICHTIGUNGEN
// ==========================================

/**
 * Admin-Nachricht an User senden
 */
export async function notifyAdminMessage(userId, title, message, link = null) {
    return await createNotification(
        userId,
        'admin_message',
        `📢 ${title}`,
        message,
        link,
        null
    );
}

/**
 * Admin-Nachricht an ALLE User senden (z.B. System-Updates)
 */
export async function notifyAllUsers(title, message, link = null) {
    try {
        // Hole alle User IDs
        const { data: users, error } = await supabase
            .from('profiles')
            .select('id');

        if (error) throw error;

        // Erstelle Benachrichtigung fÃƒÂ¼r jeden User
        const notifications = users.map(user => ({
            user_id: user.id,
            type: 'admin_message',
            title: `📢 ${title}`,
            message: message,
            link: link,
            is_read: false
        }));

        const { error: insertError } = await supabase
            .from('notifications')
            .insert(notifications);

        if (insertError) throw insertError;

        return { success: true, count: users.length };

    } catch (error) {
        console.error('Error notifying all users:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Admin-Nachricht an User in bestimmter Stadt
 */
export async function notifyUsersInCity(city, title, message, link = null) {
    try {
        // Hole alle User in der Stadt
        const { data: users, error } = await supabase
            .from('profiles')
            .select('id')
            .ilike('city', city);

        if (error) throw error;

        // Erstelle Benachrichtigung fÃƒÂ¼r jeden User
        const notifications = users.map(user => ({
            user_id: user.id,
            type: 'admin_message',
            title: `📢 ${title}`,
            message: message,
            link: link,
            is_read: false
        }));

        const { error: insertError } = await supabase
            .from('notifications')
            .insert(notifications);

        if (insertError) throw insertError;

        return { success: true, count: users.length };

    } catch (error) {
        console.error('Error notifying users in city:', error);
        return { success: false, error: error.message };
    }
}

// ==========================================
// 6. BENACHRICHTIGUNGS-EINSTELLUNGEN
// ==========================================

/**
 * Benachrichtigungs-Einstellungen aktualisieren
 */
export async function updateNotificationSettings(settings) {
    try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error('Nicht eingeloggt');

        const { error } = await supabase
            .from('profiles')
            .update({ notification_settings: settings })
            .eq('id', user.id);

        if (error) throw error;

        return { success: true };

    } catch (error) {
        console.error('Error updating notification settings:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Hole Benachrichtigungs-Einstellungen
 */
export async function getNotificationSettings() {
    try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error('Nicht eingeloggt');

        const { data, error } = await supabase
            .from('profiles')
            .select('notification_settings')
            .eq('id', user.id)
            .single();

        if (error) throw error;

        return data.notification_settings || {
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
        console.error('Error getting notification settings:', error);
        return null;
    }
}

// ==========================================
// 7. STATISTIKEN
// ==========================================

/**
 * Hole ungelesene Anzahl
 */
export async function getUnreadCount() {
    try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return 0;

        const { count, error } = await supabase
            .from('notifications')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', user.id)
            .eq('is_read', false);

        if (error) throw error;

        return count || 0;

    } catch (error) {
        console.error('Error getting unread count:', error);
        return 0;
    }
}

/**
 * Markiere Benachrichtigung als gelesen
 */
export async function markAsRead(notificationId) {
    try {
        const { error } = await supabase
            .from('notifications')
            .update({ is_read: true })
            .eq('id', notificationId);

        if (error) throw error;

        return { success: true };

    } catch (error) {
        console.error('Error marking as read:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Markiere ALLE als gelesen
 */
export async function markAllAsRead() {
    try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error('Nicht eingeloggt');

        const { error } = await supabase
            .from('notifications')
            .update({ is_read: true })
            .eq('user_id', user.id)
            .eq('is_read', false);

        if (error) throw error;

        return { success: true };

    } catch (error) {
        console.error('Error marking all as read:', error);
        return { success: false, error: error.message };
    }
}

// ==========================================
// EXPORT ALLE FUNKTIONEN
// ==========================================

export default {
    // Basis
    createNotification,
    
    // Chat & Review
    notifyChatMessage,
    notifyReview,
    
    // Favoriten
    addFavorite,
    removeFavorite,
    isFavorited,
    getUserFavorites,
    
    // Interesse
    showInterest,
    getListingInterests,
    
    // Gespeicherte Suchen
    addSavedSearch,
    removeSavedSearch,
    getUserSavedSearches,
    
    // Admin
    notifyAdminMessage,
    notifyAllUsers,
    notifyUsersInCity,
    
    // Einstellungen
    updateNotificationSettings,
    getNotificationSettings,
    
    // Statistiken
    getUnreadCount,
    markAsRead,
    markAllAsRead
};
