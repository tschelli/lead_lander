import fs from "fs";
import path from "path";

export function resolveConfigDir() {
  const candidates = [
    process.env.CONFIG_DIR,
    path.resolve(process.cwd(), "configs"),
    path.resolve(process.cwd(), "../../configs"),
    path.resolve(process.cwd(), "../configs")
  ].filter(Boolean) as string[];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return path.resolve(process.cwd(), "configs");
}
