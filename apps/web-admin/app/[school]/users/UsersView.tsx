"use client";

import { useEffect, useMemo, useState } from "react";

type SchoolOption = {
  id: string;
  name: string;
};

type UserRole = {
  role: string;
  schoolId: string | null;
};

type UserRow = {
  id: string;
  email: string;
  emailVerified: boolean;
  isActive: boolean;
  roles: UserRole[];
};

type UsersViewProps = {
  schoolSlug: string;
  schools: SchoolOption[];
};

const ROLE_OPTIONS = [
  { value: "client_admin", label: "Client admin" },
  { value: "school_admin", label: "School admin" },
  { value: "staff", label: "Staff" }
];

export function UsersView({ schoolSlug, schools }: UsersViewProps) {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [inviteEmail, setInviteEmail] = useState("");
  const [invitePassword, setInvitePassword] = useState("");
  const [inviteRole, setInviteRole] = useState("client_admin");
  const [inviteSchoolId, setInviteSchoolId] = useState(schools[0]?.id || "");
  const [saving, setSaving] = useState(false);

  const schoolOptions = useMemo(() => schools, [schools]);

  const loadUsers = () => {
    setLoading(true);
    setError(null);
    fetch(`/api/admin/schools/${schoolSlug}/users`, {
      credentials: "include",
      cache: "no-store"
    })
      .then(async (response) => {
        if (response.status === 401 || response.status === 403) {
          window.location.href = `/${schoolSlug}/login`;
          return;
        }
        if (!response.ok) {
          const message = await response.text();
          throw new Error(message || "Failed to load users");
        }
        const data = await response.json();
        setUsers(data.users || []);
      })
      .catch((err) => {
        setError(err.message || "Failed to load users");
      })
      .finally(() => {
        setLoading(false);
      });
  };

  useEffect(() => {
    loadUsers();
  }, []);

  const handleInvite = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError(null);

    try {
      const payload = {
        email: inviteEmail,
        password: invitePassword,
        role: inviteRole,
        schoolId: inviteRole === "client_admin" ? null : inviteSchoolId
      };

      const response = await fetch(`/api/admin/schools/${schoolSlug}/users`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const message = await response.text();
        throw new Error(message || "Invite failed");
      }

      setInviteEmail("");
      setInvitePassword("");
      loadUsers();
    } catch (err) {
      setError((err as Error).message || "Invite failed");
    } finally {
      setSaving(false);
    }
  };

  const handleUpdate = async (userId: string, role: string, schoolId: string | null, isActive: boolean) => {
    setSaving(true);
    setError(null);

    try {
      const payload = {
        role,
        schoolId: role === "client_admin" ? null : schoolId,
        isActive
      };

      const response = await fetch(`/api/admin/schools/${schoolSlug}/users/${userId}`, {
        method: "PATCH",
        credentials: "include",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const message = await response.text();
        throw new Error(message || "Update failed");
      }

      loadUsers();
    } catch (err) {
      setError((err as Error).message || "Update failed");
    } finally {
      setSaving(false);
    }
  };

  const resolveRole = (row: UserRow) => row.roles[0]?.role || "staff";
  const resolveSchoolId = (row: UserRow) => row.roles[0]?.schoolId || schools[0]?.id || "";

  return (
    <div className="admin-users">
      <section className="admin-card">
        <h3>Invite user</h3>
        <p className="admin-muted">Create an admin account and assign a role.</p>
        {error && <p className="admin-muted" style={{ color: "#d9534f" }}>{error}</p>}
        <form className="admin-form" onSubmit={handleInvite}>
          <label>
            Email
            <input
              type="email"
              value={inviteEmail}
              onChange={(event) => setInviteEmail(event.target.value)}
              required
            />
          </label>
          <label>
            Temporary password
            <input
              type="password"
              value={invitePassword}
              onChange={(event) => setInvitePassword(event.target.value)}
              required
            />
          </label>
          <label>
            Role
            <select value={inviteRole} onChange={(event) => setInviteRole(event.target.value)}>
              {ROLE_OPTIONS.map((role) => (
                <option key={role.value} value={role.value}>{role.label}</option>
              ))}
            </select>
          </label>
          <label>
            School scope
            <select
              value={inviteSchoolId}
              onChange={(event) => setInviteSchoolId(event.target.value)}
              disabled={inviteRole === "client_admin"}
            >
              {schoolOptions.map((school) => (
                <option key={school.id} value={school.id}>{school.name}</option>
              ))}
            </select>
          </label>
          <button className="admin-btn" type="submit" disabled={saving}>
            {saving ? "Saving..." : "Send invite"}
          </button>
        </form>
      </section>

      <section className="admin-card">
        <h3>Users</h3>
        {loading && <p className="admin-muted">Loading users…</p>}
        {!loading && users.length === 0 && <p className="admin-muted">No users yet.</p>}
        {!loading && users.length > 0 && (
          <div className="admin-users__table">
            {users.map((row) => {
              const role = resolveRole(row);
              const schoolId = resolveSchoolId(row);
              return (
                <div key={row.id} className="admin-users__row">
                  <div>
                    <strong>{row.email}</strong>
                    <p className="admin-muted">{row.isActive ? "Active" : "Disabled"}</p>
                  </div>
                  <label>
                    Role
                    <select
                      value={role}
                      onChange={(event) => handleUpdate(row.id, event.target.value, schoolId, row.isActive)}
                    >
                      {ROLE_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    School
                    <select
                      value={schoolId}
                      disabled={role === "client_admin"}
                      onChange={(event) => handleUpdate(row.id, role, event.target.value, row.isActive)}
                    >
                      {schoolOptions.map((school) => (
                        <option key={school.id} value={school.id}>{school.name}</option>
                      ))}
                    </select>
                  </label>
                  <button
                    className="admin-official__ghost"
                    onClick={() => handleUpdate(row.id, role, schoolId, !row.isActive)}
                  >
                    {row.isActive ? "Disable" : "Enable"}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
