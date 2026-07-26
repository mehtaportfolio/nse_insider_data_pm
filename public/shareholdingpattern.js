// Shareholding Pattern Module
// Handles the Shareholding Data tab functionality with stock search and real data fetching

const shareholdingState = {
  selectedStock: null,
  selectedStockName: null,
  syncStockSymbol: null,
  syncStockName: null,
  syncSuccess: false,
  syncMode: "screener",
  searchTimeout: null,
  syncSearchTimeout: null
};

const shareholdingElements = {
  searchInput: document.getElementById("stockSearchInput"),
  suggestions: document.getElementById("stockSearchSuggestions"),
  headerRow: document.getElementById("shareholdingHeaderRow"),
  body: document.getElementById("shareholdingBody"),
  summaryHeaderRow: document.getElementById("shareholdingSummaryHeaderRow"),
  summaryBody: document.getElementById("shareholdingSummaryBody"),
  summaryHeading: document.getElementById("shareholdingSummaryHeading"),
  statusText: document.getElementById("shareholdingStatusText"),
  summaryStatusText: document.getElementById("shareholdingSummaryStatusText"),
  syncStatus: document.getElementById("shareholdingSyncStatus"),
  loadingOverlay: document.getElementById("shareholdingLoadingOverlay"),
  syncTrigger: document.getElementById("shareholdingSyncTrigger"),
  nseSyncTrigger: document.getElementById("shareholdingNseSyncTrigger"),
  refreshButton: document.getElementById("shareholdingRefreshButton"),
  syncModal: document.getElementById("shareholdingSyncModal"),
  syncModalClose: document.getElementById("shareholdingSyncModalClose"),
  syncModalTitle: document.querySelector("#shareholdingSyncModal .eyebrow"),
  syncInput: document.getElementById("shareholdingSyncInput"),
  syncSuggestions: document.getElementById("shareholdingSyncSuggestions"),
  syncSelection: document.getElementById("shareholdingSyncSelection"),
  syncActions: document.getElementById("shareholdingSyncActions"),
  syncFetchButton: document.getElementById("shareholdingSyncFetchButton"),
  syncCancelButton: document.getElementById("shareholdingSyncCancelButton")
};

function setLoading(isLoading) {
  if (shareholdingElements.loadingOverlay) {
    shareholdingElements.loadingOverlay.classList.toggle("hidden", !isLoading);
  }
}

function formatMonth(dateString) {
  if (!dateString) return "-";
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return "-";
  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const year = String(date.getFullYear()).slice(-2);
  return `${monthNames[date.getMonth()]}-${year}`;
}

function getUnifiedDates(itemsA, itemsB, limit = 4) {
  const dates = new Set();
  const pushDates = (arr) => {
    (Array.isArray(arr) ? arr : []).forEach((r) => {
      if (r && r.report_date) dates.add(r.report_date);
    });
  };

  pushDates(itemsA);
  pushDates(itemsB);

  const sorted = Array.from(dates).sort((a, b) => new Date(b) - new Date(a));
  return sorted.slice(0, limit);
}

function renderRows(items, dateCols = null) {
  if (!shareholdingElements.body) return;

  const rows = Array.isArray(items) ? items : [];
  if (!rows.length) {
    if (shareholdingElements.headerRow) {
      shareholdingElements.headerRow.innerHTML = '<th>Category</th>';
    }
    shareholdingElements.body.innerHTML = '<tr><td colspan="2" style="text-align:center;padding:24px;color:#a6a6a6;">No shareholding data found</td></tr>';
    return;
  }

  const unifiedDates = Array.isArray(dateCols) && dateCols.length > 0
    ? dateCols.slice(0, 4)
    : [...rows].sort((a, b) => new Date(b.report_date) - new Date(a.report_date)).slice(0, 4).map(r => r.report_date);

  const monthColumns = unifiedDates.map((d) => formatMonth(d));
  // Ensure both tables use the same column widths by adding a colgroup
  const tableEl = shareholdingElements.headerRow ? shareholdingElements.headerRow.closest("table") : null;
  applyColGroup(tableEl, monthColumns.length);

  if (shareholdingElements.headerRow) {
    shareholdingElements.headerRow.innerHTML = [
      '<th>Category</th>',
      ...monthColumns.map((month) => `<th class="date-cell">${month}</th>`)
    ].join("");
  }

  const categories = [
    { name: "Promoters", key: "promoters_pct" },
    { name: "FII", key: "fii_pct" },
    { name: "DII", key: "dii_pct" },
    { name: "Public", key: "public_pct" }
  ];

  shareholdingElements.body.innerHTML = categories.map((category) => {
    const values = unifiedDates.map((date) => {
      const item = rows.find((r) => `${r.report_date}` === `${date}`) || {};
      const rawValue = item?.[category.key];
      if (rawValue === null || rawValue === undefined || rawValue === "") {
        return "-";
      }
      return `${parseFloat(rawValue).toFixed(2)}%`;
    });

    return `
      <tr>
        <td>${category.name}</td>
        ${values.map((value) => `<td>${value}</td>`).join("")}
      </tr>
    `;
  }).join("");
}

