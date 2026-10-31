(() => {
    "use strict";

    const supabase = window.megaHarpySupabase;
    const body = document.getElementById("documents-table-body");
    const errorBox = document.getElementById("docs-error");
    const content = document.getElementById("docs-content");
    const searchInput = document.getElementById("docs-search");
    const statusFilter = document.getElementById("status-filter");
    const refreshButton = document.getElementById("refresh-documents");
    const newButton = document.getElementById("new-machining-report");
    const logoutButton = document.getElementById("logout-button");
    let documents = [];

    const statusLabels = {
        draft: ["Rascunho", "draft"],
        submitted: ["Aguardando revisão", "submitted"],
        changes_requested: ["Correções solicitadas", "changes"],
        approved: ["Aprovado", "approved"]
    };

    function showError(message) {
        errorBox.textContent = message;
        errorBox.hidden = false;
        content.hidden = true;
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

    function render() {
        const query = searchInput.value.trim().toLocaleLowerCase("pt-BR");
        const selectedStatus = statusFilter.value;
        const filtered = documents.filter((doc) => {
            const report = doc.machining_reports?.[0] || null;
            const searchable = [doc.document_code, doc.executor_name_snapshot, report?.part_code]
                .filter(Boolean).join(" ").toLocaleLowerCase("pt-BR");
            return (!query || searchable.includes(query)) &&
                (selectedStatus === "all" || doc.status === selectedStatus);
        });

        body.replaceChildren();
        for (const doc of filtered) {
            const row = document.createElement("tr");
            row.append(makeCell(doc.document_code, "doc-code-cell"));
            row.append(makeCell(doc.machining_reports?.[0]?.part_code || "Não informado"));
            row.append(makeCell(doc.executor_name_snapshot || "—"));
            row.append(makeCell(formatDate(doc.execution_date)));

            const status = statusLabels[doc.status] || [doc.status, "draft"];
            const statusCell = document.createElement("td");
            const badge = document.createElement("span");
            badge.className = `status-badge ${status[1]}`;
            badge.textContent = status[0];
            statusCell.append(badge);
            row.append(statusCell);

            const actionCell = document.createElement("td");
            const openButton = document.createElement("a");
            openButton.className = "small-primary-button doc-open-button";
            openButton.href = `relatorio-usinagem.html?id=${encodeURIComponent(doc.id)}`;
            openButton.textContent = "Abrir";
            actionCell.append(openButton);
            row.append(actionCell);
            body.append(row);
        }

        document.getElementById("docs-empty").hidden = filtered.length > 0;
        document.getElementById("count-total").textContent = String(documents.length);
        document.getElementById("count-draft").textContent = String(documents.filter((d) => d.status === "draft").length);
        document.getElementById("count-submitted").textContent = String(documents.filter((d) => d.status === "submitted").length);
        document.getElementById("count-approved").textContent = String(documents.filter((d) => d.status === "approved").length);
    }

    async function loadDocuments() {
        refreshButton.disabled = true;
        body.innerHTML = '<tr><td colspan="6" class="docs-placeholder">Carregando documentos...</td></tr>';
        try {
            const { data: docs, error: docsError } = await supabase
                .from("documents")
                .select("id, document_code, document_type, status, executor_name_snapshot, execution_date, created_at")
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

    async function initialize() {
        const { data: authData, error: authError } = await supabase.auth.getUser();
        if (authError || !authData.user) {
            window.location.replace("login.html");
            return;
        }
        const { data: profile, error: profileError } = await supabase
            .from("profiles").select("full_name, role, is_active").eq("id", authData.user.id).single();
        if (profileError || !profile || !profile.is_active) {
            await supabase.auth.signOut();
            window.location.replace("login.html?status=inactive");
            return;
        }
        document.getElementById("header-member-name").textContent = profile.full_name || authData.user.email;
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
