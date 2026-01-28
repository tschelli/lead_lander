export function parseAdminKeyMap() {
  const raw = process.env.ADMIN_API_KEYS;
  if (!raw) return {} as Record<string, string>;

  try {
    const parsed = JSON.parse(raw) as Record<string, string>;
    if (parsed && typeof parsed === "object") {
      return Object.entries(parsed).reduce<Record<string, string>>((acc, [key, value]) => {
        if (typeof value === "string") {
          acc[key] = value;
        }
        return acc;
      }, {});
    }
  } catch (_error) {
    // Fall back to comma-delimited parsing below.
  }

  return raw.split(",").reduce<Record<string, string>>((acc, pair) => {
    const trimmed = pair.trim();
    if (!trimmed) return acc;
    const [slug, ...rest] = trimmed.split(":");
    const key = rest.join(":").trim();
    if (slug && key) {
      acc[slug.trim()] = key;
    }
    return acc;
  }, {});
}

export function resolveAdminKey(schoolSlug: string) {
  const map = parseAdminKeyMap();
  return map[schoolSlug] || process.env.ADMIN_API_KEY || "";
}
