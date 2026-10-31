(() => {
    "use strict";

    const supabase = window.megaHarpySupabase;
    const body = document.getElementById("fracas-table-body");
    const errorBox = document.getElementById("fracas-error");
    const feedbackBox = document.getElementById("fracas-feedback");
    const content = document.getElementById("fracas-content");
    const searchInput = document.getElementById("fracas-search");
    const statusFilter = document.getElementById("fracas-status-filter");
    const refreshButton = document.getElementById("refresh-fracas");
    const archiveToggle = document.getElementById("show-archived-fracas");
    const archivedNote = document.getElementById("fracas-archived-note");
    const logoutButton = document.getElementById("logout-button");

    let documents = [];
    let user = null;
    let profile = null;
    let archivedView = false;

    const documentStatusLabels = {
        draft: ["Rascunho", "draft"],
        submitted: ["Aguardando revisão", "submitted"],
        changes_requested: ["Correções solicitadas", "changes"],
        approved: ["Análise inicial aprovada", "approved"]
    };
    const lifecycleLabels = {
        open: ["Aberto", "open"],
        under_analysis: ["Em análise", "analysis"],
        action_implemented: ["Ação implementada", "implemented"],
        closed_validated: ["Fechado / Validado", "closed"]
    };
    const severityLabels = {
        low: ["Baixa", "low"], medium: ["Média", "medium"],
        high: ["Alta", "high"], critical: ["Crítica", "critical"]
    };

    function errorDetails(error) {
        return [error?.message, error?.details, error?.hint, error?.code ? `Código: ${error.code}` : ""]
            .filter(Boolean).join(" — ") || "Não foi possível concluir a operação.";
    }
    function showError(message) { errorBox.textContent = message; errorBox.hidden = !message; feedbackBox.hidden = true; }
    function showFeedback(message) { feedbackBox.textContent = message; feedbackBox.hidden = !message; errorBox.hidden = true; }
    function cell(value, className = "") {
        const td = document.createElement("td"); td.textContent = value ?? "—";
        if (className) td.className = className;
        return td;
    }
    function makeButton(label, className, action) {
        const button = document.createElement("button"); button.type = "button";
        button.className = className; button.textContent = label; button.addEventListener("click", action);
        return button;
    }
    function badge(label, className) {
        const el = document.createElement("span"); el.className = `status-badge ${className}`; el.textContent = label; return el;
    }
    function formatDate(value) {
        if (!value) return "—";
        const date = new Date(`${value}T12:00:00`);
        return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString("pt-BR");
    }
    function canDeleteDraft(doc) {
        return !doc.deleted_at && doc.status === "draft" && (profile.role === "admin" || doc.created_by === user.id);
    }
    function canArchive(doc) {
        if (doc.deleted_at || doc.status === "draft") return false;
        if (profile.role === "admin") return true;
        return doc.created_by === user.id && doc.status === "changes_requested";
    }
    function canRestore(doc) { return Boolean(doc.deleted_at) && profile.role === "admin"; }

    async function manageDocument(action, doc) {
        const isAdmin = profile.role === "admin";
        let reason = "";
        if (action !== "restore") {
            const label = action === "delete_draft"
                ? (isAdmin ? "Justificativa obrigatória para excluir" : "Motivo da exclusão (opcional)")
                : (isAdmin ? "Justificativa obrigatória para arquivar" : "Motivo do arquivamento (opcional)");
            reason = window.prompt(`${label} ${doc.document_code}:`, isAdmin ? "Registro de teste ou documento criado por engano" : "");
            if (reason === null) return;
            reason = reason.trim();
            if (isAdmin && reason.length < 5) { window.alert("Administradores precisam informar uma justificativa com pelo menos 5 caracteres."); return; }
        } else if (!window.confirm(`Restaurar ${doc.document_code}? O FRACAS voltará à lista ativa.`)) return;

        if (action !== "restore" && !window.confirm(action === "delete_draft"
            ? `Excluir definitivamente ${doc.document_code}?\n\nSomente rascunhos podem ser excluídos. Esta ação não pode ser desfeita.`
            : `Arquivar ${doc.document_code}?\n\nO FRACAS sairá da lista ativa e poderá ser restaurado por um administrador.`)) return;

        try {
            if (action === "delete_draft") {
                const { data: attachedFiles, error: evidenceError } = await supabase
                    .from("fracas_evidence").select("storage_path").eq("document_id", doc.id);
                if (evidenceError) throw evidenceError;
                const paths = (attachedFiles || []).map(item => item.storage_path);
                if (paths.length) {
                    const { error: storageError } = await supabase.storage.from("fracas-evidence").remove(paths);
                    if (storageError) throw new Error(`Não foi possível remover as evidências antes da exclusão: ${storageError.message}`);
                }
            }
            const { data, error } = await supabase.rpc("manage_engineering_document", {
                p_document_id: doc.id, p_action: action, p_reason: reason || null
            });
            if (error) throw error;
            if (data?.error) throw new Error(data.error);
            if (action === "restore" || action === "archive") setArchivedView(false);
            await loadFracas();
            showFeedback(({delete_draft:`${doc.document_code} foi excluído definitivamente.`, archive:`${doc.document_code} foi arquivado.`, restore:`${doc.document_code} foi restaurado.`})[action]);
        } catch (error) { console.error(`Falha ao executar ${action}:`, error); showError(errorDetails(error)); }
    }

    function updateArchiveControls() {
        const count = documents.filter(doc => Boolean(doc.deleted_at)).length;
        archiveToggle.hidden = profile?.role !== "admin";
        archiveToggle.textContent = archivedView ? "← Voltar aos FRACAS ativos" : `Ver arquivados${count ? ` (${count})` : ""}`;
        statusFilter.disabled = archivedView;
        archivedNote.hidden = !archivedView;
    }
    function setArchivedView(enabled) {
        archivedView = Boolean(enabled && profile?.role === "admin");
        searchInput.value = ""; statusFilter.value = "all"; updateArchiveControls(); render();
    }

    function render() {
        const query = searchInput.value.trim().toLocaleLowerCase("pt-BR");
        const selectedStatus = statusFilter.value;
        const filtered = documents.filter(doc => {
            if (Boolean(doc.deleted_at) !== archivedView) return false;
            const haystack = [doc.document_code, doc.executor_name_snapshot, doc.part_assembly_code,
                doc.environment, doc.severity, doc.deletion_reason].filter(Boolean).join(" ").toLocaleLowerCase("pt-BR");
            return (!query || haystack.includes(query)) && (archivedView || selectedStatus === "all" || doc.lifecycle_status === selectedStatus);
        });

        body.replaceChildren();
        for (const doc of filtered) {
            const row = document.createElement("tr");
            row.append(cell(doc.document_code, "fracas-code-cell"), cell(doc.part_assembly_code || "Não informado", "fracas-reference-cell"));
            const severityCell = document.createElement("td");
            const severity = severityLabels[doc.severity] || ["Não definida", "unknown"];
            severityCell.append(badge(severity[0], `severity-badge ${severity[1]}`)); row.append(severityCell);
            const lifecycleCell = document.createElement("td");
            const lifecycle = lifecycleLabels[doc.lifecycle_status] || ["Aberto", "open"];
            lifecycleCell.append(badge(doc.deleted_at ? "Arquivado" : lifecycle[0], doc.deleted_at ? "archived" : `lifecycle-badge ${lifecycle[1]}`));
            row.append(lifecycleCell);
            const docStatus = documentStatusLabels[doc.status] || [doc.status, "draft"];
            row.append(cell(doc.deleted_at ? "—" : docStatus[0]), cell(doc.executor_name_snapshot || "—"));

            const actions = document.createElement("td"); actions.className = "docs-actions-cell";
            const open = document.createElement("a"); open.className = "small-primary-button";
            open.href = `relatorio-fracas.html?id=${encodeURIComponent(doc.id)}`; open.textContent = "Abrir"; actions.append(open);
            if (canRestore(doc)) {
                actions.append(makeButton("Restaurar", "small-secondary-button", () => manageDocument("restore", doc)));
                if (doc.status === "draft") actions.append(makeButton("Excluir definitivamente", "small-danger-button", () => manageDocument("delete_draft", doc)));
            } else if (canDeleteDraft(doc)) actions.append(makeButton("Excluir rascunho", "small-danger-button", () => manageDocument("delete_draft", doc)));
            else if (canArchive(doc)) actions.append(makeButton("Arquivar", "small-danger-button", () => manageDocument("archive", doc)));
            row.append(actions); body.append(row);
        }

        document.getElementById("fracas-empty").textContent = archivedView
            ? "Não há FRACAS arquivados ou nenhum registro corresponde à busca."
            : "Nenhum FRACAS corresponde aos filtros.";
        document.getElementById("fracas-empty").hidden = filtered.length > 0;

        const active = documents.filter(doc => !doc.deleted_at);
        document.getElementById("fracas-count-total").textContent = String(active.length);
        document.getElementById("fracas-count-open").textContent = String(active.filter(doc => doc.lifecycle_status === "open").length);
        document.getElementById("fracas-count-analysis").textContent = String(active.filter(doc => doc.lifecycle_status === "under_analysis").length);
        document.getElementById("fracas-count-action").textContent = String(active.filter(doc => doc.lifecycle_status === "action_implemented").length);
        document.getElementById("fracas-count-closed").textContent = String(active.filter(doc => doc.lifecycle_status === "closed_validated").length);
        document.getElementById("fracas-list-title").textContent = archivedView ? "FRACAS arquivados" : "Relatórios FRACAS";
        updateArchiveControls();
    }

    async function loadFracas() {
        refreshButton.disabled = true;
        try {
            const { data: docs, error: docsError } = await supabase.from("documents")
                .select("id,document_code,status,executor_name_snapshot,execution_date,created_at,created_by,deleted_at,deletion_reason")
                .eq("document_type", "fracas").order("created_at", { ascending: false });
            if (docsError) throw docsError;
            const ids = (docs || []).map(doc => doc.id);
            const { data: reports, error: reportError } = ids.length
                ? await supabase.from("fracas_reports").select("document_id,part_assembly_code,severity,lifecycle_status,environment").in("document_id", ids)
                : { data: [], error: null };
            if (reportError) throw reportError;
            const byId = new Map((reports || []).map(report => [report.document_id, report]));
            documents = (docs || []).map(doc => ({ ...doc, ...(byId.get(doc.id) || {}) }));
            render(); content.hidden = false; errorBox.hidden = true;
        } catch (error) { console.error("Falha ao carregar FRACAS:", error); showError(errorDetails(error)); }
        finally { refreshButton.disabled = false; }
    }

    async function initialize() {
        if (!supabase) throw new Error("Cliente Supabase não inicializado.");
        const { data: auth, error: authError } = await supabase.auth.getUser();
        if (authError || !auth.user) { location.replace("login.html"); return; }
        user = auth.user;
        const { data: memberProfile, error } = await supabase.from("profiles")
            .select("full_name,role,is_active").eq("id", user.id).single();
        if (error || !memberProfile || !memberProfile.is_active) {
            await supabase.auth.signOut(); location.replace("login.html?status=inactive"); return;
        }
        profile = memberProfile;
        document.getElementById("header-member-name").textContent = profile.full_name || user.email;
        updateArchiveControls(); content.hidden = false; await loadFracas();
    }

    refreshButton.addEventListener("click", loadFracas);
    searchInput.addEventListener("input", render);
    statusFilter.addEventListener("change", render);
    archiveToggle.addEventListener("click", () => setArchivedView(!archivedView));
    logoutButton.addEventListener("click", async () => {
        const { error } = await supabase.auth.signOut();
        if (error) { showError("Não foi possível encerrar a sessão."); return; }
        location.replace("login.html");
    });
    supabase.auth.onAuthStateChange(event => { if (event === "SIGNED_OUT") location.replace("login.html"); });
    initialize().catch(error => { console.error(error); showError(errorDetails(error)); });
})();
