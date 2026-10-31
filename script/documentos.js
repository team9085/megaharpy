(() => {
    "use strict";
    const supabase=window.megaHarpySupabase, body=document.getElementById("documents-table-body"), errorBox=document.getElementById("docs-error"), feedbackBox=document.getElementById("docs-feedback"), content=document.getElementById("docs-content"), searchInput=document.getElementById("docs-search"), statusFilter=document.getElementById("status-filter"), refreshButton=document.getElementById("refresh-documents"), newButton=document.getElementById("new-report"), logoutButton=document.getElementById("logout-button"), archivedToggle=document.getElementById("show-archived-documents"), archivedNote=document.getElementById("archived-view-note");
    let documents=[],user=null,profile=null,archivedView=false;
    const statusLabels={draft:["Rascunho","draft"],submitted:["Aguardando revisão","submitted"],changes_requested:["Correções solicitadas","changes"],approved:["Aprovado","approved"]};
    const typeLabels={machining:"Usinagem",electrical:"Elétrica",assembly:"Montagem"};
    function showError(message){errorBox.textContent=message;errorBox.hidden=false;feedbackBox.hidden=true;}
    function showFeedback(message){feedbackBox.textContent=message;feedbackBox.hidden=!message;errorBox.hidden=true;}
    function errorDetails(error){return [error?.message,error?.details,error?.hint,error?.code?`Código: ${error.code}`:""].filter(Boolean).join(" — ")||"Operação não concluída. Consulte o Console para detalhes.";}
    function formatDate(value){if(!value)return "—";const date=new Date(`${value}T12:00:00`);return Number.isNaN(date.getTime())?"—":date.toLocaleDateString("pt-BR");}
    function cell(value,className=""){const td=document.createElement("td");td.textContent=value??"—";if(className)td.className=className;return td;}
    function button(label,className,action){const el=document.createElement("button");el.type="button";el.className=className;el.textContent=label;el.addEventListener("click",action);return el;}
    function canDeleteDraft(doc){return !doc.deleted_at&&doc.status==="draft"&&(profile.role==="admin"||doc.created_by===user.id);}
    function canArchive(doc){if(doc.deleted_at||doc.status==="draft")return false;if(profile.role==="admin")return true;return doc.created_by===user.id&&doc.status==="changes_requested";}
    function canRestore(doc){return Boolean(doc.deleted_at)&&profile.role==="admin";}
    async function manageDocument(action,doc){
        const admin=profile.role==="admin";let reason="";
        if(action!=="restore"){
            const label=action==="delete_draft"?(admin?"Justificativa obrigatória para excluir":"Motivo da exclusão (opcional)"):(admin?"Justificativa obrigatória para arquivar":"Motivo do arquivamento (opcional)");
            reason=window.prompt(`${label} ${doc.document_code}:`,admin?"Registro de teste ou documento criado por engano":"");if(reason===null)return;reason=reason.trim();if(admin&&reason.length<5){alert("Administradores precisam informar uma justificativa com pelo menos 5 caracteres.");return;}
        }else if(!confirm(`Restaurar ${doc.document_code}? O documento voltará à lista normal.`))return;
        if(action!=="restore"&&!confirm(action==="delete_draft"?`Excluir definitivamente ${doc.document_code}?\n\nSomente rascunhos podem ser excluídos. Esta ação não pode ser desfeita.`:`Arquivar ${doc.document_code}?\n\nO documento sairá da lista normal e poderá ser restaurado por um administrador.`))return;
        try{const {data,error}=await supabase.rpc("manage_engineering_document",{p_document_id:doc.id,p_action:action,p_reason:reason||null});if(error)throw error;if(data?.error)throw new Error(data.error);if(action==="restore"||action==="archive")setArchivedView(false);await loadDocuments();showFeedback(({delete_draft:`${doc.document_code} foi excluído definitivamente.`,archive:`${doc.document_code} foi arquivado.`,restore:`${doc.document_code} foi restaurado.`})[action]);}
        catch(error){console.error(`Falha na operação ${action}:`,error);showError(errorDetails(error));}
    }
    function updateArchiveControls(){if(!archivedToggle)return;const count=documents.filter(d=>Boolean(d.deleted_at)).length;archivedToggle.hidden=profile?.role!=="admin";archivedToggle.textContent=archivedView?"← Voltar aos documentos":`Ver arquivados${count?` (${count})`:""}`;statusFilter.disabled=archivedView;if(archivedNote)archivedNote.hidden=!archivedView;}
    function setArchivedView(enabled){archivedView=Boolean(enabled&&profile?.role==="admin");searchInput.value="";statusFilter.value="all";updateArchiveControls();render();}
    function render(){
        const query=searchInput.value.trim().toLocaleLowerCase("pt-BR"),selected=statusFilter.value;
        const filtered=documents.filter(doc=>{const archived=Boolean(doc.deleted_at);if(archived!==archivedView)return false;const haystack=[doc.document_code,doc.executor_name_snapshot,doc.display_reference,doc.deletion_reason,typeLabels[doc.document_type]].filter(Boolean).join(" ").toLocaleLowerCase("pt-BR");return (!query||haystack.includes(query))&&(archivedView||selected==="all"||doc.status===selected);});
        body.replaceChildren();
        for(const doc of filtered){const row=document.createElement("tr");row.append(cell(doc.document_code,"doc-code-cell"));const typeCell=document.createElement("td");const typeBadge=document.createElement("span");typeBadge.className="doc-type-badge";typeBadge.textContent=typeLabels[doc.document_type]||doc.document_type;typeCell.append(typeBadge);row.append(typeCell);row.append(cell(doc.display_reference||"Não informado"));row.append(cell(doc.executor_name_snapshot||"—"));row.append(cell(formatDate(doc.execution_date)));
            const statusCell=document.createElement("td"),badge=document.createElement("span"),status=statusLabels[doc.status]||[doc.status,"draft"];badge.className=`status-badge ${doc.deleted_at?"archived":status[1]}`;badge.textContent=doc.deleted_at?"Arquivado":status[0];statusCell.append(badge);row.append(statusCell);
            const actions=document.createElement("td");actions.className="docs-actions-cell";const open=document.createElement("a");open.className="small-primary-button doc-open-button";open.href=`${({machining:"relatorio-usinagem.html",electrical:"relatorio-eletrica.html",assembly:"relatorio-montagem.html"})[doc.document_type]||"documentos.html"}?id=${encodeURIComponent(doc.id)}`;open.textContent="Abrir";actions.append(open);
            if(canRestore(doc)){actions.append(button("Restaurar","small-secondary-button",()=>manageDocument("restore",doc)));if(doc.status==="draft")actions.append(button("Excluir definitivamente","small-danger-button",()=>manageDocument("delete_draft",doc)));}
            else if(canDeleteDraft(doc))actions.append(button("Excluir rascunho","small-danger-button",()=>manageDocument("delete_draft",doc)));
            else if(canArchive(doc))actions.append(button("Arquivar","small-danger-button",()=>manageDocument("archive",doc)));
            row.append(actions);body.append(row);
        }
        document.getElementById("docs-empty").textContent=archivedView?"Não há documentos arquivados ou nenhum registro corresponde à busca.":"Nenhum documento corresponde aos filtros.";document.getElementById("docs-empty").hidden=filtered.length>0;
        const active=documents.filter(d=>!d.deleted_at);document.getElementById("count-total").textContent=String(active.length);document.getElementById("count-draft").textContent=String(active.filter(d=>d.status==="draft").length);document.getElementById("count-submitted").textContent=String(active.filter(d=>d.status==="submitted").length);document.getElementById("count-approved").textContent=String(active.filter(d=>d.status==="approved").length);
        const heading=document.querySelector(".docs-panel-heading h2");if(heading)heading.textContent=archivedView?"Documentos arquivados":"Relatórios de processo";updateArchiveControls();
    }
    async function loadDocuments(){refreshButton.disabled=true;try{
        const {data:docs,error:docsError}=await supabase.from("documents").select("id,document_code,document_type,status,executor_name_snapshot,execution_date,created_at,created_by,deleted_at,deletion_reason").in("document_type",["machining","electrical","assembly"]).order("created_at",{ascending:false});if(docsError)throw docsError;
        const machiningIds=(docs||[]).filter(d=>d.document_type==="machining").map(d=>d.id),electricalIds=(docs||[]).filter(d=>d.document_type==="electrical").map(d=>d.id),assemblyIds=(docs||[]).filter(d=>d.document_type==="assembly").map(d=>d.id);
        const [machiningResult,electricalResult,assemblyResult]=await Promise.all([
            machiningIds.length?supabase.from("machining_reports").select("document_id,part_code").in("document_id",machiningIds):Promise.resolve({data:[],error:null}),
            electricalIds.length?supabase.from("electrical_reports").select("document_id,circuit_identification").in("document_id",electricalIds):Promise.resolve({data:[],error:null}),
            assemblyIds.length?supabase.from("assembly_reports").select("document_id,assembly_code").in("document_id",assemblyIds):Promise.resolve({data:[],error:null})
        ]);if(machiningResult.error)throw machiningResult.error;if(electricalResult.error)throw electricalResult.error;if(assemblyResult.error)throw assemblyResult.error;
        const referenceMap=new Map();for(const r of machiningResult.data||[])referenceMap.set(r.document_id,r.part_code||"");for(const r of electricalResult.data||[])referenceMap.set(r.document_id,r.circuit_identification||"");for(const r of assemblyResult.data||[])referenceMap.set(r.document_id,r.assembly_code||"");
        documents=(docs||[]).map(doc=>({...doc,display_reference:referenceMap.get(doc.id)||""}));render();content.hidden=false;errorBox.hidden=true;
    }catch(error){console.error("Falha ao carregar documentos:",error);showError(errorDetails(error));}finally{refreshButton.disabled=false;}}
    async function initialize(){if(!supabase)throw new Error("Cliente Supabase não inicializado.");const {data:authData,error:authError}=await supabase.auth.getUser();if(authError||!authData.user){location.replace("login.html");return;}user=authData.user;const {data:memberProfile,error}=await supabase.from("profiles").select("full_name,role,is_active").eq("id",user.id).single();if(error||!memberProfile||!memberProfile.is_active){await supabase.auth.signOut();location.replace("login.html?status=inactive");return;}profile=memberProfile;document.getElementById("header-member-name").textContent=profile.full_name||user.email;archivedToggle.hidden=profile.role!=="admin";updateArchiveControls();content.hidden=false;await loadDocuments();}
    newButton.addEventListener("click",()=>location.href="novo-relatorio.html");refreshButton.addEventListener("click",loadDocuments);searchInput.addEventListener("input",render);statusFilter.addEventListener("change",render);archivedToggle.addEventListener("click",()=>setArchivedView(!archivedView));
    logoutButton.addEventListener("click",async()=>{const {error}=await supabase.auth.signOut();if(error){showError("Não foi possível encerrar a sessão.");return;}location.replace("login.html");});supabase.auth.onAuthStateChange(event=>{if(event==="SIGNED_OUT")location.replace("login.html");});initialize().catch(error=>{console.error(error);showError(errorDetails(error));});
})();
