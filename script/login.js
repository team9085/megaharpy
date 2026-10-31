(() => {
    "use strict";

    const supabase = window.megaHarpySupabase;
    const form = document.getElementById("login-form");
    const emailInput = document.getElementById("email");
    const passwordInput = document.getElementById("password");
    const loginButton = document.getElementById("login-button");
    const message = document.getElementById("login-message");
    const forgotButton = document.getElementById("forgot-password");
    const togglePasswordButton = document.getElementById("toggle-password");
    const googleLoginButton = document.getElementById("google-login-button");

    function setMessage(text, type = "info") {
        message.textContent = text;
        message.className = `form-message ${type}`;
    }

    function setLoading(isLoading) {
        loginButton.disabled = isLoading;
        loginButton.classList.toggle("is-loading", isLoading);
        loginButton.querySelector(".button-label").textContent = isLoading
            ? "Autenticando..."
            : "Entrar no portal";
    }

    // If the member already has a valid session, skip the login screen.
    (async () => {
        const { data, error } = await supabase.auth.getUser();
        if (!error && data.user) {
            window.location.replace("portal.html");
        }
    })();

    form.addEventListener("submit", async (event) => {
        event.preventDefault();
        setMessage("");
        setLoading(true);

        const email = emailInput.value.trim();
        const password = passwordInput.value;

        try {
            const { error } = await supabase.auth.signInWithPassword({ email, password });

            if (error) {
                // Keep the message generic; do not disclose whether an email exists.
                setMessage("Não foi possível entrar. Confira o e-mail e a senha ou procure um administrador.", "error");
                return;
            }

            window.location.replace("portal.html");
        } catch (error) {
            console.error("Falha no login:", error);
            setMessage("O serviço de autenticação não respondeu. Tente novamente.", "error");
        } finally {
            setLoading(false);
        }
    });

    googleLoginButton.addEventListener("click", async () => {
        googleLoginButton.disabled = true;
        setMessage("Redirecionando para o Google...", "info");

        try {
            // Return to the protected portal after Supabase completes OAuth.
            const redirectTo = new URL("portal.html", window.location.href).href;
            const { error } = await supabase.auth.signInWithOAuth({
                provider: "google",
                options: {
                    redirectTo,
                    queryParams: { prompt: "select_account" }
                }
            });

            if (error) throw error;
            // On success Supabase redirects the browser to Google.
        } catch (error) {
            console.error("Falha no login com Google:", error);
            setMessage("Não foi possível iniciar o login com Google. Tente novamente ou procure um administrador.", "error");
            googleLoginButton.disabled = false;
        }
    });

    togglePasswordButton.addEventListener("click", () => {
        const showing = passwordInput.type === "text";
        passwordInput.type = showing ? "password" : "text";
        togglePasswordButton.textContent = showing ? "Mostrar" : "Ocultar";
        togglePasswordButton.setAttribute("aria-label", showing ? "Mostrar senha" : "Ocultar senha");
    });

    forgotButton.addEventListener("click", async () => {
        const email = emailInput.value.trim();

        if (!email) {
            setMessage("Digite seu e-mail primeiro para solicitar a redefinição.", "error");
            emailInput.focus();
            return;
        }

        forgotButton.disabled = true;
        setMessage("Enviando solicitação...", "info");

        try {
            const redirectTo = new URL("redefinir-senha.html", window.location.href).href;
            const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });

            if (error) {
                console.error("Falha ao solicitar redefinição:", error);
                setMessage("Não foi possível solicitar a redefinição agora. Tente novamente ou procure um administrador.", "error");
            } else {
                setMessage("Se esse e-mail estiver cadastrado, você receberá instruções para redefinir a senha.", "success");
            }
        } catch (error) {
            console.error("Falha ao solicitar redefinição:", error);
            setMessage("O serviço não respondeu. Tente novamente.", "error");
        } finally {
            forgotButton.disabled = false;
        }
    });
})();
