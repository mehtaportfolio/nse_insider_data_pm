const state = {
  page: 1,
  limit: 10,
  mobileLimit: 10,
  sortBy: "transaction_date",
  sortOrder: "desc",
  filters: {
    category: "Promoter,Promoter Group,Promoter and Director,Promoter Immediate Relative",
    transactionType: "",
    symbol: "",
    mode: "",
    view: "nse"
  }
};

const elements = {
  body: document.getElementById("transactionsBody"),
  statusText: document.getElementById("statusText"),
  syncStatus: document.getElementById("syncStatus"),
  pageInfo: document.getElementById("pageInfo"),
  pageInfoBottom: document.getElementById("pageInfoBottom"),
  prevPage: document.getElementById("prevPage"),
  prevPageBottom: document.getElementById("prevPageBottom"),
  nextPage: document.getElementById("nextPage"),
  nextPageBottom: document.getElementById("nextPageBottom"),
  transactionTypeFilter: document.getElementById("transactionTypeFilter"),
  symbolFilter: document.getElementById("symbolFilter"),
  modeFilter: document.getElementById("modeFilter"),
  loadingOverlay: document.getElementById("loadingOverlay"),
  fetchButton: document.getElementById("fetchButton"),
  refreshButton: document.getElementById("refreshButton"),
  autoRefreshIndicator: document.getElementById("autoRefreshIndicator"),
  categoryToggle: document.getElementById("categoryToggle"),
  categoryDropdown: document.getElementById("categoryDropdown"),
  categoryOptions: document.getElementById("categoryOptions"),
  viewNseButton: document.getElementById("viewNse"),
  viewHoldingsButton: document.getElementById("viewHoldings"),
  stockModal: document.getElementById("stockModal"),
  stockModalClose: document.getElementById("stockModalClose"),
  stockModalTitle: document.getElementById("stockModalTitle"),
  stockModalChange: document.getElementById("stockModalChange"),
  stockModalBody: document.getElementById("stockModalBody")
};

let debounceTimer = null;

function setLoading(isLoading) {
  elements.loadingOverlay.classList.toggle("hidden", !isLoading);
  if (elements.refreshButton) {
    elements.refreshButton.disabled = isLoading;
  }
}

function setAutoRefresh(isRefreshing, message = "Refreshing data from Supabase…") {
  if (!elements.autoRefreshIndicator) return;
  elements.autoRefreshIndicator.classList.toggle("hidden", !isRefreshing);
  if (isRefreshing) {
    elements.statusText.textContent = message;
  }
}

export function formatDate(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = String(date.getFullYear()).slice(-2);
  return `${day}-${month}-${year}`;
}

function renderRows(items, activeLimit) {
  if (!items.length) {
    elements.body.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:24px;color:#a6a6a6;">No data found</td></tr>';
    return;
  }

  elements.body.innerHTML = items.map((item, index) => {
    const averagePrice = item.value && item.quantity ? (item.value / item.quantity).toFixed(2) : "-";
    return `
      <tr>
        <td>${(state.page - 1) * activeLimit + index + 1}</td>
        <td>${item.symbol ? `<button type="button" class="symbol-button" data-symbol="${item.symbol}">${item.symbol}</button>` : "-"}</td>
        <td>${item.category_of_person || "-"}</td>
        <td class="date-cell">${formatDate(item.transaction_date)}</td>
        <td>${item.quantity ?? "-"}</td>
        <td>${averagePrice}</td>
        <td>${item.mode || "-"}</td>
      </tr>`;
  }).join("");
}

export async function fetchTransactions({ showRefreshIndicator = false } = {}) {
  if (showRefreshIndicator) {
    setAutoRefresh(true);
  }
  setLoading(true);
  const params = new URLSearchParams();
  params.set("page", state.page);
  const limit = window.innerWidth <= 600 ? state.mobileLimit : state.limit;
  params.set("limit", limit);
  params.set("sortBy", state.sortBy);
  params.set("sortOrder", state.sortOrder);
  params.set("symbol", state.filters.symbol);
  params.set("category", state.filters.category);
  params.set("transactionType", state.filters.transactionType);
  params.set("mode", state.filters.mode);
  params.set("view", state.filters.view);

  try {
    const response = await fetch(`/api/transactions?${params.toString()}`);
    const payload = await response.json();
    renderRows(payload.items || [], limit);
    elements.statusText.textContent = `${payload.pagination?.total || 0} transactions`;
    const currentPage = payload.pagination?.page || 1;
    const totalPages = payload.pagination?.totalPages || 1;
    const pageLabel = `Page ${currentPage}/${totalPages}`;
    elements.pageInfo.textContent = pageLabel;
    if (elements.pageInfoBottom) {
      elements.pageInfoBottom.textContent = pageLabel;
    }
    elements.prevPage.disabled = currentPage <= 1;
    elements.nextPage.disabled = currentPage >= totalPages;
    if (elements.prevPageBottom) {
      elements.prevPageBottom.disabled = currentPage <= 1;
    }
    if (elements.nextPageBottom) {
      elements.nextPageBottom.disabled = currentPage >= totalPages;
    }
  } catch (error) {
    elements.statusText.textContent = "Unable to load transactions";
  } finally {
    setLoading(false);
    if (showRefreshIndicator) {
      setAutoRefresh(false);
    }
  }
}

