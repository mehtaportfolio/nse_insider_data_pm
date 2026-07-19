import { initDashboard } from "./dashboard.js";

function setStartupState(isVisible, message = "") {
  const overlay = document.getElementById("startupOverlay");
  const messageEl = document.getElementById("startupMessage");

  if (overlay) {
    overlay.classList.toggle("hidden", !isVisible);
  }

  if (messageEl) {
    messageEl.textContent = message;
  }
}

async function wakeBackend() {
  if (typeof window === "undefined") return;

  const statusText = document.getElementById("statusText");
  const syncStatus = document.getElementById("syncStatus");

  setStartupState(true, "Waking up the app… this can take a moment on Render.");
  if (statusText) {
    statusText.textContent = "Waking up the app…";
  }
  if (syncStatus) {
    syncStatus.textContent = "Starting backend";
  }

  const maxAttempts = 5;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 8000);

    try {
      const response = await fetch("/health", {
        method: "GET",
        cache: "no-store",
        signal: controller.signal
      });

      if (response.ok) {
        if (statusText) {
          statusText.textContent = "App ready";
        }
        if (syncStatus) {
          syncStatus.textContent = "Connected";
        }
        setStartupState(false);
        return;
      }

      throw new Error(`Health check failed with ${response.status}`);
    } catch (error) {
      if (attempt === maxAttempts) {
        if (statusText) {
          statusText.textContent = "Backend response delayed";
        }
        if (syncStatus) {
          syncStatus.textContent = "Continuing startup";
        }
        setStartupState(true, "The app is still warming up. Please wait a moment.");
        return;
      }

      if (statusText) {
        statusText.textContent = `Waking up the app… (${attempt}/${maxAttempts})`;
      }
      if (syncStatus) {
        syncStatus.textContent = "Waiting for backend";
      }

      await new Promise((resolve) => window.setTimeout(resolve, 2500));
    } finally {
      window.clearTimeout(timeoutId);
    }
  }
}

async function init() {
  await wakeBackend();
  await initDashboard();
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => navigator.serviceWorker.register("/service-worker.js"));
  }
}

init();
