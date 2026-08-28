import { readFile } from "node:fs/promises";
import path from "node:path";

export const DEFAULT_LINKEDIN_API_VERSION = "202604";

export async function loadLocalEnv(cwd = process.cwd(), target = process.env) {
  const envPath = path.join(cwd, ".env");
  let content;

  try {
    content = await readFile(envPath, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return target;
    throw error;
  }

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const equalsIndex = line.indexOf("=");
    if (equalsIndex === -1) continue;

    const key = line.slice(0, equalsIndex).trim();
    let value = line.slice(equalsIndex + 1).trim();

    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }

    if (target[key] === undefined) {
      target[key] = value;
    }
  }

  return target;
}

export function linkedinApiVersion(env = process.env) {
  return env.LINKEDIN_API_VERSION || DEFAULT_LINKEDIN_API_VERSION;
}

export function isValidLinkedInApiVersion(version) {
  return /^\d{6}$/.test(String(version || ""));
}
