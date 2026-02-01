export function hasSessionCookie(cookieHeader: string | null) {
  if (!cookieHeader) return false;
  const name = process.env.AUTH_COOKIE_NAME || "session";
  const needle = `${name}=`;
  return cookieHeader.split(";").some((part) => part.trim().startsWith(needle));
}
