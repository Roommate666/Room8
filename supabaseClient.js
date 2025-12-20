// supabaseClient.js - WebView-kompatible Version
// HINWEIS: Die HTML-Dateien laden Supabase jetzt direkt via CDN
// Diese Datei ist nur als Fallback/Referenz

var SUPABASE_URL = "https://tvnvmogaqmduzcycmvby.supabase.co";
var SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR2bnZtb2dhcW1kdXpjeWNtdmJ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ5NTA4MTksImV4cCI6MjA3MDUyNjgxOX0.MuLv9AdclVVZYZpUFv6Bc2Jn1Z9cmmcarHwBHlHkvZw";

// Falls supabase noch nicht existiert, erstelle es
if (typeof supabase === 'undefined' && typeof window.supabase !== 'undefined') {
    var supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}

// Globale requireAuth Funktion
function requireAuth() {
    return supabase.auth.getUser().then(function(result) {
        if (!result.data.user) {
            window.location.href = 'login.html';
            throw new Error("User not authenticated");
        }
        return result.data.user;
    });
}
