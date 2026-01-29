"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type SchoolOption = {
  slug: string;
  name: string;
};

type LoginFormProps = {
  schools: SchoolOption[];
};

export function LoginForm({ schools }: LoginFormProps) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [schoolSlug, setSchoolSlug] = useState(schools[0]?.slug || "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasSchools = schools.length > 0;

  const schoolOptions = useMemo(() => schools, [schools]);

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
        body: JSON.stringify({ email, password })
      });

      if (!response.ok) {
        const message = await response.text();
        throw new Error(message || "Login failed");
      }

      const target = schoolSlug ? `/admin/${schoolSlug}` : "/admin";
      router.replace(target);
    } catch (err) {
      setError((err as Error).message || "Login failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="admin-shell admin-official">
      <section className="admin-card" style={{ maxWidth: 520 }}>
        <h2>Admin sign in</h2>
        <p className="admin-muted">Use your admin credentials to access reporting.</p>
        {!hasSchools && (
          <p className="admin-muted">No schools configured yet. Please check your config.</p>
        )}
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
          <label>
            School dashboard
            <select
              value={schoolSlug}
              onChange={(event) => setSchoolSlug(event.target.value)}
              disabled={!hasSchools}
            >
              {schoolOptions.map((school) => (
                <option key={school.slug} value={school.slug}>
                  {school.name}
                </option>
              ))}
            </select>
          </label>
          <button className="admin-btn" type="submit" disabled={loading}>
            {loading ? "Signing in..." : "Sign in"}
          </button>
        </form>
      </section>
    </div>
  );
}
