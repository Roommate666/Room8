// ==========================================
// NOTIFICATION BELL COMPONENT
// ==========================================
// Add this to any page to show notification bell with badge

import { supabase } from './supabaseClient.js';

class NotificationBell {
    constructor() {
        this.unreadCount = 0;
        this.realtimeSubscription = null;
        this.init();
    }

    async init() {
        await this.loadUnreadCount();
        this.render();
        this.setupRealtime();
        this.setupClickHandler();
    }

    async loadUnreadCount() {
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;

            const { count, error } = await supabase
                .from('notifications')
                .select('*', { count: 'exact', head: true })
                .eq('user_id', user.id)
                .eq('is_read', false);

            if (error) throw error;

            this.unreadCount = count || 0;
        } catch (error) {
            console.error('Error loading unread count:', error);
        }
    }

    render() {
        // Find or create container
        let container = document.getElementById('notification-bell-container');
        
        if (!container) {
            // Try to find header to add bell to
            const header = document.querySelector('.app-header') || 
                          document.querySelector('.notifications-header') || 
                          document.querySelector('.chat-header') ||
                          document.querySelector('header');
            
            if (header) {
                container = document.createElement('div');
                container.id = 'notification-bell-container';
                container.style.cssText = 'position: relative; margin-left: auto;';
                header.appendChild(container);
            } else {
                // Create fixed position bell in top-right
                container = document.createElement('div');
                container.id = 'notification-bell-container';
                container.style.cssText = 'position: fixed; top: 1rem; right: 1rem; z-index: 1000;';
                document.body.appendChild(container);
            }
        }

        // Inject styles if not already present
        if (!document.getElementById('notification-bell-styles')) {
            const styles = document.createElement('style');
            styles.id = 'notification-bell-styles';
            styles.textContent = `
                .notification-bell {
                    position: relative;
                    cursor: pointer;
                    padding: 0.5rem;
                    border-radius: 50%;
                    background: white;
                    border: none;
                    transition: all 0.2s;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
                }

                .notification-bell:hover {
                    background: #f3f4f6;
                    transform: scale(1.05);
                }

                .notification-bell svg {
                    width: 24px;
                    height: 24px;
                    color: #6b7280;
                }

                .notification-badge {
                    position: absolute;
                    top: 0;
                    right: 0;
                    background: #ef4444;
                    color: white;
                    border-radius: 10px;
                    min-width: 18px;
                    height: 18px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 0.65rem;
                    font-weight: 600;
                    padding: 0 4px;
                    border: 2px solid white;
                    animation: notification-pulse 2s ease-in-out infinite;
                }

                @keyframes notification-pulse {
                    0%, 100% { transform: scale(1); }
                    50% { transform: scale(1.1); }
                }

                .notification-bell.has-notifications svg {
                    color: #3b82f6;
                }
            `;
            document.head.appendChild(styles);
        }

        // Render bell HTML
        const hasNotifications = this.unreadCount > 0;
        container.innerHTML = `
            <button class="notification-bell ${hasNotifications ? 'has-notifications' : ''}" id="notificationBellBtn">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/>
                    <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>
                </svg>
                ${hasNotifications ? `<span class="notification-badge">${this.unreadCount > 99 ? '99+' : this.unreadCount}</span>` : ''}
            </button>
        `;
    }

    setupClickHandler() {
        const btn = document.getElementById('notificationBellBtn');
        if (btn) {
            btn.addEventListener('click', () => {
                window.location.href = 'notifications.html';
            });
        }
    }

    async setupRealtime() {
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;

            this.realtimeSubscription = supabase
                .channel('notification_bell')
                .on('postgres_changes', {
                    event: '*',
                    schema: 'public',
                    table: 'notifications',
                    filter: `user_id=eq.${user.id}`
                }, async (payload) => {
                    await this.loadUnreadCount();
                    this.render();
                    this.setupClickHandler();
                })
                .subscribe();
        } catch (error) {
            console.error('Error setting up realtime:', error);
        }
    }

    updateCount(newCount) {
        this.unreadCount = newCount;
        this.render();
        this.setupClickHandler();
    }

    destroy() {
        if (this.realtimeSubscription) {
            supabase.removeChannel(this.realtimeSubscription);
        }
    }
}

// Auto-initialize with proper delay
document.addEventListener('DOMContentLoaded', () => {
    // Wait for supabase to be ready
    setTimeout(() => {
        try {
            window.notificationBell = new NotificationBell();
            console.log('✅ Notification Bell initialized successfully');
        } catch (error) {
            console.error('❌ Failed to initialize Notification Bell:', error);
        }
    }, 1000);
});

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
    if (window.notificationBell) {
        window.notificationBell.destroy();
    }
});

// Export for use in other scripts
export { NotificationBell };
