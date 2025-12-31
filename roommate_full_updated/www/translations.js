// translations.js - Sprachunterstützung für Room8

const translations = {
    de: {
        // Navigation
        nav_home: 'Startseite',
        nav_listings: 'Wohnungen',
        nav_marketplace: 'Marktplatz',
        nav_jobs: 'Jobs',
        nav_messages: 'Nachrichten',
        nav_profile: 'Profil',
        nav_login: 'Anmelden',
        nav_register: 'Registrieren',
        nav_logout: 'Abmelden',
        
        // Homepage
        hero_title: 'Dein Campus. Dein Deal.',
        hero_subtitle: 'Die exklusive Plattform von Studenten, für Studenten. Finde deine nächste WG oder verkaufe gebrauchte Sachen an deine Kommilitonen - ohne Stress.',
        hero_search_placeholder: 'Stadt oder Uni suchen...',
        hero_btn_search: 'Suchen',
        hero_btn_listings: 'Wohnungen ansehen',
        hero_btn_post: 'Anzeige aufgeben',
        
        // Listings
        listings_title: 'Wohnungen & WG-Zimmer',
        listings_search_placeholder: 'Suche nach Stadt oder Titel...',
        listings_filter_city: 'Stadt',
        listings_filter_price: 'Preis',
        listings_filter_type: 'Typ',
        listings_filter_all: 'Alle',
        listings_filter_mode: 'Modus',
        listings_filter_offers: 'Angebote',
        listings_filter_searches: 'Gesuche',
        listings_filter_swaps: 'Tausch',
        listings_filter_sort: 'Sortieren & Filtern',
        listings_sort_low: 'Preis: Niedrig zu Hoch',
        listings_sort_high: 'Preis: Hoch zu Niedrig',
        listings_no_results: 'Keine Ergebnisse gefunden',
        listings_no_results_hint: 'Versuche deine Filter oder Suchanfrage anzupassen.',
        listings_per_month: '€/Monat',
        listings_rooms: 'Zimmer',
        listings_sqm: 'm²',
        listings_available_from: 'Verfügbar ab',
        listings_contact: 'Kontaktieren',
        listings_save: 'Speichern',
        listings_saved: 'Gespeichert',
        listings_report: 'Melden',
        listings_price_request: 'Preis auf Anfrage',
        listings_budget: 'Budget',
        listings_login_favorites: 'Bitte anmelden um Favoriten zu speichern!',
        
        // Marketplace
        marketplace_title: 'Marktplatz',
        marketplace_subtitle: 'Kaufe und verkaufe Gegenstände',
        marketplace_btn_sell: 'Verkaufen',
        marketplace_search_placeholder: 'Artikel suchen...',
        marketplace_loading: 'Lädt Artikel...',
        marketplace_filter_category: 'Kategorie',
        marketplace_filter_category_sort: 'Kategorie & Sortieren',
        marketplace_cat_furniture: 'Möbel & Wohnen',
        marketplace_cat_electronics: 'Elektronik & Technik',
        marketplace_cat_books: 'Bücher & Studium',
        marketplace_cat_clothing: 'Kleidung & Mode',
        marketplace_cat_kitchen: 'Küche & Geräte',
        marketplace_cat_sports: 'Sport & Outdoor',
        marketplace_cat_bikes: 'Fahrräder & Transport',
        marketplace_cat_music: 'Musik & Instrumente',
        marketplace_cat_others: 'Sonstiges',
        marketplace_categories: {
            all: 'Alle Kategorien',
            furniture: 'Möbel',
            electronics: 'Elektronik',
            books: 'Bücher',
            clothing: 'Kleidung',
            kitchen: 'Küche',
            sports: 'Sport',
            other: 'Sonstiges'
        },
        marketplace_price_free: 'Gratis',
        marketplace_price_negotiable: 'VB',
        marketplace_no_items: 'Keine Artikel gefunden',
        marketplace_no_items_hint: 'Versuche deine Filter oder Suchanfrage anzupassen.',
        
        // Jobs
        jobs_title: 'Studentenjobs',
        jobs_header: '💼 Jobs & Karriere',
        jobs_subtitle: 'Finde flexible Jobs neben dem Studium',
        jobs_marketing_title: '🎯 Erreichen Sie qualifizierte Studenten!',
        jobs_marketing_subtitle: 'Präsentieren Sie Ihre Job-Angebote direkt in unserer aktiven Campus-Community.',
        jobs_marketing_demo: 'So könnte Ihre Anzeige aussehen:',
        jobs_current_listings: '📋 Aktuelle Stellenangebote',
        jobs_no_listings: 'Keine aktiven Stellenangebote',
        jobs_no_listings_hint: 'Bald finden Sie hier spannende Job-Angebote von verifizierten Unternehmen!',
        jobs_filter_type: 'Job-Typ',
        jobs_types: {
            all: 'Alle',
            fulltime: 'Vollzeit',
            parttime: 'Teilzeit',
            minijob: 'Minijob',
            internship: 'Praktikum',
            freelance: 'Freelance'
        },
        jobs_apply: 'Bewerben',
        jobs_salary: 'Gehalt',
        jobs_location: 'Standort',
        jobs_posted: 'Veröffentlicht',
        
        // Messages
        messages_title: 'Nachrichten',
        messages_search_placeholder: 'Nachrichten suchen...',
        messages_loading: 'Lade Nachrichten...',
        messages_no_conversations: 'Noch keine Nachrichten',
        messages_no_conversations_hint: 'Starte einen Chat mit Verkäufern um deine Konversationen hier zu sehen!',
        messages_browse_marketplace: 'Marktplatz durchsuchen',
        messages_error_loading: 'Fehler beim Laden der Nachrichten',
        messages_unknown_user: 'Unbekannter Nutzer',
        messages_unknown_listing: 'Unbekanntes Inserat',
        messages_placeholder: 'Nachricht schreiben...',
        messages_send: 'Senden',
        messages_online: 'Online',
        messages_offline: 'Offline',
        
        // Profile
        profile_title: 'Mein Profil',
        profile_new_listing: '+ Neues Inserat',
        profile_settings: 'Einstellungen',
        profile_edit: 'Profil bearbeiten',
        profile_public: 'Öffentliches Profil',
        profile_verified: 'Verifiziert',
        profile_student: 'Student',
        profile_member_since: 'Mitglied seit',
        profile_listings: 'Meine Anzeigen',
        profile_favorites: 'Meine Favoriten',
        profile_favorites_desc: 'Gespeicherte Inserate ansehen',
        profile_my_listings: 'Meine Inserate',
        profile_new_features: 'Hey! Wir haben neue Features!',
        profile_new_features_desc: 'Damit du nichts mehr verpasst, haben wir coole neue Funktionen hinzugefügt:',
        profile_feature_1: '🔔 Benachrichtigungen nach deinen Wünschen anpassen',
        profile_feature_2: '🔍 Suchen speichern und automatisch Alerts bekommen',
        profile_feature_3: '📍 Updates für neue Inserate in deiner Stadt',
        profile_setup_now: 'Jetzt einrichten',
        profile_save_search: 'Suche speichern',
        profile_no_listings: 'Noch keine Inserate',
        profile_no_listings_desc: 'Erstelle dein erstes Inserat und beginne mit dem Vermieten oder Verkaufen!',
        profile_create_first: '+ Erstes Inserat erstellen',
        profile_hello: 'Hallo',
        
        // Auth
        auth_login_title: 'Willkommen zurück',
        auth_register_title: 'Registrieren',
        auth_email: 'E-Mail',
        auth_email_placeholder: 'E-Mail eingeben',
        auth_password: 'Passwort',
        auth_password_placeholder: 'Passwort eingeben',
        auth_confirm_password: 'Passwort bestätigen',
        auth_username: 'Benutzername',
        auth_btn_login: 'Anmelden',
        auth_btn_register: 'Registrieren',
        auth_forgot_password: 'Passwort vergessen?',
        auth_no_account: 'Noch kein Konto?',
        auth_signup_link: 'Registrieren',
        auth_have_account: 'Bereits ein Konto?',
        auth_login_link: 'Anmelden',
        
        // Register
        register_join: 'Tritt Room8 bei',
        register_subtitle: 'Erstelle dein Konto um auf den Studenten-Marktplatz zuzugreifen',
        register_username_placeholder: 'Wähle einen Benutzernamen',
        register_email_label: 'E-Mail-Adresse',
        register_email_placeholder: 'deine.email@beispiel.de',
        register_email_hint: 'Du kannst jede E-Mail-Adresse verwenden',
        register_password_label: 'Passwort (min. 6 Zeichen)',
        register_password_placeholder: 'Wähle ein starkes Passwort',
        register_password_confirm_placeholder: 'Passwort wiederholen',
        register_btn_create: 'Konto erstellen',
        
        // Forms
        form_title: 'Titel',
        form_description: 'Beschreibung',
        form_price: 'Preis',
        form_city: 'Stadt',
        form_address: 'Adresse',
        form_photos: 'Fotos',
        form_upload: 'Hochladen',
        form_submit: 'Absenden',
        form_cancel: 'Abbrechen',
        form_save: 'Speichern',
        form_delete: 'Löschen',
        form_required: 'Pflichtfeld',
        
        // General
        general_loading: 'Lädt...',
        general_error: 'Fehler',
        general_success: 'Erfolg',
        general_confirm: 'Bestätigen',
        general_yes: 'Ja',
        general_no: 'Nein',
        general_back: 'Zurück',
        general_next: 'Weiter',
        general_close: 'Schließen',
        general_more: 'Mehr',
        general_less: 'Weniger',
        general_all: 'Alle',
        general_none: 'Keine',
        general_search: 'Suchen',
        general_filter: 'Filtern',
        general_sort: 'Sortieren',
        general_share: 'Teilen',
        
        // Settings
        settings_title: 'Einstellungen',
        settings_language_section: 'Sprache',
        settings_language: 'Sprache wählen',
        settings_language_desc: 'Wähle deine bevorzugte Sprache',
        settings_profile_section: 'Profil & Account',
        settings_edit_profile: 'Profil bearbeiten',
        settings_edit_profile_desc: 'Name, Stadt, Uni, Interessen',
        settings_notifications_section: 'Benachrichtigungen',
        settings_notification_settings: 'Benachrichtigungs-Einstellungen',
        settings_notification_settings_desc: 'Verwalte deine Benachrichtigungen',
        settings_saved_searches: 'Gespeicherte Suchen',
        settings_saved_searches_desc: 'Benachrichtigungen für passende Inserate',
        settings_all_notifications: 'Alle Benachrichtigungen',
        settings_all_notifications_desc: 'Übersicht aller Benachrichtigungen',
        settings_content_section: 'Meine Inhalte',
        settings_my_favorites: 'Meine Favoriten',
        settings_my_favorites_desc: 'Gespeicherte Wohnungen, Gegenstände & Jobs',
        settings_my_listings: 'Meine Inserate',
        settings_my_listings_desc: 'Verwalte deine Anzeigen',
        settings_privacy_section: 'Datenschutz & Sicherheit',
        settings_privacy: 'Datenschutz',
        settings_privacy_desc: 'Datenschutzerklärung',
        settings_imprint: 'Impressum',
        settings_imprint_desc: 'Rechtliche Informationen',
        settings_logout: 'Ausloggen',
        settings_logout_confirm: 'Möchtest du dich wirklich ausloggen?',
        
        // Favorites
        favorites_title: 'Meine Favoriten',
        favorites_saved_items: 'Gespeicherte Artikel',
        favorites_subtitle: 'Deine Favoriten an einem Ort',
        favorites_tab_housing: 'Wohnungen',
        favorites_tab_marketplace: 'Marktplatz',
        favorites_loading: 'Lade Favoriten...',
        favorites_no_favorites: 'Noch keine Favoriten',
        favorites_browse_housing: 'Wohnungen durchsuchen',
        favorites_browse_marketplace: 'Marktplatz durchsuchen',
        
        // Detail Page
        detail_loading: 'Lade Details...',
        detail_contact_seller: 'Verkäufer kontaktieren',
        detail_contact_owner: 'Eigentümer kontaktieren',
        detail_login_to_contact: 'Anmelden um Kontakt aufzunehmen',
        detail_report_title: 'Inserat melden',
        detail_report_reason: 'Grund der Meldung',
        detail_report_spam: 'Spam',
        detail_report_spam_desc: 'Unerwünschte Werbung oder wiederholte Inhalte',
        detail_report_inappropriate: 'Unangemessener Inhalt',
        detail_report_inappropriate_desc: 'Anstößige oder unpassende Inhalte',
        detail_report_fake: 'Fake/Betrug',
        detail_report_fake_desc: 'Gefälschtes Inserat oder Betrugsversuch',
        detail_report_scam: 'Betrügerische Absicht',
        detail_report_scam_desc: 'Verdacht auf Betrug oder Abzocke',
        detail_report_other: 'Anderes',
        detail_report_other_desc: 'Sonstiger Grund',
        detail_report_description: 'Zusätzliche Informationen (optional)',
        detail_report_description_placeholder: 'Beschreibe das Problem genauer...',
        detail_report_submit: 'Meldung absenden',
        detail_report_sending: 'Wird gesendet...',
        detail_report_success: 'Vielen Dank für deine Meldung! Wir werden sie prüfen.',
        detail_report_duplicate: 'Du hast dieses Inserat bereits gemeldet.',
        detail_report_error: 'Fehler beim Senden der Meldung',
        detail_seller: 'Anbieter',
        detail_description: 'Beschreibung',
        detail_location: 'Standort',
        detail_category: 'Kategorie',
        detail_posted: 'Eingestellt',
        detail_available_from: 'Verfügbar ab',
        detail_rooms: 'Zimmer',
        detail_size: 'Größe',
        detail_price: 'Preis',
        detail_rent: 'Miete',
        detail_per_month: '/Monat',
        
        // Chat
        chat_title: 'Chat',
        chat_review: '⭐ Bewertung',
        chat_placeholder: 'Nachricht eingeben...',
        chat_send: 'Senden',
        chat_with: 'Chat mit',
        chat_verify_title: '🎓 Verifiziere deinen Studentenstatus um Nachrichten zu senden',
        chat_verify_desc: 'Du musst deinen Studentenstatus verifizieren bevor du mit anderen chatten kannst.',
        chat_verify_now: 'Jetzt verifizieren →',
        chat_verify_placeholder: 'Verifiziere deinen Studentenstatus um Nachrichten zu senden',
        chat_error_sending: 'Fehler beim Senden der Nachricht',
        
        // Edit Profile
        edit_profile_title: 'Profil bearbeiten',
        edit_profile_change_photo: 'Klicke, um Bild zu ändern',
        edit_profile_basic_info: '📋 Basis-Informationen',
        edit_profile_username: 'Benutzername *',
        edit_profile_username_placeholder: 'Dein Benutzername',
        edit_profile_fullname: 'Vollständiger Name',
        edit_profile_fullname_placeholder: 'z.B. Max Mustermann',
        edit_profile_city: 'Stadt',
        edit_profile_city_placeholder: 'z.B. Berlin',
        edit_profile_age: 'Alter',
        edit_profile_age_placeholder: 'z.B. 22',
        edit_profile_studies: '🎓 Studium',
        edit_profile_university: 'Universität',
        edit_profile_university_placeholder: 'z.B. TU Berlin',
        edit_profile_field: 'Studienfach',
        edit_profile_field_placeholder: 'z.B. Informatik',
        edit_profile_semester: 'Semester',
        edit_profile_select: 'Bitte wählen',
        edit_profile_about: '💬 Über mich',
        edit_profile_bio: 'Biografie',
        edit_profile_bio_placeholder: 'Erzähl etwas über dich...',
        edit_profile_languages: 'Sprachen',
        edit_profile_languages_placeholder: 'z.B. Deutsch, Englisch, Spanisch',
        edit_profile_languages_hint: 'Mehrere Sprachen mit Komma trennen',
        edit_profile_interests: 'Interessen & Hobbys',
        edit_profile_interests_placeholder: 'z.B. Fitness, Kochen, Reisen, Gaming...',
        edit_profile_save: 'Änderungen speichern',
        edit_profile_saving: 'Speichere...',
        edit_profile_success: '✓ Profil erfolgreich aktualisiert!',
        edit_profile_verification_title: '🎓 Studenten-Verifizierung',
        edit_profile_status: 'Status:',
        edit_profile_checking: 'Überprüfe Verifizierungsstatus...',
        edit_profile_verify_btn: 'Jetzt verifizieren →',
        edit_profile_verified: '✓ Verifiziert',
        edit_profile_pending: '⏳ Ausstehend',
        edit_profile_not_verified: '✗ Nicht verifiziert',
        
        // Public Profile
        public_profile_title: 'Profil',
        public_profile_loading: 'Lade Profil...',
        public_profile_report_user: 'Nutzer melden',
        public_profile_member_since: 'Mitglied seit',
        public_profile_unknown: 'Unbekannt',
        public_profile_about: '💬 Über mich',
        public_profile_interests: '🎯 Interessen & Hobbys',
        public_profile_studies: '🎓 Studium & Details',
        public_profile_university: 'Universität',
        public_profile_field: 'Studienfach',
        public_profile_semester: 'Semester',
        public_profile_languages: 'Sprachen',
        public_profile_age: 'Alter',
        public_profile_reviews: '⭐ Bewertungen',
        public_profile_no_reviews: 'Noch keine Bewertungen',
        public_profile_login_prompt: 'Melde dich an um mehr Details zu sehen',
        public_profile_login_btn: 'Anmelden',
        public_profile_review: 'Bewertung',
        public_profile_reviews_count: 'Bewertungen',
        
        // Choose Listing
        choose_title: 'Inseratstyp wählen',
        choose_verify_title: '🎓 Verifizieren um Inserate zu erstellen',
        choose_verify_desc: 'Verifiziere deinen Studentenstatus um Inserate zu erstellen',
        choose_verify_btn: 'Jetzt verifizieren →',
        choose_housing: 'Wohnungen',
        choose_housing_offer: 'Ich möchte anbieten',
        choose_housing_offer_desc: 'Zimmer oder Wohnung vermieten',
        choose_housing_search: 'Ich suche',
        choose_housing_search_desc: 'Suche nach einer Unterkunft',
        choose_housing_swap: 'Ich möchte tauschen',
        choose_housing_swap_desc: 'Wohnungen temporär tauschen',
        choose_marketplace: 'Marktplatz',
        choose_marketplace_sell: 'Ich möchte verkaufen',
        choose_marketplace_sell_desc: 'Gebrauchte Artikel verkaufen',
        choose_marketplace_search: 'Ich suche',
        choose_marketplace_search_desc: 'Nach bestimmten Artikeln suchen',
        
        // Notifications
        notifications_title: '🔔 Benachrichtigungen',
        notifications_mark_all_read: 'Alle als gelesen markieren',
        notifications_filter_all: 'Alle',
        notifications_filter_unread: 'Ungelesen',
        notifications_filter_reviews: '⭐ Bewertungen',
        notifications_filter_saved: '🔍 Gespeicherte Suchen',
        notifications_empty: 'Keine Benachrichtigungen',
        notifications_empty_unread: 'Du hast alle Benachrichtigungen gelesen',
        notifications_empty_hint: 'Hier erscheinen deine Benachrichtigungen',
        notifications_view: 'Ansehen',
        notifications_mark_read: 'Als gelesen markieren',
        notifications_error: 'Fehler beim Laden',
        notifications_error_hint: 'Benachrichtigungen konnten nicht geladen werden',
        notifications_error_mark: 'Fehler beim Markieren der Benachrichtigung',
        notifications_just_now: 'Gerade eben',
        
        // Housing Form
        housing_form_title: 'Neues Wohnungsinserat',
        housing_form_title_edit: 'Inserat bearbeiten',
        housing_form_header: 'Wohnung inserieren',
        housing_form_subtitle: 'Hilf Studenten ihr perfektes Zuhause zu finden',
        housing_mode_offer: 'Angebot',
        housing_mode_search: 'Suche',
        housing_mode_swap: 'Tausch',
        housing_room_details: 'Zimmerdetails',
        housing_price_costs: 'Preis & Kosten',
        housing_utilities: 'Nebenkosten',
        housing_furniture: 'Möblierung',
        housing_availability: 'Verfügbarkeit',
        housing_photos: 'Fotos',
        housing_title: 'Titel',
        housing_description: 'Beschreibung',
        housing_city: 'Stadt',
        housing_district: 'Stadtteil',
        housing_address: 'Adresse',
        housing_room_type: 'Zimmertyp',
        housing_room_size: 'Zimmergröße',
        housing_rooms: 'Anzahl Zimmer',
        housing_rent: 'Monatliche Miete',
        housing_deposit: 'Kaution',
        housing_available_from: 'Verfügbar ab',
        housing_available_to: 'Verfügbar bis',
        housing_submit: 'Inserat veröffentlichen',
        housing_update: 'Inserat aktualisieren',
        housing_saving: 'Speichern...',
        housing_success: '✓ Inserat erfolgreich erstellt!',
        housing_updated: '✓ Inserat erfolgreich aktualisiert!',
        
        // Marketplace Form
        marketplace_form_title: 'Neues Marktplatz-Inserat',
        marketplace_form_title_edit: 'Inserat bearbeiten',
        marketplace_form_header: 'Artikel verkaufen',
        marketplace_form_subtitle: 'Liste deine gebrauchten Artikel und hilf der Community!',
        marketplace_mode_offer: 'Angebot',
        marketplace_mode_search: 'Suche',
        marketplace_item_title: 'Titel',
        marketplace_item_desc: 'Beschreibung',
        marketplace_category: 'Kategorie',
        marketplace_condition: 'Zustand',
        marketplace_price: 'Preis',
        marketplace_city: 'Stadt',
        marketplace_photos: 'Fotos',
        marketplace_submit: 'Inserat veröffentlichen',
        marketplace_update: 'Inserat aktualisieren',
        marketplace_saving: 'Speichern...',
        marketplace_success: '✓ Artikel erfolgreich veröffentlicht!',
        marketplace_updated: '✓ Inserat erfolgreich aktualisiert!',
        
        // Footer
        footer_about: 'Über uns',
        footer_contact: 'Kontakt',
        footer_privacy: 'Datenschutz',
        footer_terms: 'AGB',
        footer_imprint: 'Impressum',
        footer_help: 'Hilfe',
        
        // Language selector
        language_select: 'Sprache wählen',
        language_de: 'Deutsch',
        language_en: 'English'
    },
    
    en: {
        // Navigation
        nav_home: 'Home',
        nav_listings: 'Listings',
        nav_marketplace: 'Marketplace',
        nav_jobs: 'Jobs',
        nav_messages: 'Messages',
        nav_profile: 'Profile',
        nav_login: 'Login',
        nav_register: 'Register',
        nav_logout: 'Logout',
        
        // Homepage
        hero_title: 'Your Campus. Your Deal.',
        hero_subtitle: 'The exclusive platform by students, for students. Find your next shared flat or sell used items to your fellow students without the stress.',
        hero_search_placeholder: 'Search city or university...',
        hero_btn_search: 'Search',
        hero_btn_listings: 'View Listings',
        hero_btn_post: 'Post Ad',
        
        // Listings
        listings_title: 'Apartments & Rooms',
        listings_search_placeholder: 'Search by city or title...',
        listings_filter_city: 'City',
        listings_filter_price: 'Price',
        listings_filter_type: 'Type',
        listings_filter_all: 'All',
        listings_filter_mode: 'Mode',
        listings_filter_offers: 'Offers',
        listings_filter_searches: 'Searches',
        listings_filter_swaps: 'Swaps',
        listings_filter_sort: 'Sort & Filter',
        listings_sort_low: 'Price: Low to High',
        listings_sort_high: 'Price: High to Low',
        listings_no_results: 'No results found',
        listings_no_results_hint: 'Try adjusting your filters or search query.',
        listings_per_month: '€/month',
        listings_rooms: 'Rooms',
        listings_sqm: 'sqm',
        listings_available_from: 'Available from',
        listings_contact: 'Contact',
        listings_save: 'Save',
        listings_saved: 'Saved',
        listings_report: 'Report',
        listings_price_request: 'Price on request',
        listings_budget: 'Budget',
        listings_login_favorites: 'Please log in to save favorites!',
        
        // Marketplace
        marketplace_title: 'Marketplace',
        marketplace_subtitle: 'Buy and sell items',
        marketplace_btn_sell: 'Sell',
        marketplace_search_placeholder: 'Search items...',
        marketplace_loading: 'Loading items...',
        marketplace_filter_category: 'Category',
        marketplace_filter_category_sort: 'Category & Sort',
        marketplace_cat_furniture: 'Furniture & Home',
        marketplace_cat_electronics: 'Electronics & Tech',
        marketplace_cat_books: 'Books & Study',
        marketplace_cat_clothing: 'Clothing & Fashion',
        marketplace_cat_kitchen: 'Kitchen & Appliances',
        marketplace_cat_sports: 'Sports & Outdoor',
        marketplace_cat_bikes: 'Bikes & Transport',
        marketplace_cat_music: 'Music & Instruments',
        marketplace_cat_others: 'Others',
        marketplace_categories: {
            all: 'All Categories',
            furniture: 'Furniture',
            electronics: 'Electronics',
            books: 'Books',
            clothing: 'Clothing',
            kitchen: 'Kitchen',
            sports: 'Sports',
            other: 'Other'
        },
        marketplace_price_free: 'Free',
        marketplace_price_negotiable: 'OBO',
        marketplace_no_items: 'No items found',
        marketplace_no_items_hint: 'Try adjusting your filters or search query.',
        
        // Jobs
        jobs_title: 'Student Jobs',
        jobs_header: '💼 Jobs & Career',
        jobs_subtitle: 'Find flexible jobs alongside your studies',
        jobs_marketing_title: '🎯 Reach qualified students!',
        jobs_marketing_subtitle: 'Present your job offers directly to our active campus community.',
        jobs_marketing_demo: 'This is how your ad could look:',
        jobs_current_listings: '📋 Current Job Listings',
        jobs_no_listings: 'No active job listings',
        jobs_no_listings_hint: 'Soon you will find exciting job offers from verified companies here!',
        jobs_filter_type: 'Job Type',
        jobs_types: {
            all: 'All',
            fulltime: 'Full-time',
            parttime: 'Part-time',
            minijob: 'Mini Job',
            internship: 'Internship',
            freelance: 'Freelance'
        },
        jobs_apply: 'Apply',
        jobs_salary: 'Salary',
        jobs_location: 'Location',
        jobs_posted: 'Posted',
        
        // Messages
        messages_title: 'Messages',
        messages_search_placeholder: 'Search messages...',
        messages_loading: 'Loading messages...',
        messages_no_conversations: 'No messages yet',
        messages_no_conversations_hint: 'Start chatting with sellers to see your conversations here!',
        messages_browse_marketplace: 'Browse Marketplace',
        messages_error_loading: 'Error loading messages',
        messages_unknown_user: 'Unknown User',
        messages_unknown_listing: 'Unknown Listing',
        messages_placeholder: 'Write a message...',
        messages_send: 'Send',
        messages_online: 'Online',
        messages_offline: 'Offline',
        
        // Profile
        profile_title: 'My Profile',
        profile_new_listing: '+ New Listing',
        profile_settings: 'Settings',
        profile_edit: 'Edit Profile',
        profile_public: 'Public Profile',
        profile_verified: 'Verified',
        profile_student: 'Student',
        profile_member_since: 'Member since',
        profile_listings: 'My Listings',
        profile_favorites: 'My Favorites',
        profile_favorites_desc: 'View saved listings',
        profile_my_listings: 'My Listings',
        profile_new_features: 'Hey! We have new features!',
        profile_new_features_desc: 'So you do not miss anything, we added cool new features:',
        profile_feature_1: '🔔 Customize notifications to your preferences',
        profile_feature_2: '🔍 Save searches and get automatic alerts',
        profile_feature_3: '📍 Updates for new listings in your city',
        profile_setup_now: 'Set up now',
        profile_save_search: 'Save search',
        profile_no_listings: 'No listings yet',
        profile_no_listings_desc: 'Create your first listing and start renting or selling!',
        profile_create_first: '+ Create first listing',
        profile_hello: 'Hello',
        
        // Auth
        auth_login_title: 'Welcome Back',
        auth_register_title: 'Register',
        auth_email: 'Email',
        auth_email_placeholder: 'Enter your email',
        auth_password: 'Password',
        auth_password_placeholder: 'Enter your password',
        auth_confirm_password: 'Confirm Password',
        auth_username: 'Username',
        auth_btn_login: 'Log In',
        auth_btn_register: 'Register',
        auth_forgot_password: 'Forgot password?',
        auth_no_account: "Don't have an account?",
        auth_signup_link: 'Sign up',
        auth_have_account: 'Already have an account?',
        auth_login_link: 'Log in',
        
        // Register
        register_join: 'Join Room8',
        register_subtitle: 'Create your account to access the student marketplace',
        register_username_placeholder: 'Choose a username',
        register_email_label: 'Email Address',
        register_email_placeholder: 'your.email@example.com',
        register_email_hint: 'You can use any email address',
        register_password_label: 'Password (min. 6 characters)',
        register_password_placeholder: 'Choose a strong password',
        register_password_confirm_placeholder: 'Repeat your password',
        register_btn_create: 'Create Account',
        
        // Forms
        form_title: 'Title',
        form_description: 'Description',
        form_price: 'Price',
        form_city: 'City',
        form_address: 'Address',
        form_photos: 'Photos',
        form_upload: 'Upload',
        form_submit: 'Submit',
        form_cancel: 'Cancel',
        form_save: 'Save',
        form_delete: 'Delete',
        form_required: 'Required',
        
        // General
        general_loading: 'Loading...',
        general_error: 'Error',
        general_success: 'Success',
        general_confirm: 'Confirm',
        general_yes: 'Yes',
        general_no: 'No',
        general_back: 'Back',
        general_next: 'Next',
        general_close: 'Close',
        general_more: 'More',
        general_less: 'Less',
        general_all: 'All',
        general_none: 'None',
        general_search: 'Search',
        general_filter: 'Filter',
        general_sort: 'Sort',
        general_share: 'Share',
        
        // Settings
        settings_title: 'Settings',
        settings_language_section: 'Language',
        settings_language: 'Select Language',
        settings_language_desc: 'Choose your preferred language',
        settings_profile_section: 'Profile & Account',
        settings_edit_profile: 'Edit Profile',
        settings_edit_profile_desc: 'Name, city, university, interests',
        settings_notifications_section: 'Notifications',
        settings_notification_settings: 'Notification Settings',
        settings_notification_settings_desc: 'Manage your notifications',
        settings_saved_searches: 'Saved Searches',
        settings_saved_searches_desc: 'Notifications for matching listings',
        settings_all_notifications: 'All Notifications',
        settings_all_notifications_desc: 'Overview of all notifications',
        settings_content_section: 'My Content',
        settings_my_favorites: 'My Favorites',
        settings_my_favorites_desc: 'Saved apartments, items & jobs',
        settings_my_listings: 'My Listings',
        settings_my_listings_desc: 'Manage your listings',
        settings_privacy_section: 'Privacy & Security',
        settings_privacy: 'Privacy',
        settings_privacy_desc: 'Privacy policy',
        settings_imprint: 'Imprint',
        settings_imprint_desc: 'Legal information',
        settings_logout: 'Log out',
        settings_logout_confirm: 'Do you really want to log out?',
        
        // Favorites
        favorites_title: 'My Favorites',
        favorites_saved_items: 'Saved Items',
        favorites_subtitle: 'Your favorite listings in one place',
        favorites_tab_housing: 'Housing',
        favorites_tab_marketplace: 'Marketplace',
        favorites_loading: 'Loading favorites...',
        favorites_no_favorites: 'No favorites yet',
        favorites_browse_housing: 'Browse Housing',
        favorites_browse_marketplace: 'Browse Marketplace',
        
        // Detail Page
        detail_loading: 'Loading details...',
        detail_contact_seller: 'Contact Seller',
        detail_contact_owner: 'Contact Owner',
        detail_login_to_contact: 'Login to Contact',
        detail_report_title: 'Report Listing',
        detail_report_reason: 'Reason for Report',
        detail_report_spam: 'Spam',
        detail_report_spam_desc: 'Unwanted advertising or repeated content',
        detail_report_inappropriate: 'Inappropriate Content',
        detail_report_inappropriate_desc: 'Offensive or unsuitable content',
        detail_report_fake: 'Fake/Fraud',
        detail_report_fake_desc: 'Fake listing or fraud attempt',
        detail_report_scam: 'Scam',
        detail_report_scam_desc: 'Suspected fraud or scam',
        detail_report_other: 'Other',
        detail_report_other_desc: 'Other reason',
        detail_report_description: 'Additional Information (optional)',
        detail_report_description_placeholder: 'Describe the problem in more detail...',
        detail_report_submit: 'Submit Report',
        detail_report_sending: 'Sending...',
        detail_report_success: 'Thank you for your report! We will review it.',
        detail_report_duplicate: 'You have already reported this listing.',
        detail_report_error: 'Error sending report',
        detail_seller: 'Seller',
        detail_description: 'Description',
        detail_location: 'Location',
        detail_category: 'Category',
        detail_posted: 'Posted',
        detail_available_from: 'Available from',
        detail_rooms: 'Rooms',
        detail_size: 'Size',
        detail_price: 'Price',
        detail_rent: 'Rent',
        detail_per_month: '/month',
        
        // Chat
        chat_title: 'Chat',
        chat_review: '⭐ Review',
        chat_placeholder: 'Type a message...',
        chat_send: 'Send',
        chat_with: 'Chat with',
        chat_verify_title: '🎓 Verify Your Student Status to Send Messages',
        chat_verify_desc: 'You need to verify your student status before you can chat with other users.',
        chat_verify_now: 'Verify Now →',
        chat_verify_placeholder: 'Verify your student status to send messages',
        chat_error_sending: 'Error sending message',
        
        // Edit Profile
        edit_profile_title: 'Edit Profile',
        edit_profile_change_photo: 'Click to change photo',
        edit_profile_basic_info: '📋 Basic Information',
        edit_profile_username: 'Username *',
        edit_profile_username_placeholder: 'Your username',
        edit_profile_fullname: 'Full Name',
        edit_profile_fullname_placeholder: 'e.g. John Doe',
        edit_profile_city: 'City',
        edit_profile_city_placeholder: 'e.g. Berlin',
        edit_profile_age: 'Age',
        edit_profile_age_placeholder: 'e.g. 22',
        edit_profile_studies: '🎓 Studies',
        edit_profile_university: 'University',
        edit_profile_university_placeholder: 'e.g. TU Berlin',
        edit_profile_field: 'Field of Study',
        edit_profile_field_placeholder: 'e.g. Computer Science',
        edit_profile_semester: 'Semester',
        edit_profile_select: 'Please select',
        edit_profile_about: '💬 About Me',
        edit_profile_bio: 'Biography',
        edit_profile_bio_placeholder: 'Tell us about yourself...',
        edit_profile_languages: 'Languages',
        edit_profile_languages_placeholder: 'e.g. German, English, Spanish',
        edit_profile_languages_hint: 'Separate multiple languages with commas',
        edit_profile_interests: 'Interests & Hobbies',
        edit_profile_interests_placeholder: 'e.g. Fitness, Cooking, Travel, Gaming...',
        edit_profile_save: 'Save Changes',
        edit_profile_saving: 'Saving...',
        edit_profile_success: '✓ Profile updated successfully!',
        edit_profile_verification_title: '🎓 Student Verification',
        edit_profile_status: 'Status:',
        edit_profile_checking: 'Checking verification status...',
        edit_profile_verify_btn: 'Verify Now →',
        edit_profile_verified: '✓ Verified',
        edit_profile_pending: '⏳ Pending',
        edit_profile_not_verified: '✗ Not Verified',
        
        // Public Profile
        public_profile_title: 'Profile',
        public_profile_loading: 'Loading profile...',
        public_profile_report_user: 'Report User',
        public_profile_member_since: 'Member since',
        public_profile_unknown: 'Unknown',
        public_profile_about: '💬 About me',
        public_profile_interests: '🎯 Interests & Hobbies',
        public_profile_studies: '🎓 Study & Details',
        public_profile_university: 'University',
        public_profile_field: 'Field of Study',
        public_profile_semester: 'Semester',
        public_profile_languages: 'Languages',
        public_profile_age: 'Age',
        public_profile_reviews: '⭐ Reviews',
        public_profile_no_reviews: 'No reviews yet',
        public_profile_login_prompt: 'Log in to see more details',
        public_profile_login_btn: 'Log In',
        public_profile_review: 'review',
        public_profile_reviews_count: 'reviews',
        
        // Choose Listing
        choose_title: 'Choose Listing Type',
        choose_verify_title: '🎓 Verify to Create Listings',
        choose_verify_desc: 'Verify your student status to create listings',
        choose_verify_btn: 'Verify Now →',
        choose_housing: 'Housing',
        choose_housing_offer: 'I want to offer',
        choose_housing_offer_desc: 'Rent out a room or apartment',
        choose_housing_search: 'I am searching',
        choose_housing_search_desc: 'Looking for a place to live',
        choose_housing_swap: 'I want to swap',
        choose_housing_swap_desc: 'Exchange apartments temporarily',
        choose_marketplace: 'Marketplace',
        choose_marketplace_sell: 'I want to sell',
        choose_marketplace_sell_desc: 'Sell your used items',
        choose_marketplace_search: 'I am searching',
        choose_marketplace_search_desc: 'Looking for specific items',
        
        // Notifications
        notifications_title: '🔔 Notifications',
        notifications_mark_all_read: 'Mark all as read',
        notifications_filter_all: 'All',
        notifications_filter_unread: 'Unread',
        notifications_filter_reviews: '⭐ Reviews',
        notifications_filter_saved: '🔍 Saved Searches',
        notifications_empty: 'No notifications',
        notifications_empty_unread: 'You have read all notifications',
        notifications_empty_hint: 'Your notifications will appear here',
        notifications_view: 'View',
        notifications_mark_read: 'Mark as read',
        notifications_error: 'Error loading',
        notifications_error_hint: 'Notifications could not be loaded',
        notifications_error_mark: 'Error marking notification',
        notifications_just_now: 'Just now',
        
        // Housing Form
        housing_form_title: 'New Housing Listing',
        housing_form_title_edit: 'Edit Listing',
        housing_form_header: 'List Your Apartment',
        housing_form_subtitle: 'Help students find their perfect home',
        housing_mode_offer: 'Offer',
        housing_mode_search: 'Search',
        housing_mode_swap: 'Swap',
        housing_room_details: 'Room Details',
        housing_price_costs: 'Price & Costs',
        housing_utilities: 'Utilities',
        housing_furniture: 'Furniture',
        housing_availability: 'Availability',
        housing_photos: 'Photos',
        housing_title: 'Title',
        housing_description: 'Description',
        housing_city: 'City',
        housing_district: 'District',
        housing_address: 'Address',
        housing_room_type: 'Room Type',
        housing_room_size: 'Room Size',
        housing_rooms: 'Number of Rooms',
        housing_rent: 'Monthly Rent',
        housing_deposit: 'Deposit',
        housing_available_from: 'Available from',
        housing_available_to: 'Available until',
        housing_submit: 'Post Listing',
        housing_update: 'Update Listing',
        housing_saving: 'Saving...',
        housing_success: '✓ Listing created successfully!',
        housing_updated: '✓ Listing updated successfully!',
        
        // Marketplace Form
        marketplace_form_title: 'New Marketplace Listing',
        marketplace_form_title_edit: 'Edit Listing',
        marketplace_form_header: 'Sell Your Item',
        marketplace_form_subtitle: 'List your used items and help the community!',
        marketplace_mode_offer: 'Offer',
        marketplace_mode_search: 'Search',
        marketplace_item_title: 'Title',
        marketplace_item_desc: 'Description',
        marketplace_category: 'Category',
        marketplace_condition: 'Condition',
        marketplace_price: 'Price',
        marketplace_city: 'City',
        marketplace_photos: 'Photos',
        marketplace_submit: 'Post Listing',
        marketplace_update: 'Update Listing',
        marketplace_saving: 'Saving...',
        marketplace_success: '✓ Item posted successfully!',
        marketplace_updated: '✓ Listing updated successfully!',
        
        // Footer
        footer_about: 'About',
        footer_contact: 'Contact',
        footer_privacy: 'Privacy',
        footer_terms: 'Terms',
        footer_imprint: 'Imprint',
        footer_help: 'Help',
        
        // Language selector
        language_select: 'Select Language',
        language_de: 'Deutsch',
        language_en: 'English'
    }
};

