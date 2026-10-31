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
    const archivedFilterOption = document.getElementById("archived-filter-option");

    let documents = [];
    let user = null;
    let profile = null;

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
        content.hidden = true;
    }

    function showFeedback(message) {
        feedbackBox.textContent = message;
        feedbackBox.hidden = false;
        errorBox.hidden = true;
    }

    function formatDate(value) {
        if (!value) return "—";
        const date = new Date(`${value}T12:00:00`);
        return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString("pt-BR");
    }

    function makeCell(text, className = "") {
        const td = document.createElement("td");
        td.textContent = text ?? "—";
        if (className) td.className = className;
        return td;
    }

    function makeButton(label, className, onClick) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = className;
        button.textContent = label;
        button.addEventListener("click", onClick);
        return button;
    }

    function canDeleteDraft(doc) {
        return doc.status === "draft"
            && (profile?.role === "admin" || doc.created_by === user?.id);
    }

    function canArchive(doc) {
        if (doc.deleted_at) return false;
        if (profile?.role === "admin") return doc.status !== "draft";
        return doc.created_by === user?.id && doc.status === "changes_requested";
    }

    function render() {
        const query = searchInput.value.trim().toLocaleLowerCase("pt-BR");
        const selectedStatus = statusFilter.value;
        const archivedView = selectedStatus === "archived";

        const filtered = documents.filter((doc) => {
            const isArchived = Boolean(doc.deleted_at);
            if (archivedView !== isArchived) return false;

            const report = doc.machining_reports?.[0] || null;
            const searchable = [
                doc.document_code,
                doc.executor_name_snapshot,
                report?.part_code,
                doc.deletion_reason
            ].filter(Boolean).join(" ").toLocaleLowerCase("pt-BR");

            return (!query || searchable.includes(query))
                && (archivedView || selectedStatus === "all" || doc.status === selectedStatus);
        });

        body.replaceChildren();
        for (const doc of filtered) {
            const row = document.createElement("tr");
            row.append(makeCell(doc.document_code, "doc-code-cell"));
            row.append(makeCell(doc.machining_reports?.[0]?.part_code || "Não informado"));
            row.append(makeCell(doc.executor_name_snapshot || "—"));
            row.append(makeCell(formatDate(doc.execution_date)));

            const statusCell = document.createElement("td");
            const badge = document.createElement("span");
            const status = statusLabels[doc.status] || [doc.status, "draft"];
            badge.className = `status-badge ${status[1]}`;
            badge.textContent = doc.deleted_at ? "Arquivado" : status[0];
            statusCell.append(badge);
            row.append(statusCell);

            const actionCell = document.createElement("td");
            actionCell.className = "docs-actions-cell";
            const openButton = document.createElement("a");
            openButton.className = "small-primary-button doc-open-button";
            openButton.href = `relatorio-usinagem.html?id=${encodeURIComponent(doc.id)}`;
            openButton.textContent = "Abrir";
            actionCell.append(openButton);

            if (doc.deleted_at) {
                if (profile?.role === "admin") {
                    actionCell.append(makeButton("Restaurar", "small-secondary-button", () => restoreDocument(doc)));
                    if (canDeleteDraft(doc)) {
                        actionCell.append(makeButton("Excluir definitivamente", "small-danger-button", () => deleteDraft(doc)));
                    }
                }
            } else if (canDeleteDraft(doc)) {
                actionCell.append(makeButton("Excluir rascunho", "small-danger-button", () => deleteDraft(doc)));
            } else if (canArchive(doc)) {
                actionCell.append(makeButton("Arquivar", "small-danger-button", () => archiveDocument(doc)));
            }

            row.append(actionCell);
            body.append(row);
        }

        document.getElementById("docs-empty").textContent = archivedView
            ? "A lixeira está vazia ou nenhum registro corresponde à busca."
            : "Nenhum relatório corresponde aos filtros.";
        document.getElementById("docs-empty").hidden = filtered.length > 0;

        const activeDocuments = documents.filter((doc) => !doc.deleted_at);
        document.getElementById("count-total").textContent = String(activeDocuments.length);
        document.getElementById("count-draft").textContent = String(activeDocuments.filter((d) => d.status === "draft").length);
        document.getElementById("count-submitted").textContent = String(activeDocuments.filter((d) => d.status === "submitted").length);
        document.getElementById("count-approved").textContent = String(activeDocuments.filter((d) => d.status === "approved").length);

        const heading = document.querySelector(".docs-panel-heading h2");
        if (heading) heading.textContent = archivedView ? "Relatórios arquivados" : "Relatórios de usinagem";
    }

    async function loadDocuments() {
        refreshButton.disabled = true;
        body.innerHTML = '<tr><td colspan="6" class="docs-placeholder">Carregando documentos...</td></tr>';
        try {
            const { data: docs, error: docsError } = await supabase
                .from("documents")
                .select("id, document_code, document_type, status, executor_name_snapshot, execution_date, created_at, created_by, deleted_at, deleted_by, deletion_reason")
                .eq("document_type", "machining")
                .order("created_at", { ascending: false });
            if (docsError) throw docsError;

            const ids = (docs || []).map((doc) => doc.id);
            let reports = [];
            if (ids.length) {
                const { data, error } = await supabase
                    .from("machining_reports")
                    .select("document_id, part_code")
                    .in("document_id", ids);
                if (error) throw error;
                reports = data || [];
            }
            const reportById = new Map(reports.map((report) => [report.document_id, report]));
            documents = (docs || []).map((doc) => ({
                ...doc,
                machining_reports: reportById.has(doc.id) ? [reportById.get(doc.id)] : []
            }));
            render();
            content.hidden = false;
            errorBox.hidden = true;
        } catch (error) {
            console.error("Falha ao carregar documentos:", error);
            showError(error.message || "Não foi possível carregar os relatórios.");
        } finally {
            refreshButton.disabled = false;
        }
    }

    async function deleteDraft(doc) {
        const isAdmin = profile?.role === "admin";
        const reason = window.prompt(
            isAdmin
                ? `Justificativa obrigatória para excluir definitivamente ${doc.document_code}:`
                : `Motivo da exclusão de ${doc.document_code} (opcional):`,
            isAdmin ? "Rascunho criado durante testes" : ""
        );
        if (reason === null) return;
        if (isAdmin && reason.trim().length < 5) {
            window.alert("A justificativa do administrador precisa ter pelo menos 5 caracteres.");
            return;
        }
        const confirmation = window.confirm(
            `Excluir definitivamente ${doc.document_code}?

Esta ação apaga o rascunho e seus dados associados. Ela não pode ser desfeita.`
        );
        if (!confirmation) return;

        try {
            const { error } = await supabase.rpc("delete_engineering_draft", {
                p_document_id: doc.id,
                p_reason: reason.trim() || null
            });
            if (error) throw error;
            await loadDocuments();
            showFeedback(`${doc.document_code} foi excluído definitivamente. O código não será reutilizado.`);
        } catch (error) {
            console.error("Falha ao excluir rascunho:", error);
            window.alert(error.message || "Não foi possível excluir o rascunho.");
        }
    }

    async function archiveDocument(doc) {
        const isAdmin = profile?.role === "admin";
        const reason = window.prompt(
            isAdmin
                ? `Justificativa obrigatória para arquivar ${doc.document_code}:`
                : `Motivo do arquivamento de ${doc.document_code} (opcional):`,
            isAdmin ? "Registro de teste ou documento criado por engano" : ""
        );
        if (reason === null) return;
        if (isAdmin && reason.trim().length < 5) {
            window.alert("A justificativa do administrador precisa ter pelo menos 5 caracteres.");
            return;
        }
        if (!window.confirm(`Arquivar ${doc.document_code}? O relatório sairá da lista normal, mas poderá ser restaurado por um administrador.`)) {
            return;
        }

        try {
            const { error } = await supabase.rpc("archive_engineering_document", {
                p_document_id: doc.id,
                p_reason: reason.trim() || null
            });
            if (error) throw error;
            showFeedback(`${doc.document_code} foi arquivado.`);
            if (statusFilter.value === "archived") statusFilter.value = "all";
            await loadDocuments();
            showFeedback(`${doc.document_code} foi arquivado. O registro pode ser recuperado por um administrador na opção Arquivados.`);
        } catch (error) {
            console.error("Falha ao arquivar documento:", error);
            window.alert(error.message || "Não foi possível arquivar o relatório.");
        }
    }

    async function restoreDocument(doc) {
        if (!window.confirm(`Restaurar ${doc.document_code} para a lista normal de relatórios?`)) return;
        try {
            const { error } = await supabase.rpc("restore_engineering_document", {
                p_document_id: doc.id,
                p_reason: "Restaurado pelo painel administrativo"
            });
            if (error) throw error;
            await loadDocuments();
            showFeedback(`${doc.document_code} foi restaurado.`);
        } catch (error) {
            console.error("Falha ao restaurar documento:", error);
            window.alert(error.message || "Não foi possível restaurar o relatório.");
        }
    }

    async function initialize() {
        const { data: authData, error: authError } = await supabase.auth.getUser();
        if (authError || !authData.user) {
            window.location.replace("login.html");
            return;
        }
        user = authData.user;
        const { data: memberProfile, error: profileError } = await supabase
            .from("profiles").select("full_name, role, is_active").eq("id", user.id).single();
        if (profileError || !memberProfile || !memberProfile.is_active) {
            await supabase.auth.signOut();
            window.location.replace("login.html?status=inactive");
            return;
        }
        profile = memberProfile;
        document.getElementById("header-member-name").textContent = profile.full_name || user.email;
        archivedFilterOption.hidden = profile.role !== "admin";
        archivedFilterOption.disabled = profile.role !== "admin";
        content.hidden = false;
        await loadDocuments();
    }

    newButton.addEventListener("click", () => window.location.href = "relatorio-usinagem.html");
    refreshButton.addEventListener("click", loadDocuments);
    searchInput.addEventListener("input", render);
    statusFilter.addEventListener("change", render);
    logoutButton.addEventListener("click", async () => {
        logoutButton.disabled = true;
        const { error } = await supabase.auth.signOut();
        if (error) {
            alert("Não foi possível encerrar a sessão. Tente novamente.");
            logoutButton.disabled = false;
            return;
        }
        window.location.replace("login.html");
    });
    supabase.auth.onAuthStateChange((event) => {
        if (event === "SIGNED_OUT") window.location.replace("login.html");
    });
    initialize().catch((error) => {
        console.error(error);
        showError("Ocorreu um erro ao iniciar a documentação.");
    });
})();
