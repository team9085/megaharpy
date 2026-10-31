(() => {
    "use strict";

    const supabase = window.megaHarpySupabase;
    const documentId = new URLSearchParams(location.search).get("id");
    const errorBox = document.getElementById("eco-review-error");
    const content = document.getElementById("eco-review-content");
    const notes = document.getElementById("eco-review-notes");
    const approveButton = document.getElementById("eco-review-approve");
    const changesButton = document.getElementById("eco-review-request-changes");
    const logoutButton = document.getElementById("logout-button");

    let doc = null;
    let busy = false;

    function showError(message) {
        errorBox.textContent = message;
        errorBox.hidden = !message;
    }

    function setText(id, value) {
        document.getElementById(id).textContent = value === null || value === undefined || value === "" ? "—" : String(value);
    }

    function formatDate(value) {
        if (!value) return "—";
        const date = new Date(`${value}T12:00:00`);
        return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString("pt-BR");
    }

    function formatTime(start, end) {
        return `${start?.slice(0, 5) || "—"} – ${end?.slice(0, 5) || "—"}`;
    }

    function renderHistory(reviews) {
        const host = document.getElementById("eco-review-history");
        host.replaceChildren();
        if (!reviews.length) {
            const empty = document.createElement("p");
            empty.className = "docs-empty";
            empty.textContent = "Esta ECO ainda não possui revisões anteriores.";
            host.append(empty);
            return;
        }
        for (const review of reviews) {
            const item = document.createElement("article");
            item.className = "review-history-item";
            const heading = document.createElement("div");
            heading.className = "review-history-heading";
            const name = document.createElement("strong");
            name.textContent = review.reviewer_name_snapshot || "Revisor da equipe";
            const badge = document.createElement("span");
            badge.className = `status-badge ${review.decision === "approved" ? "approved" : "changes"}`;
            badge.textContent = review.decision === "approved" ? "Aprovada" : "Correções solicitadas";
            heading.append(name, badge);
            const time = document.createElement("time");
            time.className = "review-history-date";
            time.textContent = new Date(review.created_at).toLocaleString("pt-BR");
            const note = document.createElement("p");
            note.textContent = review.notes || "Nenhuma observação registrada.";
            item.append(heading, time, note);
            host.append(item);
        }
    }

    function render(report, reviews) {
        setText("eco-review-code", doc.document_code);
        const status = document.getElementById("eco-review-status");
        status.textContent = doc.status === "submitted" ? "Aguardando revisão" : (doc.status === "approved" ? "Aprovada" : doc.status);
        status.className = `status-badge ${doc.status === "submitted" ? "submitted" : doc.status === "approved" ? "approved" : "changes"}`;
        document.getElementById("eco-review-subtitle").textContent = doc.submitted_at
            ? `Enviada em ${new Date(doc.submitted_at).toLocaleString("pt-BR")}`
            : "Detalhes da solicitação de mudança.";
        setText("eco-review-date", formatDate(doc.execution_date));
        setText("eco-review-time", formatTime(doc.start_time, doc.end_time));
        setText("eco-review-author", doc.executor_name_snapshot);
        setText("eco-reviewer-snapshot", doc.reviewer_name_snapshot || "Aguardando revisão");
        setText("eco-review-affected-codes", report?.affected_codes);
        setText("eco-review-reason", report?.change_reason);
        renderHistory(reviews);

        const canDecide = doc.status === "submitted" && !doc.deleted_at;
        document.getElementById("eco-review-decision-panel").hidden = !canDecide;
        if (!canDecide) showError("Esta ECO não está mais aguardando revisão. Atualize a fila para consultar o estado atual.");
    }

    async function loadDocument() {
        if (!documentId) throw new Error("Identificador da ECO ausente na URL.");
        const { data, error } = await supabase.from("documents").select("*").eq("id", documentId).maybeSingle();
        if (error) throw error;
        if (!data || data.document_type !== "eco") throw new Error("Ordem de Mudança de Engenharia não encontrada.");
        doc = data;
        const [reportResult, historyResult] = await Promise.all([
            supabase.from("eco_reports").select("*").eq("document_id", documentId).maybeSingle(),
            supabase.from("document_reviews").select("reviewer_name_snapshot,decision,notes,created_at").eq("document_id", documentId).order("created_at", { ascending: false })
        ]);
        if (reportResult.error) throw reportResult.error;
        if (historyResult.error) throw historyResult.error;
        render(reportResult.data, historyResult.data || []);
        content.hidden = false;
    }

    async function decide(decision) {
        if (busy || !doc) return;
        const note = notes.value.trim();
        if (decision === "changes_requested" && note.length < 3) {
            showError("Descreva as correções solicitadas (mínimo de 3 caracteres).");
            notes.focus();
            return;
        }
        const confirmed = window.confirm(decision === "approved"
            ? `Aprovar ${doc.document_code}?`
            : `Devolver ${doc.document_code} para correções?`);
        if (!confirmed) return;

        busy = true;
        approveButton.disabled = true;
        changesButton.disabled = true;
        showError("");
        try {
            const { error } = await supabase.rpc("review_engineering_document", {
                p_document_id: doc.id,
                p_decision: decision,
                p_notes: note || null
            });
            if (error) throw error;
            location.replace(`revisoes.html?result=${decision === "approved" ? "approved" : "changes"}`);
        } catch (error) {
            console.error("Falha ao registrar revisão da ECO:", error);
            showError([error.message, error.details, error.hint, error.code].filter(Boolean).join(" — ") || "Não foi possível registrar a revisão.");
        } finally {
            busy = false;
            approveButton.disabled = false;
            changesButton.disabled = false;
        }
    }

    async function initialize() {
        if (!supabase) throw new Error("Cliente Supabase não inicializado.");
        const { data: auth, error: authError } = await supabase.auth.getUser();
        if (authError || !auth.user) { location.replace("login.html"); return; }
        const { data: profile, error } = await supabase.from("profiles")
            .select("full_name,role,is_active").eq("id", auth.user.id).single();
        if (error || !profile || !profile.is_active) {
            await supabase.auth.signOut();
            location.replace("login.html?status=inactive");
            return;
        }
        if (!["reviewer", "admin"].includes(profile.role)) { location.replace("portal.html"); return; }
        document.getElementById("header-member-name").textContent = profile.full_name || auth.user.email;
        await loadDocument();
    }

    approveButton.addEventListener("click", () => decide("approved"));
    changesButton.addEventListener("click", () => decide("changes_requested"));
    logoutButton.addEventListener("click", async () => {
        const { error } = await supabase.auth.signOut();
        if (error) { showError("Não foi possível encerrar a sessão."); return; }
        location.replace("login.html");
    });
    supabase.auth.onAuthStateChange(event => { if (event === "SIGNED_OUT") location.replace("login.html"); });
    initialize().catch(error => { console.error(error); showError(error.message || "Não foi possível carregar a ECO para revisão."); });
})();
