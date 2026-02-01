import type { Config } from "@lead_lander/config-schema";
import { pool } from "./db";
import { createConfigStore } from "./configStore";

const store = createConfigStore(pool);

export async function getConfigForClient(clientId: string): Promise<Config> {
  return store.getClientConfig(clientId);
}
