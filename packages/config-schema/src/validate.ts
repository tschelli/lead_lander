import path from "path";
import { loadConfig } from "./load";

const configDir = process.env.CONFIG_DIR
  ? path.resolve(process.env.CONFIG_DIR)
  : path.resolve(process.cwd(), "../../configs");

try {
  loadConfig(configDir);
  console.log(`Config validation passed for ${configDir}`);
} catch (error) {
  console.error("Config validation failed:", error);
  process.exit(1);
}