function renderSummaryRows(items, dateCols = null) {
  if (!shareholdingElements.summaryBody) return;

  const rows = Array.isArray(items) ? items : [];
  if (!rows.length) {
    if (shareholdingElements.summaryHeaderRow) {
      shareholdingElements.summaryHeaderRow.innerHTML = '<th>Category</th>';
    }
    shareholdingElements.summaryBody.innerHTML = '<tr><td colspan="2" style="text-align:center;padding:24px;color:#a6a6a6;">No NSE shareholder data found</td></tr>';
    return;
  }

  const unifiedDates = Array.isArray(dateCols) && dateCols.length > 0
    ? dateCols.slice(0, 4)
    : [...rows].sort((a, b) => new Date(b.report_date) - new Date(a.report_date)).slice(0, 4).map(r => r.report_date);

  const monthColumns = unifiedDates.map((d) => formatMonth(d));

  if (shareholdingElements.summaryHeaderRow) {
    const tableEl = shareholdingElements.summaryHeaderRow ? shareholdingElements.summaryHeaderRow.closest("table") : null;
    applyColGroup(tableEl, monthColumns.length);

    shareholdingElements.summaryHeaderRow.innerHTML = [
      '<th>Category</th>',
      ...monthColumns.map((month) => `<th class="date-cell">${month}</th>`)
    ].join("");
  }

  const categories = [
    { name: "Promoters", key: "promoter_pct" },
    { name: "FII", key: "fii_pct" },
    { name: "DII", key: "dii_pct" },
    // New dummy Public row placed after DII (blank for now)
    { name: "Public", key: "public_pct", dummy: true },
    { name: "Bank", key: "bank_pct", publicBucket: true },
    { name: "AIF", key: "aif_pct", publicBucket: true },
    { name: "NRI", key: "nri_pct", publicBucket: true },
    { name: "Bodies Corporate", key: "bodies_corporate_pct", publicBucket: true },
    { name: "Retail < 2L", key: "retail_below_2l_pct", publicBucket: true },
    { name: "Retail > 2L", key: "retail_above_2l_pct", publicBucket: true },
    { name: "Other Non Institution", key: "other_non_institution_pct", publicBucket: true }
  ];

  shareholdingElements.summaryBody.innerHTML = categories.map((category) => {
    const values = unifiedDates.map((date) => {
      const item = rows.find((r) => `${r.report_date}` === `${date}`) || {};

      if (category.key === 'public_pct') {
        // Compute Public as the sum of the detailed public buckets shown in UI
        const keysToSum = [
          'bank_pct','aif_pct','nri_pct','bodies_corporate_pct',
          'retail_below_2l_pct','retail_above_2l_pct','other_non_institution_pct'
        ];

        let sum = 0;
        let foundAny = false;
        keysToSum.forEach(k => {
          const v = parseFloat(item?.[k]);
          if (!Number.isNaN(v)) { sum += v; foundAny = true; }
        });

        if (!foundAny) return "-";
        return `${sum.toFixed(2)}%`;
      }

      const rawValue = item?.[category.key];
      if (rawValue === null || rawValue === undefined || rawValue === "") {
        return "-";
      }
      const num = parseFloat(rawValue);
      if (Number.isNaN(num)) return "-";
      return `${num.toFixed(2)}%`;
    });

    const trClass = category.publicBucket ? 'public-bucket' : '';
    const firstCell = category.name === 'Public'
      ? `<td>${category.name} <button class="toggle-public" aria-expanded="false" title="Toggle public buckets">▸</button></td>`
      : `<td>${category.name}</td>`;

    return `
      <tr class="${trClass}">
        ${firstCell}
        ${values.map((value) => `<td>${value}</td>`).join("")}
      </tr>
    `;
  }).join("");

  // Wire up the toggle button to collapse/expand public bucket rows
  const summaryTable = shareholdingElements.summaryHeaderRow ? shareholdingElements.summaryHeaderRow.closest('table') : null;
  if (summaryTable) {
    const toggle = summaryTable.querySelector('.toggle-public');
    // start collapsed by default
    summaryTable.classList.add('public-collapsed');
    if (toggle) {
      toggle.textContent = '▸';
      toggle.setAttribute('aria-expanded', 'false');
      toggle.addEventListener('click', () => {
        const collapsed = summaryTable.classList.toggle('public-collapsed');
        toggle.textContent = collapsed ? '▸' : '▾';
        toggle.setAttribute('aria-expanded', String(!collapsed));
      });
    }
  }
}

