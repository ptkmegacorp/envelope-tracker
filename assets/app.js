import { createBatch, getBatch, refreshBatch, updateItemStatus } from "./api.js";
import { parseImbs, normalizeImbs, summarizeWarnings } from "./validate.js";

const STATUS_LABELS = {
  PENDING: "Pending",
  IN_TRANSIT: "In Transit",
  DELIVERED: "Delivered",
  RETURNED: "Returned",
  ERROR: "Error",
};

const STATUS_CLASS = {
  PENDING: "pending",
  IN_TRANSIT: "in_transit",
  DELIVERED: "delivered",
  RETURNED: "returned",
  ERROR: "error",
};

const PAGE = document.body?.dataset?.page;

if (PAGE === "index") {
  initIndex();
}

if (PAGE === "batch") {
  initBatch();
}

function initIndex() {
  const textarea = document.getElementById("imb-input");
  const fileInput = document.getElementById("file-input");
  const createBtn = document.getElementById("create-btn");
  const summary = document.getElementById("summary");
  const warningsEl = document.getElementById("warnings");
  const statusMessage = document.getElementById("status-message");
  const sourceInput = document.getElementById("source-input");
  const noteInput = document.getElementById("note-input");

  let fileText = "";
  let currentImbs = [];

  function updateSummary() {
    const combined = [textarea.value, fileText].filter(Boolean).join("\n");
    const parsed = parseImbs(combined);
    const imbs = normalizeImbs(parsed);
    const warnings = summarizeWarnings(imbs);

    currentImbs = imbs;
    summary.textContent = `${imbs.length} unique IMB${imbs.length === 1 ? "" : "s"} ready`;

    if (warnings.length) {
      const sample = warnings.slice(0, 5).join(" · ");
      warningsEl.innerHTML = `<span class="warn">Warnings:</span> ${sample}${warnings.length > 5 ? "..." : ""}`;
    } else {
      warningsEl.textContent = "No format warnings detected.";
    }

    createBtn.disabled = imbs.length === 0;
  }

  textarea.addEventListener("input", updateSummary);

  fileInput.addEventListener("change", () => {
    const file = fileInput.files?.[0];
    if (!file) {
      fileText = "";
      updateSummary();
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      fileText = String(reader.result || "");
      updateSummary();
    };
    reader.onerror = () => {
      fileText = "";
      statusMessage.textContent = "Failed to read file.";
      statusMessage.className = "meta error";
      updateSummary();
    };
    reader.readAsText(file);
  });

  createBtn.addEventListener("click", async () => {
    statusMessage.textContent = "";
    statusMessage.className = "meta";
    createBtn.disabled = true;

    try {
      const meta = {};
      if (sourceInput.value.trim()) meta.sourcePlatform = sourceInput.value.trim();
      if (noteInput.value.trim()) meta.note = noteInput.value.trim();
      const payload = { imbs: currentImbs };
      if (Object.keys(meta).length) payload.meta = meta;

      const result = await createBatch(payload);
      window.location.href = `batch.html?id=${encodeURIComponent(result.batchId)}`;
    } catch (err) {
      statusMessage.textContent = err.message;
      statusMessage.className = "meta error";
    } finally {
      createBtn.disabled = currentImbs.length === 0;
    }
  });

  updateSummary();
}