// Aktuelle Sprache
let currentLanguage = localStorage.getItem('room8_language') || localStorage.getItem('language') || 'de';

// Sprache setzen
function setLanguage(lang) {
    currentLanguage = lang;
    localStorage.setItem('room8_language', lang);
    document.documentElement.setAttribute('lang', lang);
    applyTranslations();
    
    // Event für andere Scripts
    window.dispatchEvent(new CustomEvent('languageChanged', { detail: { language: lang } }));
}

// Übersetzung abrufen
function t(key) {
    if (!currentLanguage) return key;
    
    const keys = key.split('.');
    let value = translations[currentLanguage];
    
    for (const k of keys) {
        if (value && value[k]) {
            value = value[k];
        } else {
            return key; // Fallback: Key zurückgeben
        }
    }
    
    return value;
}

// Übersetzungen auf Seite anwenden
function applyTranslations() {
    if (!currentLanguage) return;
    
    // Alle Elemente mit data-i18n Attribut übersetzen
    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        const translation = t(key);
        
        if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
            if (el.placeholder) {
                el.placeholder = translation;
            }
        } else {
            el.textContent = translation;
        }
    });
    
    // Elemente mit data-i18n-placeholder
    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
        const key = el.getAttribute('data-i18n-placeholder');
        el.placeholder = t(key);
    });
}

