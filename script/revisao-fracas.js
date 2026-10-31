(() => {
    "use strict";

    const supabase = window.megaHarpySupabase;
    const documentId = new URLSearchParams(location.search).get("id");
    const errorBox = document.getElementById("fracas-review-error");
    const content = document.getElementById("fracas-review-content");
    const notes = document.getElementById("fracas-review-notes");
    const approveButton = document.getElementById("fracas-review-approve");
    const changesButton = document.getElementById("fracas-review-request-changes");
    const logoutButton = document.getElementById("logout-button");

    let currentDocument = null;
    let busy = false;
    const conditionLabels = { bench_test:"Teste de bancada", load_stress:"Teste de carga / estresse", pilot_practice:"Treino de piloto / prática", competition:"Partida de competição" };
    const severityLabels = { low:"Baixa", medium:"Média", high:"Alta", critical:"Crítica" };
    const categoryLabels = { design_cad:"Erro de Projeto / CAD", material_manufacturing:"Falha de Material / Fabricação", software_logic:"Falha de Software / Lógica", electrical_assembly:"Falha Elétrica / Montagem", operational_human:"Operacional / Fator Humano" };

    function showError(message) { errorBox.textContent = message; errorBox.hidden = !message; }
    function setText(id, value) { document.getElementById(id).textContent = value === null || value === undefined || value === "" ? "—" : String(value); }
    function dateTime(date, time) {
        if (!date) return "—";
        const parsed = new Date(`${date}T${(time || "12:00").slice(0,5)}:00`);
        return Number.isNaN(parsed.getTime()) ? `${date} ${time || ""}` : parsed.toLocaleString("pt-BR");
    }
    function renderHistory(reviews) {
        const host = document.getElementById("fracas-review-history"); host.replaceChildren();
        if (!reviews.length) { const p = document.createElement("p"); p.className="docs-empty"; p.textContent="Este FRACAS ainda não possui revisões anteriores."; host.append(p); return; }
        for (const review of reviews) {
            const item = document.createElement("article"); item.className="review-history-item";
            const heading = document.createElement("div"); heading.className="review-history-heading";
            const name = document.createElement("strong"); name.textContent=review.reviewer_name_snapshot || "Revisor da equipe";
            const badge = document.createElement("span"); badge.className=`status-badge ${review.decision === "approved" ? "approved" : "changes"}`;
            badge.textContent=review.decision === "approved" ? "Análise aprovada" : "Correções solicitadas";
            heading.append(name,badge);
            const time=document.createElement("time"); time.className="review-history-date"; time.textContent=new Date(review.created_at).toLocaleString("pt-BR");
            const note=document.createElement("p"); note.textContent=review.notes || "Nenhuma observação registrada.";
            item.append(heading,time,note); host.append(item);
        }
    }
    async function renderEvidence(items) {
        const host=document.getElementById("fracas-review-evidence"); host.replaceChildren();
        if (!items.length) { const p=document.createElement("p"); p.className="docs-empty"; p.textContent="Nenhuma evidência anexada."; host.append(p); return; }
        for (const evidence of items) {
            const {data,error}=await supabase.storage.from("fracas-evidence").createSignedUrl(evidence.storage_path,900);
            const row=document.createElement("div"); row.className="evidence-item";
            const link=document.createElement("a"); link.className="evidence-link"; link.textContent=evidence.original_name;
            if (!error && data?.signedUrl) { link.href=data.signedUrl; link.target="_blank"; link.rel="noopener noreferrer"; }
            else { link.href="#"; link.addEventListener("click",e=>{e.preventDefault();showError(error?.message || "Não foi possível abrir a evidência.");}); }
            row.append(link); host.append(row);
        }
    }
    function render(report, reviews, files) {
        setText("fracas-review-code",currentDocument.document_code);
        setText("fracas-review-part",report.part_assembly_code);
        setText("fracas-review-datetime",dateTime(currentDocument.execution_date,report.occurrence_time));
        setText("fracas-review-environment",report.environment);
        setText("fracas-review-condition",`${conditionLabels[report.event_condition] || "—"}${report.competition_number ? ` · Partida ${report.competition_number}` : ""}`);
        setText("fracas-review-severity-text",severityLabels[report.severity] || "—");
        setText("fracas-review-author",currentDocument.executor_name_snapshot);
        setText("fracas-review-expected",report.expected_behavior);
        setText("fracas-review-observed",report.observed_behavior);
        setText("fracas-review-whys",report.five_whys || "Ainda não preenchido; a investigação pode continuar após a análise inicial.");
        setText("fracas-review-category",categoryLabels[report.root_cause_category] || "Ainda não classificada.");
        const badge=document.getElementById("fracas-review-doc-status"); badge.textContent="Aguardando revisão"; badge.className="status-badge submitted";
        const severity=document.getElementById("fracas-review-severity"); severity.textContent=severityLabels[report.severity] || "Gravidade não definida"; severity.className=`severity-badge ${report.severity || "unknown"}`;
        document.getElementById("fracas-review-subtitle").textContent=`Enviado em ${new Date(currentDocument.submitted_at).toLocaleString("pt-BR")}`;
        document.getElementById("fracas-review-decision-panel").hidden=currentDocument.status !== "submitted" || Boolean(currentDocument.deleted_at);
        renderHistory(reviews); renderEvidence(files);
    }
    async function loadDocument() {
        if (!documentId) throw new Error("Identificador do FRACAS ausente na URL.");
        const {data:doc,error:docError}=await supabase.from("documents").select("*").eq("id",documentId).maybeSingle();
        if (docError) throw docError;
        if (!doc || doc.document_type !== "fracas") throw new Error("Relatório FRACAS não encontrado.");
        currentDocument=doc;
        const [reportResult,historyResult,evidenceResult]=await Promise.all([
            supabase.from("fracas_reports").select("*").eq("document_id",documentId).maybeSingle(),
            supabase.from("document_reviews").select("reviewer_name_snapshot,decision,notes,created_at").eq("document_id",documentId).order("created_at",{ascending:false}),
            supabase.from("fracas_evidence").select("storage_path,original_name").eq("document_id",documentId).order("created_at",{ascending:true})
        ]);
        for (const result of [reportResult,historyResult,evidenceResult]) if (result.error) throw result.error;
        if (!reportResult.data) throw new Error("Dados da ocorrência não encontrados.");
        render(reportResult.data,historyResult.data || [],evidenceResult.data || []);
        content.hidden=false;
    }
    async function decide(decision) {
        if (busy || !currentDocument) return;
        const note=notes.value.trim();
        if (decision === "changes_requested" && note.length < 3) { showError("Descreva as correções solicitadas (mínimo de 3 caracteres)."); notes.focus(); return; }
        const prompt=decision === "approved" ? `Aprovar a análise inicial de ${currentDocument.document_code}? O ciclo mudará para Em análise.` : `Devolver ${currentDocument.document_code} para correções?`;
        if (!window.confirm(prompt)) return;
        busy=true; approveButton.disabled=true; changesButton.disabled=true; errorBox.hidden=true;
        try {
            const {error}=await supabase.rpc("review_engineering_document",{p_document_id:currentDocument.id,p_decision:decision,p_notes:note || null});
            if (error) throw error;
            location.replace(`revisoes.html?result=${decision === "approved" ? "approved" : "changes"}`);
        } catch (error) { console.error("Falha ao registrar revisão FRACAS:",error); showError([error.message,error.details,error.hint,error.code].filter(Boolean).join(" — ") || "Não foi possível registrar a revisão."); }
        finally { busy=false; approveButton.disabled=false; changesButton.disabled=false; }
    }
    async function initialize() {
        if (!supabase) throw new Error("Cliente Supabase não inicializado.");
        const {data:auth,error:authError}=await supabase.auth.getUser();
        if (authError || !auth.user) { location.replace("login.html"); return; }
        const {data:profile,error}=await supabase.from("profiles").select("full_name,role,is_active").eq("id",auth.user.id).single();
        if (error || !profile || !profile.is_active) { await supabase.auth.signOut(); location.replace("login.html?status=inactive"); return; }
        if (!["reviewer","admin"].includes(profile.role)) { location.replace("portal.html"); return; }
        document.getElementById("header-member-name").textContent=profile.full_name || auth.user.email;
        await loadDocument();
    }
    approveButton.addEventListener("click",()=>decide("approved"));
    changesButton.addEventListener("click",()=>decide("changes_requested"));
    logoutButton.addEventListener("click",async()=>{const {error}=await supabase.auth.signOut();if(error){showError("Não foi possível encerrar a sessão.");return;}location.replace("login.html");});
    supabase.auth.onAuthStateChange(event=>{if(event === "SIGNED_OUT")location.replace("login.html");});
    initialize().catch(error=>{console.error(error);showError(error.message || "Não foi possível carregar o FRACAS para revisão.");});
})();