export async function fetchFilterOptions() {
  try {
    const response = await fetch("/api/filter-options");
    const payload = await response.json();
    const categories = payload.categories || [];
    renderCategoryOptions(categories);
  } catch (error) {
    console.error(error);
  }
}

function updateCategoryLabel() {
  const selectedValues = Array.from(elements.categoryOptions.querySelectorAll("input[type='checkbox']:checked"))
    .map((checkbox) => checkbox.value);

  state.filters.category = selectedValues.join(",");

  if (selectedValues.length === 0) {
    elements.categoryToggle.textContent = "Select categories";
    return;
  }

  elements.categoryToggle.textContent = `${selectedValues.length} selected`;
}

function renderCategoryOptions(categories) {
  const selectedValues = new Set(state.filters.category.split(",").map((value) => value.trim()).filter(Boolean));

  elements.categoryOptions.innerHTML = categories.map((category) => `
    <label class="checkbox-option">
      <input type="checkbox" value="${category}" ${selectedValues.has(category) ? "checked" : ""} />
      <span>${category}</span>
    </label>
  `).join("");

  updateCategoryLabel();

  elements.categoryOptions.querySelectorAll("input[type='checkbox']").forEach((checkbox) => {
    checkbox.addEventListener("change", () => {
      updateCategoryLabel();
      state.page = 1;
      fetchTransactions();
    });
  });
}

function setViewFilter(view) {
  state.filters.view = view;
  elements.viewNseButton.classList.toggle("active", view === "nse");
  elements.viewHoldingsButton.classList.toggle("active", view === "holdings");
  state.page = 1;
  fetchTransactions();
}

function showStockModal(title, changeText, contentHtml, changeClass = "") {
  elements.stockModalTitle.textContent = title;
  elements.stockModalChange.textContent = changeText || "";
  elements.stockModalChange.className = `modal-subtitle ${changeClass}`.trim();
  elements.stockModalBody.innerHTML = contentHtml;
  elements.stockModal.classList.remove("hidden");
}

function closeStockModal() {
  elements.stockModal.classList.add("hidden");
}

async function fetchStockDetails(stockName) {
  if (!stockName) {
    showStockModal("No details", "<p class=\"modal-loading\">Invalid symbol selected.</p>");
    return;
  }

  showStockModal(`Details for ${stockName}`, "", "<p class=\"modal-loading\">Loading stock details…</p>");
  try {
    const response = await fetch(`/api/stock-master?stock_name=${encodeURIComponent(stockName)}`);
    if (!response.ok) {
      throw new Error("No details found for this symbol.");
    }

    const payload = await response.json();
    const detail = payload.data || payload;
    if (!detail || Object.keys(detail).length === 0) {
      showStockModal(`Details for ${stockName}`, "", `<p class=\"modal-loading\">No matching stock details found.</p>`);
      return;
    }

    const cmpValue = Number(detail.cmp);
    const lcpValue = Number(detail.lcp);
    let changeLabel = "";
    let changeClass = "";

    if (Number.isFinite(cmpValue) && Number.isFinite(lcpValue) && lcpValue !== 0) {
      const rawChange = cmpValue - lcpValue;
      const dayChange = Math.abs(rawChange);
      const dayChangePercent = Math.abs((dayChange / lcpValue) * 100);
      const sign = rawChange >= 0 ? "+" : "-";
      changeLabel = `${sign}${dayChange.toFixed(2)} (${sign}${dayChangePercent.toFixed(2)}%)`;
      changeClass = rawChange >= 0 ? "positive" : "negative";
    }

    const fields = [
      ["CMP", detail.cmp],
      ["LCP", detail.lcp],
      ["Industry", detail.industry],
      ["Sector", detail.sector],
      ["Category", detail.category],
      ["Macro Sector", detail.macro_sector],
      ["Known Sector", detail.known_sector],
      ["Basic Industry", detail.basic_industry]
    ];

    const contentHtml = fields.map(([label, value]) => `
      <div class="modal-field">
        <span class="field-label">${label}</span>
        <span class="field-value">${value ?? "-"}</span>
      </div>
    `).join("");

    const titleText = `Details for ${stockName}`;
    const subtitleText = changeLabel ? `Day change: ${changeLabel}` : "";
    showStockModal(titleText, subtitleText, contentHtml, changeClass);
  } catch (error) {
    showStockModal(`Details for ${stockName}`, "", `<p class=\"modal-loading\">${error.message}</p>`);
  }
}

