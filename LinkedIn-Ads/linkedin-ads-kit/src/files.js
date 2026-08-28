import { access, appendFile, chmod, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";

export async function pathExists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function ensureDir(dirPath, options = {}) {
  await mkdir(dirPath, { recursive: true, ...options });
}

export async function readTextIfExists(filePath, fallback = "") {
  try {
    return await readFile(filePath, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return fallback;
    throw error;
  }
}

export async function readJsonIfExists(filePath, fallback = null) {
  const content = await readTextIfExists(filePath, "");
  if (!content.trim()) return fallback;
  try {
    return JSON.parse(content);
  } catch (error) {
    throw new Error(`Failed to parse JSON at ${filePath}: ${error.message}`);
  }
}

export async function writeJson(filePath, value, options = {}) {
  const { dirMode, fileMode } = options;
  await ensureDir(path.dirname(filePath), dirMode ? { mode: dirMode } : undefined);
  const writeOptions = { encoding: "utf8" };
  if (fileMode !== undefined) writeOptions.mode = fileMode;
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, writeOptions);
  if (fileMode !== undefined) {
    // writeFile's mode option is only applied on create, so chmod explicitly to
    // tighten permissions even when the file already existed.
    await chmod(filePath, fileMode);
  }
}

export async function writeText(filePath, content) {
  await ensureDir(path.dirname(filePath));
  await writeFile(filePath, content, "utf8");
}

export async function writeIfMissing(filePath, content) {
  if (await pathExists(filePath)) {
    return false;
  }

  await writeText(filePath, content);
  return true;
}

export async function appendText(filePath, content) {
  await ensureDir(path.dirname(filePath));
  await appendFile(filePath, content, "utf8");
}

export async function fileMtimeMs(filePath) {
  try {
    const result = await stat(filePath);
    return result.mtimeMs;
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

export async function fileModeBits(filePath) {
  try {
    const result = await stat(filePath);
    return result.mode & 0o777;
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

export async function sha256File(filePath) {
  const content = await readFile(filePath);
  return createHash("sha256").update(content).digest("hex");
}
