import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.resolve(__dirname, "..");

const ENV_FILES = [
  path.resolve(backendRoot, ".env"),
  path.resolve(backendRoot, ".env.local"),
  path.resolve(__dirname, "../../.env"),
];

function parseValue(raw: string): string {
  const trimmed = raw.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function loadEnvFile(filePath: string): void {
  if (!fs.existsSync(filePath)) {
    return;
  }
  const content = fs.readFileSync(filePath, "utf-8");
  content.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      return;
    }
    const equalsIndex = trimmed.indexOf("=");
    if (equalsIndex === -1) {
      return;
    }
    const key = trimmed.slice(0, equalsIndex).trim();
    if (!key || key.startsWith("#")) {
      return;
    }
    const rawValue = trimmed.slice(equalsIndex + 1);
    const existing = process.env[key];
    if (existing !== undefined && existing !== "") {
      return;
    }
    process.env[key] = parseValue(rawValue);
  });
}

for (const envPath of ENV_FILES) {
  loadEnvFile(envPath);
}
