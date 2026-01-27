import path from "path";
import { loadConfig, type Config } from "@lead_lander/config-schema";
import { env } from "./env";

let cachedConfig: Config | null = null;

export function getConfig(): Config {
  if (cachedConfig) return cachedConfig;
  const configDir = path.resolve(process.cwd(), env.configDir);
  cachedConfig = loadConfig(configDir);
  return cachedConfig;
}
