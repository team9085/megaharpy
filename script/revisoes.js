(() => {
    "use strict";
    const supabase = window.megaHarpySupabase;
    const body = document.getElementById("review-queue-body");
    const errorBox = document.getElementById("review-queue-error");
    const feedbackBox = document.getElementById("review-queue-feedback");
    const content = document.getElementById("review-queue-content");
    const search = document.getElementById("review-search");
    const refresh = document.getElementById("refresh-reviews");
    const logout = document.getElementById("logout-button");
    let pending = [];

    function showError(message) { errorBox.textContent = message; errorBox.hidden = false; feedbackBox.hidden = true; }
    function dateTime(value) {
        if (!value) return "—";
        const date = new Date(value);
        return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString("pt-BR");
    }
    function cell(text, className = "") {
        const td = document.createElement("td"); td.textContent = text ?? "—"; if (className) td.className = className; return td;
    }
    function render() {
        const q = search.value.trim().toLocaleLowerCase("pt-BR");
        const rows = pending.filter((doc) => [doc.document_code, doc.part_code, doc.executor_name_snapshot]
            .filter(Boolean).join(" ").toLocaleLowerCase("pt-BR").includes(q));
        body.replaceChildren();
        for (const doc of rows) {
            const tr = document.createElement("tr");
            tr.append(cell(doc.document_code, "doc-code-cell"), cell(doc.part_code || "Não informado"),
                cell(doc.executor_name_snapshot || "—"), cell(dateTime(doc.submitted_at)));
            const actionCell = document.createElement("td");
            const link = document.createElement("a");
            link.className = "small-primary-button";
            link.href = `revisao-usinagem.html?id=${encodeURIComponent(doc.id)}`;
            link.textContent = "Analisar";
            actionCell.append(link); tr.append(actionCell); body.append(tr);
        }
        document.getElementById("review-queue-empty").hidden = rows.length > 0;
        document.getElementById("review-count-pending").textContent = String(pending.length);
        const oldest = pending.length ? pending[0].submitted_at : null;
        document.getElementById("review-oldest-date").textContent = oldest ? new Date(oldest).toLocaleDateString("pt-BR") : "—";
    }
    async function loadQueue() {
        refresh.disabled = true; refresh.textContent = "Carregando...";
        try {
            const { data: docs, error } = await supabase.from("documents")
                .select("id, document_code, document_type, status, executor_name_snapshot, submitted_at, deleted_at")
                .eq("document_type", "machining").eq("status", "submitted").is("deleted_at", null)
                .order("submitted_at", { ascending: true });
            if (error) throw error;
            const ids = (docs || []).map((doc) => doc.id);
            let reports = [];
            if (ids.length) {
                const result = await supabase.from("machining_reports").select("document_id, part_code").in("document_id", ids);
                if (result.error) throw result.error;
                reports = result.data || [];
            }
            const byId = new Map(reports.map((report) => [report.document_id, report.part_code]));
            pending = (docs || []).map((doc) => ({ ...doc, part_code: byId.get(doc.id) || "" }));
            render(); content.hidden = false; errorBox.hidden = true;
        } catch (error) {
            console.error("Falha ao carregar fila de revisão:", error);
            showError([error.message, error.details, error.hint, error.code].filter(Boolean).join(" — ") || "Não foi possível carregar a fila.");
        } finally { refresh.disabled = false; refresh.textContent = "↻ Atualizar fila"; }
    }
    async function initialize() {
        if (!supabase) throw new Error("Cliente Supabase não inicializado.");
        const { data: auth, error: authError } = await supabase.auth.getUser();
        if (authError || !auth.user) { window.location.replace("login.html"); return; }
        const { data: profile, error } = await supabase.from("profiles").select("full_name, role, is_active").eq("id", auth.user.id).single();
        if (error || !profile || !profile.is_active) { await supabase.auth.signOut(); window.location.replace("login.html?status=inactive"); return; }
        if (!["reviewer", "admin"].includes(profile.role)) { window.location.replace("portal.html"); return; }
        document.getElementById("header-member-name").textContent = profile.full_name || auth.user.email;
        content.hidden = false; await loadQueue();
        const params = new URLSearchParams(location.search);
        if (params.get("result") === "approved") feedbackBox.textContent = "Documento aprovado com sucesso.";
        if (params.get("result") === "changes") feedbackBox.textContent = "Documento devolvido para correções.";
        feedbackBox.hidden = !feedbackBox.textContent;
    }
    refresh.addEventListener("click", loadQueue);
    search.addEventListener("input", render);
    logout.addEventListener("click", async () => { const { error } = await supabase.auth.signOut(); if (error) { showError("Não foi possível encerrar a sessão."); return; } location.replace("login.html"); });
    supabase.auth.onAuthStateChange((event) => { if (event === "SIGNED_OUT") location.replace("login.html"); });
    initialize().catch((error) => { console.error(error); showError(error.message || "Não foi possível inicializar a fila."); });
})();
