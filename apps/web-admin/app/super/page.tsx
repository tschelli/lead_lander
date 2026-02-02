import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { hasSessionCookie } from "@/lib/authCookies";
import { SuperAdminLayout } from "./SuperAdminLayout";
import "./super-admin.css";

export const dynamic = "force-dynamic";

type AuthMeResponse = {
  user: {
    email: string;
    role: string;
  };
};

type ClientsResponse = {
  clients: Array<{
    id: string;
    name: string;
    schools: Array<{
      id: string;
      slug: string;
      name: string;
      programs: Array<{
        id: string;
        slug: string;
        name: string;
      }>;
    }>;
  }>;
};

export default async function SuperAdminPage() {
  const requestHeaders = headers();
  const cookie = requestHeaders.get("cookie");

  const apiBase =
    process.env.ADMIN_API_BASE_URL ||
    process.env.NEXT_PUBLIC_API_BASE_URL ||
    "http://localhost:4000";

  if (!hasSessionCookie(cookie)) {
    redirect("/");
  }

  const authHeaders: Record<string, string> = cookie ? { cookie } : {};

  // Check user role
  const authResponse = await fetch(`${apiBase}/api/auth/me`, {
    headers: authHeaders,
    cache: "no-store"
  });

  if (!authResponse.ok) {
    redirect("/");
  }

  const authData = (await authResponse.json()) as AuthMeResponse;

  // Only super_admin role can access
  if (authData.user.role !== "super_admin") {
    redirect("/");
  }

  // Fetch all clients with nested schools and programs
  const clientsResponse = await fetch(`${apiBase}/api/super/tree`, {
    headers: authHeaders,
    cache: "no-store"
  });

  if (!clientsResponse.ok) {
    throw new Error("Failed to load clients");
  }

  const clientsData = (await clientsResponse.json()) as ClientsResponse;

  return (
    <SuperAdminLayout
      initialClients={clientsData.clients}
      userEmail={authData.user.email}
    />
  );
}
