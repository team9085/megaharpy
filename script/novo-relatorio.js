(() => {
    "use strict";
    const supabase = window.megaHarpySupabase;
    const grid = document.getElementById("report-type-grid");
    const errorBox = document.getElementById("chooser-error");
    const logout = document.getElementById("logout-button");
    async function initialize() {
        if (!supabase) throw new Error("Cliente Supabase não inicializado.");
        const { data: auth, error: authError } = await supabase.auth.getUser();
        if (authError || !auth.user) { location.replace("login.html"); return; }
        const { data: profile, error } = await supabase.from("profiles").select("full_name, is_active").eq("id", auth.user.id).single();
        if (error || !profile || !profile.is_active) { await supabase.auth.signOut(); location.replace("login.html?status=inactive"); return; }
        document.getElementById("header-member-name").textContent = profile.full_name || auth.user.email;
        grid.hidden = false;
    }
    logout.addEventListener("click", async () => { const { error } = await supabase.auth.signOut(); if (error) { errorBox.textContent = error.message; errorBox.hidden = false; return; } location.replace("login.html"); });
    supabase.auth.onAuthStateChange((event) => { if (event === "SIGNED_OUT") location.replace("login.html"); });
    initialize().catch((error) => { console.error(error); errorBox.textContent = error.message || "Não foi possível carregar a seleção de relatórios."; errorBox.hidden = false; });
})();