// Sprach-Popup anzeigen (wenn noch keine Sprache gewählt)
function showLanguagePopup() {
    if (currentLanguage) return; // Schon gewählt
    
    const popup = document.createElement('div');
    popup.id = 'language-popup';
    popup.innerHTML = `
        <div style="position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.7); z-index: 99999; display: flex; align-items: center; justify-content: center;">
            <div style="background: white; padding: 2.5rem; border-radius: 16px; text-align: center; max-width: 400px; box-shadow: 0 20px 60px rgba(0,0,0,0.3);">
                <h2 style="margin: 0 0 0.5rem 0; font-size: 1.5rem; color: #1f2937;">🌍 Welcome to Room8</h2>
                <p style="margin: 0 0 2rem 0; color: #6b7280;">Please select your language<br>Bitte wähle deine Sprache</p>
                
                <div style="display: flex; gap: 1rem; justify-content: center;">
                    <button onclick="selectLanguage('de')" style="padding: 1rem 2rem; background: linear-gradient(135deg, #1f2937 0%, #374151 100%); color: white; border: none; border-radius: 12px; cursor: pointer; font-size: 1.1rem; font-weight: 600; display: flex; align-items: center; gap: 0.75rem; transition: transform 0.2s, box-shadow 0.2s;" onmouseover="this.style.transform='translateY(-2px)'; this.style.boxShadow='0 8px 20px rgba(0,0,0,0.2)'" onmouseout="this.style.transform='translateY(0)'; this.style.boxShadow='none'">
                        <span style="font-size: 1.5rem;">🇩🇪</span> Deutsch
                    </button>
                    <button onclick="selectLanguage('en')" style="padding: 1rem 2rem; background: linear-gradient(135deg, #1f2937 0%, #374151 100%); color: white; border: none; border-radius: 12px; cursor: pointer; font-size: 1.1rem; font-weight: 600; display: flex; align-items: center; gap: 0.75rem; transition: transform 0.2s, box-shadow 0.2s;" onmouseover="this.style.transform='translateY(-2px)'; this.style.boxShadow='0 8px 20px rgba(0,0,0,0.2)'" onmouseout="this.style.transform='translateY(0)'; this.style.boxShadow='none'">
                        <span style="font-size: 1.5rem;">🇬🇧</span> English
                    </button>
                </div>
            </div>
        </div>
    `;
    
    document.body.appendChild(popup);
}