function applyDebouncedSearch() {
  clearTimeout(debounceTimer);
  debounceTimer = window.setTimeout(() => {
    state.page = 1;
    fetchTransactions();
  }, 250);
}

function bindEvents() {
  elements.fetchButton.addEventListener("click", async () => {
    elements.fetchButton.disabled = true;
    elements.fetchButton.textContent = "Fetching...";
    elements.statusText.textContent = "Syncing with NSE...";
    elements.syncStatus.textContent = "Starting sync";
    try {
      const response = await fetch("/api/sync", {
        method: "POST",
        headers: { Accept: "text/event-stream" }
      });

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n\n");
        buffer = parts.pop() || "";

        for (const part of parts) {
          if (!part.startsWith("data:")) continue;
          const payload = JSON.parse(part.slice(5).trim());
          if (payload.done) {
            elements.syncStatus.textContent = `Completed: ${payload.totalInserted || 0} inserted, ${payload.deleted || 0} removed`;
            elements.statusText.textContent = `Synced ${payload.totalInserted || 0} transactions`;
            await fetchTransactions();
          } else if (payload.processed && payload.total) {
            const base = `${payload.processed} of ${payload.total} processed`;
            elements.syncStatus.textContent = payload.message ? `${base} — ${payload.message}` : base;
          } else if (payload.message) {
            elements.syncStatus.textContent = payload.message;
          }
        }
      }
    } catch (error) {
      elements.statusText.textContent = "Sync failed";
      elements.syncStatus.textContent = error.message;
    } finally {
      elements.fetchButton.disabled = false;
      elements.fetchButton.textContent = "Fetch Data";
    }
  });

  elements.prevPage.addEventListener("click", () => {
    if (state.page > 1) {
      state.page -= 1;
      fetchTransactions();
    }
  });

  if (elements.prevPageBottom) {
    elements.prevPageBottom.addEventListener("click", () => {
      if (state.page > 1) {
        state.page -= 1;
        fetchTransactions();
      }
    });
  }

  elements.nextPage.addEventListener("click", () => {
    state.page += 1;
    fetchTransactions();
  });

  if (elements.nextPageBottom) {
    elements.nextPageBottom.addEventListener("click", () => {
      state.page += 1;
      fetchTransactions();
    });
  }

  elements.viewNseButton.addEventListener("click", () => setViewFilter("nse"));
  elements.viewHoldingsButton.addEventListener("click", () => setViewFilter("holdings"));

  elements.categoryToggle.addEventListener("click", (event) => {
    event.stopPropagation();
    elements.categoryDropdown.classList.toggle("hidden");
  });

  document.addEventListener("click", (event) => {
    if (!event.target.closest(".multi-select")) {
      elements.categoryDropdown.classList.add("hidden");
    }
  });

  elements.stockModalClose.addEventListener("click", closeStockModal);
  elements.stockModal.addEventListener("click", (event) => {
    if (event.target === elements.stockModal) {
      closeStockModal();
    }
  });

  elements.transactionTypeFilter.addEventListener("change", () => {
    state.filters.transactionType = elements.transactionTypeFilter.value;
    state.page = 1;
    fetchTransactions();
  });

  elements.symbolFilter.addEventListener("input", () => {
    state.filters.symbol = elements.symbolFilter.value.trim();
    applyDebouncedSearch();
  });

  elements.modeFilter.addEventListener("change", () => {
    state.filters.mode = elements.modeFilter.value;
    state.page = 1;
    fetchTransactions();
  });

  elements.refreshButton.addEventListener("click", async () => {
    elements.statusText.textContent = "Refreshing data from Supabase...";
    elements.syncStatus.textContent = "";
    await fetchTransactions({ showRefreshIndicator: true });
  });

  document.body.addEventListener("click", (event) => {
    const target = event.target;
    if (target instanceof HTMLElement && target.matches(".symbol-button")) {
      const symbol = target.dataset.symbol;
      fetchStockDetails(symbol);
    }
  });

  document.querySelectorAll("th[data-sort]").forEach((header) => {
    header.addEventListener("click", () => {
      const sortBy = header.dataset.sort;
      if (state.sortBy === sortBy) {
        state.sortOrder = state.sortOrder === "asc" ? "desc" : "asc";
      } else {
        state.sortBy = sortBy;
        state.sortOrder = "asc";
      }
      fetchTransactions();
    });
  });

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
  });
}

export async function initDashboard() {
  bindEvents();
  await fetchFilterOptions();
  await fetchTransactions({ showRefreshIndicator: true });
}
