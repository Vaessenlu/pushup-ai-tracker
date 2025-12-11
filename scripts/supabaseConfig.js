import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

const candidateFiles = [
  path.join(ROOT, 'supabase.config.local.json'),
  path.join(ROOT, 'supabase.config.json'),
];

export function loadSupabaseConfig() {
  for (const file of candidateFiles) {
    if (!fs.existsSync(file)) continue;
    try {
      const content = fs.readFileSync(file, 'utf8');
      return JSON.parse(content);
    } catch (err) {
      console.warn(`Could not parse ${file}:`, err.message);
    }
  }
  return {};
}

export function resolveValue(envValue, ...configKeys) {
  if (envValue) return envValue;
  const config = loadSupabaseConfig();
  for (const key of configKeys) {
    if (config?.[key]) return config[key];
  }
  return undefined;
}
