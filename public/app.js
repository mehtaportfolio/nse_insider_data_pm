import { initDashboard } from "./dashboard.js";

async function init() {
  await initDashboard();
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => navigator.serviceWorker.register("/service-worker.js"));
  }
}

init();
