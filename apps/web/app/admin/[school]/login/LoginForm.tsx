"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

type LoginFormProps = {
  schoolSlug: string;
  schoolName: string;
};

export function LoginForm({ schoolSlug, schoolName }: LoginFormProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);

    if (!email || !password) {
      setError("Enter your email and password.");
      return;
    }

    setLoading(true);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ email, password, schoolSlug })
      });

      if (!response.ok) {
        const message = await response.text();
        throw new Error(message || "Login failed");
      }

      const next = searchParams.get("next");
      router.replace(next || `/admin/${schoolSlug}`);
    } catch (err) {
      setError((err as Error).message || "Login failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="admin-shell admin-official">
      <section className="admin-card" style={{ maxWidth: 520 }}>
        <h2>{schoolName} admin sign in</h2>
        <p className="admin-muted">Use your admin credentials to access reporting.</p>
        {error && <p className="admin-muted" style={{ color: "#d9534f" }}>{error}</p>}
        <form onSubmit={handleSubmit} className="admin-form">
          <label>
            Email
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="admin@client.com"
              required
            />
          </label>
          <label>
            Password
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </label>
          <button className="admin-btn" type="submit" disabled={loading}>
            {loading ? "Signing in..." : "Sign in"}
          </button>
        </form>
      </section>
    </div>
  );
}
