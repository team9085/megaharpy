(() => {
    "use strict";

    const supabase = window.megaHarpySupabase;
    const params = new URLSearchParams(location.search);
    const documentId = params.get("id");
    const form = document.getElementById("eco-form");
    const errorBox = document.getElementById("eco-error");
    const messageBox = document.getElementById("eco-message");
    const saveButton = document.getElementById("eco-save-draft");
    const submitButton = document.getElementById("eco-submit");
    const printButton = document.getElementById("eco-print");
    const logoutButton = document.getElementById("logout-button");

    const statusLabels = {
        draft: ["Rascunho", "draft"],
        submitted: ["Aguardando revisão", "submitted"],
        changes_requested: ["Correções solicitadas", "changes"],
        approved: ["Aprovada", "approved"]
    };

    let user = null;
    let profile = null;
    let currentDocument = null;
    let canEdit = false;
    let busy = false;

    const value = id => document.getElementById(id).value.trim();
    const setValue = (id, valueToSet) => { document.getElementById(id).value = valueToSet ?? ""; };

    function showError(message) {
        errorBox.textContent = message;
        errorBox.hidden = !message;
        messageBox.hidden = true;
    }

    function showMessage(message, type = "info") {
        messageBox.textContent = message;
        messageBox.className = `notice ${type}`;
        messageBox.hidden = !message;
        errorBox.hidden = true;
    }

    function setBusy(state) {
        busy = state;
        saveButton.disabled = state;
        submitButton.disabled = state;
    }

    function updateStatus(status) {
        const [label, cssClass] = statusLabels[status] || [status, "draft"];
        const badge = document.getElementById("eco-document-status");
        badge.textContent = label;
        badge.className = `status-badge ${cssClass}`;
    }

    function renderHistory(reviews) {
        const panel = document.getElementById("eco-review-history-panel");
        const host = document.getElementById("eco-review-history");
        host.replaceChildren();
        panel.hidden = !reviews.length;
        for (const review of reviews) {
            const item = document.createElement("article");
            item.className = "review-history-item";
            const heading = document.createElement("div");
            heading.className = "review-history-heading";
            const name = document.createElement("strong");
            name.textContent = review.reviewer_name_snapshot || "Revisor da equipe";
            const decision = document.createElement("span");
            decision.className = `status-badge ${review.decision === "approved" ? "approved" : "changes"}`;
            decision.textContent = review.decision === "approved" ? "Aprovada" : "Correções solicitadas";
            heading.append(name, decision);
            const date = document.createElement("time");
            date.className = "review-history-date";
            date.textContent = new Date(review.created_at).toLocaleString("pt-BR");
            const note = document.createElement("p");
            note.textContent = review.notes || "Nenhuma observação registrada.";
            item.append(heading, date, note);
            host.append(item);
        }
    }

    function collectReport() {
        return {
            affected_codes: value("eco-affected-codes"),
            change_reason: value("eco-change-reason")
        };
    }

    function fillForm() {
        const doc = currentDocument;
        const report = doc.report || {};
        document.getElementById("eco-document-code").textContent = doc.document_code;
        updateStatus(doc.status);
        setValue("eco-date", doc.execution_date);
        setValue("eco-start-time", doc.start_time?.slice(0, 5));
        setValue("eco-end-time", doc.end_time?.slice(0, 5));
        setValue("eco-affected-codes", report.affected_codes);
        setValue("eco-change-reason", report.change_reason);
        document.getElementById("eco-author").textContent = doc.executor_name_snapshot || "—";
        document.getElementById("eco-reviewer").textContent = doc.reviewer_name_snapshot || "Aguardando revisão";
        document.getElementById("eco-subtitle").textContent = `Criada em ${new Date(doc.created_at).toLocaleString("pt-BR")}`;
        renderHistory(doc.reviews || []);
    }

    function applyPermissions() {
        const archived = Boolean(currentDocument?.deleted_at);
        canEdit = Boolean(currentDocument && !archived && currentDocument.created_by === user.id &&
            ["draft", "changes_requested"].includes(currentDocument.status));
        const archivedNotice = document.getElementById("eco-archived-notice");
        archivedNotice.hidden = !archived;
        if (archived) {
            archivedNotice.textContent = "Esta ECO está arquivada e disponível somente para consulta. Um administrador pode restaurá-la pela área Engenharia.";
            const badge = document.getElementById("eco-document-status");
            badge.textContent = "Arquivada";
            badge.className = "status-badge archived";
        }
        form.querySelectorAll("input, textarea, select").forEach(element => { element.disabled = !canEdit; });
        saveButton.hidden = !canEdit;
        submitButton.hidden = !canEdit;
        printButton.hidden = !currentDocument?.id;
        document.getElementById("eco-reviewer").textContent = currentDocument?.reviewer_name_snapshot || "Aguardando revisão";
        document.getElementById("eco-subtitle").textContent = canEdit
            ? "Descreva a mudança proposta e os itens de engenharia afetados."
            : "Visualização da solicitação. As decisões acontecem na área Revisão técnica.";
    }

    async function saveReport() {
        if (busy) return null;
        setBusy(true);
        showError("");
        try {
            const report = collectReport();
            const docFields = {
                record_part: "initial",
                execution_date: value("eco-date"),
                start_time: value("eco-start-time") || null,
                end_time: value("eco-end-time") || null
            };
            if (!docFields.execution_date) throw new Error("Informe a data da solicitação.");

            let doc = currentDocument;
            if (!doc) {
                const { data, error } = await supabase.from("documents")
                    .insert({ document_type: "eco", ...docFields }).select("*").single();
                if (error) throw error;
                doc = data;
                currentDocument = { ...data, report: null, reviews: [] };
                history.replaceState({}, "", `${location.pathname}?id=${encodeURIComponent(doc.id)}`);
            } else {
                const { data, error } = await supabase.from("documents")
                    .update(docFields).eq("id", doc.id).select("*").single();
                if (error) throw error;
                doc = { ...doc, ...data };
                currentDocument = { ...currentDocument, ...data };
            }

            const { error: reportError } = await supabase.from("eco_reports")
                .upsert({ document_id: doc.id, ...report }, { onConflict: "document_id" });
            if (reportError) throw reportError;

            currentDocument = { ...currentDocument, report };
            document.getElementById("eco-document-code").textContent = doc.document_code;
            updateStatus(doc.status);
            saveButton.textContent = "Salvar alterações";
            showMessage("Rascunho da ECO salvo. A solicitação já está disponível para consulta pelos membros ativos.", "success");
            applyPermissions();
            return doc;
        } finally {
            setBusy(false);
        }
    }

    function validateForSubmission() {
        const report = collectReport();
        if (!value("eco-date") || !value("eco-start-time") || !value("eco-end-time")) {
            throw new Error("Informe a data da solicitação e os horários de início e término.");
        }
        if (report.affected_codes.length < 3) {
            throw new Error("Informe o código de pelo menos uma montagem ou peça alterada.");
        }
        if (report.change_reason.length < 10) {
            throw new Error("Descreva o motivo da solicitação com pelo menos 10 caracteres.");
        }
    }

    async function submitReport() {
        try {
            validateForSubmission();
            const doc = await saveReport();
            if (!doc) return;
            setBusy(true);
            const { error } = await supabase.rpc("submit_eco_document", { p_document_id: doc.id });
            if (error) throw error;
            currentDocument.status = "submitted";
            currentDocument.submitted_at = new Date().toISOString();
            updateStatus("submitted");
            applyPermissions();
            showMessage("ECO enviada para revisão técnica.", "success");
        } catch (error) {
            console.error("Falha ao enviar ECO:", error);
            showError(error.message || "Não foi possível enviar a ECO.");
        } finally {
            setBusy(false);
        }
    }

    async function fetchCurrentDocument() {
        const { data, error } = await supabase.from("documents").select("*").eq("id", documentId).single();
        if (error) throw error;
        if (data.document_type !== "eco") throw new Error("Este documento não é uma Ordem de Mudança de Engenharia.");
        const [reportResult, reviewsResult] = await Promise.all([
            supabase.from("eco_reports").select("*").eq("document_id", documentId).maybeSingle(),
            supabase.from("document_reviews").select("reviewer_name_snapshot,decision,notes,created_at").eq("document_id", documentId).order("created_at", { ascending: false })
        ]);
        if (reportResult.error) throw reportResult.error;
        if (reviewsResult.error) throw reviewsResult.error;
        currentDocument = { ...data, report: reportResult.data, reviews: reviewsResult.data || [] };
        fillForm();
        applyPermissions();
    }

    async function initialize() {
        if (!supabase) throw new Error("Cliente Supabase não inicializado.");
        const { data: auth, error: authError } = await supabase.auth.getUser();
        if (authError || !auth.user) { location.replace("login.html"); return; }
        user = auth.user;
        const { data: memberProfile, error } = await supabase.from("profiles")
            .select("full_name,role,is_active").eq("id", user.id).single();
        if (error || !memberProfile || !memberProfile.is_active) {
            await supabase.auth.signOut();
            location.replace("login.html?status=inactive");
            return;
        }
        profile = memberProfile;
        document.getElementById("header-member-name").textContent = profile.full_name || user.email;

        if (documentId) {
            await fetchCurrentDocument();
        } else {
            const today = new Date();
            setValue("eco-date", `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`);
            document.getElementById("eco-author").textContent = profile.full_name || user.email;
            document.getElementById("eco-document-status").textContent = "Novo rascunho";
            document.getElementById("eco-document-status").className = "status-badge draft";
            printButton.hidden = true;
            canEdit = true;
        }
    }

    saveButton.addEventListener("click", async () => {
        try { await saveReport(); }
        catch (error) { console.error(error); showError(error.message || "Não foi possível salvar o rascunho."); }
    });
    submitButton.addEventListener("click", submitReport);
    printButton.addEventListener("click", () => window.print());
    logoutButton.addEventListener("click", async () => {
        const { error } = await supabase.auth.signOut();
        if (error) { window.alert("Não foi possível encerrar a sessão."); return; }
        location.replace("login.html");
    });
    supabase.auth.onAuthStateChange(event => { if (event === "SIGNED_OUT") location.replace("login.html"); });
    initialize().catch(error => {
        console.error("Falha ao iniciar ECO:", error);
        showError(error.message || "Não foi possível carregar a Ordem de Mudança.");
        form.hidden = true;
    });
})();
