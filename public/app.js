import { initDashboard } from "./dashboard.js";
import { initShareholdingPatternTab, cleanupShareholdingTab } from "./shareholdingpattern.js";

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

function switchTab(tabName) {
  const insiderDataView = document.getElementById("insiderDataView");
  const shareholdingDataView = document.getElementById("shareholdingDataView");
  const insiderDataTab = document.getElementById("insiderDataTab");
  const shareholdingDataTab = document.getElementById("shareholdingDataTab");

  if (tabName === "insider-data") {
    if (insiderDataView) insiderDataView.classList.add("active");
    if (shareholdingDataView) shareholdingDataView.classList.remove("active");
    if (insiderDataTab) {
      insiderDataTab.classList.add("active");
      insiderDataTab.setAttribute("aria-selected", "true");
    }
    if (shareholdingDataTab) {
      shareholdingDataTab.classList.remove("active");
      shareholdingDataTab.setAttribute("aria-selected", "false");
    }
  } else if (tabName === "shareholding-data") {
    if (insiderDataView) insiderDataView.classList.remove("active");
    if (shareholdingDataView) shareholdingDataView.classList.add("active");
    if (insiderDataTab) {
      insiderDataTab.classList.remove("active");
      insiderDataTab.setAttribute("aria-selected", "false");
    }
    if (shareholdingDataTab) {
      shareholdingDataTab.classList.add("active");
      shareholdingDataTab.setAttribute("aria-selected", "true");
    }
  }
}

function setupTabNavigation() {
  const insiderDataTab = document.getElementById("insiderDataTab");
  const shareholdingDataTab = document.getElementById("shareholdingDataTab");

  if (insiderDataTab) {
    insiderDataTab.addEventListener("click", () => {
      switchTab("insider-data");
    });
  }

  if (shareholdingDataTab) {
    shareholdingDataTab.addEventListener("click", () => {
      switchTab("shareholding-data");
    });
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
  setupTabNavigation();
  await initDashboard();
  await initShareholdingPatternTab();
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => navigator.serviceWorker.register("/service-worker.js"));
  }
}

init();
