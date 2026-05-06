(function () {
  const SESSION_KEY = "os_gate_session_v1";
  /** Evita que um verify antigo (async) apague o token novo após login bem-sucedido. */
  let authEpoch = 0;

  function showApp() {
    const gate = document.getElementById("auth-gate");
    const shell = document.getElementById("app-shell");
    const active = document.activeElement;
    if (gate && active && typeof active.blur === "function" && gate.contains(active)) {
      active.blur();
    }
    if (gate) {
      gate.hidden = true;
      gate.setAttribute("aria-hidden", "true");
    }
    if (shell) {
      shell.hidden = false;
      shell.removeAttribute("aria-hidden");
    }
    document.dispatchEvent(new CustomEvent("os-app-unlock"));
  }

  function showGate() {
    const gate = document.getElementById("auth-gate");
    const shell = document.getElementById("app-shell");
    if (shell) {
      shell.hidden = true;
      shell.setAttribute("aria-hidden", "true");
    }
    if (gate) {
      gate.hidden = false;
      gate.setAttribute("aria-hidden", "false");
    }
  }

  async function verifyStored() {
    const token = localStorage.getItem(SESSION_KEY);
    if (!token) return false;
    try {
      const r = await fetch("/api/verify-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
        cache: "no-store"
      });
      const data = await r.json().catch(() => ({}));
      return data.ok === true;
    } catch {
      return false;
    }
  }

  async function init() {
    const epoch = authEpoch;
    const ok = await verifyStored();
    if (epoch !== authEpoch) return;
    if (ok) {
      showApp();
      return;
    }
    try {
      localStorage.removeItem(SESSION_KEY);
    } catch (_) { /* ignore */ }
    if (epoch !== authEpoch) return;
    showGate();
  }

  async function onSubmit(e) {
    e.preventDefault();
    const input = document.getElementById("auth-code");
    const msg = document.getElementById("auth-gate-msg");
    const code = (input?.value || "").trim();
    if (!code) {
      if (msg) {
        msg.textContent = "Informe o código.";
        msg.classList.add("is-error");
      }
      return;
    }
    if (msg) {
      msg.textContent = "Verificando…";
      msg.classList.remove("is-error");
    }
    try {
      const r = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
        cache: "no-store"
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok || !data.ok || !data.token) {
        const map = {
          invalid_code: "Código inválido.",
          server_misconfigured: "Serviço indisponível. Tente mais tarde."
        };
        if (msg) {
          msg.textContent = map[data.msg] || "Não foi possível entrar.";
          msg.classList.add("is-error");
        }
        return;
      }
      authEpoch += 1;
      try {
        localStorage.setItem(SESSION_KEY, data.token);
      } catch (err) {
        if (msg) {
          msg.textContent = "Não foi possível guardar a sessão neste navegador.";
          msg.classList.add("is-error");
        }
        return;
      }
      if (msg) msg.textContent = "";
      showApp();
    } catch {
      if (msg) {
        msg.textContent = "Sem conexão. Verifique a internet.";
        msg.classList.add("is-error");
      }
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    document.getElementById("auth-gate-form")?.addEventListener("submit", onSubmit);
    init();
  });
})();
