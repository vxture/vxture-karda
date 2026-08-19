#!/usr/bin/env node
// Port-consistency guardrail (registry R3; adopted from vxtpl after karda#104:
// six port declarations, five of them wrong). R3: local dev port = in-code
// fallback = the IN-CONTAINER port = the allocated number (karda: 3240); only
// the HOST publish port stays a variable (its fallback must also be 3240).
//
// This guard cannot know whether 3240 is the RIGHT number - only the port
// registry can - but it guarantees the repo tells ONE story: every place that
// declares a port agrees. karda#104 was exactly the failure it catches.
//
// Zero-dependency, CI-wired (static-checks -> quality-gate). Exit 1 on drift.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const PORT = "3240";
const root = resolve(new URL("../..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));

/** Each site: file, a human label, and a regex that must match the file. The
 *  regex pins the exact port so a stray 3000 (or any other number) fails. */
const SITES = [
  { file: ".env.example", label: "APP_PUBLISH_PORT", re: new RegExp(`^APP_PUBLISH_PORT=${PORT}\\b`, "m") },
  { file: "docker-compose.yml", label: "app PORT env", re: new RegExp(`PORT: "${PORT}"`) },
  {
    file: "docker-compose.yml",
    label: "publish mapping",
    re: new RegExp(`\\$\\{APP_PUBLISH_PORT:-${PORT}\\}:${PORT}"`),
  },
  { file: "docker-compose.yml", label: "healthcheck", re: new RegExp(`http://127\\.0\\.0\\.1:${PORT}/api/health`) },
  { file: "docker-compose.dev.yml", label: "app PORT env", re: new RegExp(`PORT: "${PORT}"`) },
  {
    file: "docker-compose.dev.yml",
    label: "publish mapping",
    re: new RegExp(`\\$\\{APP_PUBLISH_PORT:-${PORT}\\}:${PORT}"`),
  },
  { file: "docker-compose.dev.yml", label: "healthcheck", re: new RegExp(`http://127\\.0\\.0\\.1:${PORT}/api/health`) },
  { file: "portals/app/Dockerfile", label: "ENV PORT", re: new RegExp(`\\bPORT=${PORT}\\b`) },
  { file: "portals/app/Dockerfile", label: "EXPOSE", re: new RegExp(`^EXPOSE ${PORT}$`, "m") },
  { file: "portals/app/package.json", label: "next dev -p", re: new RegExp(`next dev -p ${PORT}`) },
  // The site the original sweep missed: deploy.sh's verify probes this port
  // IN-CONTAINER via docker exec - a wrong value fails every deploy
  // deterministically while the app is healthy (v0.5.0/v0.6.0, 2026-08-19).
  { file: "deploy/deploy.sh", label: "APP_PORT", re: new RegExp(`^APP_PORT="${PORT}"$`, "m") },
];

/** No file may declare a DIFFERENT listen port through these shapes. */
const FORBIDDEN = [
  { file: "docker-compose.yml", re: /PORT: "(?!3240")\d+"/ },
  { file: "docker-compose.dev.yml", re: /PORT: "(?!3240")\d+"/ },
  { file: "portals/app/Dockerfile", re: /\bPORT=(?!3240\b)\d+/ },
  { file: "portals/app/Dockerfile", re: /^EXPOSE (?!3240$)\d+$/m },
  { file: "deploy/deploy.sh", re: /^APP_PORT="(?!3240")\d+"$/m },
];

let failed = false;

for (const site of SITES) {
  const text = readFileSync(resolve(root, site.file), "utf8");
  if (!site.re.test(text)) {
    console.error(`[port-consistency] ${site.file}: ${site.label} does not declare ${PORT}`);
    failed = true;
  }
}

for (const rule of FORBIDDEN) {
  const text = readFileSync(resolve(root, rule.file), "utf8");
  const m = text.match(rule.re);
  if (m) {
    console.error(`[port-consistency] ${rule.file}: declares a non-${PORT} listen port: ${m[0]}`);
    failed = true;
  }
}

if (failed) {
  console.error(`[port-consistency] FAIL - the repo must tell one story: the allocated port is ${PORT} (registry R3)`);
  process.exit(1);
}
console.log(`[port-consistency] OK - every declaration agrees on ${PORT}`);
