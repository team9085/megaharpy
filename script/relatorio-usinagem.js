(() => {
    "use strict";

    const supabase = window.megaHarpySupabase;
    const form = document.getElementById("machining-form");
    const params = new URLSearchParams(window.location.search);
    const documentId = params.get("id");
    const dimensionRows = document.getElementById("dimension-rows");
    const errorBox = document.getElementById("report-error");
    const messageBox = document.getElementById("report-message");
    const saveButton = document.getElementById("save-draft");
    const submitButton = document.getElementById("submit-report");
    const printButton = document.getElementById("print-report");
    const approveButton = document.getElementById("approve-document");
    const requestChangesButton = document.getElementById("request-changes");
    const logoutButton = document.getElementById("logout-button");

    const statusLabels = {
        draft: ["Rascunho", "draft"],
        submitted: ["Aguardando revisão", "submitted"],
        changes_requested: ["Correções solicitadas", "changes"],
        approved: ["Aprovado", "approved"]
    };

    let user = null;
    let profile = null;
    let currentDocument = null;
    let canEdit = false;
    let canReview = false;
    let busy = false;

    function value(id) { return document.getElementById(id).value.trim(); }
    function setValue(id, val) { document.getElementById(id).value = val ?? ""; }

    function showMessage(text, type = "info") {
        messageBox.textContent = text;
        messageBox.className = `notice ${type}`;
        messageBox.hidden = !text;
    }

    function showError(text) {
        errorBox.textContent = text;
        errorBox.hidden = !text;
    }

    function setBusy(state) {
        busy = state;
        [saveButton, submitButton, approveButton, requestChangesButton].forEach((button) => {
            if (button) button.disabled = state;
        });
    }

    function addDimensionRow(row = {}) {
        const tr = document.createElement("tr");
        const projectedCell = document.createElement("td");
        const measuredCell = document.createElement("td");
        const toleranceCell = document.createElement("td");
        const actionCell = document.createElement("td");

        const projected = document.createElement("input");
        projected.type = "text";
        projected.maxLength = 120;
        projected.placeholder = "Ex.: Ø10,00 ±0,10 mm";
        projected.value = row.projected_dimension || "";
        projected.className = "dimension-input";
        projected.setAttribute("aria-label", "Cota projetada");

        const measured = document.createElement("input");
        measured.type = "text";
        measured.maxLength = 120;
        measured.placeholder = "Medida obtida";
        measured.value = row.measured_dimension || "";
        measured.className = "dimension-input";
        measured.setAttribute("aria-label", "Cota medida");

        const tolerance = document.createElement("select");
        tolerance.className = "dimension-select";
        tolerance.setAttribute("aria-label", "Dentro da tolerância");
        tolerance.innerHTML = '<option value="">Selecionar</option><option value="true">Sim</option><option value="false">Não</option>';
        tolerance.value = row.within_tolerance === true ? "true" : row.within_tolerance === false ? "false" : "";

        const remove = document.createElement("button");
        remove.type = "button";
        remove.className = "remove-dimension";
        remove.textContent = "Remover";
        remove.setAttribute("aria-label", "Remover cota");
        remove.addEventListener("click", () => tr.remove());

        projectedCell.append(projected);
        measuredCell.append(measured);
        toleranceCell.append(tolerance);
        actionCell.append(remove);
        tr.append(projectedCell, measuredCell, toleranceCell, actionCell);
        dimensionRows.append(tr);
    }

    function readDimensions() {
        return [...dimensionRows.querySelectorAll("tr")].map((tr, index) => {
            const inputs = tr.querySelectorAll("input");
            const tolerance = tr.querySelector("select").value;
            return {
                sort_order: index,
                projected_dimension: inputs[0].value.trim(),
                measured_dimension: inputs[1].value.trim(),
                within_tolerance: tolerance === "" ? null : tolerance === "true"
            };
        });
    }

    function updateStatus(status) {
        const label = statusLabels[status] || [status, "draft"];
        const badge = document.getElementById("document-status");
        badge.textContent = label[0];
        badge.className = `status-badge ${label[1]}`;
    }

    function applyPermissions() {
        const status = currentDocument.status;
        const isArchived = Boolean(currentDocument.deleted_at);
        canEdit = !isArchived && currentDocument.created_by === user.id && ["draft", "changes_requested"].includes(status);
        canReview = !isArchived && ["reviewer", "admin"].includes(profile.role) && status === "submitted";

        const archivedNotice = document.getElementById("archived-document-notice");
        archivedNotice.hidden = !isArchived;
        if (isArchived) {
            archivedNotice.textContent = profile.role === "admin"
                ? "Este documento está arquivado. Ele está em modo de leitura; restaure-o pela lista de documentação para voltar a editá-lo ou revisá-lo."
                : "Este documento está arquivado e disponível somente para consulta.";
            const badge = document.getElementById("document-status");
            badge.textContent = "Arquivado";
            badge.className = "status-badge archived";
        }

        form.querySelectorAll("input, textarea, select").forEach((element) => {
            if (element.id === "review-notes") return;
            element.disabled = !canEdit;
        });
        document.getElementById("add-dimension").hidden = !canEdit;
        dimensionRows.querySelectorAll("button").forEach((button) => button.hidden = !canEdit);
        dimensionRows.querySelectorAll("input, select").forEach((element) => element.disabled = !canEdit);
        saveButton.hidden = !canEdit;
        submitButton.hidden = !canEdit;
        document.getElementById("review-panel").hidden = !canReview;
        document.getElementById("review-notes").disabled = !canReview;
        approveButton.hidden = !canReview;
        requestChangesButton.hidden = !canReview;
        printButton.hidden = !currentDocument.id;

        if (status === "changes_requested" && currentDocument.review_notes) {
            document.getElementById("existing-review-panel").hidden = false;
            document.getElementById("existing-review-notes").textContent = currentDocument.review_notes;
        }
        document.getElementById("reviewer-name").textContent = currentDocument.reviewer_name_snapshot || "Aguardando revisão";
        document.getElementById("report-subtitle").textContent = canEdit
            ? "Preencha os dados e salve o rascunho ou envie para revisão."
            : canReview ? "Este relatório está aguardando sua revisão técnica."
            : "Visualização do registro de usinagem.";
    }

    async function fetchCurrentDocument() {
        const { data, error } = await supabase.from("documents").select("*").eq("id", documentId).single();
        if (error) throw error;
        if (data.document_type !== "machining") throw new Error("Este documento não é um relatório de usinagem.");
        const [{ data: report, error: reportError }, { data: checks, error: checksError }] = await Promise.all([
            supabase.from("machining_reports").select("*").eq("document_id", documentId).maybeSingle(),
            supabase.from("dimensional_checks").select("*").eq("document_id", documentId).order("sort_order")
        ]);
        if (reportError) throw reportError;
        if (checksError) throw checksError;
        currentDocument = { ...data, report, checks: checks || [] };
        fillForm();
        applyPermissions();
    }

    function fillForm() {
        const doc = currentDocument;
        const report = doc.report || {};
        document.getElementById("document-code").textContent = doc.document_code;
        updateStatus(doc.status);
        setValue("record-part", doc.record_part);
        setValue("execution-date", doc.execution_date);
        setValue("start-time", doc.start_time ? doc.start_time.slice(0, 5) : "");
        setValue("end-time", doc.end_time ? doc.end_time.slice(0, 5) : "");
        document.getElementById("executor-name").textContent = doc.executor_name_snapshot || "—";
        setValue("part-code", report.part_code);
        setValue("material-used", report.material_used);
        setValue("raw-dimensions", report.raw_material_dimensions);
        setValue("machine-used", report.machine_used);
        setValue("operations", report.operations_performed);
        setValue("tools", report.tools_used);
        setValue("execution-observations", report.execution_observations);
        setValue("scrap-quantity", report.scrap_quantity ?? 0);
        setValue("produced-quantity", report.produced_quantity ?? 0);
        setValue("review-notes", "");
        documentId && (document.getElementById("report-subtitle").textContent = `Criado em ${new Date(doc.created_at).toLocaleString("pt-BR")}`);
        dimensionRows.replaceChildren();
        (doc.checks || []).forEach(addDimensionRow);
        if (!doc.checks?.length) addDimensionRow();
    }

    function collectReport() {
        const scrap = Number(document.getElementById("scrap-quantity").value);
        const produced = Number(document.getElementById("produced-quantity").value);
        if (!Number.isInteger(scrap) || scrap < 0 || !Number.isInteger(produced) || produced < 0) {
            throw new Error("As quantidades de refugo e produção devem ser números inteiros iguais ou maiores que zero.");
        }
        return {
            part_code: value("part-code"),
            material_used: value("material-used"),
            raw_material_dimensions: value("raw-dimensions"),
            machine_used: value("machine-used"),
            operations_performed: value("operations"),
            tools_used: value("tools"),
            scrap_quantity: scrap,
            produced_quantity: produced,
            execution_observations: value("execution-observations")
        };
    }

    async function saveReport() {
        if (busy) return;
        setBusy(true);
        showError("");
        try {
            const report = collectReport();
            let doc = currentDocument;
            const docFields = {
                record_part: value("record-part"),
                execution_date: value("execution-date"),
                start_time: value("start-time") || null,
                end_time: value("end-time") || null
            };
            if (!doc) {
                const { data, error } = await supabase.from("documents").insert({
                    document_type: "machining",
                    ...docFields
                }).select("*").single();
                if (error) throw error;
                doc = data;
                currentDocument = { ...data, report: null, checks: [] };
                window.history.replaceState({}, "", `${window.location.pathname}?id=${encodeURIComponent(doc.id)}`);
            } else {
                const { data, error } = await supabase.from("documents").update(docFields)
                    .eq("id", doc.id).select("*").single();
                if (error) throw error;
                doc = { ...doc, ...data };
                currentDocument = { ...currentDocument, ...data };
            }

            const { error: reportError } = await supabase.from("machining_reports").upsert({
                document_id: doc.id,
                ...report
            }, { onConflict: "document_id" });
            if (reportError) throw reportError;

            const { error: deleteError } = await supabase.from("dimensional_checks").delete().eq("document_id", doc.id);
            if (deleteError) throw deleteError;
            const checks = readDimensions();
            const nonEmptyChecks = checks.filter((row) => row.projected_dimension || row.measured_dimension || row.within_tolerance !== null);
            if (nonEmptyChecks.length) {
                const { error: checksError } = await supabase.from("dimensional_checks").insert(
                    nonEmptyChecks.map((row) => ({ document_id: doc.id, ...row }))
                );
                if (checksError) throw checksError;
            }

            currentDocument = { ...currentDocument, report, checks: nonEmptyChecks };
            document.getElementById("document-code").textContent = doc.document_code;
            document.getElementById("report-subtitle").textContent = "Rascunho salvo com sucesso.";
            updateStatus(doc.status);
            saveButton.textContent = "Salvar alterações";
            showMessage("Rascunho salvo. O documento já está disponível para consulta pelos membros ativos da equipe.", "success");
            if (!documentId) window.history.replaceState({}, "", `${window.location.pathname}?id=${encodeURIComponent(doc.id)}`);
            applyPermissions();
            return doc;
        } finally {
            setBusy(false);
        }
    }

    async function submitReport() {
        try {
            const doc = await saveReport();
            if (!doc) return;
            setBusy(true);
            const { error } = await supabase.rpc("submit_machining_document", { p_document_id: doc.id });
            if (error) throw error;
            currentDocument.status = "submitted";
            updateStatus("submitted");
            applyPermissions();
            showMessage("Relatório enviado para revisão técnica.", "success");
        } catch (error) {
            console.error(error);
            showError(error.message || "Não foi possível enviar o relatório.");
        } finally {
            setBusy(false);
        }
    }

    async function reviewDocument(decision) {
        if (busy || !currentDocument) return;
        const notes = value("review-notes");
        if (decision === "changes_requested" && notes.length < 3) {
            showError("Descreva as correções solicitadas antes de devolver o relatório.");
            return;
        }
        const confirmation = decision === "approved"
            ? window.confirm("Confirmar a aprovação deste relatório?")
            : window.confirm("Devolver este relatório ao autor para correções?");
        if (!confirmation) return;
        setBusy(true);
        showError("");
        try {
            const { error } = await supabase.rpc("review_engineering_document", {
                p_document_id: currentDocument.id,
                p_decision: decision,
                p_notes: notes || null
            });
            if (error) throw error;
            await fetchCurrentDocument();
            showMessage(decision === "approved" ? "Relatório aprovado." : "Relatório devolvido para correções.", "success");
        } catch (error) {
            console.error(error);
            showError(error.message || "Não foi possível concluir a revisão.");
        } finally {
            setBusy(false);
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

        if (documentId) {
            await fetchCurrentDocument();
        } else {
            currentDocument = null;
            document.getElementById("executor-name").textContent = profile.full_name || user.email;
            const now = new Date();
            const localDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
            document.getElementById("execution-date").value = localDate;
            addDimensionRow();
            document.getElementById("document-status").textContent = "Novo rascunho";
            document.getElementById("document-status").className = "status-badge draft";
            document.getElementById("review-panel").hidden = true;
            document.getElementById("existing-review-panel").hidden = true;
            printButton.hidden = true;
            canEdit = true;
        }
    }

    document.getElementById("add-dimension").addEventListener("click", () => addDimensionRow());
    saveButton.addEventListener("click", async () => {
        try { await saveReport(); }
        catch (error) { console.error(error); showError(error.message || "Não foi possível salvar o rascunho."); }
    });
    submitButton.addEventListener("click", submitReport);
    approveButton.addEventListener("click", () => reviewDocument("approved"));
    requestChangesButton.addEventListener("click", () => reviewDocument("changes_requested"));
    printButton.addEventListener("click", () => window.print());
    logoutButton.addEventListener("click", async () => {
        logoutButton.disabled = true;
        const { error } = await supabase.auth.signOut();
        if (error) { alert("Não foi possível encerrar a sessão."); logoutButton.disabled = false; return; }
        window.location.replace("login.html");
    });
    supabase.auth.onAuthStateChange((event) => {
        if (event === "SIGNED_OUT") window.location.replace("login.html");
    });

    initialize().catch((error) => {
        console.error("Falha ao iniciar relatório:", error);
        showError(error.message || "Não foi possível carregar este relatório.");
        form.hidden = true;
    });
})();
