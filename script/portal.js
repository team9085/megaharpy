(() => {
    "use strict";

    const supabase = window.megaHarpySupabase;
    const errorBox = document.getElementById("portal-error");
    const portalContent = document.getElementById("portal-content");
    const profilePanel = document.getElementById("profile-panel");
    const logoutButton = document.getElementById("logout-button");

    const roleNames = {
        member: "Membro",
        reviewer: "Revisor",
        admin: "Administrador"
    };

    function showError(message) {
        errorBox.textContent = message;
        errorBox.hidden = false;
        portalContent.hidden = true;
        profilePanel.hidden = true;
    }

    async function loadPortal() {
        errorBox.hidden = true;
        portalContent.hidden = true;
        profilePanel.hidden = true;

        // getUser() verifies the user with Supabase Auth instead of trusting
        // only user data stored locally in the browser.
        const { data: userData, error: userError } = await supabase.auth.getUser();

        if (userError || !userData.user) {
            window.location.replace("login.html");
            return;
        }

        const user = userData.user;
        const { data: profile, error: profileError } = await supabase
            .from("profiles")
            .select("full_name, role, created_at, is_active")
            .eq("id", user.id)
            .single();

        if (profileError || !profile) {
            console.error("Não foi possível carregar o perfil:", profileError);
            showError("Sua conta foi autenticada, mas o perfil da equipe não foi encontrado. Procure um administrador da Mega Harpy.");
            return;
        }

        if (profile.is_active === false) {
            await supabase.auth.signOut();
            window.location.replace("login.html?status=inactive");
            return;
        }

        const displayName = profile.full_name || user.email || "Membro da equipe";
        const roleLabel = roleNames[profile.role] || "Acesso não classificado";

        document.getElementById("header-member-name").textContent = displayName;
        document.getElementById("welcome-message").textContent = `Olá, ${displayName}. Seja bem-vindo(a) ao ambiente interno da Mega Harpy.`;
        document.getElementById("role-pill").textContent = roleLabel;
        document.getElementById("profile-name").textContent = displayName;
        document.getElementById("profile-email").textContent = user.email || "E-mail não disponível";
        document.getElementById("profile-role").textContent = roleLabel;

        const createdAt = profile.created_at ? new Date(profile.created_at) : null;
        document.getElementById("profile-created").textContent = createdAt && !Number.isNaN(createdAt.getTime())
            ? createdAt.toLocaleDateString("pt-BR")
            : "Não disponível";

        // These visibility checks improve the interface only. Actual data
        // authorization must also be enforced by PostgreSQL RLS policies.
        document.getElementById("reviewer-tools").hidden = !["reviewer", "admin"].includes(profile.role);
        document.getElementById("admin-tools").hidden = profile.role !== "admin";

        portalContent.hidden = false;
        profilePanel.hidden = false;
    }

    logoutButton.addEventListener("click", async () => {
        logoutButton.disabled = true;
        const { error } = await supabase.auth.signOut();

        if (error) {
            console.error("Falha ao sair:", error);
            logoutButton.disabled = false;
            showError("Não foi possível encerrar a sessão. Tente novamente.");
            return;
        }

        window.location.replace("login.html");
    });

    // Keep the portal from remaining open after a sign-out in another tab.
    supabase.auth.onAuthStateChange((event) => {
        if (event === "SIGNED_OUT") {
            window.location.replace("login.html");
        }
    });

    loadPortal().catch((error) => {
        console.error("Falha ao carregar o portal:", error);
        showError("Ocorreu um erro ao carregar o portal. Atualize a página ou tente novamente.");
    });
})();
