(() => {
    "use strict";
    const supabase = window.megaHarpySupabase;
    const body = document.getElementById("documents-table-body");
    const errorBox = document.getElementById("docs-error");
    const feedbackBox = document.getElementById("docs-feedback");
    const content = document.getElementById("docs-content");
    const searchInput = document.getElementById("docs-search");
    const statusFilter = document.getElementById("status-filter");
    const refreshButton = document.getElementById("refresh-documents");
    const newButton = document.getElementById("new-machining-report");
    const logoutButton = document.getElementById("logout-button");
    const archivedToggle = document.getElementById("show-archived-documents");
    const archivedNote = document.getElementById("archived-view-note");
    let documents = [];
    let user = null;
    let profile = null;
    let archivedView = false;

    const statusLabels = {
        draft: ["Rascunho", "draft"],
        submitted: ["Aguardando revisão", "submitted"],
        changes_requested: ["Correções solicitadas", "changes"],
        approved: ["Aprovado", "approved"]
    };

    function showError(message) {
        errorBox.textContent = message;
        errorBox.hidden = false;
        feedbackBox.hidden = true;
    }
    function showFeedback(message) {
        feedbackBox.textContent = message;
        feedbackBox.hidden = !message;
        errorBox.hidden = true;
    }
    function errorDetails(error) {
        return [error?.message, error?.details, error?.hint, error?.code ? `Código: ${error.code}` : ""]
            .filter(Boolean).join(" — ") || "Operação não concluída. Consulte o Console para detalhes.";
    }
    function formatDate(value) {
        if (!value) return "—";
        const date = new Date(`${value}T12:00:00`);
        return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString("pt-BR");
    }
    function formatDateTime(value) {
        if (!value) return "—";
        const date = new Date(value);
        return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString("pt-BR");
    }
    function cell(value, className = "") {
        const td = document.createElement("td");
        td.textContent = value ?? "—";
        if (className) td.className = className;
        return td;
    }
    function button(label, className, action) {
        const element = document.createElement("button");
        element.type = "button";
        element.className = className;
        element.textContent = label;
        element.addEventListener("click", action);
        return element;
    }
    function canDeleteDraft(doc) {
        return !doc.deleted_at && doc.status === "draft"
            && (profile.role === "admin" || doc.created_by === user.id);
    }
    function canArchive(doc) {
        if (doc.deleted_at || doc.status === "draft") return false;
        if (profile.role === "admin") return true;
        return doc.created_by === user.id && doc.status === "changes_requested";
    }
    function canRestore(doc) {
        return Boolean(doc.deleted_at) && profile.role === "admin";
    }

    async function manageDocument(action, doc) {
        const admin = profile.role === "admin";
        let reason = "";
        if (action !== "restore") {
            const labels = {
                delete_draft: admin ? "Justificativa obrigatória para excluir" : "Motivo da exclusão (opcional)",
                archive: admin ? "Justificativa obrigatória para arquivar" : "Motivo do arquivamento (opcional)"
            };
            reason = window.prompt(`${labels[action]} ${doc.document_code}:`, admin ? "Registro de teste ou documento criado por engano" : "");
            if (reason === null) return;
            reason = reason.trim();
            if (admin && reason.length < 5) {
                window.alert("Administradores precisam informar uma justificativa com pelo menos 5 caracteres.");
                return;
            }
        } else if (!window.confirm(`Restaurar ${doc.document_code}? O documento voltará à lista normal.`)) {
            return;
        }

        const confirmations = {
            delete_draft: `Excluir definitivamente ${doc.document_code}?

Somente rascunhos podem ser excluídos. Esta ação não pode ser desfeita.`,
            archive: `Arquivar ${doc.document_code}?

O documento sairá da lista normal e poderá ser restaurado por um administrador.`,
            restore: ""
        };
        if (action !== "restore" && !window.confirm(confirmations[action])) return;

        const actionButtons = [...document.querySelectorAll(".docs-actions-cell button")];
        actionButtons.forEach((item) => item.disabled = true);
        try {
            const { data, error } = await supabase.rpc("manage_engineering_document", {
                p_document_id: doc.id,
                p_action: action,
                p_reason: reason || null
            });
            if (error) throw error;
            if (data?.error) throw new Error(data.error);
            const messages = {
                delete_draft: `${doc.document_code} foi excluído definitivamente. O código não será reutilizado.`,
                archive: `${doc.document_code} foi arquivado.`,
                restore: `${doc.document_code} foi restaurado.`
            };
            if (action === "restore" || action === "archive") {
                archivedView = false;
                statusFilter.value = "all";
            }
            await loadDocuments();
            showFeedback(messages[action]);
        } catch (error) {
            console.error(`Falha na operação ${action}:`, error);
            showError(errorDetails(error));
        } finally {
            actionButtons.forEach((item) => item.disabled = false);
        }
    }

    function updateArchiveControls() {
        if (!archivedToggle) return;
        const archivedCount = documents.filter((doc) => Boolean(doc.deleted_at)).length;
        archivedToggle.hidden = profile?.role !== "admin";
        archivedToggle.textContent = archivedView
            ? "← Voltar aos documentos"
            : `Ver arquivados${archivedCount ? ` (${archivedCount})` : ""}`;
        statusFilter.disabled = archivedView;
        if (archivedNote) archivedNote.hidden = !archivedView;
    }

    function setArchivedView(enabled) {
        archivedView = Boolean(enabled && profile?.role === "admin");
        searchInput.value = "";
        statusFilter.value = "all";
        updateArchiveControls();
        render();
    }

    function render() {
        const query = searchInput.value.trim().toLocaleLowerCase("pt-BR");
        const selected = statusFilter.value;
        const filtered = documents.filter((doc) => {
            const archived = Boolean(doc.deleted_at);
            if (archived !== archivedView) return false;
            const report = doc.machining_reports?.[0];
            const haystack = [doc.document_code, doc.executor_name_snapshot, report?.part_code, doc.deletion_reason]
                .filter(Boolean).join(" ").toLocaleLowerCase("pt-BR");
            return (!query || haystack.includes(query)) && (archivedView || selected === "all" || doc.status === selected);
        });

        body.replaceChildren();
        for (const doc of filtered) {
            const row = document.createElement("tr");
            row.append(cell(doc.document_code, "doc-code-cell"));
            row.append(cell(doc.machining_reports?.[0]?.part_code || "Não informado"));
            row.append(cell(doc.executor_name_snapshot || "—"));
            row.append(cell(formatDate(doc.execution_date)));
            const statusCell = document.createElement("td");
            const badge = document.createElement("span");
            const status = statusLabels[doc.status] || [doc.status, "draft"];
            badge.className = `status-badge ${doc.deleted_at ? "archived" : status[1]}`;
            badge.textContent = doc.deleted_at ? "Arquivado" : status[0];
            statusCell.append(badge);
            row.append(statusCell);

            const actions = document.createElement("td");
            actions.className = "docs-actions-cell";
            const open = document.createElement("a");
            open.className = "small-primary-button doc-open-button";
            open.href = `relatorio-usinagem.html?id=${encodeURIComponent(doc.id)}`;
            open.textContent = "Abrir";
            actions.append(open);

            if (canRestore(doc)) {
                actions.append(button("Restaurar", "small-secondary-button", () => manageDocument("restore", doc)));
                if (doc.status === "draft") {
                    actions.append(button("Excluir definitivamente", "small-danger-button", () => manageDocument("delete_draft", doc)));
                }
            } else if (canDeleteDraft(doc)) {
                actions.append(button("Excluir rascunho", "small-danger-button", () => manageDocument("delete_draft", doc)));
            } else if (canArchive(doc)) {
                actions.append(button("Arquivar", "small-danger-button", () => manageDocument("archive", doc)));
            }
            row.append(actions);
            body.append(row);
        }

        document.getElementById("docs-empty").textContent = archivedView
            ? "Não há documentos arquivados ou nenhum registro corresponde à busca."
            : "Nenhum relatório corresponde aos filtros.";
        document.getElementById("docs-empty").hidden = filtered.length > 0;
        const active = documents.filter((doc) => !doc.deleted_at);
        document.getElementById("count-total").textContent = String(active.length);
        document.getElementById("count-draft").textContent = String(active.filter((d) => d.status === "draft").length);
        document.getElementById("count-submitted").textContent = String(active.filter((d) => d.status === "submitted").length);
        document.getElementById("count-approved").textContent = String(active.filter((d) => d.status === "approved").length);
        const heading = document.querySelector(".docs-panel-heading h2");
        if (heading) heading.textContent = archivedView ? "Relatórios arquivados" : "Relatórios de usinagem";
        updateArchiveControls();
    }

    async function loadDocuments() {
        refreshButton.disabled = true;
        try {
            const { data: docs, error: docsError } = await supabase.from("documents")
                .select("id, document_code, document_type, status, executor_name_snapshot, execution_date, created_at, created_by, deleted_at, deletion_reason")
                .eq("document_type", "machining").order("created_at", { ascending: false });
            if (docsError) throw docsError;
            const ids = (docs || []).map((doc) => doc.id);
            let reports = [];
            if (ids.length) {
                const { data, error } = await supabase.from("machining_reports").select("document_id, part_code").in("document_id", ids);
                if (error) throw error;
                reports = data || [];
            }
            const map = new Map(reports.map((report) => [report.document_id, report]));
            documents = (docs || []).map((doc) => ({ ...doc, machining_reports: map.has(doc.id) ? [map.get(doc.id)] : [] }));
            render();
            content.hidden = false;
            errorBox.hidden = true;
        } catch (error) {
            console.error("Falha ao carregar documentos:", error);
            showError(errorDetails(error));
        } finally {
            refreshButton.disabled = false;
        }
    }

    async function initialize() {
        if (!supabase) throw new Error("Cliente Supabase não inicializado.");
        const { data: authData, error: authError } = await supabase.auth.getUser();
        if (authError || !authData.user) { window.location.replace("login.html"); return; }
        user = authData.user;
        const { data: memberProfile, error } = await supabase.from("profiles")
            .select("full_name, role, is_active").eq("id", user.id).single();
        if (error || !memberProfile || !memberProfile.is_active) {
            await supabase.auth.signOut(); window.location.replace("login.html?status=inactive"); return;
        }
        profile = memberProfile;
        document.getElementById("header-member-name").textContent = profile.full_name || user.email;
        archivedToggle.hidden = profile.role !== "admin";
        updateArchiveControls();
        content.hidden = false;
        await loadDocuments();
    }

    newButton.addEventListener("click", () => window.location.href = "relatorio-usinagem.html");
    refreshButton.addEventListener("click", loadDocuments);
    searchInput.addEventListener("input", render);
    statusFilter.addEventListener("change", render);
    archivedToggle.addEventListener("click", () => setArchivedView(!archivedView));
    logoutButton.addEventListener("click", async () => {
        const { error } = await supabase.auth.signOut();
        if (error) { showError("Não foi possível encerrar a sessão."); return; }
        window.location.replace("login.html");
    });
    supabase.auth.onAuthStateChange((event) => { if (event === "SIGNED_OUT") window.location.replace("login.html"); });
    initialize().catch((error) => { console.error(error); showError(errorDetails(error)); });
})();
