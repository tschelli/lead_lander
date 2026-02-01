import fs from "fs";
import path from "path";
import YAML from "yaml";
import { ConfigSchema, type Config, type Campus, type LandingPage, type Program, type School } from "./schema";

const SUPPORTED_EXTENSIONS = [".yml", ".yaml", ".json"];

export function loadConfig(configDir: string): Config {
  const files = fs
    .readdirSync(configDir)
    .filter((file) => SUPPORTED_EXTENSIONS.includes(path.extname(file)));

  const merged: Config = {
    schools: [],
    campuses: [],
    programs: [],
    landingPages: [],
    crmConnections: [],
    quizQuestions: [],
    quizAnswerOptions: []
  };

  for (const file of files) {
    const fullPath = path.join(configDir, file);
    const raw = fs.readFileSync(fullPath, "utf8");
    const parsed = parseConfigFile(raw, path.extname(file));
    const validated = ConfigSchema.parse(parsed);

    merged.schools.push(...validated.schools);
    merged.campuses.push(...validated.campuses);
    merged.programs.push(...validated.programs);
    merged.landingPages.push(...validated.landingPages);
    merged.crmConnections.push(...validated.crmConnections);
    merged.quizQuestions.push(...(validated.quizQuestions || []));
    merged.quizAnswerOptions.push(...(validated.quizAnswerOptions || []));
  }

  return merged;
}

function parseConfigFile(raw: string, ext: string) {
  if (ext === ".json") {
    return JSON.parse(raw);
  }

  return YAML.parse(raw);
}

export type ResolvedLandingPage = {
  school: School;
  program: Program;
  landingPage: LandingPage;
  landingCopy: Program["landingCopy"];
  questionOverrides: Program["questionOverrides"] | undefined;
};

export function resolveLandingPageBySlugs(
  config: Config,
  schoolSlug: string,
  programSlug: string
): ResolvedLandingPage | null {
  const school = config.schools.find((item) => item.slug === schoolSlug);
  if (!school) return null;

  const program = config.programs.find(
    (item) => item.slug === programSlug && item.schoolId === school.id
  );
  if (!program) return null;

  const landingPage = config.landingPages.find(
    (item) => item.schoolId === school.id && item.programId === program.id
  );
  if (!landingPage) return null;

  const landingCopy = {
    ...program.landingCopy,
    ...landingPage.overrides?.landingCopy
  };

  const questionOverrides = landingPage.overrides?.questionOverrides ?? program.questionOverrides;

  return { school, program, landingPage, landingCopy, questionOverrides };
}

export function resolveEntitiesByIds(
  config: Config,
  schoolId: string,
  campusId: string | null | undefined,
  programId: string
) {
  const school = config.schools.find((item) => item.id === schoolId);
  const program = config.programs.find(
    (item) => item.id === programId && item.schoolId === schoolId
  );

  if (!school || !program) {
    return null;
  }

  let campus: Campus | null = null;

  if (campusId) {
    campus =
      config.campuses.find((item) => item.id === campusId && item.schoolId === schoolId) || null;

    if (!campus) {
      return null;
    }
  }

  return { school, campus, program };
}
