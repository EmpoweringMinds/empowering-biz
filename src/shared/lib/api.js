const configuredBaseUrl = import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8787";

export const API_BASE_URL = configuredBaseUrl.replace(/\/+$/, "");

export async function apiRequest(path, options = {}) {
  const headers = new Headers(options.headers || {});
  if (options.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers,
  });

  let data = {};
  try {
    data = await response.json();
  } catch {
    // Keep an empty response object for non-JSON responses.
  }

  if (!response.ok) {
    const error = new Error(data?.error || `Request failed (${response.status})`);
    error.status = response.status;
    error.data = data;
    throw error;
  }

  return data;
}
