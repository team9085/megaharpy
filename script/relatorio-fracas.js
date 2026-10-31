(() => {
    "use strict";

    const supabase = window.megaHarpySupabase;
    const params = new URLSearchParams(location.search);
    const requestedDocumentId = params.get("id");
    const form = document.getElementById("fracas-form");
    const errorBox = document.getElementById("fracas-error");
    const messageBox = document.getElementById("fracas-message");
    const saveDraftButton = document.getElementById("fracas-save-draft");
    const submitButton = document.getElementById("fracas-submit");
    const savePlanButton = document.getElementById("fracas-save-plan");
    const implementButton = document.getElementById("fracas-mark-implemented");
    const rejectRevalidationButton = document.getElementById("fracas-revalidation-rejected");
    const closeCycleButton = document.getElementById("fracas-close-cycle");
    const uploadButton = document.getElementById("upload-evidence");
    const fileInput = document.getElementById("fracas-evidence-files");
    const printButton = document.getElementById("fracas-print");
    const logoutButton = document.getElementById("logout-button");

    const documentStatusLabels = {
        draft: ["Rascunho", "draft"], submitted: ["Aguardando revisão", "submitted"],
        changes_requested: ["Correções solicitadas", "changes"], approved: ["Análise inicial aprovada", "approved"]
    };
    const lifecycleLabels = {
        open: ["Aberto", "open"], under_analysis: ["Em análise", "analysis"],
        action_implemented: ["Ação implementada", "implemented"], closed_validated: ["Fechado / Validado", "closed"]
    };
    const conditionLabels = {
        bench_test: "Teste de bancada", load_stress: "Teste de carga / estresse",
        pilot_practice: "Treino de piloto / prática", competition: "Partida de competição"
    };
    const severityLabels = { low: "Baixa", medium: "Média", high: "Alta", critical: "Crítica" };
    const categoryLabels = {
        design_cad: "Erro de Projeto / CAD",
        material_manufacturing: "Falha de Material / Fabricação",
        software_logic: "Falha de Software / Lógica",
        electrical_assembly: "Falha Elétrica / Montagem",
        operational_human: "Operacional / Fator Humano"
    };

    let user = null;
    let profile = null;
    let currentDocument = null;
    let currentReport = null;
    let evidence = [];
    let canEditInitial = false;
    let canEditPlan = false;
    let canUploadEvidence = false;
    let busy = false;

    const value = id => document.getElementById(id).value.trim();
    const setValue = (id, v) => { document.getElementById(id).value = v ?? ""; };
    const isReviewer = () => ["reviewer", "admin"].includes(profile?.role);
    const isAdmin = () => profile?.role === "admin";
    const escapeFileName = name => String(name || "evidence").normalize("NFKD").replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 100) || "evidence";
    function errorDetails(error) {
        return [error?.message, error?.details, error?.hint, error?.code ? `Código: ${error.code}` : ""]
            .filter(Boolean).join(" — ") || "Não foi possível concluir a operação.";
    }
    function showError(message) { errorBox.textContent = message; errorBox.hidden = !message; messageBox.hidden = true; }
    function showMessage(message, type = "info") { messageBox.textContent = message; messageBox.className = `notice ${type}`; messageBox.hidden = !message; errorBox.hidden = true; }
    function setBusy(state) {
        busy = state;
        [saveDraftButton, submitButton, savePlanButton, implementButton, rejectRevalidationButton, closeCycleButton, uploadButton].forEach(button => {
            if (button) button.disabled = state;
        });
    }
    function updateDocumentStatus(status) {
        const label = documentStatusLabels[status] || [status || "Rascunho", "draft"];
        const badge = document.getElementById("fracas-document-status");
        badge.textContent = label[0]; badge.className = `status-badge ${label[1]}`;
    }
    function updateLifecycleStatus(status) {
        const label = lifecycleLabels[status] || lifecycleLabels.open;
        const badge = document.getElementById("fracas-lifecycle-status");
        badge.textContent = label[0]; badge.className = `lifecycle-badge ${label[1]}`;
        document.getElementById("fracas-cycle-label").textContent = label[0];
    }
    function formatDate(valueToFormat) {
        if (!valueToFormat) return "—";
        const date = new Date(`${valueToFormat}T12:00:00`);
        return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString("pt-BR");
    }
    function setSectionDisabled(selector, disabled) {
        document.querySelectorAll(`${selector} input, ${selector} select, ${selector} textarea, ${selector} button`).forEach(el => { el.disabled = disabled; });
    }
    function configurePermissions() {
        const status = currentDocument?.status || "draft";
        const cycle = currentReport?.lifecycle_status || "open";
        const isAuthor = currentDocument?.created_by === user?.id;
        const isArchived = Boolean(currentDocument?.deleted_at);
        canEditInitial = !isArchived && (!currentDocument || (isAuthor && ["draft", "changes_requested"].includes(status)));
        canEditPlan = !isArchived && cycle !== "closed_validated" && (
            !currentDocument ||
            (isAuthor && ["draft", "changes_requested", "approved"].includes(status)) ||
            (isReviewer() && status === "approved")
        );
        canUploadEvidence = !isArchived && isAuthor && ["draft", "changes_requested", "approved"].includes(status) && cycle !== "closed_validated";
        const canEditRevalidation = !isArchived && status === "approved" && cycle === "action_implemented" && (isAuthor || isReviewer());

        setSectionDisabled("[data-initial-section]", !canEditInitial);
        setSectionDisabled("[data-action-section]", !canEditPlan);
        setSectionDisabled("[data-revalidation-section]", !canEditRevalidation);
        document.getElementById("revalidation-result").disabled = true;
        document.getElementById("fracas-evidence-files").disabled = !canUploadEvidence;
        uploadButton.hidden = !canUploadEvidence;
        saveDraftButton.hidden = !canEditInitial;
        submitButton.hidden = !canEditInitial;
        savePlanButton.hidden = !(currentDocument && status === "approved" && canEditPlan);
        implementButton.hidden = !(currentDocument && status === "approved" && canEditPlan && cycle === "under_analysis");
        // Final closure is an administrator-only engineering authorization.
        closeCycleButton.hidden = !(currentDocument && status === "approved" && isAdmin() && cycle === "action_implemented");
        rejectRevalidationButton.hidden = !(currentDocument && status === "approved" && isReviewer() && cycle === "action_implemented");

        if (isArchived) showMessage("Este FRACAS está arquivado e foi aberto em modo de consulta.", "info");
        else if (status === "submitted") showMessage("O registro foi enviado para revisão técnica. Os dados iniciais estão bloqueados até a decisão do revisor.", "info");
        else if (status === "approved" && cycle !== "closed_validated") showMessage("A análise inicial foi aprovada. Complete o plano de ação e acompanhe a falha até a revalidação.", "info");
        else if (status === "approved" && cycle === "closed_validated") showMessage("FRACAS fechado e validado. O registro está disponível para consulta.", "success");
    }

    function getInitialPayload() {
        return {
            part_assembly_code: value("part-assembly-code"),
            occurrence_time: value("occurrence-time") || null,
            environment: value("environment"),
            event_condition: value("event-condition") || null,
            competition_number: value("competition-number") || null,
            severity: value("severity") || null,
            expected_behavior: value("expected-behavior"),
            observed_behavior: value("observed-behavior"),
            five_whys: value("five-whys"),
            root_cause_category: value("root-cause-category") || null,
            immediate_containment: value("immediate-containment"),
            definitive_action: value("definitive-action"),
            linked_eco_code: value("linked-eco-code") || null,
            implementation_due_date: value("implementation-due-date") || null
        };
    }
    function populateReport(report) {
        const mapping = {
            part_assembly_code: "part-assembly-code", occurrence_time: "occurrence-time", environment: "environment",
            event_condition: "event-condition", competition_number: "competition-number", severity: "severity",
            expected_behavior: "expected-behavior", observed_behavior: "observed-behavior", five_whys: "five-whys",
            root_cause_category: "root-cause-category", immediate_containment: "immediate-containment",
            definitive_action: "definitive-action", linked_eco_code: "linked-eco-code",
            implementation_due_date: "implementation-due-date", revalidation_test: "revalidation-test",
            revalidation_result: "revalidation-result"
        };
        for (const [field, id] of Object.entries(mapping)) setValue(id, report?.[field]);
        document.getElementById("competition-number-field").hidden = report?.event_condition !== "competition";
    }

    async function saveInitialData() {
        if (!canEditInitial && currentDocument) throw new Error("Este documento não está disponível para edição inicial.");
        const occurrenceDate = value("occurrence-date");
        const occurrenceTime = value("occurrence-time");
        if (!occurrenceDate) throw new Error("Informe a data da ocorrência.");
        if (!occurrenceTime) throw new Error("Informe o horário da ocorrência.");

        if (!currentDocument) {
            const { data, error } = await supabase.from("documents").insert({
                document_type: "fracas", record_part: "initial", execution_date: occurrenceDate, start_time: occurrenceTime
            }).select("*").single();
            if (error) throw error;
            currentDocument = data;
            const newUrl = new URL(location.href);
            newUrl.searchParams.set("id", data.id);
            history.replaceState({}, "", newUrl);
        } else {
            const { data, error } = await supabase.from("documents").update({
                execution_date: occurrenceDate, start_time: occurrenceTime
            }).eq("id", currentDocument.id).select("*").single();
            if (error) throw error;
            currentDocument = data;
        }

        const payload = { document_id: currentDocument.id, ...getInitialPayload() };
        const { data: report, error: reportError } = await supabase.from("fracas_reports")
            .upsert(payload, { onConflict: "document_id" }).select("*").single();
        if (reportError) throw reportError;
        currentReport = report;
        configurePermissions();
        document.getElementById("fracas-document-code").textContent = currentDocument.document_code;
        document.getElementById("fracas-author").textContent = currentDocument.executor_name_snapshot || profile.full_name || user.email;
        document.getElementById("fracas-author-audit").textContent = currentDocument.executor_name_snapshot || profile.full_name || user.email;
        updateDocumentStatus(currentDocument.status);
        updateLifecycleStatus(currentReport.lifecycle_status);
        return report;
    }

    async function saveActionPlan() {
        if (!currentDocument || currentDocument.status !== "approved") throw new Error("O plano de ação só pode ser salvo após a análise inicial.");
        const { error } = await supabase.rpc("update_fracas_action_plan", {
            p_document_id: currentDocument.id,
            p_five_whys: value("five-whys"),
            p_root_cause_category: value("root-cause-category") || null,
            p_immediate_containment: value("immediate-containment"),
            p_definitive_action: value("definitive-action"),
            p_linked_eco_code: value("linked-eco-code") || null,
            p_implementation_due_date: value("implementation-due-date") || null,
            p_revalidation_test: value("revalidation-test")
        });
        if (error) throw error;
        const { data, error: readError } = await supabase.from("fracas_reports").select("*").eq("document_id", currentDocument.id).single();
        if (readError) throw readError;
        currentReport = data;
        return data;
    }

    async function renderHistory() {
        if (!currentDocument) return;
        const [reviewsResult, cycleResult] = await Promise.all([
            supabase.from("document_reviews").select("reviewer_name_snapshot,decision,notes,created_at")
                .eq("document_id", currentDocument.id).order("created_at", { ascending: false }),
            supabase.from("fracas_status_history").select("actor_name_snapshot,from_status,to_status,notes,revalidation_test,revalidation_result,created_at")
                .eq("document_id", currentDocument.id).order("created_at", { ascending: false })
        ]);
        if (reviewsResult.error) throw reviewsResult.error;
        if (cycleResult.error) throw cycleResult.error;
        renderHistoryList("fracas-review-history-panel", "fracas-review-history", reviewsResult.data || [], "decision");
        renderHistoryList("fracas-history-panel", "fracas-status-history", cycleResult.data || [], "status");
    }

    function renderHistoryList(panelId, hostId, entries, mode) {
        const panel = document.getElementById(panelId), host = document.getElementById(hostId);
        host.replaceChildren(); panel.hidden = entries.length === 0;
        if (!entries.length) return;
        for (const entry of entries) {
            const item = document.createElement("article"); item.className = "review-history-item";
            const heading = document.createElement("div"); heading.className = "review-history-heading";
            const name = document.createElement("strong"); name.textContent = entry.reviewer_name_snapshot || entry.actor_name_snapshot || "Membro da equipe";
            const badge = document.createElement("span");
            if (mode === "decision") {
                badge.className = `status-badge ${entry.decision === "approved" ? "approved" : "changes"}`;
                badge.textContent = entry.decision === "approved" ? "Análise aprovada" : "Correções solicitadas";
            } else {
                const label = lifecycleLabels[entry.to_status] || [entry.to_status, "open"];
                badge.className = `lifecycle-badge ${label[1]}`; badge.textContent = label[0];
            }
            heading.append(name, badge);
            const time = document.createElement("time"); time.className = "review-history-date"; time.textContent = new Date(entry.created_at).toLocaleString("pt-BR");
            const note = document.createElement("p");
            note.textContent = mode === "status" && entry.from_status
                ? `${lifecycleLabels[entry.from_status]?.[0] || entry.from_status} → ${lifecycleLabels[entry.to_status]?.[0] || entry.to_status}${entry.notes ? `\n${entry.notes}` : ""}`
                : entry.notes || "Nenhuma observação registrada.";
            item.append(heading, time, note);
            if (mode === "status" && entry.revalidation_test) {
                const validation = document.createElement("p");
                const resultLabel = entry.revalidation_result === "approved" ? "Aprovado" : entry.revalidation_result === "rejected" ? "Reprovado" : "Resultado não informado";
                validation.className = "review-history-validation";
                validation.textContent = `Teste de revalidação (${resultLabel}): ${entry.revalidation_test}`;
                item.append(validation);
            }
            host.append(item);
        }
    }

    async function renderEvidence() {
        const host = document.getElementById("fracas-evidence-list"); host.replaceChildren();
        if (!currentDocument) { host.innerHTML = '<p class="docs-empty">Salve o rascunho para anexar evidências.</p>'; return; }
        const { data, error } = await supabase.from("fracas_evidence").select("id,storage_path,original_name,content_type,size_bytes,uploaded_by,created_at")
            .eq("document_id", currentDocument.id).order("created_at", { ascending: true });
        if (error) throw error;
        evidence = data || [];
        if (!evidence.length) { host.innerHTML = '<p class="docs-empty">Nenhuma evidência anexada.</p>'; return; }

        for (const item of evidence) {
            const { data: signed, error: signedError } = await supabase.storage.from("fracas-evidence").createSignedUrl(item.storage_path, 900);
            const row = document.createElement("div"); row.className = "evidence-item";
            const link = document.createElement("a"); link.className = "evidence-link";
            link.textContent = `${item.original_name} (${(item.size_bytes / 1024 / 1024).toFixed(2)} MB)`;
            if (!signedError && signed?.signedUrl) { link.href = signed.signedUrl; link.target = "_blank"; link.rel = "noopener noreferrer"; }
            else { link.href = "#"; link.addEventListener("click", event => { event.preventDefault(); showError(errorDetails(signedError)); }); }
            row.append(link);
            if (canUploadEvidence && item.uploaded_by === user.id) {
                const remove = document.createElement("button"); remove.type = "button"; remove.className = "small-danger-button"; remove.textContent = "Remover";
                remove.addEventListener("click", () => removeEvidence(item)); row.append(remove);
            }
            host.append(row);
        }
    }

    async function removeEvidence(item) {
        if (!window.confirm(`Remover a evidência ${item.original_name}?`)) return;
        try {
            const { error: rowError } = await supabase.from("fracas_evidence").delete().eq("id", item.id);
            if (rowError) throw rowError;
            const { error: fileError } = await supabase.storage.from("fracas-evidence").remove([item.storage_path]);
            if (fileError) console.warn("Metadados removidos, mas o arquivo não pôde ser apagado:", fileError);
            await renderEvidence(); showMessage("Evidência removida.", "success");
        } catch (error) { console.error(error); showError(errorDetails(error)); }
    }

    async function uploadEvidence() {
        const files = Array.from(fileInput.files || []);
        if (!files.length) { showMessage("Selecione pelo menos um arquivo.", "info"); return; }
        const allowed = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
        for (const file of files) {
            if (!allowed.includes(file.type)) throw new Error(`${file.name}: formato não permitido. Use JPG, PNG, WEBP ou PDF.`);
            if (file.size <= 0 || file.size > 10 * 1024 * 1024) throw new Error(`${file.name}: o arquivo deve ter até 10 MB.`);
        }
        if (!currentDocument) await saveInitialData();
        if (!canUploadEvidence) throw new Error("Este documento não está disponível para anexar evidências.");
        setBusy(true);
        try {
            for (const file of files) {
                const unique = (window.crypto?.randomUUID ? window.crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`);
                const path = `${user.id}/${currentDocument.id}/${unique}-${escapeFileName(file.name)}`;
                const { error: uploadError } = await supabase.storage.from("fracas-evidence").upload(path, file, { upsert: false, contentType: file.type });
                if (uploadError) throw uploadError;
                const { error: metadataError } = await supabase.from("fracas_evidence").insert({
                    document_id: currentDocument.id, storage_path: path, original_name: file.name,
                    content_type: file.type, size_bytes: file.size, uploaded_by: user.id
                });
                if (metadataError) {
                    await supabase.storage.from("fracas-evidence").remove([path]);
                    throw metadataError;
                }
            }
            fileInput.value = ""; await renderEvidence(); showMessage("Evidência(s) anexada(s) com sucesso.", "success");
            configurePermissions();
        } finally { setBusy(false); }
    }

    async function refreshCurrentDocument() {
        if (!currentDocument) return;
        const { data: doc, error: docError } = await supabase.from("documents").select("*").eq("id", currentDocument.id).single();
        if (docError) throw docError;
        const { data: report, error: reportError } = await supabase.from("fracas_reports").select("*").eq("document_id", currentDocument.id).single();
        if (reportError) throw reportError;
        currentDocument = doc; currentReport = report;
        renderDocument(); await renderHistory(); await renderEvidence(); configurePermissions();
    }

    function renderDocument() {
        document.getElementById("fracas-document-code").textContent = currentDocument.document_code || "Gerado ao salvar";
        document.getElementById("fracas-subtitle").textContent = currentDocument.status === "draft"
            ? "Novo registro de falha." : `Registro criado em ${new Date(currentDocument.created_at).toLocaleString("pt-BR")}.`;
        document.getElementById("occurrence-date").value = currentDocument.execution_date || "";
        document.getElementById("occurrence-time").value = currentReport.occurrence_time || currentDocument.start_time || "";
        document.getElementById("fracas-author").textContent = currentDocument.executor_name_snapshot || "—";
        document.getElementById("fracas-author-audit").textContent = currentDocument.executor_name_snapshot || "—";
        document.getElementById("fracas-analyzed-by").textContent = currentReport.analyzed_by_name_snapshot || "Aguardando análise";
        document.getElementById("fracas-reviewed-by").textContent = currentDocument.reviewer_name_snapshot || "—";
        document.getElementById("fracas-validator").textContent = currentReport.validated_by_name_snapshot || "Aguardando validação";
        document.getElementById("fracas-closed-date").textContent = formatDate(currentReport.closed_at?.slice(0,10));
        populateReport(currentReport);
        updateDocumentStatus(currentDocument.status); updateLifecycleStatus(currentReport.lifecycle_status);
        configurePermissions();
    }

    async function loadExistingDocument() {
        const { data: doc, error: docError } = await supabase.from("documents").select("*").eq("id", requestedDocumentId).maybeSingle();
        if (docError) throw docError;
        if (!doc || doc.document_type !== "fracas") throw new Error("Relatório FRACAS não encontrado.");
        currentDocument = doc;
        const { data: report, error: reportError } = await supabase.from("fracas_reports").select("*").eq("document_id", requestedDocumentId).maybeSingle();
        if (reportError) throw reportError;
        if (!report) throw new Error("Os dados do relatório FRACAS ainda não foram registrados.");
        currentReport = report;
        renderDocument();
        await renderHistory(); await renderEvidence();
    }

    async function saveDraft() {
        if (busy) return;
        setBusy(true); errorBox.hidden = true;
        try {
            await saveInitialData();
            showMessage(`Rascunho ${currentDocument.document_code} salvo com sucesso.`, "success");
            await refreshCurrentDocument();
        } catch (error) { console.error("Falha ao salvar FRACAS:", error); showError(errorDetails(error)); }
        finally { setBusy(false); }
    }

    async function submitFracas() {
        if (busy) return;
        if (!window.confirm("Enviar este FRACAS para revisão técnica? Após o envio, os dados iniciais ficarão bloqueados até a decisão do revisor.")) return;
        setBusy(true); errorBox.hidden = true;
        try {
            await saveInitialData();
            const { error } = await supabase.rpc("submit_fracas_document", { p_document_id: currentDocument.id });
            if (error) throw error;
            await refreshCurrentDocument();
            showMessage("FRACAS enviado para a fila de revisão técnica.", "success");
        } catch (error) { console.error("Falha ao enviar FRACAS:", error); showError(errorDetails(error)); }
        finally { setBusy(false); }
    }

    async function persistActionPlan() {
        await saveActionPlan();
        showMessage("Plano de ação salvo.", "success");
    }

    async function markActionImplemented() {
        if (busy) return;
        if (!window.confirm("Marcar a ação corretiva como implementada? O FRACAS seguirá para a etapa de revalidação.")) return;
        setBusy(true); errorBox.hidden = true;
        try {
            await saveActionPlan();
            const { error } = await supabase.rpc("advance_fracas_status", {
                p_document_id: currentDocument.id, p_next_status: "action_implemented",
                p_revalidation_test: null, p_revalidation_result: null,
                p_notes: "Ação corretiva registrada como implementada. Aguardando revalidação."
            });
            if (error) throw error;
            await refreshCurrentDocument(); showMessage("Ação implementada. Agora registre a revalidação.", "success");
        } catch (error) { console.error(error); showError(errorDetails(error)); }
        finally { setBusy(false); }
    }

    async function finishRevalidation(result) {
        if (busy) return;
        const test = value("revalidation-test");
        if (test.length < 5) { showError("Descreva o teste de revalidação (mínimo de 5 caracteres)."); document.getElementById("revalidation-test").focus(); return; }
        const nextStatus = result === "approved" ? "closed_validated" : "under_analysis";
        const confirmation = result === "approved"
            ? "Validar o fechamento? O FRACAS será marcado como Fechado / Validado."
            : "A revalidação foi reprovada. Reabrir o ciclo de análise da falha?";
        if (!window.confirm(confirmation)) return;
        setBusy(true); errorBox.hidden = true;
        try {
            const { error } = await supabase.rpc("advance_fracas_status", {
                p_document_id: currentDocument.id, p_next_status: nextStatus,
                p_revalidation_test: test, p_revalidation_result: result,
                p_notes: result === "approved" ? "Teste de revalidação aprovado; falha considerada resolvida." : "Teste de revalidação reprovado; falha persiste e novo ciclo FRACAS foi iniciado."
            });
            if (error) throw error;
            await refreshCurrentDocument();
            showMessage(result === "approved" ? "FRACAS fechado e validado." : "Ciclo FRACAS reaberto para nova análise.", "success");
        } catch (error) { console.error(error); showError(errorDetails(error)); }
        finally { setBusy(false); }
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

        if (requestedDocumentId) await loadExistingDocument();
        else {
            const now = new Date();
            setValue("occurrence-date", `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}-${String(now.getDate()).padStart(2,"0")}`);
            document.getElementById("fracas-author").textContent = profile.full_name || user.email;
            document.getElementById("fracas-author-audit").textContent = profile.full_name || user.email;
            currentDocument = null; currentReport = { lifecycle_status: "open" };
            updateDocumentStatus("draft"); updateLifecycleStatus("open"); configurePermissions();
            document.getElementById("fracas-evidence-list").innerHTML = '<p class="docs-empty">Salve o rascunho para anexar evidências.</p>';
        }
    }

    document.getElementById("event-condition").addEventListener("change", event => {
        document.getElementById("competition-number-field").hidden = event.target.value !== "competition";
    });
    saveDraftButton.addEventListener("click", saveDraft);
    submitButton.addEventListener("click", submitFracas);
    savePlanButton.addEventListener("click", async () => {
        if (busy) return; setBusy(true);
        try { await persistActionPlan(); await refreshCurrentDocument(); }
        catch (error) { console.error(error); showError(errorDetails(error)); }
        finally { setBusy(false); }
    });
    implementButton.addEventListener("click", markActionImplemented);
    closeCycleButton.addEventListener("click", () => finishRevalidation("approved"));
    rejectRevalidationButton.addEventListener("click", () => finishRevalidation("rejected"));
    uploadButton.addEventListener("click", async () => {
        if (busy) return;
        try { await uploadEvidence(); }
        catch (error) { console.error(error); showError(errorDetails(error)); }
    });
    printButton.addEventListener("click", () => window.print());
    logoutButton.addEventListener("click", async () => {
        const { error } = await supabase.auth.signOut();
        if (error) { showError("Não foi possível encerrar a sessão."); return; }
        location.replace("login.html");
    });
    supabase.auth.onAuthStateChange(event => { if (event === "SIGNED_OUT") location.replace("login.html"); });
    initialize().catch(error => { console.error("Falha ao iniciar FRACAS:", error); showError(errorDetails(error)); form.hidden = true; });
})();
