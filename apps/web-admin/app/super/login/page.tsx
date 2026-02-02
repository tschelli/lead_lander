import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { hasSessionCookie } from "@/lib/authCookies";
import { SuperLoginForm } from "./superLoginForm";
import "../super-admin.css";

export const dynamic = "force-dynamic";

const SUPER_LOGIN_SCHOOL_SLUG = process.env.SUPER_LOGIN_SCHOOL_SLUG || "VAST-admin";

export default async function SuperLoginPage() {
  const requestHeaders = headers();
  const cookie = requestHeaders.get("cookie");
  if (hasSessionCookie(cookie)) {
    redirect("/super");
  }

  return (
    <div className="admin-shell">
      <SuperLoginForm schoolSlug={SUPER_LOGIN_SCHOOL_SLUG} />
    </div>
  );
}
