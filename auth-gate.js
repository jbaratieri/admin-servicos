(function () {
  const LICENSE_KEY = "os_license_key";
  const AUTH_KEY = "os_auth_ok";
  const LAST_CHECK_KEY = "os_last_license_check";
  const LICENSE_SNAPSHOT = "os_license";
  const LOCK_KEY = "os:check:lock";
  const STATUS_BLOCKED = "os:status";
  const LEGACY_SESSION = "os_gate_session_v1";
  /** Evita que um verify antigo (async) feche o app após login bem-sucedido. */
  let authEpoch = 0;

  const OFFLINE_TTL_DAYS = 5;
  const CHECK_COOLDOWN_HOURS = 24;

  function getDeviceId() {
    try {
      const KEY = "os_device_id";
      let id = localStorage.getItem(KEY);
      if (!id) {
        if (typeof crypto !== "undefined" && crypto.randomUUID) {
          id = crypto.randomUUID();
        } else {
          id = "dev-" + Date.now().toString(36) + "-" + Math.floor(Math.random() * 1e6).toString(36);
        }
        localStorage.setItem(KEY, id);
      }
      return id;
    } catch {
      return "dev-unknown";
    }
  }

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

  function clearLicenseState() {
    try {
      localStorage.removeItem(LICENSE_KEY);
      localStorage.removeItem(AUTH_KEY);
      localStorage.removeItem(LAST_CHECK_KEY);
      localStorage.removeItem(LICENSE_SNAPSHOT);
      localStorage.removeItem(LEGACY_SESSION);
    } catch (_) {
      /* ignore */
    }
  }

  async function checkLicenseApi(license) {
    const r = await fetch("/api/check-license", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ license_key: license }),
      cache: "no-store"
    });
    const data = await r.json().catch(() => ({}));
    return { resp: r, data };
  }

  async function revalidateDaily(options) {
    const force = options && options.force === true;
    const epoch = authEpoch;
    const now = Date.now();

    if (localStorage.getItem(AUTH_KEY) !== "ok") return;
    const code = localStorage.getItem(LICENSE_KEY);
    if (!code) return;

    const lastOk = parseInt(localStorage.getItem(LAST_CHECK_KEY) || "0", 10) || 0;
    const hoursSinceOk = (now - lastOk) / (1000 * 60 * 60);
    if (!force && hoursSinceOk < CHECK_COOLDOWN_HOURS) return;

    try {
      const lockTs = parseInt(localStorage.getItem(LOCK_KEY) || "0", 10) || 0;
      if (now - lockTs < 30_000) return;
      localStorage.setItem(LOCK_KEY, String(now));
    } catch (_) {
      /* ignore */
    }

    const banner = document.createElement("div");
    banner.textContent = "Verificando licença…";
    banner.style.cssText =
      "position:fixed;top:0;left:0;width:100%;background:#44403c;color:#fff;padding:6px 8px;text-align:center;font-size:12px;z-index:9999;";
    document.body.appendChild(banner);

    try {
      const { resp, data } = await checkLicenseApi(code);
      if (epoch !== authEpoch) return;

      if (data && data.ok === true) {
        const serverNow = data.server_time ? Date.parse(data.server_time) : now;
        localStorage.setItem(LAST_CHECK_KEY, String(Number.isFinite(serverNow) ? serverNow : now));
        try {
          localStorage.setItem(
            LICENSE_SNAPSHOT,
            JSON.stringify({
              plan: data.plan_type || data.plan || "mensal",
              expires: data.expires_at || null
            })
          );
        } catch (_) {
          /* ignore */
        }
        return;
      }

      const reason = data && data.msg ? data.msg : "";
      if (reason === "blocked" || reason === "expired" || reason === "license_not_found") {
        try {
          localStorage.setItem(STATUS_BLOCKED, "1");
          clearLicenseState();
        } catch (_) {
          /* ignore */
        }
        const text =
          reason === "blocked"
            ? "Acesso bloqueado. Fale com o suporte."
            : reason === "expired"
              ? "Licença expirada. Entre novamente após renovar."
              : "Código não encontrado. Faça login novamente.";
        alert(text);
        showGate();
        return;
      }

      console.warn("[auth-gate] check-license:", reason || "(HTTP " + resp.status + ")");
    } catch (err) {
      if (epoch !== authEpoch) return;
      const daysSinceOk =
        (now - (parseInt(localStorage.getItem(LAST_CHECK_KEY) || "0", 10) || 0)) /
        (1000 * 60 * 60 * 24);
      if (daysSinceOk >= OFFLINE_TTL_DAYS) {
        try {
          localStorage.setItem(STATUS_BLOCKED, "1");
          clearLicenseState();
        } catch (_) {
          /* ignore */
        }
        alert(
          "Não foi possível validar sua licença e o período offline expirou.\nConecte-se e faça login novamente."
        );
        showGate();
      } else {
        console.warn("[auth-gate] rede; mantendo dentro do período offline.", err);
      }
    } finally {
      setTimeout(() => banner.remove(), 900);
      try {
        localStorage.removeItem(LOCK_KEY);
      } catch (_) {
        /* ignore */
      }
    }
  }

  async function init() {
    const epoch = authEpoch;
    try {
      localStorage.removeItem(LEGACY_SESSION);
    } catch (_) {
      /* ignore */
    }

    try {
      if (localStorage.getItem(STATUS_BLOCKED) === "1") {
        const msg = document.getElementById("auth-gate-msg");
        if (msg) {
          msg.textContent = "Acesso bloqueado ou licença inválida. Entre com seu código ou fale com o suporte.";
          msg.classList.add("is-error");
        }
        clearLicenseState();
        try {
          localStorage.removeItem(STATUS_BLOCKED);
        } catch (_) {
          /* ignore */
        }
        showGate();
        return;
      }
    } catch (_) {
      /* ignore */
    }

    if (localStorage.getItem(AUTH_KEY) !== "ok") {
      showGate();
      return;
    }
    const code = localStorage.getItem(LICENSE_KEY);
    if (!code) {
      clearLicenseState();
      showGate();
      return;
    }

    const lastOk = parseInt(localStorage.getItem(LAST_CHECK_KEY) || "0", 10) || 0;
    if (!lastOk) {
      await revalidateDaily({ force: true });
    } else {
      await revalidateDaily();
    }

    if (epoch !== authEpoch) return;

    if (localStorage.getItem(AUTH_KEY) === "ok" && localStorage.getItem(LICENSE_KEY)) {
      showApp();
    } else {
      showGate();
    }
  }

  async function onSubmit(e) {
    e.preventDefault();
    const input = document.getElementById("auth-code");
    const msg = document.getElementById("auth-gate-msg");
    const code = (input?.value || "").trim().toUpperCase();
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
      if (!r.ok || !data.ok) {
        const map = {
          license_not_found: "Código não encontrado.",
          invalid_code: "Código inválido.",
          blocked: "Acesso bloqueado. Fale com o suporte.",
          expired: "Licença expirada. Fale com o suporte.",
          server_misconfigured: "Serviço indisponível. Tente mais tarde.",
          server_error: "Falha no servidor. Tente novamente."
        };
        if (msg) {
          msg.textContent = map[data.msg] || "Não foi possível entrar.";
          msg.classList.add("is-error");
        }
        return;
      }

      authEpoch += 1;
      try {
        localStorage.setItem(LICENSE_KEY, code);
        localStorage.setItem(AUTH_KEY, "ok");
        localStorage.setItem(
          LICENSE_SNAPSHOT,
          JSON.stringify({
            plan: data.plan_type || "mensal",
            expires: data.expires_at || ""
          })
        );
        const serverNow = data.server_time ? Date.parse(data.server_time) : Date.now();
        localStorage.setItem(LAST_CHECK_KEY, String(Number.isFinite(serverNow) ? serverNow : Date.now()));
        try {
          localStorage.removeItem(STATUS_BLOCKED);
        } catch (_) {
          /* ignore */
        }
      } catch (err) {
        if (msg) {
          msg.textContent = "Não foi possível guardar a sessão neste navegador.";
          msg.classList.add("is-error");
        }
        return;
      }

      if (data.bypass !== "env_code") {
        try {
          await fetch("/api/validate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ code, deviceId: getDeviceId() }),
            cache: "no-store"
          });
        } catch (_) {
          /* igual ao Método: falha pontual não impede entrada */
        }
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
    try {
      const input = document.getElementById("auth-code");
      const saved = localStorage.getItem(LICENSE_KEY);
      if (input && saved && !(input.value || "").trim()) {
        input.value = saved;
      }
    } catch (_) {
      /* ignore */
    }
    init();
  });

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") revalidateDaily();
  });
})();
