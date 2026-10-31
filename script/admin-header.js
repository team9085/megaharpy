(() => {
    "use strict";
    const supabase = window.megaHarpySupabase;
    const nameChip = document.getElementById("header-member-name");
    if (!supabase || !nameChip) return;

    async function loadHeaderMemberName() {
        const { data: authData, error: authError } = await supabase.auth.getUser();
        if (authError || !authData.user) return;

        const { data: profile, error: profileError } = await supabase
            .from("profiles")
            .select("full_name")
            .eq("id", authData.user.id)
            .maybeSingle();

        if (profileError) {
            console.error("Não foi possível carregar o nome do administrador:", profileError);
        }
        nameChip.textContent = profile?.full_name?.trim() || authData.user.email || "Membro da equipe";
    }

    loadHeaderMemberName().catch((error) => {
        console.error("Falha ao carregar a identificação do administrador:", error);
        nameChip.textContent = "Administrador";
    });
})();
