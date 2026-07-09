const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem("postly_token");
}

export function setToken(token: string) {
  if (typeof window !== "undefined") window.localStorage.setItem("postly_token", token);
}

export function clearToken() {
  if (typeof window !== "undefined") window.localStorage.removeItem("postly_token");
}

async function request(path: string, options: RequestInit = {}) {
  const token = getToken();
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ? JSON.stringify(data.error) : `Request failed: ${res.status}`);
  return data;
}

export const api = {
  register: (email: string, password: string, name?: string) =>
    request("/api/auth/register", { method: "POST", body: JSON.stringify({ email, password, name }) }),
  login: (email: string, password: string) =>
    request("/api/auth/login", { method: "POST", body: JSON.stringify({ email, password }) }),
  listCampaigns: () => request("/api/campaigns"),
  createCampaign: (payload: { name: string; idea: string; platforms: string[] }) =>
    request("/api/campaigns", { method: "POST", body: JSON.stringify(payload) }),
  getCampaign: (id: string) => request(`/api/campaigns/${id}`),
  retryCampaign: (id: string) => request(`/api/campaigns/${id}/retry`, { method: "POST" }),
  analyticsOverview: () => request("/api/analytics/overview"),
};