function applyColGroup(tableEl, monthCount) {
  if (!tableEl || typeof monthCount !== 'number') return;

  // Remove existing colgroup
  const existing = tableEl.querySelector('colgroup');
  if (existing) existing.remove();

  const colgroup = document.createElement('colgroup');

  const totalMonths = Math.max(0, monthCount);
  // First column gets 30% width, remaining months share 70%
  const firstCol = document.createElement('col');
  firstCol.style.width = '30%';
  colgroup.appendChild(firstCol);

  const remaining = totalMonths > 0 ? 70 / totalMonths : 70;
  for (let i = 0; i < totalMonths; i++) {
    const c = document.createElement('col');
    c.style.width = `${remaining}%`;
    colgroup.appendChild(c);
  }

  tableEl.insertBefore(colgroup, tableEl.firstChild);
  tableEl.style.tableLayout = 'fixed';
}

async function fetchStockSuggestions(searchTerm) {
  if (!searchTerm || searchTerm.trim().length < 1) {
    shareholdingElements.suggestions.classList.add("hidden");
    return;
  }

  try {
    const params = new URLSearchParams();
    params.set("search", searchTerm.trim());
    params.set("limit", "1000");

    const response = await fetch(`/api/stock-suggestions?${params.toString()}`);
    if (!response.ok) throw new Error("Failed to fetch suggestions");

    const stocks = await response.json();

    if (!stocks || stocks.length === 0) {
      shareholdingElements.suggestions.innerHTML = '<div class="suggestion-item">No stocks found</div>';
      shareholdingElements.suggestions.classList.remove("hidden");
      return;
    }

    const suggestionsHtml = stocks
      .map((stock) => `
        <div class="suggestion-item" data-symbol="${stock.symbol}" data-stock-name="${stock.stock_name}">
          <span class="suggestion-symbol">${stock.symbol}</span>
          <span class="suggestion-name">${stock.stock_name}</span>
        </div>
      `)
      .join("");

    shareholdingElements.suggestions.innerHTML = suggestionsHtml;
    shareholdingElements.suggestions.classList.remove("hidden");

    shareholdingElements.suggestions.querySelectorAll(".suggestion-item").forEach((item) => {
      item.addEventListener("click", () => selectStock(item));
    });
  } catch (error) {
    console.error("Error fetching stock suggestions:", error);
    shareholdingElements.suggestions.innerHTML = '<div class="suggestion-item">Error loading suggestions</div>';
    shareholdingElements.suggestions.classList.remove("hidden");
  }
}

async function fetchSyncSuggestions(searchTerm) {
  if (!shareholdingElements.syncSuggestions) return;

  if (!searchTerm || searchTerm.trim().length < 1) {
    shareholdingElements.syncSuggestions.classList.add("hidden");
    return;
  }

  try {
    const params = new URLSearchParams();
    params.set("search", searchTerm.trim());
    params.set("limit", "1000");

    const response = await fetch(`/api/stock-suggestions?${params.toString()}`);
    if (!response.ok) throw new Error("Failed to fetch suggestions");

    const stocks = await response.json();

    if (!stocks || stocks.length === 0) {
      shareholdingElements.syncSuggestions.innerHTML = '<div class="suggestion-item">No stocks found</div>';
      shareholdingElements.syncSuggestions.classList.remove("hidden");
      return;
    }

    const suggestionsHtml = stocks
      .map((stock) => `
        <div class="suggestion-item" data-symbol="${stock.symbol}" data-stock-name="${stock.stock_name}">
          <span class="suggestion-symbol">${stock.symbol}</span>
          <span class="suggestion-name">${stock.stock_name}</span>
        </div>
      `)
      .join("");

    shareholdingElements.syncSuggestions.innerHTML = suggestionsHtml;
    shareholdingElements.syncSuggestions.classList.remove("hidden");

    shareholdingElements.syncSuggestions.querySelectorAll(".suggestion-item").forEach((item) => {
      item.addEventListener("click", () => selectSyncStock(item));
    });
  } catch (error) {
    console.error("Error fetching sync suggestions:", error);
    shareholdingElements.syncSuggestions.innerHTML = '<div class="suggestion-item">Error loading suggestions</div>';
    shareholdingElements.syncSuggestions.classList.remove("hidden");
  }
}

