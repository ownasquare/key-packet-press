import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const requiredFiles = [
  "README.md",
  "LICENSE",
  "SECURITY.md",
  "CONTRIBUTING.md",
  "CHANGELOG.md",
  "docs/key-packet-press/product.md",
  "docs/key-packet-press/architecture.md",
  "docs/key-packet-press/data-contract.md",
  "docs/key-packet-press/privacy-safety-limits.md",
  "docs/key-packet-press/monetization-hypothesis.md",
  "docs/key-packet-press/completion-status.md",
  "docs/key-packet-press/2026-07-27-completion.md",
  "docs/handoffs/2026-07-27-codex-key-packet-press.handoff.mdc",
];

for (const relativePath of requiredFiles) {
  await readFile(path.join(root, relativePath), "utf8");
}

const ignoredDirectoryNames = new Set([
  ".git",
  "dist",
  "node_modules",
  "playwright-report",
  "test-results",
]);

async function collectFiles(directory, filenamePattern) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (!ignoredDirectoryNames.has(entry.name)) {
        files.push(...(await collectFiles(target, filenamePattern)));
      }
    } else if (filenamePattern.test(entry.name)) {
      files.push(target);
    }
  }
  return files;
}

const sourceFiles = [
  path.join(root, "index.html"),
  ...(await collectFiles(path.join(root, "src"), /\.(?:css|html|js|mjs|ts)$/)),
  path.join(root, "vite.config.ts"),
  path.join(root, "playwright.config.ts"),
];
const builtFiles = await collectFiles(path.join(root, "dist"), /\.(?:css|html|js)$/);
const secretScanFiles = await collectFiles(root, /\.(?:css|csv|html|js|json|md|mdc|mjs|ts)$/);

const secretPatterns = [
  /(?:api[_-]?key|secret|token|password)\s*[:=]\s*["'][^"']{8,}["']/i,
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
];
const networkPatterns = [
  /\bfetch\s*\(/,
  /\bXMLHttpRequest\b/,
  /\bWebSocket\s*\(/,
  /\bEventSource\s*\(/,
  /\bsendBeacon\s*\(/,
  /(?:src|href)=["']https?:\/\//i,
];
const remoteBundlePatterns = [/(?:https?|wss?):\/\//i, /["']\/\/[a-z0-9]/i];
const allowedBundleMetadataUrls = ["https://github.com/Hopding/pdf-lib"];

let sourceText = "";
for (const file of sourceFiles) {
  const contents = await readFile(file, "utf8");
  sourceText += `\n${contents}`;
  for (const pattern of [...secretPatterns, ...networkPatterns]) {
    if (pattern.test(contents)) {
      throw new Error(`Unsafe source pattern found in ${path.relative(root, file)}.`);
    }
  }
}

for (const file of builtFiles) {
  const contents = await readFile(file, "utf8");
  const remoteScanContents = allowedBundleMetadataUrls.reduce(
    (current, allowedUrl) => current.replaceAll(allowedUrl, ""),
    contents,
  );
  for (const pattern of secretPatterns) {
    if (pattern.test(contents)) {
      throw new Error(`Unsafe built artifact pattern found in ${path.relative(root, file)}.`);
    }
  }
  for (const pattern of remoteBundlePatterns) {
    if (pattern.test(remoteScanContents)) {
      throw new Error(`Unsafe built artifact pattern found in ${path.relative(root, file)}.`);
    }
  }
}

for (const file of secretScanFiles) {
  const contents = await readFile(file, "utf8");
  for (const pattern of secretPatterns) {
    if (pattern.test(contents)) {
      throw new Error(`Secret-shaped text found in ${path.relative(root, file)}.`);
    }
  }
}

for (const redundantLabel of ["Continue", "Next", "View results"]) {
  if (sourceText.includes(`>${redundantLabel}<`)) {
    throw new Error(`Redundant workflow action found: ${redundantLabel}.`);
  }
}

const html = await readFile(path.join(root, "index.html"), "utf8");
if ((html.match(/type="file"/g) ?? []).length !== 1) {
  throw new Error("The chosen CSV workflow must expose its single file surface.");
}
for (const forbiddenMarkup of ["<select", "<nav", 'type="password"', "<dialog"]) {
  if (html.toLowerCase().includes(forbiddenMarkup)) {
    throw new Error(`Unexpected workflow markup found: ${forbiddenMarkup}.`);
  }
}

const lock = JSON.parse(await readFile(path.join(root, "package-lock.json"), "utf8"));
const allowedLicenses = new Set([
  "0BSD",
  "Apache-2.0",
  "BSD-2-Clause",
  "BSD-3-Clause",
  "ISC",
  "MIT",
  "MIT OR Apache-2.0",
  "MPL-2.0",
  "OFL-1.1",
  "(MIT AND Zlib)",
]);
for (const [packagePath, metadata] of Object.entries(lock.packages ?? {})) {
  if (!packagePath.startsWith("node_modules/")) {
    continue;
  }
  const license = metadata.license;
  if (!license || !allowedLicenses.has(license)) {
    throw new Error(
      `${packagePath} has an unapproved or missing license: ${license ?? "missing"}.`,
    );
  }
}

console.log(
  "Release audit passed: required files, local-only source, concise file workflow, and permissive dependency licenses verified.",
);