// Sprache auswählen (vom Popup)
function selectLanguage(lang) {
    setLanguage(lang);
    const popup = document.getElementById('language-popup');
    if (popup) {
        popup.style.opacity = '0';
        popup.style.transition = 'opacity 0.3s';
        setTimeout(() => popup.remove(), 300);
    }
}

// Sprach-Switcher für Header erstellen
function createLanguageSwitcher() {
    const switcher = document.createElement('div');
    switcher.id = 'language-switcher';
    switcher.innerHTML = `
        <div style="position: relative; display: inline-block;">
            <button id="lang-btn" style="padding: 0.5rem 0.75rem; background: #f3f4f6; border: 1px solid #e5e7eb; border-radius: 8px; cursor: pointer; display: flex; align-items: center; gap: 0.5rem; font-size: 0.9rem; color: #374151;">
                <span id="current-lang-flag">${currentLanguage === 'de' ? '🇩🇪' : '🇬🇧'}</span>
                <span id="current-lang-text">${currentLanguage === 'de' ? 'DE' : 'EN'}</span>
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" style="margin-left: 0.25rem;">
                    <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
            </button>
            <div id="lang-dropdown" style="display: none; position: absolute; top: 100%; right: 0; margin-top: 0.5rem; background: white; border: 1px solid #e5e7eb; border-radius: 8px; box-shadow: 0 10px 40px rgba(0,0,0,0.1); overflow: hidden; z-index: 1000;">
                <button onclick="setLanguage('de'); updateLanguageSwitcher();" style="width: 100%; padding: 0.75rem 1rem; border: none; background: ${currentLanguage === 'de' ? '#f3f4f6' : 'white'}; cursor: pointer; display: flex; align-items: center; gap: 0.75rem; font-size: 0.9rem; color: #374151;" onmouseover="this.style.background='#f3f4f6'" onmouseout="this.style.background='${currentLanguage === 'de' ? '#f3f4f6' : 'white'}'">
                    <span>🇩🇪</span> Deutsch
                </button>
                <button onclick="setLanguage('en'); updateLanguageSwitcher();" style="width: 100%; padding: 0.75rem 1rem; border: none; background: ${currentLanguage === 'en' ? '#f3f4f6' : 'white'}; cursor: pointer; display: flex; align-items: center; gap: 0.75rem; font-size: 0.9rem; color: #374151;" onmouseover="this.style.background='#f3f4f6'" onmouseout="this.style.background='${currentLanguage === 'en' ? '#f3f4f6' : 'white'}'">
                    <span>🇬🇧</span> English
                </button>
            </div>
        </div>
    `;
    
    return switcher;
}

