"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function AdminLogin() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });

      if (!res.ok) {
        setError("Invalid credentials");
        return;
      }

      router.push("/admin");
    } catch {
      setError("Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center"
      style={{ background: "var(--cream)", fontFamily: "var(--font-body), system-ui, sans-serif" }}
    >
      <div className="w-full max-w-sm px-6">
        <div className="text-center mb-8">
          <h2 className="font-display text-2xl tracking-tight" style={{ color: "var(--bark)" }}>
            Welcome back
          </h2>
        </div>
        <div className="rounded-xl p-8" style={{ background: "var(--pure-white)", border: "1px solid var(--cream-dark)", boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}>
          <h1 className="font-display text-xl mb-1" style={{ color: "var(--bark)" }}>Sign In</h1>
          <p className="text-sm mb-6" style={{ color: "var(--bark-faded)" }}>Manage your site content</p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1" style={{ color: "var(--bark-light)" }}>Username</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full px-3 py-2.5 rounded-lg text-sm outline-none transition-all"
                style={{ border: "1px solid var(--cream-dark)", color: "var(--bark)" }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = "var(--sage)";
                  e.currentTarget.style.boxShadow = "0 0 0 3px rgba(124,154,142,0.1)";
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = "var(--cream-dark)";
                  e.currentTarget.style.boxShadow = "none";
                }}
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1" style={{ color: "var(--bark-light)" }}>Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3 py-2.5 rounded-lg text-sm outline-none transition-all"
                style={{ border: "1px solid var(--cream-dark)", color: "var(--bark)" }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = "var(--sage)";
                  e.currentTarget.style.boxShadow = "0 0 0 3px rgba(124,154,142,0.1)";
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = "var(--cream-dark)";
                  e.currentTarget.style.boxShadow = "none";
                }}
                required
              />
            </div>

            {error && (
              <p className="text-sm" style={{ color: "var(--terra)" }}>{error}</p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 text-sm font-semibold rounded-lg transition-colors disabled:opacity-50"
              style={{ background: "var(--sage)", color: "var(--pure-white)" }}
              onMouseEnter={(e) => { e.currentTarget.style.background = "var(--sage-light)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "var(--sage)"; }}
            >
              {loading ? "Signing in..." : "Sign In"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