function initBatch() {
  const batchTitle = document.getElementById("batch-title");
  const batchMeta = document.getElementById("batch-meta");
  const tableWrap = document.getElementById("table-wrap");
  const searchInput = document.getElementById("search-input");
  const refreshBtn = document.getElementById("refresh-btn");
  const copyBtn = document.getElementById("copy-btn");
  const statusMessage = document.getElementById("status-message");
  const adminPanel = document.getElementById("admin-panel");
  const clearAdminBtn = document.getElementById("clear-admin");

  const url = new URL(window.location.href);
  const queryAdmin = url.searchParams.get("adminKey");
  if (queryAdmin) {
    localStorage.setItem("adminKey", queryAdmin);
    url.searchParams.delete("adminKey");
    history.replaceState({}, "", url.toString());
  }
  const adminKey = localStorage.getItem("adminKey") || "";

  if (adminKey) {
    adminPanel.style.display = "flex";
    clearAdminBtn.addEventListener("click", () => {
      localStorage.removeItem("adminKey");
      adminPanel.style.display = "none";
    });
  }

  const batchId = getBatchId();
  if (!batchId) {
    batchTitle.textContent = "Batch not found";
    batchMeta.textContent = "Missing batch ID in URL.";
    return;
  }

  let batchData = null;
  let items = [];

  function renderTable() {
    const query = searchInput.value.trim().toLowerCase();
    const filtered = items.filter((item) => {
      if (!query) return true;
      return (
        item.imb.toLowerCase().includes(query) ||
        item.status.toLowerCase().includes(query)
      );
    });

    const rows = filtered
      .map((item) => {
        const statusClass = STATUS_CLASS[item.status] || "pending";
        const adminControls = adminKey
          ? `
            <select data-item="${item.id}">
              ${Object.keys(STATUS_LABELS)
                .map(
                  (status) =>
                    `<option value="${status}" ${status === item.status ? "selected" : ""}>${STATUS_LABELS[status]}</option>`
                )
                .join("")}
            </select>
            <button class="secondary" data-action="override" data-item="${item.id}">Set</button>
          `
          : "";

        return `
          <tr>
            <td><span class="meta">${item.imb}</span></td>
            <td><span class="badge ${statusClass}">${STATUS_LABELS[item.status] || item.status}</span></td>
            <td>${new Date(item.updated_at).toLocaleString()}</td>
            ${adminKey ? `<td>${adminControls}</td>` : ""}
          </tr>
        `;
      })
      .join("");

    tableWrap.innerHTML = `
      <table class="table">
        <thead>
          <tr>
            <th>IMB</th>
            <th>Status</th>
            <th>Updated</th>
            ${adminKey ? "<th>Override</th>" : ""}
          </tr>
        </thead>
        <tbody>
          ${rows || `<tr><td colspan="${adminKey ? 4 : 3}">No items found.</td></tr>`}
        </tbody>
      </table>
    `;

    if (adminKey) {
      tableWrap.querySelectorAll("button[data-action='override']").forEach((button) => {
        button.addEventListener("click", async () => {
          const itemId = button.dataset.item;
          const select = tableWrap.querySelector(`select[data-item='${itemId}']`);
          const status = select?.value;
          if (!status) return;
          button.disabled = true;
          try {
            const result = await updateItemStatus(batchId, itemId, status, adminKey);
            const idx = items.findIndex((item) => item.id === itemId);
            if (idx >= 0) items[idx] = result.item;
            renderTable();
            statusMessage.textContent = "Status updated.";
          } catch (err) {
            statusMessage.textContent = err.message;
          } finally {
            button.disabled = false;
          }
        });
      });
    }
  }

  async function loadBatch() {
    statusMessage.textContent = "";
    try {
      const data = await getBatch(batchId);
      batchData = data.batch;
      items = data.items || [];
      batchTitle.textContent = `Batch ${batchId}`;
      batchMeta.textContent = `Created ${new Date(batchData.created_at).toLocaleString()} · ${items.length} items`;
      renderTable();
    } catch (err) {
      batchMeta.textContent = err.message;
    }
  }

  refreshBtn.addEventListener("click", async () => {
    refreshBtn.disabled = true;
    statusMessage.textContent = "Refreshing...";
    try {
      const data = await refreshBatch(batchId);
      items = data.items || [];
      renderTable();
      statusMessage.textContent = "Refresh complete.";
    } catch (err) {
      statusMessage.textContent = err.message;
    } finally {
      refreshBtn.disabled = false;
    }
  });

  searchInput.addEventListener("input", renderTable);

  copyBtn.addEventListener("click", async () => {
    const basePath = getBasePath();
    const shareUrl = `${window.location.origin}${basePath}b/${batchId}`;
    try {
      await navigator.clipboard.writeText(shareUrl);
      statusMessage.textContent = "Share link copied.";
    } catch {
      statusMessage.textContent = `Copy failed. Link: ${shareUrl}`;
    }
  });

  loadBatch();
}

function getBatchId() {
  const url = new URL(window.location.href);
  const paramId = url.searchParams.get("id");
  if (paramId) return paramId;

  const parts = url.pathname.split("/").filter(Boolean);
  const bIndex = parts.indexOf("b");
  if (bIndex >= 0 && parts[bIndex + 1]) {
    return parts[bIndex + 1];
  }
  if (parts.length === 2 && parts[0] === "b") {
    return parts[1];
  }

  return null;
}

function getBasePath() {
  const { pathname } = window.location;
  if (pathname.includes("/b/")) {
    const [prefix] = pathname.split("/b/");
    return prefix.endsWith("/") ? prefix : `${prefix}/`;
  }
  if (pathname.endsWith("/batch.html")) {
    return pathname.replace(/batch\.html$/, "");
  }
  if (pathname.endsWith("/")) return pathname;
  const idx = pathname.lastIndexOf("/");
  if (idx >= 0) return pathname.slice(0, idx + 1);
  return "/";
}
