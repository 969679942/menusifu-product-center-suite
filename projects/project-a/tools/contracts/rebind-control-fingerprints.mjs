import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const contractDir = path.join(root, "contracts/product-center");
const artifactsDir = path.resolve(root, "../TestOps/artifacts");
const controlsPath = path.join(contractDir, "controls.json");
const contractPath = path.join(contractDir, "product-center-test-contract.json");

const clean = value => String(value ?? "").replace(/\s+/g, " ").trim();
const readJson = async file => JSON.parse(await fs.readFile(file, "utf8"));
const writeJson = async (file, value) => fs.writeFile(file, JSON.stringify(value, null, 2) + "\n");

async function walkReports(directory, output = []) {
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) await walkReports(fullPath, output);
    else if (entry.name === "audit-report.json" || entry.name === "audit-report.partial.json") output.push(fullPath);
  }
  return output;
}

function routeRecords(report, reportPath, modifiedAt) {
  return (report.routes ?? [])
    .filter(route => route.href && route.status === "audited" && !route.error)
    .map(route => ({
      route: route.href,
      reportPath,
      modifiedAt,
      controls: (route.controls ?? []).filter(control => !control.disabled),
    }));
}

function uniqueCount(controls, key) {
  const target = key(controls.current);
  return controls.all.filter(control => key(control) === target).length;
}

function buildPrimary(control, allControls) {
  const collection = { current: control, all: allControls };
  if (control.row && control.icon) return { strategy: "row-icon", rowText: control.row, icon: control.icon, column: control.column || "", expectedCount: 1 };
  if (control.row && control.text) return { strategy: "row-text", rowText: control.row, text: control.text, exact: true, column: control.column || "", expectedCount: 1 };
  if (control.href && uniqueCount(collection, item => item.href) === 1) return { strategy: "href", value: control.href, expectedCount: 1 };
  if (control.text && uniqueCount(collection, item => `${item.role}|${item.text}`) === 1) return { strategy: "role-text", role: control.role, text: control.text, exact: true, expectedCount: 1 };
  if (control.aria && uniqueCount(collection, item => `${item.role}|${item.aria}`) === 1) return { strategy: "role-aria", role: control.role, aria: control.aria, exact: true, expectedCount: 1 };
  if (control.icon && uniqueCount(collection, item => `${item.role}|${item.icon}|${item.column}`) === 1) return { strategy: "icon-context", role: control.role, icon: control.icon, column: control.column || "", expectedCount: 1 };
  return { strategy: "signature-occurrence", signature: control.signature, occurrence: control.occurrence, fingerprint: control.fingerprint, expectedCount: 1 };
}

const controls = await readJson(controlsPath);
const reports = await walkReports(artifactsDir);
const candidatesByRoute = new Map();
for (const reportPath of reports) {
  let report;
  try { report = await readJson(reportPath); } catch { continue; }
  const modifiedAt = (await fs.stat(reportPath)).mtimeMs;
  for (const record of routeRecords(report, reportPath, modifiedAt)) {
    const records = candidatesByRoute.get(record.route) ?? [];
    records.push(record);
    candidatesByRoute.set(record.route, records);
  }
}

const grouped = Map.groupBy(controls, control => control.route);
const bindings = [];
const locators = [];
const unresolved = [];

for (const [route, routeControls] of grouped) {
  const expectedCount = routeControls.length;
  const directPath = routeControls[0]?.source?.[0]?.path;
  const candidates = (candidatesByRoute.get(route) ?? []).filter(candidate => candidate.controls.length === expectedCount);
  let selected = candidates.find(candidate => directPath && path.resolve(candidate.reportPath) === path.resolve(directPath));
  selected ??= candidates.sort((left, right) => right.modifiedAt - left.modifiedAt)[0];
  if (!selected) {
    unresolved.push({ route, expectedCount, reason: "no-terminal-report-with-exact-enabled-control-count" });
    continue;
  }

  routeControls.forEach((record, index) => {
    const raw = selected.controls[index];
    const primary = buildPrimary(raw, selected.controls);
    record.source = [{ path: selected.reportPath, locator: `${route}.controls[${index}]` }];
    record.confidence = primary.strategy === "signature-occurrence" ? 0.82 : 0.94;
    record.generationAllowed = true;
    record.evidence = {
      ...record.evidence,
      legacyName: record.evidence?.name ?? "",
      name: raw.name,
      tag: raw.tag,
      role: raw.role,
      text: raw.text,
      aria: raw.aria,
      title: raw.title,
      icon: raw.icon,
      type: raw.type,
      href: raw.href,
      disabled: raw.disabled,
      column: raw.column,
      row: raw.row,
      group: raw.group,
      occurrence: raw.occurrence,
      signature: raw.signature,
      fingerprint: raw.fingerprint,
      primaryLocator: primary,
      terminalReport: selected.reportPath,
    };
    locators.push({
      id: `locator:${record.id}`,
      status: "observed",
      sourceType: "ui-runtime",
      confidence: record.confidence,
      generationAllowed: true,
      source: record.source,
      route,
      evidence: {
        controlId: record.id,
        fingerprint: raw.fingerprint,
        signature: raw.signature,
        occurrence: raw.occurrence,
        primary,
        rowIdentity: raw.row || "",
        groupContext: raw.group || "",
        expectedCount: 1,
        driftPolicy: "fail-on-zero-or-multiple",
      },
    });
    bindings.push({ controlId: record.id, route, fingerprint: raw.fingerprint, strategy: primary.strategy, source: selected.reportPath });
  });
}

if (unresolved.length) throw new Error(`Unresolved control routes: ${JSON.stringify(unresolved)}`);
if (bindings.length !== controls.length) throw new Error(`Bound ${bindings.length}/${controls.length} controls`);
if (new Set(bindings.map(binding => binding.controlId)).size !== controls.length) throw new Error("Duplicate control bindings");

const contract = await readJson(contractPath);
contract.controls = controls;
contract.locators = locators;
contract.unresolved = (contract.unresolved ?? []).filter(record => !String(record.id).startsWith("locator-unresolved:"));
contract.metadata.generatedAt = new Date().toISOString();
contract.metadata.counts.controls = controls.length;
contract.metadata.counts.locators = locators.length;
contract.metadata.counts.unresolved = contract.unresolved.length;

await writeJson(controlsPath, controls);
await writeJson(path.join(contractDir, "locators.json"), locators);
await writeJson(path.join(contractDir, "locator-unresolved.json"), []);
await writeJson(path.join(contractDir, "control-fingerprint-bindings.json"), bindings);
await writeJson(contractPath, contract);

const strategies = Object.fromEntries(Object.entries(Object.groupBy(bindings, binding => binding.strategy)).map(([key, value]) => [key, value.length]));
console.log(JSON.stringify({ controls: controls.length, bound: bindings.length, unresolved: 0, strategies }, null, 2));
