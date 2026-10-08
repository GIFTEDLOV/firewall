import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const files = execFileSync("git", ["ls-files"], { encoding: "utf8" }).trim().split(/\r?\n/).filter(Boolean);
const patterns = [
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /(?:ghp_|github_pat_|xox[baprs]-)[A-Za-z0-9_-]{20,}/,
  /(?:VERCEL_TOKEN|GENLAYER_PRIVATE_KEY|PRIVATE_KEY)\s*[:=]\s*(?!\$\{?)[^\s#]{12,}/i,
];
const findings = [];
for (const file of files) {
  if (file.endsWith(".env.example") || file.includes("node_modules")) continue;
  const text = readFileSync(file, "utf8");
  for (const pattern of patterns) if (pattern.test(text)) findings.push(file);
}
if (findings.length) throw new Error(`POSSIBLE_SECRET:${[...new Set(findings)].join(",")}`);
console.log(JSON.stringify({ ok: true, scanned: files.length }));