// Switcher aktualisieren
function updateLanguageSwitcher() {
    const flag = document.getElementById('current-lang-flag');
    const text = document.getElementById('current-lang-text');
    const dropdown = document.getElementById('lang-dropdown');
    
    if (flag) flag.textContent = currentLanguage === 'de' ? '🇩🇪' : '🇬🇧';
    if (text) text.textContent = currentLanguage === 'de' ? 'DE' : 'EN';
    if (dropdown) dropdown.style.display = 'none';
}

// Dropdown Toggle
document.addEventListener('click', function(e) {
    const dropdown = document.getElementById('lang-dropdown');
    const langBtn = document.getElementById('lang-btn');
    
    if (langBtn && langBtn.contains(e.target)) {
        if (dropdown) {
            dropdown.style.display = dropdown.style.display === 'none' ? 'block' : 'none';
        }
    } else if (dropdown && !dropdown.contains(e.target)) {
        dropdown.style.display = 'none';
    }
});

// Init beim Laden
document.addEventListener('DOMContentLoaded', function() {
    // Nur Popup zeigen wenn weder room8_language noch language gesetzt ist
    const hasLanguage = localStorage.getItem('room8_language') || localStorage.getItem('language');
    
    if (!hasLanguage) {
        showLanguagePopup();
    } else {
        // Übersetzungen anwenden
        applyTranslations();
    }
});

// Export für andere Scripts
window.Room8i18n = {
    t,
    setLanguage,
    getCurrentLanguage: () => currentLanguage,
    translations
};
