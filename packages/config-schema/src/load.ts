import fs from "fs";
import path from "path";
import YAML from "yaml";
import {
  ConfigSchema,
  type Config,
  type Account,
  type Location,
  type Program
} from "./schema";

const SUPPORTED_EXTENSIONS = [".yml", ".yaml", ".json"];

export function loadConfig(configDir: string): Config {
  const files = fs
    .readdirSync(configDir)
    .filter((file) => SUPPORTED_EXTENSIONS.includes(path.extname(file)));

  const merged: Config = {
    clients: [],
    accounts: [],
    locations: [],
    programs: [],
    crmConnections: [],
    quizQuestions: [],
    quizAnswerOptions: [],
    landingPageQuestions: [],
    landingPageQuestionOptions: [],
    webhookConfigs: []
  };

  for (const file of files) {
    const fullPath = path.join(configDir, file);
    const raw = fs.readFileSync(fullPath, "utf8");
    const parsed = parseConfigFile(raw, path.extname(file));
    const validated = ConfigSchema.parse(parsed);

    merged.clients.push(...(validated.clients || []));
    merged.accounts.push(...(validated.accounts || []));
    merged.locations.push(...(validated.locations || []));
    merged.programs.push(...(validated.programs || []));
    merged.crmConnections.push(...(validated.crmConnections || []));
    merged.quizQuestions.push(...(validated.quizQuestions || []));
    merged.quizAnswerOptions.push(...(validated.quizAnswerOptions || []));
    merged.landingPageQuestions.push(...(validated.landingPageQuestions || []));
    merged.landingPageQuestionOptions.push(...(validated.landingPageQuestionOptions || []));
    merged.webhookConfigs.push(...(validated.webhookConfigs || []));
  }

  return merged;
}

function parseConfigFile(raw: string, ext: string) {
  if (ext === ".json") {
    return JSON.parse(raw);
  }

  return YAML.parse(raw);
}

/**
 * Resolves an account by its slug
 * Used for landing page routing: /{accountSlug}
 */
export function resolveAccountBySlug(
  config: Config,
  accountSlug: string
): Account | null {
  return config.accounts.find((item) => item.slug === accountSlug) || null;
}

/**
 * Gets all active programs for an account
 */
export function getProgramsByAccount(
  config: Config,
  accountId: string
): Program[] {
  return config.programs.filter(
    (item) => item.accountId === accountId && item.isActive
  );
}

/**
 * Gets all active locations for an account
 */
export function getLocationsByAccount(
  config: Config,
  accountId: string
): Location[] {
  return config.locations.filter(
    (item) => item.accountId === accountId && item.isActive
  );
}

/**
 * Resolves entities by IDs for submission processing
 */
export function resolveEntitiesByIds(
  config: Config,
  accountId: string,
  locationId: string | null | undefined,
  programId: string | null | undefined
) {
  const account = config.accounts.find((item) => item.id === accountId);

  if (!account) {
    return null;
  }

  let location: Location | null = null;
  if (locationId) {
    location =
      config.locations.find(
        (item) => item.id === locationId && item.accountId === accountId
      ) || null;
  }

  let program: Program | null = null;
  if (programId) {
    program =
      config.programs.find(
        (item) => item.id === programId && item.accountId === accountId
      ) || null;
  }

  return { account, location, program };
}

// ============================================================================
// LEGACY SUPPORT (for backwards compatibility during refactor)
// ============================================================================

/** @deprecated Use resolveAccountBySlug instead */
export function resolveLandingPageBySlugs(
  config: Config,
  accountSlug: string,
  _programSlug?: string
) {
  const account = resolveAccountBySlug(config, accountSlug);
  if (!account) return null;

  // For backwards compatibility, return a structure similar to old ResolvedLandingPage
  return {
    school: account,
    account,
    programs: getProgramsByAccount(config, account.id),
    locations: getLocationsByAccount(config, account.id)
  };
}
