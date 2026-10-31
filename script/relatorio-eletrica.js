(() => {
    "use strict";
    const supabase = window.megaHarpySupabase;
    const form = document.getElementById("electrical-form");
    const params = new URLSearchParams(location.search);
    const documentId = params.get("id");
    const connectionRows = document.getElementById("connection-rows");
    const errorBox = document.getElementById("report-error");
    const messageBox = document.getElementById("report-message");
    const saveButton = document.getElementById("save-draft");
    const submitButton = document.getElementById("submit-report");
    const printButton = document.getElementById("print-report");
    const logoutButton = document.getElementById("logout-button");
    const statusLabels = { draft:["Rascunho","draft"], submitted:["Aguardando revisão","submitted"], changes_requested:["Correções solicitadas","changes"], approved:["Aprovado","approved"] };
    let user = null, profile = null, currentDocument = null, canEdit = false, busy = false;

    function value(id) { return document.getElementById(id).value.trim(); }
    function setValue(id, v) { document.getElementById(id).value = v ?? ""; }
    function boolValue(id) { const v = document.getElementById(id).value; return v === "" ? null : v === "true"; }
    function setBool(id, v) { document.getElementById(id).value = v === true ? "true" : v === false ? "false" : ""; }
    function showMessage(text, type="info") { messageBox.textContent=text; messageBox.className=`notice ${type}`; messageBox.hidden=!text; }
    function showError(text) { errorBox.textContent=text; errorBox.hidden=!text; }
    function setBusy(state) { busy=state; [saveButton,submitButton].forEach((b)=>b.disabled=state); }
    function updateStatus(status) { const label=statusLabels[status]||[status,"draft"]; const badge=document.getElementById("document-status"); badge.textContent=label[0]; badge.className=`status-badge ${label[1]}`; }

    function addConnectionRow(row={}) {
        const tr=document.createElement("tr");
        const deviceCell=document.createElement("td"), portCell=document.createElement("td"), actionCell=document.createElement("td");
        const device=document.createElement("input"); device.type="text"; device.maxLength=160; device.className="dimension-input"; device.placeholder="Ex.: Kraken X60 do shooter"; device.value=row.connected_device||""; device.setAttribute("aria-label","Motor ou sensor conectado");
        const port=document.createElement("input"); port.type="text"; port.maxLength=100; port.className="dimension-input"; port.placeholder="Ex.: CAN 17 / PWM 0"; port.value=row.id_port_used||""; port.setAttribute("aria-label","ID ou porta usada");
        const remove=document.createElement("button"); remove.type="button"; remove.className="remove-dimension"; remove.textContent="Remover"; remove.addEventListener("click",()=>tr.remove());
        deviceCell.append(device); portCell.append(port); actionCell.append(remove); tr.append(deviceCell,portCell,actionCell); connectionRows.append(tr);
    }
    function readConnections() {
        return [...connectionRows.querySelectorAll("tr")].map((tr,index)=>({
            sort_order:index,
            connected_device:tr.children[0].querySelector("input").value.trim(),
            id_port_used:tr.children[1].querySelector("input").value.trim()
        })).filter((row)=>row.connected_device||row.id_port_used);
    }
    function renderReviewHistory(reviews) {
        const panel=document.getElementById("review-history-panel"), list=document.getElementById("review-history-list"); list.replaceChildren(); panel.hidden=!reviews.length;
        for(const review of reviews){
            const item=document.createElement("article"); item.className="review-history-item";
            const heading=document.createElement("div"); heading.className="review-history-heading";
            const name=document.createElement("strong"); name.textContent=review.reviewer_name_snapshot||"Revisor da equipe";
            const outcome=document.createElement("span"); outcome.className=`status-badge ${review.decision==="approved"?"approved":"changes"}`; outcome.textContent=review.decision==="approved"?"Aprovado":"Correções solicitadas"; heading.append(name,outcome);
            const date=document.createElement("time"); date.className="review-history-date"; date.textContent=new Date(review.created_at).toLocaleString("pt-BR");
            const note=document.createElement("p"); note.textContent=review.notes||"Nenhuma observação registrada."; item.append(heading,date,note); list.append(item);
        }
    }
    function applyPermissions() {
        const archived=Boolean(currentDocument.deleted_at);
        canEdit=!archived && currentDocument.created_by===user.id && ["draft","changes_requested"].includes(currentDocument.status);
        const notice=document.getElementById("archived-document-notice"); notice.hidden=!archived;
        if(archived){notice.textContent="Este documento está arquivado e disponível somente para consulta. Um administrador pode restaurá-lo pela lista de documentação."; const badge=document.getElementById("document-status"); badge.textContent="Arquivado"; badge.className="status-badge archived";}
        form.querySelectorAll("input,textarea,select").forEach((el)=>el.disabled=!canEdit);
        document.getElementById("add-connection").hidden=!canEdit;
        connectionRows.querySelectorAll("button").forEach((b)=>b.hidden=!canEdit);
        saveButton.hidden=!canEdit; submitButton.hidden=!canEdit; printButton.hidden=!currentDocument.id;
        document.getElementById("reviewer-name").textContent=currentDocument.reviewer_name_snapshot||"Aguardando revisão";
        document.getElementById("report-subtitle").textContent=canEdit?"Preencha os dados e salve o rascunho ou envie para revisão.":"Visualização do registro de elétrica. A revisão técnica acontece na área Revisão técnica do portal.";
    }
    function fillForm() {
        const doc=currentDocument, report=doc.report||{};
        document.getElementById("document-code").textContent=doc.document_code; updateStatus(doc.status);
        setValue("record-part",doc.record_part); setValue("execution-date",doc.execution_date); setValue("start-time",doc.start_time?.slice(0,5)); setValue("end-time",doc.end_time?.slice(0,5));
        document.getElementById("executor-name").textContent=doc.executor_name_snapshot||"—";
        for(const [id,key] of [["circuit-identification","circuit_identification"],["nominal-voltage","nominal_voltage"],["breaker-limit","breaker_limit"],["circuit-type","circuit_type"],["operations","operations_performed"],["tools","tools_used"],["execution-observations","execution_observations"]]) setValue(id,report[key]);
        setBool("wire-gauge-ok",report.wire_gauge_ok); setBool("crimping-ok",report.crimping_tinning_ok); setBool("labels-ok",report.labels_both_ends_ok); setBool("continuity-ok",report.continuity_test_ok); setBool("cable-organization-ok",report.cable_organization_ok);
        connectionRows.replaceChildren(); (doc.connections||[]).forEach(addConnectionRow); if(!doc.connections?.length) addConnectionRow();
        document.getElementById("report-subtitle").textContent=`Criado em ${new Date(doc.created_at).toLocaleString("pt-BR")}`;
        renderReviewHistory(doc.reviews||[]);
    }
    function collectReport() {
        return {
            circuit_identification:value("circuit-identification"), nominal_voltage:value("nominal-voltage"), breaker_limit:value("breaker-limit"), circuit_type:value("circuit-type"),
            operations_performed:value("operations"), tools_used:value("tools"), wire_gauge_ok:boolValue("wire-gauge-ok"), crimping_tinning_ok:boolValue("crimping-ok"),
            labels_both_ends_ok:boolValue("labels-ok"), continuity_test_ok:boolValue("continuity-ok"), cable_organization_ok:boolValue("cable-organization-ok"),
            execution_observations:value("execution-observations")
        };
    }
    async function saveReport() {
        if(busy) return null; setBusy(true); showError("");
        try {
            const report=collectReport(), connections=readConnections();
            const docFields={record_part:value("record-part"),execution_date:value("execution-date"),start_time:value("start-time")||null,end_time:value("end-time")||null};
            let doc=currentDocument;
            if(!doc){const {data,error}=await supabase.from("documents").insert({document_type:"electrical",...docFields}).select("*").single(); if(error)throw error; doc=data; currentDocument={...data,report:null,connections:[],reviews:[]}; history.replaceState({},"",`${location.pathname}?id=${encodeURIComponent(doc.id)}`);}
            else {const {data,error}=await supabase.from("documents").update(docFields).eq("id",doc.id).select("*").single(); if(error)throw error; doc={...doc,...data}; currentDocument={...currentDocument,...data};}
            const {error:reportError}=await supabase.from("electrical_reports").upsert({document_id:doc.id,...report},{onConflict:"document_id"}); if(reportError)throw reportError;
            const {error:deleteError}=await supabase.from("electrical_connections").delete().eq("document_id",doc.id); if(deleteError)throw deleteError;
            if(connections.length){const {error:connectionError}=await supabase.from("electrical_connections").insert(connections.map((row)=>({document_id:doc.id,...row}))); if(connectionError)throw connectionError;}
            currentDocument={...currentDocument,report,connections};
            document.getElementById("document-code").textContent=doc.document_code; updateStatus(doc.status); saveButton.textContent="Salvar alterações";
            showMessage("Rascunho salvo. O documento já está disponível para consulta pelos membros ativos da equipe.","success"); applyPermissions(); return doc;
        } finally {setBusy(false);}
    }
    function validateForSubmission() {
        const report=collectReport(), connections=readConnections();
        const required=[report.circuit_identification,report.nominal_voltage,report.breaker_limit,report.circuit_type,report.operations_performed,report.tools_used];
        if(required.some((v)=>!v)) throw new Error("Preencha identificação do circuito, tensão nominal, limite do disjuntor, tipo do circuito, operações e ferramentas.");
        const checks=[report.wire_gauge_ok,report.crimping_tinning_ok,report.labels_both_ends_ok,report.continuity_test_ok,report.cable_organization_ok];
        if(checks.some((v)=>v===null)) throw new Error("Avalie os cinco critérios de validação selecionando Sim ou Não.");
        if(!connections.length||connections.some((row)=>!row.connected_device||!row.id_port_used)) throw new Error("Informe pelo menos um motor/sensor conectado e sua respectiva ID/porta.");
        if(!value("start-time")||!value("end-time")) throw new Error("Informe os horários de início e término.");
    }
    async function submitReport() {
        try{validateForSubmission();const doc=await saveReport();if(!doc)return;setBusy(true);const {error}=await supabase.rpc("submit_electrical_document",{p_document_id:doc.id});if(error)throw error;currentDocument.status="submitted";updateStatus("submitted");applyPermissions();showMessage("Relatório enviado para revisão técnica.","success");}
        catch(error){console.error(error);showError(error.message||"Não foi possível enviar o relatório.");}finally{setBusy(false);}
    }
    async function fetchCurrentDocument() {
        const {data,error}=await supabase.from("documents").select("*").eq("id",documentId).single(); if(error)throw error;
        if(data.document_type!=="electrical")throw new Error("Este documento não é um relatório de elétrica.");
        const [reportResult,connectionResult,reviewResult]=await Promise.all([
            supabase.from("electrical_reports").select("*").eq("document_id",documentId).maybeSingle(),
            supabase.from("electrical_connections").select("*").eq("document_id",documentId).order("sort_order"),
            supabase.from("document_reviews").select("reviewer_name_snapshot,decision,notes,created_at").eq("document_id",documentId).order("created_at",{ascending:false})
        ]);
        if(reportResult.error)throw reportResult.error;if(connectionResult.error)throw connectionResult.error;if(reviewResult.error)throw reviewResult.error;
        currentDocument={...data,report:reportResult.data,connections:connectionResult.data||[],reviews:reviewResult.data||[]};fillForm();applyPermissions();
    }
    async function initialize() {
        if(!supabase)throw new Error("Cliente Supabase não inicializado.");
        const {data:auth,error:authError}=await supabase.auth.getUser();if(authError||!auth.user){location.replace("login.html");return;}user=auth.user;
        const {data:memberProfile,error}=await supabase.from("profiles").select("full_name,role,is_active").eq("id",user.id).single();
        if(error||!memberProfile||!memberProfile.is_active){await supabase.auth.signOut();location.replace("login.html?status=inactive");return;}profile=memberProfile;
        document.getElementById("header-member-name").textContent=profile.full_name||user.email;
        if(documentId){await fetchCurrentDocument();}else{
            const now=new Date();setValue("execution-date",`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}-${String(now.getDate()).padStart(2,"0")}`);
            document.getElementById("executor-name").textContent=profile.full_name||user.email;addConnectionRow();
            document.getElementById("document-status").textContent="Novo rascunho";document.getElementById("document-status").className="status-badge draft";printButton.hidden=true;canEdit=true;
        }
    }
    document.getElementById("add-connection").addEventListener("click",()=>addConnectionRow());
    saveButton.addEventListener("click",async()=>{try{await saveReport();}catch(error){console.error(error);showError(error.message||"Não foi possível salvar o rascunho.");}});
    submitButton.addEventListener("click",submitReport);printButton.addEventListener("click",()=>window.print());
    logoutButton.addEventListener("click",async()=>{logoutButton.disabled=true;const {error}=await supabase.auth.signOut();if(error){alert("Não foi possível encerrar a sessão.");logoutButton.disabled=false;return;}location.replace("login.html");});
    supabase.auth.onAuthStateChange((event)=>{if(event==="SIGNED_OUT")location.replace("login.html");});
    initialize().catch((error)=>{console.error("Falha ao iniciar relatório de elétrica:",error);showError(error.message||"Não foi possível carregar este relatório.");form.hidden=true;});
})();