function selectStock(suggestionElement) {
  const symbol = suggestionElement.dataset.symbol;
  const stockName = suggestionElement.dataset.stockName;

  shareholdingState.selectedStock = symbol;
  shareholdingState.selectedStockName = stockName;

  shareholdingElements.searchInput.value = `${symbol} - ${stockName}`;
  shareholdingElements.suggestions.classList.add("hidden");

  fetchShareholdingData(stockName);
}

function selectSyncStock(suggestionElement) {
  const symbol = suggestionElement.dataset.symbol;
  const stockName = suggestionElement.dataset.stockName;

  shareholdingState.syncStockSymbol = symbol;
  shareholdingState.syncStockName = stockName;

  if (shareholdingElements.syncInput) {
    shareholdingElements.syncInput.value = `${symbol} - ${stockName}`;
  }

  if (shareholdingElements.syncSelection) {
    shareholdingElements.syncSelection.innerHTML = "";
    shareholdingElements.syncSelection.classList.add("hidden");
  }

  if (shareholdingElements.syncActions) {
    shareholdingElements.syncActions.classList.remove("hidden");
  }

  if (shareholdingElements.syncSuggestions) {
    shareholdingElements.syncSuggestions.classList.add("hidden");
  }
}

function openSyncModal(mode = "screener") {
  if (!shareholdingElements.syncModal) return;

  shareholdingState.syncMode = mode;
  shareholdingState.syncStockSymbol = null;
  shareholdingState.syncStockName = null;
  shareholdingState.syncSuccess = false;
  if (shareholdingElements.syncInput) shareholdingElements.syncInput.value = "";
  if (shareholdingElements.syncSelection) {
    shareholdingElements.syncSelection.innerHTML = "";
    shareholdingElements.syncSelection.classList.add("hidden");
  }
  if (shareholdingElements.syncActions) shareholdingElements.syncActions.classList.add("hidden");
  if (shareholdingElements.syncSuggestions) shareholdingElements.syncSuggestions.classList.add("hidden");

  const isNseMode = mode === "nse";
  if (shareholdingElements.syncModalTitle) {
    shareholdingElements.syncModalTitle.textContent = isNseMode ? "Sync stock data from NSE" : "Sync stock data";
  }
  if (shareholdingElements.syncFetchButton) {
    shareholdingElements.syncFetchButton.textContent = isNseMode ? "Fetch from NSE" : "Fetch latest data";
  }

  shareholdingElements.syncModal.classList.remove("hidden");
  if (shareholdingElements.syncInput) shareholdingElements.syncInput.focus();
}

function closeSyncModal() {
  if (shareholdingElements.syncModal) {
    shareholdingElements.syncModal.classList.add("hidden");
    if (shareholdingState.syncSuccess && shareholdingState.selectedStockName) {
      fetchShareholdingData(shareholdingState.selectedStockName);
    }
  }
}

