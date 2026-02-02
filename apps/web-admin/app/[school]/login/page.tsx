import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { LoginForm } from "./LoginForm";

export const dynamic = "force-dynamic";

type SchoolResponse = {
  school: { id: string; slug: string; name: string; branding: { logoUrl?: string } };
};

export default async function AdminSchoolLogin({ params }: { params: { school: string } }) {
  const apiBase =
    process.env.ADMIN_API_BASE_URL ||
    process.env.NEXT_PUBLIC_API_BASE_URL ||
    "http://localhost:4000";

  const requestHeaders = headers();
  const cookie = requestHeaders.get("cookie");
  if (cookie) {
    const authResponse = await fetch(`${apiBase}/api/auth/me`, {
      headers: { cookie },
      cache: "no-store"
    });
    if (authResponse.ok) {
      redirect(`/${params.school}`);
    }
  }

  const response = await fetch(`${apiBase}/api/public/schools/${params.school}`, {
    cache: "no-store"
  });

  if (!response.ok) {
    return (
      <div className="admin-shell">
        <div className="admin-card">
          <h2>Account not found</h2>
          <p className="admin-muted">Check the URL or configuration.</p>
        </div>
      </div>
    );
  }

  const data = (await response.json()) as SchoolResponse;
  return <LoginForm schoolSlug={data.school.slug} schoolName={data.school.name} />;
}
