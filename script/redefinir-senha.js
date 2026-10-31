(() => {
    "use strict";

    const supabase = window.megaHarpySupabase;
    const form = document.getElementById("reset-form");
    const message = document.getElementById("reset-message");
    const saveButton = document.getElementById("save-password");
    const newPasswordInput = document.getElementById("new-password");
    const confirmPasswordInput = document.getElementById("confirm-password");

    function setMessage(text, type = "info") {
        message.textContent = text;
        message.className = `form-message ${type}`;
    }

    function setLoading(isLoading) {
        saveButton.disabled = isLoading;
        saveButton.classList.toggle("is-loading", isLoading);
        saveButton.querySelector(".button-label").textContent = isLoading
            ? "Salvando..."
            : "Salvar nova senha";
    }

    // The recovery link is parsed by supabase-js (detectSessionInUrl).
    // A valid recovery session is required before showing the password form.
    (async () => {
        const { data, error } = await supabase.auth.getSession();

        if (error || !data.session) {
            setMessage("Este link é inválido ou expirou. Volte ao login e solicite uma nova redefinição.", "error");
            return;
        }

        form.hidden = false;
        setMessage("Link validado. Defina sua nova senha.", "success");
    })();

    form.addEventListener("submit", async (event) => {
        event.preventDefault();
        const password = newPasswordInput.value;
        const confirmation = confirmPasswordInput.value;

        if (password.length < 8) {
            setMessage("A senha precisa ter pelo menos 8 caracteres.", "error");
            return;
        }

        if (password !== confirmation) {
            setMessage("As senhas não coincidem.", "error");
            return;
        }

        setLoading(true);
        try {
            const { error } = await supabase.auth.updateUser({ password });
            if (error) {
                setMessage("Não foi possível atualizar a senha. Solicite um novo link e tente novamente.", "error");
                return;
            }

            setMessage("Senha atualizada com sucesso. Redirecionando ao portal...", "success");
            window.setTimeout(() => window.location.replace("portal.html"), 1200);
        } catch (error) {
            console.error("Falha ao atualizar a senha:", error);
            setMessage("O serviço não respondeu. Tente novamente.", "error");
        } finally {
            setLoading(false);
        }
    });
})();