async function syncSelectedStock() {
  const stockName = shareholdingState.syncStockName;
  const isNseMode = shareholdingState.syncMode === "nse";

  if (!stockName) {
    if (shareholdingElements.syncSelection) {
      shareholdingElements.syncSelection.innerHTML = '<span class="muted">Please select a stock first.</span>';
      shareholdingElements.syncSelection.classList.remove("hidden");
    }
    return;
  }

  if (shareholdingElements.syncFetchButton) {
    shareholdingElements.syncFetchButton.disabled = true;
    shareholdingElements.syncFetchButton.textContent = isNseMode ? "Fetching from NSE..." : "Fetching...";
  }
  if (shareholdingElements.syncSelection) {
    shareholdingElements.syncSelection.classList.remove("hidden");
  }

  try {
    const response = isNseMode
      ? await fetch(`/api/shareholding-sync-trigger?stock_name=${encodeURIComponent(stockName)}`)
      : await fetch(`http://localhost:3000/screener-stock/${encodeURIComponent(stockName)}?key=pm_shareholding_sync_2026_7gH92KxL`);
    let payload = null;

    if (response.ok) {
      try {
        payload = await response.json();
      } catch (_) {
        payload = null;
      }

      if (payload && payload.success === false) {
        throw new Error(payload.error || "Sync failed");
      }
    } else {
      let errorPayload = {};
      try {
        errorPayload = await response.json();
      } catch (parseError) {
        errorPayload.error = await response.text().catch(() => response.statusText || "Sync failed");
      }
      throw new Error(errorPayload.error || "Sync failed");
    }

    shareholdingState.selectedStock = stockName;
    shareholdingState.selectedStockName = stockName;
    shareholdingState.syncSuccess = true;
    if (shareholdingElements.searchInput) {
      shareholdingElements.searchInput.value = stockName;
    }

    await fetchShareholdingData(stockName);

    if (shareholdingElements.syncSelection) {
      shareholdingElements.syncSelection.innerHTML = `
        <span class="muted">Success:</span>
        <strong>${isNseMode ? `Fetched latest NSE data for ${stockName}` : `Fetched latest data for ${stockName}`}</strong>
      `;
      shareholdingElements.syncSelection.classList.remove("hidden");
    }
  } catch (error) {
    console.error("Error syncing stock data:", error);
    if (shareholdingElements.syncSelection) {
      shareholdingElements.syncSelection.innerHTML = `<span class="muted">${error.message}</span>`;
      shareholdingElements.syncSelection.classList.remove("hidden");
    }
  } finally {
    if (shareholdingElements.syncFetchButton) {
      shareholdingElements.syncFetchButton.disabled = false;
      shareholdingElements.syncFetchButton.textContent = shareholdingState.syncMode === "nse" ? "Fetch from NSE" : "Fetch latest data";
    }
  }
}

function syncSelectedStockFromNse() {
  openSyncModal("nse");
}

async function fetchShareholdingData(stockName) {
  if (!stockName) {
    shareholdingElements.statusText.textContent = "Please select a stock";
    shareholdingElements.syncStatus.textContent = "Ready";
    return;
  }

  setLoading(true);
  if (shareholdingElements.statusText) {
    shareholdingElements.statusText.textContent = "Loading shareholding data…";
  }
  if (shareholdingElements.syncStatus) {
    shareholdingElements.syncStatus.textContent = "Fetching";
  }

  try {
    const params = new URLSearchParams();
    params.set("stock_name", stockName);
    params.set("limit", "4");
    params.set("sort_by", "report_date");
    params.set("sort_order", "desc");

    const response = await fetch(`/api/shareholding-pattern?${params.toString()}`);
    if (!response.ok) {
      throw new Error("Failed to fetch shareholding data");
    }

    const payload = await response.json();
    const items = payload.items || payload.data || [];
    const summaryItems = payload.summaryItems || [];

    // Compute month columns separately for each table so they reflect their own data
    const screenerDates = getUnifiedDates(items, [], 4);
    const summaryDates = getUnifiedDates(summaryItems, [], 4);

    if (!items.length) {
      if (shareholdingElements.headerRow) {
        shareholdingElements.headerRow.innerHTML = '<th>Category</th>';
      }
      shareholdingElements.body.innerHTML = '<tr><td colspan="2" style="text-align:center;padding:24px;color:#a6a6a6;">No shareholding data available for this stock</td></tr>';
      shareholdingElements.statusText.textContent = "No data found";
      shareholdingElements.syncStatus.textContent = "Ready";
    } else {
      renderRows(items, screenerDates);
      shareholdingElements.statusText.textContent = `Shareholding data for ${shareholdingState.selectedStock}`;
      shareholdingElements.syncStatus.textContent = `Showing ${Math.min(items.length, 4)} recent periods`;
    }

    if (!summaryItems.length) {
      if (shareholdingElements.summaryHeaderRow) {
        shareholdingElements.summaryHeaderRow.innerHTML = '<th>Category</th>';
      }
      shareholdingElements.summaryBody.innerHTML = '<tr><td colspan="2" style="text-align:center;padding:24px;color:#a6a6a6;">No NSE shareholder data available for this stock</td></tr>';
      if (shareholdingElements.summaryStatusText) {
        shareholdingElements.summaryStatusText.textContent = "No NSE shareholder data found";
      }
    } else {
      renderSummaryRows(summaryItems, summaryDates);
      if (shareholdingElements.summaryStatusText) {
        shareholdingElements.summaryStatusText.textContent = `NSE Shareholder data for ${payload.symbol || shareholdingState.selectedStock}`;
      }
      if (shareholdingElements.summaryHeading) {
        shareholdingElements.summaryHeading.textContent = `NSE Shareholder Data${payload.symbol ? ` - ${payload.symbol}` : ""}`;
      }
    }
  } catch (error) {
    console.error("Error fetching shareholding data:", error);
    shareholdingElements.body.innerHTML = `<tr><td colspan="4" style="text-align:center;padding:24px;color:#a6a6a6;">Error loading data: ${error.message}</td></tr>`;
    shareholdingElements.statusText.textContent = "Error loading shareholding data";
    shareholdingElements.syncStatus.textContent = "Failed";
  } finally {
    setLoading(false);
  }
}

