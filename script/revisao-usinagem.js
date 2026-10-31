(() => {
    "use strict";
    const supabase = window.megaHarpySupabase;
    const params = new URLSearchParams(location.search);
    const documentId = params.get("id");
    const errorBox = document.getElementById("review-detail-error");
    const feedbackBox = document.getElementById("review-detail-feedback");
    const content = document.getElementById("review-detail-content");
    const notes = document.getElementById("review-decision-notes");
    const approveButton = document.getElementById("review-approve");
    const changesButton = document.getElementById("review-request-changes");
    const logout = document.getElementById("logout-button");
    let user = null;
    let busy = false;
    let doc = null;

    function showError(message) { errorBox.textContent = message; errorBox.hidden = !message; feedbackBox.hidden = true; }
    function showFeedback(message) { feedbackBox.textContent = message; feedbackBox.hidden = !message; errorBox.hidden = true; }
    function setText(id, value) { document.getElementById(id).textContent = value === null || value === undefined || value === "" ? "—" : String(value); }
    function formatDate(value) { if (!value) return "—"; const d = new Date(`${value}T12:00:00`); return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("pt-BR"); }
    function formatTime(value) { return value ? value.slice(0, 5) : "—"; }
    function setBusy(value) { busy = value; approveButton.disabled = value; changesButton.disabled = value; }
    function renderHistory(rows) {
        const host = document.getElementById("review-detail-history"); host.replaceChildren();
        if (!rows.length) { const p = document.createElement("p"); p.className = "docs-empty"; p.textContent = "Este documento ainda não possui revisões anteriores."; host.append(p); return; }
        for (const row of rows) {
            const item = document.createElement("article"); item.className = "review-history-item";
            const head = document.createElement("div"); head.className = "review-history-heading";
            const name = document.createElement("strong"); name.textContent = row.reviewer_name_snapshot || "Revisor da equipe";
            const badge = document.createElement("span"); badge.className = `status-badge ${row.decision === "approved" ? "approved" : "changes"}`;
            badge.textContent = row.decision === "approved" ? "Aprovado" : "Correções solicitadas";
            head.append(name, badge);
            const time = document.createElement("time"); time.className = "review-history-date"; time.textContent = new Date(row.created_at).toLocaleString("pt-BR");
            const p = document.createElement("p"); p.textContent = row.notes || "Nenhuma observação registrada.";
            item.append(head, time, p); host.append(item);
        }
    }
    function renderDocument(report, checks, reviews) {
        setText("review-document-code", doc.document_code);
        const status = document.getElementById("review-document-status"); status.textContent = doc.status === "submitted" ? "Aguardando revisão" : doc.status; status.className = `status-badge ${doc.status === "submitted" ? "submitted" : "draft"}`;
        setText("review-subtitle", `Enviado em ${doc.submitted_at ? new Date(doc.submitted_at).toLocaleString("pt-BR") : "data não disponível"}`);
        setText("review-record-part", ({ initial: "Início", continuation: "Continuação", final: "Final" })[doc.record_part] || doc.record_part);
        setText("review-execution-date", formatDate(doc.execution_date));
        setText("review-execution-time", `${formatTime(doc.start_time)} – ${formatTime(doc.end_time)}`);
        setText("review-executor", doc.executor_name_snapshot);
        setText("review-part-code", report?.part_code);
        setText("review-machine", report?.machine_used);
        setText("review-material", report?.material_used);
        setText("review-raw-dimensions", report?.raw_material_dimensions);
        setText("review-operations", report?.operations_performed);
        setText("review-tools", report?.tools_used);
        setText("review-observations", report?.execution_observations);
        setText("review-produced", report?.produced_quantity ?? 0);
        setText("review-scrap", report?.scrap_quantity ?? 0);
        const dimensionBody = document.getElementById("review-dimensions-body"); dimensionBody.replaceChildren();
        if (!checks.length) { const tr = document.createElement("tr"); const td = document.createElement("td"); td.colSpan = 3; td.className = "docs-placeholder"; td.textContent = "Nenhuma cota registrada."; tr.append(td); dimensionBody.append(tr); }
        for (const check of checks) {
            const tr = document.createElement("tr");
            for (const text of [check.projected_dimension || "—", check.measured_dimension || "—", check.within_tolerance === true ? "Sim" : check.within_tolerance === false ? "Não" : "Não informado"]) {
                const td = document.createElement("td"); td.textContent = text; tr.append(td);
            }
            dimensionBody.append(tr);
        }
        renderHistory(reviews);
        const canDecide = doc.status === "submitted" && !doc.deleted_at;
        document.getElementById("review-decision-panel").hidden = !canDecide;
        if (!canDecide) showError("Este documento não está mais aguardando revisão. Atualize a fila para ver o estado atual.");
    }
    async function loadDocument() {
        if (!documentId) throw new Error("Identificador do documento ausente na URL.");
        const { data, error } = await supabase.from("documents").select("*").eq("id", documentId).maybeSingle();
        if (error) throw error;
        if (!data || data.document_type !== "machining") throw new Error("Relatório de usinagem não encontrado.");
        doc = data;
        const [reportResult, checksResult, reviewResult] = await Promise.all([
            supabase.from("machining_reports").select("*").eq("document_id", documentId).maybeSingle(),
            supabase.from("dimensional_checks").select("*").eq("document_id", documentId).order("sort_order"),
            supabase.from("document_reviews").select("reviewer_name_snapshot, decision, notes, created_at").eq("document_id", documentId).order("created_at", { ascending: false })
        ]);
        if (reportResult.error) throw reportResult.error;
        if (checksResult.error) throw checksResult.error;
        if (reviewResult.error) throw reviewResult.error;
        renderDocument(reportResult.data, checksResult.data || [], reviewResult.data || []);
        content.hidden = false;
    }
    async function decide(decision) {
        if (busy || !doc) return;
        const note = notes.value.trim();
        if (decision === "changes_requested" && note.length < 3) { showError("Descreva as correções solicitadas (mínimo de 3 caracteres)."); notes.focus(); return; }
        const prompt = decision === "approved" ? `Aprovar ${doc.document_code}?` : `Devolver ${doc.document_code} para correções?`;
        if (!window.confirm(prompt)) return;
        setBusy(true); showError("");
        try {
            const { error } = await supabase.rpc("review_engineering_document", {
                p_document_id: doc.id, p_decision: decision, p_notes: note || null
            });
            if (error) throw error;
            const result = decision === "approved" ? "approved" : "changes";
            window.location.replace(`revisoes.html?result=${result}`);
        } catch (error) {
            console.error("Falha ao registrar revisão:", error);
            showError([error.message, error.details, error.hint, error.code].filter(Boolean).join(" — ") || "Não foi possível registrar a revisão.");
        } finally { setBusy(false); }
    }
    async function initialize() {
        if (!supabase) throw new Error("Cliente Supabase não inicializado.");
        const { data: auth, error: authError } = await supabase.auth.getUser();
        if (authError || !auth.user) { location.replace("login.html"); return; }
        user = auth.user;
        const { data: profile, error } = await supabase.from("profiles").select("full_name, role, is_active").eq("id", user.id).single();
        if (error || !profile || !profile.is_active) { await supabase.auth.signOut(); location.replace("login.html?status=inactive"); return; }
        if (!["reviewer", "admin"].includes(profile.role)) { location.replace("portal.html"); return; }
        document.getElementById("header-member-name").textContent = profile.full_name || user.email;
        await loadDocument();
    }
    approveButton.addEventListener("click", () => decide("approved"));
    changesButton.addEventListener("click", () => decide("changes_requested"));
    logout.addEventListener("click", async () => { const { error } = await supabase.auth.signOut(); if (error) { showError("Não foi possível encerrar a sessão."); return; } location.replace("login.html"); });
    supabase.auth.onAuthStateChange((event) => { if (event === "SIGNED_OUT") location.replace("login.html"); });
    initialize().catch((error) => { console.error(error); showError(error.message || "Não foi possível carregar a revisão."); });
})();
