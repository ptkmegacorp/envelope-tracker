export const API_BASE = typeof window !== "undefined" && window.API_BASE != null ? window.API_BASE : "";

async function apiFetch(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    ...options,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Request failed (${res.status})`);
  }

  return res.json();
}

export function createBatch(payload) {
  return apiFetch("/api/batches", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function getBatch(batchId) {
  return apiFetch(`/api/batches/${batchId}`);
}

export function refreshBatch(batchId) {
  return apiFetch(`/api/batches/${batchId}/refresh`, { method: "POST" });
}

export function updateItemStatus(batchId, itemId, status, adminKey) {
  return apiFetch(`/api/batches/${batchId}/items/${itemId}/status`, {
    method: "POST",
    headers: adminKey ? { "x-admin-key": adminKey } : {},
    body: JSON.stringify({ status }),
  });
}