export async function initShareholdingPatternTab() {
  if (!shareholdingElements.searchInput) return;

  shareholdingElements.searchInput.addEventListener("input", (e) => {
    clearTimeout(shareholdingState.searchTimeout);
    const searchTerm = e.target.value;

    if (searchTerm.length === 0) {
      shareholdingElements.suggestions.classList.add("hidden");
      return;
    }

    shareholdingState.searchTimeout = setTimeout(() => {
      fetchStockSuggestions(searchTerm);
    }, 300);
  });

  if (shareholdingElements.syncTrigger) {
    shareholdingElements.syncTrigger.addEventListener("click", openSyncModal);
  }

  if (shareholdingElements.nseSyncTrigger) {
    shareholdingElements.nseSyncTrigger.addEventListener("click", syncSelectedStockFromNse);
  }

  if (shareholdingElements.syncModalClose) {
    shareholdingElements.syncModalClose.addEventListener("click", closeSyncModal);
  }

  if (shareholdingElements.syncCancelButton) {
    shareholdingElements.syncCancelButton.addEventListener("click", closeSyncModal);
  }

  if (shareholdingElements.syncFetchButton) {
    shareholdingElements.syncFetchButton.addEventListener("click", syncSelectedStock);
  }

  if (shareholdingElements.syncInput) {
    shareholdingElements.syncInput.addEventListener("input", (e) => {
      clearTimeout(shareholdingState.syncSearchTimeout);
      const searchTerm = e.target.value;

      if (searchTerm.length === 0) {
        shareholdingElements.syncSuggestions.classList.add("hidden");
        return;
      }

      shareholdingState.syncSearchTimeout = setTimeout(() => {
        fetchSyncSuggestions(searchTerm);
      }, 300);
    });
  }

  if (shareholdingElements.refreshButton) {
    shareholdingElements.refreshButton.addEventListener("click", () => {
      if (!shareholdingState.selectedStockName && !shareholdingState.selectedStock) {
        openSyncModal();
        return;
      }
      fetchShareholdingData(shareholdingState.selectedStockName || shareholdingState.selectedStock);
    });
  }

  document.addEventListener("click", (e) => {
    const clickedInsideMain = e.target.closest(".stock-search-container");
    const clickedInsideSync = e.target.closest(".shareholding-sync-search");

    if (!clickedInsideMain && !clickedInsideSync) {
      shareholdingElements.suggestions.classList.add("hidden");
      if (shareholdingElements.syncSuggestions) {
        shareholdingElements.syncSuggestions.classList.add("hidden");
      }
    }
  });

  shareholdingElements.statusText.textContent = "Select a stock to view shareholding data";
  shareholdingElements.syncStatus.textContent = "Ready";
  if (shareholdingElements.summaryStatusText) {
    shareholdingElements.summaryStatusText.textContent = "Select a stock to view NSE shareholder data";
  }
  if (shareholdingElements.summaryHeading) {
    shareholdingElements.summaryHeading.textContent = "NSE Shareholder Data";
  }
}

export function cleanupShareholdingTab() {
  shareholdingState.selectedStock = null;
  shareholdingState.selectedStockName = null;
  shareholdingState.syncStockSymbol = null;
  shareholdingState.syncStockName = null;

  if (shareholdingElements.searchInput) {
    shareholdingElements.searchInput.value = "";
  }
  if (shareholdingElements.suggestions) {
    shareholdingElements.suggestions.classList.add("hidden");
  }
  if (shareholdingElements.syncSuggestions) {
    shareholdingElements.syncSuggestions.classList.add("hidden");
  }
  if (shareholdingElements.syncModal) {
    shareholdingElements.syncModal.classList.add("hidden");
  }
}
