(function () {
  const LS_DISMISS = "pwa_os_install_banner_dismissed_v1";

  function isStandalone() {
    return (
      window.matchMedia("(display-mode: standalone)").matches ||
      window.matchMedia("(display-mode: window-controls-overlay)").matches ||
      window.navigator.standalone === true
    );
  }

  function isIOS() {
    const ua = navigator.userAgent || "";
    if (/iPad|iPhone|iPod/i.test(ua)) return true;
    return navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
  }

  function dismissed() {
    try {
      return localStorage.getItem(LS_DISMISS) === "1";
    } catch {
      return false;
    }
  }

  function dismiss() {
    try {
      localStorage.setItem(LS_DISMISS, "1");
    } catch (_) { /* ignore */ }
    hide();
  }

  function hide() {
    const b = document.getElementById("pwa-install-banner");
    if (b) {
      b.hidden = true;
    }
  }

  function showChromeMode() {
    const banner = document.getElementById("pwa-install-banner");
    const tChrome = document.getElementById("pwa-install-text-chrome");
    const tIos = document.getElementById("pwa-install-text-ios");
    const btn = document.getElementById("pwa-install-btn");
    if (!banner || !tChrome || !tIos || !btn) return;
    tChrome.hidden = false;
    tIos.hidden = true;
    btn.hidden = false;
    banner.hidden = false;
  }

  function showIOSMode() {
    const banner = document.getElementById("pwa-install-banner");
    const tChrome = document.getElementById("pwa-install-text-chrome");
    const tIos = document.getElementById("pwa-install-text-ios");
    const btn = document.getElementById("pwa-install-btn");
    if (!banner || !tChrome || !tIos || !btn) return;
    tChrome.hidden = true;
    tIos.hidden = false;
    btn.hidden = true;
    banner.hidden = false;
  }

  let deferredPrompt = null;

  window.addEventListener("beforeinstallprompt", e => {
    e.preventDefault();
    deferredPrompt = e;
    if (isStandalone() || dismissed()) return;
    showChromeMode();
  });

  document.addEventListener("DOMContentLoaded", () => {
    if (isStandalone() || dismissed()) return;

    const dismissBtn = document.getElementById("pwa-install-dismiss");
    const installBtn = document.getElementById("pwa-install-btn");

    dismissBtn?.addEventListener("click", dismiss);

    installBtn?.addEventListener("click", async () => {
      if (!deferredPrompt) return;
      deferredPrompt.prompt();
      try {
        await deferredPrompt.userChoice;
      } catch (_) { /* ignore */ }
      deferredPrompt = null;
      dismiss();
    });

    if (isIOS()) {
      showIOSMode();
    }
  });
})();
