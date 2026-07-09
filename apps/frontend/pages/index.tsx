import { useEffect, useState } from "react";
import { api, setToken, clearToken } from "../lib/api";

const PLATFORMS = ["linkedin", "twitter", "instagram", "threads"] as const;

export default function Home() {
  const [authed, setAuthed] = useState(false);
  const [email, setEmail] = useState("dev@postly.local");
  const [password, setPassword] = useState("password123");
  const [authError, setAuthError] = useState<string | null>(null);

  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [name, setName] = useState("");
  const [idea, setIdea] = useState("");
  const [platforms, setPlatforms] = useState<string[]>(["linkedin", "twitter"]);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window !== "undefined" && window.localStorage.getItem("postly_token")) {
      setAuthed(true);
    }
  }, []);

  useEffect(() => {
    if (authed) refreshCampaigns();
  }, [authed]);

  async function refreshCampaigns() {
    try {
      const data = await api.listCampaigns();
      setCampaigns(data.campaigns || []);
    } catch (err: any) {
      setError(err.message);
    }
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setAuthError(null);
    try {
      const data = await api.login(email, password);
      setToken(data.token);
      setAuthed(true);
    } catch {
      try {
        const data = await api.register(email, password, "Demo User");
        setToken(data.token);
        setAuthed(true);
      } catch (err: any) {
        setAuthError(err.message);
      }
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    setError(null);
    try {
      await api.createCampaign({ name, idea, platforms });
      setName("");
      setIdea("");
      await refreshCampaigns();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setCreating(false);
    }
  }

  function togglePlatform(p: string) {
    setPlatforms((prev) => (prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]));
  }

  if (!authed) {
    return (
      <main style={styles.centeredPage}>
        <form onSubmit={handleLogin} style={styles.card}>
          <h1 style={styles.h1}>Postly</h1>
          <p style={styles.subtitle}>Multi-agent content orchestration</p>
          <input style={styles.input} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email" />
          <input
            style={styles.input}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="password"
            type="password"
          />
          <button style={styles.button} type="submit">
            Sign in / Register
          </button>
          {authError && <p style={styles.error}>{authError}</p>}
        </form>
      </main>
    );
  }

  return (
    <main style={styles.page}>
      <div style={styles.header}>
        <h1 style={styles.h1}>Postly</h1>
        <button
          style={styles.linkButton}
          onClick={() => {
            clearToken();
            setAuthed(false);
          }}
        >
          Sign out
        </button>
      </div>

      <section style={styles.card}>
        <h2 style={styles.h2}>New campaign</h2>
        <form onSubmit={handleCreate}>
          <input style={styles.input} value={name} onChange={(e) => setName(e.target.value)} placeholder="Campaign name" />
          <textarea
            style={{ ...styles.input, height: 90 }}
            value={idea}
            onChange={(e) => setIdea(e.target.value)}
            placeholder="What's the idea? e.g. 'Why async pipelines beat cron jobs for AI agents'"
          />
          <div style={styles.platformRow}>
            {PLATFORMS.map((p) => (
              <label key={p} style={styles.platformChip(platforms.includes(p))}>
                <input
                  type="checkbox"
                  checked={platforms.includes(p)}
                  onChange={() => togglePlatform(p)}
                  style={{ marginRight: 6 }}
                />
                {p}
              </label>
            ))}
          </div>
          <button style={styles.button} type="submit" disabled={creating}>
            {creating ? "Launching agents..." : "Generate campaign"}
          </button>
          {error && <p style={styles.error}>{error}</p>}
        </form>
      </section>

      <section>
        <h2 style={styles.h2}>Campaigns</h2>
        {campaigns.length === 0 && <p style={styles.subtitle}>No campaigns yet — create one above.</p>}
        <div style={styles.grid}>
          {campaigns.map((c) => (
            <div key={c.id} style={styles.campaignCard}>
              <div style={styles.campaignHeader}>
                <strong>{c.name}</strong>
                <span style={styles.statusBadge(c.status)}>{c.status}</span>
              </div>
              <p style={styles.idea}>{c.idea}</p>
              <div style={styles.platformRow}>
                {(c.platforms || []).map((p: string) => (
                  <span key={p} style={styles.platformTag}>
                    {p}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}

const styles: any = {
  page: { maxWidth: 880, margin: "0 auto", padding: "32px 20px", fontFamily: "system-ui, sans-serif", color: "#e5e5e5", background: "#0f0f12", minHeight: "100vh" },
  centeredPage: { display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", background: "#0f0f12", fontFamily: "system-ui, sans-serif" },
  header: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 },
  h1: { fontSize: 28, margin: 0, color: "#f5f5f5" },
  h2: { fontSize: 18, color: "#c9c9c9", marginBottom: 12 },
  subtitle: { color: "#8a8a8a", marginTop: 4 },
  card: { background: "#18181c", border: "1px solid #2a2a30", borderRadius: 12, padding: 24, marginBottom: 28, width: 360 },
  input: { display: "block", width: "100%", padding: "10px 12px", marginBottom: 12, borderRadius: 8, border: "1px solid #333", background: "#111114", color: "#f0f0f0", fontSize: 14, boxSizing: "border-box" },
  button: { background: "#6d5ef0", color: "white", border: "none", borderRadius: 8, padding: "10px 18px", fontSize: 14, cursor: "pointer" },
  linkButton: { background: "none", border: "none", color: "#9a9aa0", cursor: "pointer", fontSize: 13 },
  error: { color: "#f87171", fontSize: 13, marginTop: 8 },
  platformRow: { display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 },
  platformChip: (active: boolean) => ({
    padding: "6px 10px",
    borderRadius: 20,
    fontSize: 12,
    border: active ? "1px solid #6d5ef0" : "1px solid #333",
    background: active ? "#241f3d" : "#151518",
    color: active ? "#c9c1ff" : "#999",
    cursor: "pointer",
  }),
  platformTag: { fontSize: 11, background: "#222", padding: "3px 8px", borderRadius: 12, color: "#aaa" },
  grid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 14 },
  campaignCard: { background: "#18181c", border: "1px solid #2a2a30", borderRadius: 10, padding: 16 },
  campaignHeader: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  idea: { fontSize: 13, color: "#aaa", marginBottom: 10 },
  statusBadge: (status: string) => {
    const colors: Record<string, string> = {
      draft: "#666", planning: "#eab308", researching: "#eab308", generating: "#3b82f6",
      reviewing: "#3b82f6", scheduled: "#a855f7", publishing: "#a855f7", published: "#22c55e", failed: "#ef4444",
    };
    return { fontSize: 11, padding: "3px 8px", borderRadius: 12, background: `${colors[status] || "#666"}22`, color: colors[status] || "#999" };
  },
};
