(() => {
    "use strict";

    const supabase = window.megaHarpySupabase;
    const adminContent = document.getElementById("admin-content");
    const accessDenied = document.getElementById("access-denied");
    const adminMessage = document.getElementById("admin-message");
    const tableBody = document.getElementById("members-table-body");
    const emptyState = document.getElementById("members-empty");
    const inviteForm = document.getElementById("invite-form");
    const inviteButton = document.getElementById("invite-submit");
    const inviteMessage = document.getElementById("invite-message");
    const refreshButton = document.getElementById("refresh-members");
    const searchInput = document.getElementById("member-search");
    const roleFilter = document.getElementById("role-filter");
    const logoutButton = document.getElementById("logout-button");

    const roleLabels = {
        member: "Membro",
        reviewer: "Revisor",
        admin: "Administrador",
    };

    let currentUser = null;
    let members = [];

    function setMessage(element, text, type = "info") {
        element.textContent = text;
        element.className = `notice ${type}`;
        element.hidden = !text;
    }

    function setFormMessage(text, type = "info") {
        inviteMessage.textContent = text;
        inviteMessage.className = `form-message ${type}`;
    }

    function setButtonLoading(button, loading, loadingText, normalText) {
        button.disabled = loading;
        button.classList.toggle("is-loading", loading);
        const label = button.querySelector(".button-label");
        if (label) label.textContent = loading ? loadingText : normalText;
    }

    async function invokeAdmin(payload) {
        const { data, error } = await supabase.functions.invoke("admin-members", {
            body: payload,
        });

        if (error) {
            let detail = error.message || "A operação não foi concluída.";
            if (error.context && typeof error.context.json === "function") {
                try {
                    const responseBody = await error.context.json();
                    detail = responseBody.error || responseBody.message || detail;
                } catch {
                    // Keep the SDK error message when the response is not JSON.
                }
            }
            throw new Error(detail);
        }

        if (data?.error) throw new Error(data.error);
        return data;
    }

    function formatDate(value) {
        if (!value) return "—";
        const date = new Date(value);
        return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString("pt-BR");
    }

    function memberStatus(member) {
        if (!member.is_active) return { label: "Suspenso", className: "suspended" };
        if (!member.confirmed_at) return { label: "Convite pendente", className: "pending" };
        return { label: "Ativo", className: "active" };
    }

    function updateCounters() {
        const suspended = members.filter((member) => !member.is_active).length;
        const pending = members.filter((member) => member.is_active && !member.confirmed_at).length;
        const active = members.length - suspended - pending;

        document.getElementById("count-total").textContent = String(members.length);
        document.getElementById("count-active").textContent = String(active);
        document.getElementById("count-pending").textContent = String(pending);
        document.getElementById("count-suspended").textContent = String(suspended);
    }

    function makeCell(className = "") {
        const cell = document.createElement("td");
        if (className) cell.className = className;
        return cell;
    }

    function makeButton(label, className, onClick) {
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = label;
        button.className = className;
        button.addEventListener("click", onClick);
        return button;
    }

    async function saveMember(member, nameInput, roleSelect, saveButton) {
        const fullName = nameInput.value.trim();
        if (fullName.length < 2) {
            setMessage(adminMessage, "O nome precisa ter pelo menos 2 caracteres.", "error");
            nameInput.focus();
            return;
        }

        saveButton.disabled = true;
        try {
            await invokeAdmin({
                action: "update",
                userId: member.id,
                fullName,
                role: roleSelect.value,
            });
            setMessage(adminMessage, `Dados de ${member.email} atualizados.`, "success");
            await loadMembers();
        } catch (error) {
            setMessage(adminMessage, error.message, "error");
        } finally {
            saveButton.disabled = false;
        }
    }

    async function toggleMember(member, action, button) {
        const actionLabel = action === "suspend" ? "suspender" : "reativar";
        const confirmation = window.confirm(
            `Deseja realmente ${actionLabel} o acesso de ${member.full_name || member.email}?`,
        );
        if (!confirmation) return;

        button.disabled = true;
        try {
            await invokeAdmin({ action, userId: member.id });
            setMessage(
                adminMessage,
                action === "suspend"
                    ? `Acesso de ${member.email} suspenso.`
                    : `Acesso de ${member.email} reativado.`,
                "success",
            );
            await loadMembers();
        } catch (error) {
            setMessage(adminMessage, error.message, "error");
        } finally {
            button.disabled = false;
        }
    }

    function renderMembers() {
        const search = searchInput.value.trim().toLocaleLowerCase("pt-BR");
        const selectedRole = roleFilter.value;
        const filtered = members.filter((member) => {
            const searchable = `${member.full_name} ${member.email}`.toLocaleLowerCase("pt-BR");
            const matchesSearch = !search || searchable.includes(search);
            const matchesRole = selectedRole === "all" || member.role === selectedRole;
            return matchesSearch && matchesRole;
        });

        tableBody.replaceChildren();
        emptyState.hidden = filtered.length > 0;

        if (filtered.length === 0) return;

        for (const member of filtered) {
            const row = document.createElement("tr");
            const isSelf = member.id === currentUser.id;
            const status = memberStatus(member);

            const nameCell = makeCell("member-name-cell");
            const nameInput = document.createElement("input");
            nameInput.type = "text";
            nameInput.className = "member-name-input";
            nameInput.value = member.full_name || "";
            nameInput.maxLength = 120;
            nameInput.setAttribute("aria-label", `Nome de ${member.email}`);
            nameCell.append(nameInput);
            if (isSelf) {
                const selfLabel = document.createElement("small");
                selfLabel.className = "self-label";
                selfLabel.textContent = "Sua conta";
                nameCell.append(selfLabel);
            }

            const emailCell = makeCell("member-email-cell");
            emailCell.textContent = member.email || "E-mail não disponível";

            const roleCell = makeCell("member-role-cell");
            const roleSelect = document.createElement("select");
            roleSelect.className = "member-role-select";
            roleSelect.setAttribute("aria-label", `Nível de acesso de ${member.email}`);
            for (const [role, label] of Object.entries(roleLabels)) {
                const option = document.createElement("option");
                option.value = role;
                option.textContent = label;
                roleSelect.append(option);
            }
            roleSelect.value = roleLabels[member.role] ? member.role : "member";
            roleSelect.disabled = isSelf;
            roleCell.append(roleSelect);

            const statusCell = makeCell("member-status-cell");
            const statusBadge = document.createElement("span");
            statusBadge.className = `status-badge ${status.className}`;
            statusBadge.textContent = status.label;
            statusCell.append(statusBadge);

            const dateCell = makeCell("member-date-cell");
            dateCell.textContent = formatDate(member.created_at);

            const actionsCell = makeCell("member-actions-cell");
            const actions = document.createElement("div");
            actions.className = "member-actions";

            const saveButton = makeButton("Salvar", "small-primary-button", () => {
                saveMember(member, nameInput, roleSelect, saveButton);
            });
            actions.append(saveButton);

            const canSuspend = !isSelf && member.role !== "admin";
            const toggleButton = makeButton(
                member.is_active ? "Suspender" : "Reativar",
                member.is_active ? "small-danger-button" : "small-secondary-button",
                () => toggleMember(member, member.is_active ? "suspend" : "reactivate", toggleButton),
            );
            toggleButton.disabled = !canSuspend;
            if (!canSuspend) {
                toggleButton.title = isSelf
                    ? "Você não pode suspender sua própria conta."
                    : "Rebaixe a função administrativa antes de suspender esta conta.";
            }
            actions.append(toggleButton);
            actionsCell.append(actions);

            row.append(nameCell, emailCell, roleCell, statusCell, dateCell, actionsCell);
            tableBody.append(row);
        }
    }

    async function loadMembers() {
        refreshButton.disabled = true;
        refreshButton.textContent = "Carregando...";
        try {
            const data = await invokeAdmin({ action: "list" });
            members = Array.isArray(data.members) ? data.members : [];
            updateCounters();
            renderMembers();
            setMessage(adminMessage, "", "info");
        } catch (error) {
            setMessage(adminMessage, error.message, "error");
            tableBody.replaceChildren();
            const row = document.createElement("tr");
            const cell = makeCell("table-placeholder");
            cell.colSpan = 6;
            cell.textContent = "Não foi possível carregar a lista de membros.";
            row.append(cell);
            tableBody.append(row);
        } finally {
            refreshButton.disabled = false;
            refreshButton.textContent = "↻ Atualizar lista";
        }
    }

    inviteForm.addEventListener("submit", async (event) => {
        event.preventDefault();
        setFormMessage("");
        const formData = new FormData(inviteForm);
        const payload = {
            action: "invite",
            fullName: String(formData.get("fullName") || "").trim(),
            email: String(formData.get("email") || "").trim(),
            role: String(formData.get("role") || "member"),
        };

        setButtonLoading(inviteButton, true, "Enviando convite...", "Enviar convite");
        try {
            const result = await invokeAdmin(payload);
            setFormMessage(result.message || "Convite enviado com sucesso.", "success");
            inviteForm.reset();
            await loadMembers();
        } catch (error) {
            setFormMessage(error.message, "error");
        } finally {
            setButtonLoading(inviteButton, false, "Enviando convite...", "Enviar convite");
        }
    });

    refreshButton.addEventListener("click", loadMembers);
    searchInput.addEventListener("input", renderMembers);
    roleFilter.addEventListener("change", renderMembers);

    logoutButton.addEventListener("click", async () => {
        logoutButton.disabled = true;
        const { error } = await supabase.auth.signOut();
        if (error) {
            logoutButton.disabled = false;
            setMessage(adminMessage, "Não foi possível encerrar a sessão. Tente novamente.", "error");
            return;
        }
        window.location.replace("login.html");
    });

    supabase.auth.onAuthStateChange((event) => {
        if (event === "SIGNED_OUT") window.location.replace("login.html");
    });

    async function initialize() {
        if (!supabase) {
            setMessage(adminMessage, "O cliente Supabase não foi inicializado.", "error");
            return;
        }

        const { data: authData, error: authError } = await supabase.auth.getUser();
        if (authError || !authData.user) {
            window.location.replace("login.html");
            return;
        }
        currentUser = authData.user;

        const { data: profile, error: profileError } = await supabase
            .from("profiles")
            .select("role, is_active")
            .eq("id", currentUser.id)
            .single();

        if (profileError || !profile || profile.is_active === false) {
            await supabase.auth.signOut();
            window.location.replace("login.html?status=inactive");
            return;
        }

        if (profile.role !== "admin") {
            accessDenied.hidden = false;
            return;
        }

        adminContent.hidden = false;
        await loadMembers();
    }

    initialize().catch((error) => {
        console.error("Falha ao inicializar a administração:", error);
        setMessage(adminMessage, "Ocorreu um erro ao carregar a administração. Atualize a página.", "error");
    });
})();
