(() => {
    "use strict";

    const supabase = window.megaHarpySupabase;
    const body = document.getElementById("review-queue-body");
    const errorBox = document.getElementById("review-queue-error");
    const feedbackBox = document.getElementById("review-queue-feedback");
    const content = document.getElementById("review-queue-content");
    const search = document.getElementById("review-search");
    const refresh = document.getElementById("refresh-reviews");
    const logout = document.getElementById("logout-button");

    let pending = [];
    const labels = {
        machining: "Usinagem",
        electrical: "Elétrica",
        assembly: "Montagem",
        maintenance: "Manutenção",
        eco: "ECO",
        fracas: "FRACAS"
    };

    function showError(message) {
        errorBox.textContent = message;
        errorBox.hidden = !message;
        feedbackBox.hidden = true;
    }

    function dateTime(value) {
        if (!value) return "—";
        const date = new Date(value);
        return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString("pt-BR");
    }

    function cell(value) {
        const td = document.createElement("td");
        td.textContent = value ?? "—";
        return td;
    }

    function render() {
        const query = search.value.trim().toLocaleLowerCase("pt-BR");
        const rows = pending.filter(doc => [
            doc.document_code, doc.display_reference, doc.executor_name_snapshot, labels[doc.document_type]
        ].filter(Boolean).join(" ").toLocaleLowerCase("pt-BR").includes(query));

        body.replaceChildren();
        for (const doc of rows) {
            const row = document.createElement("tr");
            row.append(cell(doc.document_code), cell(labels[doc.document_type] || doc.document_type),
                cell(doc.display_reference || "Não informado"), cell(doc.executor_name_snapshot || "—"),
                cell(dateTime(doc.submitted_at)));
            const action = document.createElement("td");
            const link = document.createElement("a");
            link.className = "small-primary-button";
            const destinations = {
                machining: "revisao-usinagem.html",
                electrical: "revisao-eletrica.html",
                assembly: "revisao-montagem.html",
                maintenance: "revisao-manutencao.html",
                eco: "revisao-eco.html",
                fracas: "revisao-fracas.html"
            };
            link.href = `${destinations[doc.document_type] || "revisoes.html"}?id=${encodeURIComponent(doc.id)}`;
            link.textContent = "Analisar";
            action.append(link);
            row.append(action);
            body.append(row);
        }

        document.getElementById("review-queue-empty").hidden = rows.length > 0;
        document.getElementById("review-count-pending").textContent = String(pending.length);
        const oldest = pending.length ? pending[0].submitted_at : null;
        document.getElementById("review-oldest-date").textContent = oldest
            ? new Date(oldest).toLocaleDateString("pt-BR") : "—";
    }

    async function loadQueue() {
        refresh.disabled = true;
        refresh.textContent = "Carregando...";
        try {
            const { data: docs, error } = await supabase.from("documents")
                .select("id,document_code,document_type,status,executor_name_snapshot,submitted_at,deleted_at")
                .in("document_type", ["machining", "electrical", "assembly", "maintenance", "eco", "fracas"])
                .eq("status", "submitted").is("deleted_at", null)
                .order("submitted_at", { ascending: true });
            if (error) throw error;

            const byType = type => (docs || []).filter(doc => doc.document_type === type).map(doc => doc.id);
            const [machining, electrical, assembly, maintenance, eco, fracas] = await Promise.all([
                byType("machining").length ? supabase.from("machining_reports").select("document_id,part_code").in("document_id", byType("machining")) : Promise.resolve({ data: [], error: null }),
                byType("electrical").length ? supabase.from("electrical_reports").select("document_id,circuit_identification").in("document_id", byType("electrical")) : Promise.resolve({ data: [], error: null }),
                byType("assembly").length ? supabase.from("assembly_reports").select("document_id,assembly_code").in("document_id", byType("assembly")) : Promise.resolve({ data: [], error: null }),
                byType("maintenance").length ? supabase.from("maintenance_reports").select("document_id,assembly_code").in("document_id", byType("maintenance")) : Promise.resolve({ data: [], error: null }),
                byType("eco").length ? supabase.from("eco_reports").select("document_id,affected_codes").in("document_id", byType("eco")) : Promise.resolve({ data: [], error: null }),
                byType("fracas").length ? supabase.from("fracas_reports").select("document_id,part_assembly_code").in("document_id", byType("fracas")) : Promise.resolve({ data: [], error: null })
            ]);
            for (const result of [machining, electrical, assembly, maintenance, eco, fracas]) {
                if (result.error) throw result.error;
            }

            const references = new Map();
            for (const row of machining.data || []) references.set(row.document_id, row.part_code || "");
            for (const row of electrical.data || []) references.set(row.document_id, row.circuit_identification || "");
            for (const row of assembly.data || []) references.set(row.document_id, row.assembly_code || "");
            for (const row of maintenance.data || []) references.set(row.document_id, row.assembly_code || "");
            for (const row of eco.data || []) references.set(row.document_id, (row.affected_codes || "").replace(/\s*\n\s*/g, " · "));
            for (const row of fracas.data || []) references.set(row.document_id, row.part_assembly_code || "");

            pending = (docs || []).map(doc => ({ ...doc, display_reference: references.get(doc.id) || "" }));
            render();
            content.hidden = false;
            errorBox.hidden = true;
        } catch (error) {
            console.error("Falha ao carregar fila de revisão:", error);
            showError([error.message, error.details, error.hint, error.code].filter(Boolean).join(" — ") || "Não foi possível carregar a fila.");
        } finally {
            refresh.disabled = false;
            refresh.textContent = "↻ Atualizar fila";
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
        content.hidden = false;
        await loadQueue();

        const result = new URLSearchParams(location.search).get("result");
        if (result === "approved") feedbackBox.textContent = "Documento aprovado com sucesso.";
        if (result === "changes") feedbackBox.textContent = "Documento devolvido para correções.";
        feedbackBox.hidden = !feedbackBox.textContent;
    }

    refresh.addEventListener("click", loadQueue);
    search.addEventListener("input", render);
    logout.addEventListener("click", async () => {
        const { error } = await supabase.auth.signOut();
        if (error) { showError("Não foi possível encerrar a sessão."); return; }
        location.replace("login.html");
    });
    supabase.auth.onAuthStateChange(event => { if (event === "SIGNED_OUT") location.replace("login.html"); });
    initialize().catch(error => { console.error(error); showError(error.message || "Não foi possível inicializar a fila."); });
})();
