"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

type SuperLoginFormProps = {
  schoolSlug: string;
};

export function SuperLoginForm({ schoolSlug }: SuperLoginFormProps) {
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
      router.replace(next || "/super");
    } catch (err) {
      setError((err as Error).message || "Login failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="admin-card super-login">
      <div>
        <h2>Super Admin Login</h2>
        <p className="admin-muted">Sign in to manage clients, schools, and programs.</p>
      </div>
      {error && <p className="admin-muted super-admin__error">{error}</p>}
      <form onSubmit={handleSubmit} className="admin-form">
        <label>
          Email
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@vast.com"
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
        <button className="super-admin__btn" type="submit" disabled={loading}>
          {loading ? "Signing in..." : "Sign in"}
        </button>
      </form>
    </div>
  );
}
