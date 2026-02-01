import type { Config } from "@lead_lander/config-schema";
import { env } from "./env";
import { pool } from "./db";
import { createConfigStore } from "./configStore";

const store = createConfigStore(pool);

export async function getConfigForClient(clientId: string): Promise<Config> {
  return store.getClientConfig(clientId);
}

export async function getConfig(): Promise<Config> {
  if (!env.defaultClientId) {
    throw new Error("DEFAULT_CLIENT_ID is required for config loading");
  }
  return store.getClientConfig(env.defaultClientId);
}

export function invalidateConfigCache(clientId: string) {
  store.invalidate(clientId);
}
