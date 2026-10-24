// ============================================================
// Blueprint: the method as a drawing. Served by the Dashboards server at /d/blueprint, which calls page() and
// wraps it in the page frame; styled by blueprint-dashboard.css, with blueprint-dashboard.client.ts for the
// tooltips, the rule finder and the jumps between a mark and its rule.
//
// What it shows: the model as a schematic and the drawing's title block (hero), how the method grew (each landed
// revision, the rules it added and changed, and the requests that led to it), the feedback board, every rule, and
// the state of the repo, its health, its InMail and its actions.
//
// engine.ts beside this file decides everything: this module asks it and draws the answer. Drawing only reads
// (rule 18): git and the files here. GitHub is asked by a job (live() starts it while a page is open), and the
// revision history is read by a job and kept in ctx.state and a cache in local app data.
// ============================================================
import fs from "fs";
import path from "path";
import cp from "child_process";
import * as eng from "./engine";
import type { Ctx, ActionResult, JobStatus } from "../Dashboards/contract";

// open pages redraw when one of these changes: the method, the feedback, the mail, a commit or a push
export const watch = ["README.md", "CLAUDE.md", "engine.ts", "private", "InMail", ".git/refs", ".git/HEAD"];

type BpCtx = Pick<Ctx, "dir" | "projects" | "state" | "job" | "jobStatus" | "remote">;

interface GitHubRun { status: string; conclusion: string; displayTitle: string; createdAt: string; headSha: string; url: string; workflowName: string }
interface HealthCell { state: string; text: string; why: string }
interface HealthRow { label: string; cells: Record<string, HealthCell>; fails: number; ok: boolean; command: string | null }
interface HealthRule { id: string; label: string; rule: string; what: string }
interface BpState {
  revs?: { head: string; list: eng.Revision[] };
  github?: { at: number; runs: GitHubRun[]; error: string | null };
  tools?: { at: number; gitleaks: string | null };
  health?: { at: number; row: HealthRow | null; rules: HealthRule[]; error: string | null; checksAt: number | null };
}
const st = (ctx: Pick<Ctx, "state">): BpState => ctx.state as BpState;

// ---------------------------------------------------------------- small helpers

const esc = (s: unknown): string => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
const errMsg = (e: unknown): string => String((e as Error | null)?.message ?? e);
const pad2 = (n: number): string => String(n).padStart(2, "0");
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const dayKey = (t: number): string => { const d = new Date(t); return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; };
const dShort = (t: number): string => { const d = new Date(t); return `${d.getDate()} ${MONTHS[d.getMonth()]}`; };
const dLong = (t: number): string => { const d = new Date(t); return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`; };
function ago(t: number | null | undefined, now = Date.now()): string {
  if (!t) return "never";
  const s = Math.max(0, Math.round((now - t) / 1000));
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  const d = Math.round(s / 86400);
  return d === 1 ? "yesterday" : d < 45 ? `${d} days ago` : dLong(t);
}
const compact = (n: number): string => n >= 10000 ? `${Math.round(n / 1000)}K` : n >= 1000 ? `${(n / 1000).toFixed(1).replace(/\.0$/, "")}K` : String(n);
const plural = (n: number, one: string, many = one + "s"): string => `${n} ${n === 1 ? one : many}`;
const LOCAL = (): string => process.env.LOCALAPPDATA || path.join(process.env.HOME || ".", ".cache");
const historyCache = (): string => path.join(LOCAL(), "ObsidianDash", "blueprint-history.json");

interface Run { ok: boolean; code: number | null; out: string }
function sh(file: string, args: string[], o: { cwd?: string; timeout?: number } = {}): Promise<Run> {
  return new Promise(res => cp.execFile(file, args, { cwd: o.cwd, windowsHide: true, timeout: o.timeout ?? 20000, maxBuffer: 1 << 26 },
    (err, out, errOut) => res({ ok: !err, code: err ? (typeof (err as { code?: unknown }).code === "number" ? (err as { code: number }).code : 1) : 0, out: String(out) + String(errOut) })));
}
const git = (dir: string, args: string[], timeout?: number): Promise<Run> => sh("git", ["-C", dir, ...args], { timeout });
/** The project this page belongs to, as the megaproject names it: the first folder of ctx.dir under ctx.projects. */
export const projectOf = (ctx: Pick<Ctx, "dir" | "projects">): string =>
  path.relative(ctx.projects, ctx.dir).split(path.sep)[0] || path.basename(ctx.dir);
const tail = (s: string, n = 6): string => s.replace(/\x1b\[[0-9;?]*[ -\/]*[@-~]/g, "").split(/\r?\n/).map(l => l.trimEnd()).filter(Boolean).slice(-n).join("\n");

/** Git Bash, not whatever bash is first on PATH (on Windows that can be WSL's launcher). */
async function bash(): Promise<string> {
  if (process.platform !== "win32") return "bash";
  const r = await sh("git", ["--exec-path"]);
  const found = r.ok ? path.resolve(r.out.trim(), "..", "..", "..", "bin", "bash.exe") : "";
  return found && fs.existsSync(found) ? found : "bash";
}

// ---------------------------------------------------------------- what the page reads

interface Repo {
  ok: boolean; branch: string; head: string; short: string; dirty: number; ahead: number | null; behind: number | null;
  pushedAt: number | null; worktrees: string[]; hooksPath: string; machineHooks: "found" | "missing" | "none";
  github: string | null; blocklist: number | null; allowed: number | null;
}

/** GitHub's owner/name from the origin URL, if origin is on GitHub. */
export function githubSlug(url: string): string | null {
  const m = /github\.com[:/]([^/\s]+)\/([^/\s]+?)(?:\.git)?\/?$/.exec(url.trim());
  return m ? `${m[1]}/${m[2]}` : null;
}
const countEntries = (file: string): number | null => {
  try { return fs.readFileSync(file, "utf8").split(/\r?\n/).map(l => l.trim()).filter(l => l && !l.startsWith("#")).length; }
  catch { return null; }
};

async function readRepo(dir: string): Promise<Repo> {
  const [branch, head, status, lr, pushed, wt, hooks, machine, origin] = await Promise.all([
    git(dir, ["rev-parse", "--abbrev-ref", "HEAD"]), git(dir, ["rev-parse", "main"]), git(dir, ["status", "--porcelain"]),
    git(dir, ["rev-list", "--left-right", "--count", "origin/main...main"]), git(dir, ["log", "-1", "--format=%ct", "origin/main"]),
    git(dir, ["worktree", "list", "--porcelain"]), git(dir, ["config", "--get", "core.hooksPath"]),
    git(dir, ["config", "--global", "--includes", "--type=path", "--get", "core.hooksPath"]), git(dir, ["remote", "get-url", "origin"]),
  ]);
  const [behind, ahead] = lr.ok ? lr.out.trim().split(/\s+/).map(Number) : [null, null];
  const trees = wt.ok ? wt.out.split(/\r?\n\r?\n/).map(b => /^branch refs\/heads\/(.+)$/m.exec(b)?.[1] || "").slice(1).filter(Boolean) : [];
  const mdir = machine.ok ? machine.out.trim() : "";
  const home = process.env.USERPROFILE || process.env.HOME || "";
  return {
    ok: head.ok, branch: branch.ok ? branch.out.trim() : "?", head: head.ok ? head.out.trim() : "", short: head.ok ? head.out.trim().slice(0, 7) : "",
    dirty: status.ok ? status.out.split(/\r?\n/).filter(Boolean).length : 0, ahead: ahead ?? null, behind: behind ?? null,
    pushedAt: pushed.ok && pushed.out.trim() ? Number(pushed.out.trim()) * 1000 : null, worktrees: trees,
    hooksPath: hooks.ok ? hooks.out.trim() : "", machineHooks: !mdir ? "none" : fs.existsSync(mdir) ? "found" : "missing",
    github: origin.ok ? githubSlug(origin.out) : null,
    blocklist: countEntries(process.env.VADE_BLOCKLIST_FILE || path.join(home, ".config", "vade", "blocklist.txt")),
    allowed: countEntries(process.env.VADE_ALLOWED_IDENTITIES_FILE || path.join(home, ".config", "vade", "allowed-identities.txt")),
  };
}

/** Project health's row for this folder, from the index's health.ts, kept for 30 s. */
function readHealth(ctx: BpCtx): NonNullable<BpState["health"]> {
  const S = st(ctx);
  if (S.health && Date.now() - S.health.at < 30000) return S.health;
  let out: NonNullable<BpState["health"]>;
  try {
    const h = require(path.join(ctx.projects, "health")) as { report(): { rules: HealthRule[]; projects: (HealthRow & { dir: string })[]; checksAt: number | null } };
    const rep = h.report();
    const me = path.resolve(ctx.projects, projectOf(ctx)).toLowerCase();
    out = { at: Date.now(), row: rep.projects.find(p => path.resolve(p.dir).toLowerCase() === me) || null, rules: [...rep.rules], error: null, checksAt: rep.checksAt };
  } catch (e) {
    const code = (e as NodeJS.ErrnoException).code;
    out = { at: Date.now(), row: null, rules: [], error: code === "MODULE_NOT_FOUND" ? "Project health isn't installed here." : errMsg(e), checksAt: null };
  }
  S.health = out;
  return out;
}

// ---------------------------------------------------------------- the jobs

async function refreshGitHub(ctx: BpCtx): Promise<ActionResult> {
  const repo = await readRepo(ctx.dir);
  if (!repo.github) { st(ctx).github = { at: Date.now(), runs: [], error: "origin isn't on GitHub" }; return { ok: false, message: "origin isn't a GitHub repo." }; }
  await git(ctx.dir, ["fetch", "-q", "origin"], 60000);
  const r = await sh("gh", ["run", "list", "--repo", repo.github, "--limit", "6", "--json", "status,conclusion,displayTitle,createdAt,headSha,url,workflowName"], { timeout: 30000 });
  let runs: GitHubRun[] = [], error: string | null = null;
  if (r.ok) { try { runs = JSON.parse(r.out.slice(r.out.indexOf("["))); } catch (e) { error = `gh's answer wasn't JSON: ${errMsg(e)}`; } }
  else error = tail(r.out, 2) || "gh failed (is it installed and signed in?)";
  st(ctx).github = { at: Date.now(), runs, error };
  return error ? { ok: false, message: `GitHub: ${error}` } : runs[0] ? `GitHub's last check: ${runs[0].conclusion || runs[0].status}` : "GitHub has no checks yet";
}

async function readTools(ctx: BpCtx): Promise<ActionResult> {
  const r = await sh("gitleaks", ["version"]);
  st(ctx).tools = { at: Date.now(), gitleaks: r.ok ? r.out.trim().replace(/^v/, "") : null };
  return r.ok ? `gitleaks ${r.out.trim()}` : { ok: false, message: "gitleaks isn't installed" };
}

async function readRevisions(ctx: BpCtx, head: string): Promise<ActionResult> {
  const list = await eng.readHistory(ctx.dir, historyCache());
  st(ctx).revs = { head, list };
  return `Read ${plural(list.length, "revision")}`;
}

async function runCheck(dir: string): Promise<ActionResult> {
  const b = await bash();
  const leaks = await sh(b, ["scripts/test-leak-check.sh"], { cwd: dir, timeout: 600000 });
  const passed = /(\d+) passed, (\d+) failed/.exec(leaks.out);
  if (!leaks.ok) return { ok: false, message: `The leak check's tests failed:\n${tail(leaks.out)}` };
  const ts = await sh("node", [path.join("..", ".typescript", "check.cts")], { cwd: dir, timeout: 600000 });
  const tests = /# pass (\d+)/.exec(ts.out), fails = /# fail (\d+)/.exec(ts.out);
  if (!ts.ok) return { ok: false, message: `The TypeScript check failed${fails ? ` (${fails[1]} failing)` : ""}:\n${tail(ts.out)}` };
  return `Check passed: ${passed ? passed[1] : "all"} leak-check tests, then tsc and ${tests ? tests[1] : "the"} tests`;
}

async function runLeaks(dir: string): Promise<ActionResult> {
  const r = await sh(await bash(), ["scripts/leak-check.sh", "--all"], { cwd: dir, timeout: 600000 });
  const n = /checked (\d+) commit/.exec(r.out);
  return r.ok ? `Leak check passed over ${n ? n[1] : "every"} commits` : { ok: false, message: `The leak check blocked it:\n${tail(r.out)}` };
}

async function runPush(ctx: BpCtx): Promise<ActionResult> {
  const r = await git(ctx.dir, ["push", "origin", "main"], 600000);
  if (!r.ok) return { ok: false, message: `The push was refused:\n${tail(r.out)}` };
  void ctx.job("github", () => refreshGitHub(ctx));
  return /Everything up-to-date/.test(r.out) ? "GitHub already had everything" : "Pushed main to GitHub";
}

// ---------------------------------------------------------------- Markdown, for a rule's text

/** The rule's own Markdown as HTML: paragraphs, lists, tables, code. Everything is escaped first. */
export function md(src: string): string {
  const inline = (s: string): string => esc(s)
    .replace(/`([^`]+)`/g, (_m, c: string) => `<code>${c}</code>`)
    .replace(/\*\*(.+?)\*\*/g, "<b>$1</b>")
    .replace(/(^|[^*\w])\*([^*\s][^*]*?)\*(?![*\w])/g, "$1<i>$2</i>")
    .replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<span class="bp-link" data-url="$2">$1</span>')
    .replace(/&lt;(https?:\/\/[^&\s]+)&gt;/g, '<span class="bp-link" data-url="$1">$1</span>')
    .replace(/\b(rules?) (\d+(?:(?:,? and |, | or )\d+)*)/gi, (_m, w: string, nums: string) => `${w} ${nums.replace(/\d+/g, n => `<a class="bp-ref" href="#bp-rule-${n}">${n}</a>`)}`);
  const lines = src.replace(/\r\n?/g, "\n").split("\n");
  const out: string[] = [];
  let i = 0;
  const isBlock = (l: string): boolean => /^```/.test(l) || /^\s*\|/.test(l) || /^\s*[-*] /.test(l) || /^\s*\d+\. /.test(l);
  while (i < lines.length) {
    const l = lines[i];
    if (!l.trim()) { i++; continue; }
    if (/^```/.test(l)) {
      const code: string[] = [];
      for (i++; i < lines.length && !/^```/.test(lines[i]); i++) code.push(lines[i]);
      i++; out.push(`<pre class="bp-pre">${esc(code.join("\n"))}</pre>`); continue;
    }
    if (/^\s*\|/.test(l)) {
      const rows: string[][] = [];
      for (; i < lines.length && /^\s*\|/.test(lines[i]); i++) {
        if (/^\s*\|[\s:|-]+\|\s*$/.test(lines[i])) continue;
        rows.push(lines[i].trim().replace(/^\||\|$/g, "").split("|").map(c => c.trim()));
      }
      const [h, ...body] = rows;
      out.push(`<div class="bp-table-wrap"><table class="bp-table"><thead><tr>${(h || []).map(c => `<th>${inline(c)}</th>`).join("")}</tr></thead><tbody>${body.map(r => `<tr>${r.map(c => `<td>${inline(c)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`);
      continue;
    }
    const list = /^\s*[-*] /.test(l) ? "ul" : /^\s*\d+\. /.test(l) ? "ol" : "";
    if (list) {
      const items: string[] = [];
      const start = list === "ul" ? /^\s*[-*] / : /^\s*\d+\. /;
      for (; i < lines.length && lines[i].trim(); i++) {
        if (start.test(lines[i])) items.push(lines[i].replace(start, ""));
        else if (items.length) items[items.length - 1] += " " + lines[i].trim();
      }
      out.push(`<${list}>${items.map(t => `<li>${inline(t)}</li>`).join("")}</${list}>`);
      continue;
    }
    const para: string[] = [];
    for (; i < lines.length && lines[i].trim() && !isBlock(lines[i]); i++) para.push(lines[i].trim());
    const text = para.join(" ");
    out.push(/^\*\*Why:\*\*/.test(text) ? `<p class="bp-why">${inline(text)}</p>` : `<p>${inline(text)}</p>`);
  }
  return out.join("");
}

// ---------------------------------------------------------------- the model, drawn

interface Node { id: string; x: number; y: number; w: number; h: number; label: string; part?: string; shape: "box" | "stadium" | "cylinder" | "hex" }
const NODES: Node[] = [
  { id: "you", x: 54, y: 150, w: 100, h: 38, label: "You", shape: "stadium" },
  { id: "dash", x: 200, y: 70, w: 124, h: 52, label: "Dashboards", part: "dashboards", shape: "box" },
  { id: "agent", x: 200, y: 230, w: 124, h: 52, label: "Agents", part: "agents", shape: "box" },
  { id: "engine", x: 400, y: 70, w: 124, h: 52, label: "Engines", part: "engines", shape: "box" },
  { id: "conn", x: 400, y: 230, w: 124, h: 52, label: "Connectors", part: "connectors", shape: "box" },
  { id: "vault", x: 600, y: 128, w: 104, h: 64, label: "Vault", part: "vault", shape: "cylinder" },
  { id: "out", x: 600, y: 252, w: 104, h: 40, label: "Outside", shape: "hex" },
];
// from, to, label (\n breaks it), where along the line the label sits, both ways
const EDGES: [string, string, string, number, boolean?][] = [
  ["you", "dash", "look, act", 0.5], ["you", "agent", "ask, approve", 0.5],
  ["dash", "engine", "calls", 0.5], ["agent", "engine", "runs commands", 0.3],
  ["engine", "vault", "reads, writes\nrecords", 0.5], ["agent", "vault", "reads; writes notes", 0.44],
  ["dash", "conn", "runs backend", 0.3], ["agent", "conn", "uses tools", 0.5],
  ["conn", "vault", "syncs\ndata in", 0.5], ["conn", "out", "", 0.5, true],
];

function modelSvg(m: eng.Method, open: Record<string, number>): string {
  const by = new Map(NODES.map(n => [n.id, n]));
  const partOf = new Map(m.parts.map(p => [p.key, p]));
  const modelRow = (name: string): eng.ModelRow | undefined => m.model.find(r => r.part.toLowerCase() === name.toLowerCase());
  // where the line from a node's centre towards a point leaves its outline
  const exit = (n: Node, tx: number, ty: number, gap: number): [number, number] => {
    const dx = tx - n.x, dy = ty - n.y, len = Math.hypot(dx, dy) || 1;
    const t = Math.min(dx ? (n.w / 2) / Math.abs(dx) : Infinity, dy ? (n.h / 2) / Math.abs(dy) : Infinity);
    return [n.x + dx * t + (dx / len) * gap, n.y + dy * t + (dy / len) * gap];
  };
  let labels = "";
  const edges = EDGES.map(([a, b, label, at, both]) => {
    const A = by.get(a)!, B = by.get(b)!;
    const [x1, y1] = exit(A, B.x, B.y, both ? 5 : 2), [x2, y2] = exit(B, A.x, A.y, 5);
    const lx = x1 + (x2 - x1) * at, ly = y1 + (y2 - y1) * at;
    const lines = label ? label.split("\n") : [];
    // drawn after the nodes, so a label is never under one
    labels += lines.length ? `<text class="bp-edge-label" x="${lx.toFixed(1)}" y="${(ly + 3 - (lines.length - 1) * 5.5).toFixed(1)}" text-anchor="middle">${lines.map((l, i) => `<tspan x="${lx.toFixed(1)}" dy="${i ? 11 : 0}">${esc(l)}</tspan>`).join("")}</text>` : "";
    return `<line class="bp-edge" x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" marker-end="url(#bp-arrow)"${both ? ' marker-start="url(#bp-arrow)"' : ""}/>`;
  }).join("");
  const nodes = NODES.map(n => {
    const x = n.x - n.w / 2, y = n.y - n.h / 2;
    const p = n.part ? partOf.get(n.part) : undefined;
    const row = modelRow(n.label);
    const shape = n.shape === "stadium" ? `<rect class="bp-node" x="${x}" y="${y}" width="${n.w}" height="${n.h}" rx="${n.h / 2}"/>`
      : n.shape === "cylinder" ? `<path class="bp-node" d="M${x},${y + 9} a${n.w / 2},9 0 0 1 ${n.w},0 v${n.h - 18} a${n.w / 2},9 0 0 1 -${n.w},0 z"/><path class="bp-node-rim" d="M${x},${y + 9} a${n.w / 2},9 0 0 0 ${n.w},0"/>`
      : n.shape === "hex" ? `<polygon class="bp-node" points="${x + 12},${y} ${x + n.w - 12},${y} ${x + n.w},${n.y} ${x + n.w - 12},${y + n.h} ${x + 12},${y + n.h} ${x},${n.y}"/>`
      : `<rect class="bp-node" x="${x}" y="${y}" width="${n.w}" height="${n.h}" rx="6"/>`;
    const sub = p ? `${plural(p.rules.length, "rule")}${open[p.key] ? ` · ${open[p.key]} open` : ""}` : n.id === "you" ? "the final say" : "services";
    const tip = row ? `${row.part}\nIts job: ${row.job}\nHolds: ${row.holds}\nNever: ${row.never}` : p ? `${p.name}: ${p.tagline}` : n.id === "you" ? "You look and act through the dashboards, and talk to the agent." : "Outside services, reached only through connectors.";
    const body = `${shape}<text class="bp-node-label" x="${n.x}" y="${n.y + (sub ? -1 : 4)}" text-anchor="middle">${esc(n.label.toUpperCase())}</text>` +
      `<text class="bp-node-sub" x="${n.x}" y="${n.y + 13}" text-anchor="middle">${esc(sub)}</text>`;
    return p ? `<a href="#bp-part-${esc(p.key)}" class="bp-node-link" data-tip="${esc(tip)}" aria-label="${esc(`${p.name}: ${p.rules.length} rules`)}">${body}</a>` : `<g data-tip="${esc(tip)}">${body}</g>`;
  }).join("");
  const n = m.rules.length;
  return `<svg class="bp-svg bp-model" viewBox="0 0 660 318" role="img" aria-label="The model: you, dashboards, agents, engines, connectors, the vault and outside services">
    <defs><marker id="bp-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,1 L10,5 L0,9 z" class="bp-arrowhead"/></marker></defs>
    ${edges}${nodes}${labels}
    <g class="bp-dim"><line x1="8" y1="304" x2="652" y2="304"/><line x1="8" y1="297" x2="8" y2="311"/><line x1="652" y1="297" x2="652" y2="311"/>
      <text x="330" y="300" text-anchor="middle">${esc(`${n} RULES · ${m.parts.length} PARTS · ${m.foundations.length} FOUNDATIONS`)}</text></g>
  </svg>`;
}

// ---------------------------------------------------------------- charts

interface Pt { t: number; v: number; tip: string }
/** A round step that splits 0..v into about five: 1, 2, 2.5 or 5 times a power of ten. */
export function niceStep(v: number): number {
  const target = Math.max(v, 1) / 5;
  const p = Math.pow(10, Math.floor(Math.log10(target)));
  for (const k of [1, 2, 2.5, 5, 10]) if (k * p >= target) return k * p;
  return 10 * p;
}

/** A step line of one measure over time, a dot at each revision. One series, so no legend: the title names it. */
function stepChart(title: string, pts: Pt[], t1: number, fmt: (v: number) => string): string {
  if (!pts.length) return "";
  const W = 560, H = 176, L = 42, R = 34, T = 14, B = 28;
  const t0 = pts[0].t, span = Math.max(1, t1 - t0);
  const top = Math.max(...pts.map(p => p.v)) * 1.06;
  const step = niceStep(top);
  const max = Math.ceil(top / step) * step || step;
  const x = (t: number): number => L + ((t - t0) / span) * (W - L - R);
  const y = (v: number): number => T + (1 - v / max) * (H - T - B);
  let d = `M${x(pts[0].t).toFixed(1)},${y(pts[0].v).toFixed(1)}`;
  for (const p of pts.slice(1)) d += ` H${x(p.t).toFixed(1)} V${y(p.v).toFixed(1)}`;
  d += ` H${x(t1).toFixed(1)}`;
  const area = `${d} V${y(0).toFixed(1)} H${x(t0).toFixed(1)} Z`;
  const ticks = Array.from({ length: Math.round(max / step) + 1 }, (_, i) => i * step);
  const grid = ticks.map(v => `<line class="bp-gridline" x1="${L}" x2="${W - R}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}"/><text class="bp-tick" x="${L - 6}" y="${(y(v) + 3).toFixed(1)}" text-anchor="end">${esc(fmt(v))}</text>`).join("");
  // x ticks: the first of each month in range, and the two ends when there's room
  const xt: { t: number; label: string }[] = [];
  const m = new Date(t0); m.setDate(1); m.setHours(0, 0, 0, 0); m.setMonth(m.getMonth() + 1);
  for (; m.getTime() < t1; m.setMonth(m.getMonth() + 1)) xt.push({ t: m.getTime(), label: `1 ${MONTHS[m.getMonth()]}` });
  for (const end of [{ t: t0, label: dShort(t0) }, { t: t1, label: dShort(t1) }]) if (xt.every(k => Math.abs(x(k.t) - x(end.t)) > 46)) xt.push(end);
  const xaxis = xt.map(k => `<line class="bp-axis" x1="${x(k.t).toFixed(1)}" x2="${x(k.t).toFixed(1)}" y1="${H - B}" y2="${H - B + 4}"/><text class="bp-tick" x="${x(k.t).toFixed(1)}" y="${H - 8}" text-anchor="middle">${esc(k.label)}</text>`).join("");
  const last = pts[pts.length - 1];
  const dots = pts.map(p => `<g class="bp-pt" tabindex="0" data-tip="${esc(p.tip)}"><circle class="bp-hit" cx="${x(p.t).toFixed(1)}" cy="${y(p.v).toFixed(1)}" r="12"/><circle class="bp-dot" cx="${x(p.t).toFixed(1)}" cy="${y(p.v).toFixed(1)}" r="4"/></g>`).join("");
  return `<figure class="bp-chart"><figcaption>${esc(title)}</figcaption>
    <svg class="bp-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(`${title}: ${fmt(pts[0].v)} on ${dShort(pts[0].t)} to ${fmt(last.v)} now`)}">
      ${grid}<line class="bp-axis" x1="${L}" x2="${W - R}" y1="${H - B}" y2="${H - B}"/>${xaxis}
      <path class="bp-area" d="${area}"/><path class="bp-line" d="${d}"/>${dots}
      <text class="bp-endlabel" x="${(x(t1) + 6).toFixed(1)}" y="${(y(last.v) + 4).toFixed(1)}">${esc(fmt(last.v))}</text>
    </svg></figure>`;
}

// ---------------------------------------------------------------- the revision table: rules as lifelines

const COL = 16, ROW = 28;
function lifelines(revs: eng.Revision[], m: eng.Method, sum: eng.FbSummary, reqs: Map<string, eng.Request[]>, fbBy: Map<string, eng.Feedback[]>, titles: Map<number, string>): string {
  const n = Math.max(m.rules.length, ...revs.map(r => r.count));
  const W = n * COL;
  const cx = (k: number): number => (k - 0.5) * COL;
  const title = (k: number): string => titles.get(k) || `rule ${k}`;
  // header: the parts as brackets, then every rule's number
  const head = m.parts.map(p => {
    if (!p.rules.length) return "";
    const a = (Math.min(...p.rules) - 1) * COL + 2, b = Math.max(...p.rules) * COL - 2;
    return `<a href="#bp-part-${esc(p.key)}"><text class="bp-part-label" x="${(a + b) / 2}" y="10" text-anchor="middle">${esc(p.name.toUpperCase())}</text></a><path class="bp-bracket" d="M${a},20 V15 H${b} V20"/>`;
  }).join("") + Array.from({ length: n }, (_, i) => `<text class="bp-colnum" data-col="${i + 1}" x="${cx(i + 1)}" y="34" text-anchor="middle">${i + 1}</text>`).join("");
  const header = `<div class="bp-rev bp-rev-head"><div class="bp-rev-id">Rev</div><svg class="bp-svg bp-strip" viewBox="0 0 ${W} 40" width="${W}" height="40">${head}</svg><div class="bp-rev-what">What landed</div></div>`;

  const rows = revs.map((r, ri) => {
    const born = new Set(r.born), changed = new Set(r.changed);
    let cells = "";
    for (let k = 1; k <= n; k++) {
      const alive = !!r.rules[k], x = cx(k);
      if (!alive) { cells += `<circle class="bp-void" cx="${x}" cy="${ROW / 2}" r="0.9"/>`; continue; }
      const state = born.has(k) ? "born" : changed.has(k) ? "changed" : "same";
      cells += `<line class="bp-life" data-col="${k}" x1="${x}" x2="${x}" y1="${state === "born" ? ROW / 2 : 0}" y2="${ROW}"/>`;
      if (state === "born") cells += `<circle class="bp-born" data-col="${k}" cx="${x}" cy="${ROW / 2}" r="4.5"/>`;
      if (state === "changed") cells += `<circle class="bp-changed" data-col="${k}" cx="${x}" cy="${ROW / 2}" r="4"/>`;
      const tip = `Rule ${k} · ${title(k)}\n${state === "born" ? `Written in REV ${r.letter}` : state === "changed" ? `Changed in REV ${r.letter}` : `Unchanged in REV ${r.letter}`}, ${dLong(r.at)}`;
      cells += `<a href="#bp-rule-${k}" data-tip="${esc(tip)}" data-col="${k}"><rect class="bp-cell" x="${x - COL / 2}" y="0" width="${COL}" height="${ROW}"/></a>`;
    }
    for (const k of r.gone) cells += `<path class="bp-gone" d="M${cx(k) - 3},${ROW / 2 - 3} l6,6 m0,-6 l-6,6"/>`;
    const asked = reqs.get(r.sha) || [], closed = fbBy.get(r.sha) || [];
    const what = eng.describe(r.subject, r.detail);
    const meta = [
      r.born.length ? `+${r.born.length} ${r.born.length === 1 ? "rule" : "rules"}` : "",
      r.changed.length ? `${r.changed.length} changed` : "",
      r.foundationsChanged ? "foundations" : "",
      r.commits > 1 ? `${r.commits} commits` : "",
    ].filter(Boolean);
    const chips = (asked.length ? `<span class="bp-chip bp-chip-mail" data-tip="${esc(`Asked for by:\n${asked.map(q => `${q.from}: ${q.subject}`).join("\n")}`)}">✉ ${asked.length}</span>` : "") +
      (closed.length ? `<span class="bp-chip bp-chip-done" data-tip="${esc(`Feedback this answered:\n${closed.map(f => `${f.id}: ${f.text.slice(0, 120)}`).join("\n")}`)}">✓ ${closed.map(f => esc(f.id)).join(" ")}</span>` : "");
    const tip = `REV ${r.letter} · ${r.short} · ${dLong(r.at)}\n${what}\n${r.count} rules, ${r.words.toLocaleString("en-AU")} words`;
    return `<div class="bp-rev${ri === revs.length - 1 ? " bp-rev-now" : ""}">
      <div class="bp-rev-id" data-tip="${esc(tip)}"><b>${esc(r.letter)}</b><span>${esc(dShort(r.at))}</span></div>
      <svg class="bp-svg bp-strip" viewBox="0 0 ${W} ${ROW}" width="${W}" height="${ROW}">${cells}</svg>
      <div class="bp-rev-what" data-tip="${esc(tip)}"><span class="bp-rev-text">${esc(what)}</span>${meta.length ? `<span class="bp-rev-meta">${esc(meta.join(" · "))}</span>` : ""}${chips}</div>
    </div>`;
  }).join("");

  // the last row: where the open feedback presses on each rule, darker for more (cost-weighted)
  const lv = (w: number): number => w <= 0 ? 0 : w <= 1 ? 1 : w <= 2 ? 2 : w <= 4 ? 3 : 4;
  let press = "";
  for (let k = 1; k <= n; k++) {
    const w = sum.byRule[k] || 0, x = cx(k);
    if (m.rules.some(r => r.n === k)) press += `<line class="bp-life" data-col="${k}" x1="${x}" x2="${x}" y1="0" y2="9"/>`;
    press += `<a href="#bp-rule-${k}" data-col="${k}" data-tip="${esc(`Rule ${k} · ${title(k)}\n${w ? `Open feedback weighing ${w}` : "No open feedback"}`)}"><rect class="bp-press" data-level="${lv(w)}" x="${x - 6}" y="10" width="12" height="12" rx="2"/></a>`;
  }
  const footer = `<div class="bp-rev bp-rev-press"><div class="bp-rev-id"><b>Now</b><span>feedback</span></div>
    <svg class="bp-svg bp-strip" viewBox="0 0 ${W} ${ROW}" width="${W}" height="${ROW}">${press}</svg>
    <div class="bp-rev-what"><span class="bp-rev-text">${sum.weight ? `Open feedback, by rule${sum.general ? ` · ${sum.general} on the whole method` : ""}` : "No open feedback: every rule is quiet"}</span></div></div>`;
  return `<div class="bp-revs" style="--bp-strip-w:${W}px">${header}${rows}${footer}</div>
    <div class="bp-legend"><span><svg width="14" height="14"><circle class="bp-born" cx="7" cy="7" r="4.5"/></svg> written</span><span><svg width="14" height="14"><circle class="bp-changed" cx="7" cy="7" r="4"/></svg> changed</span><span><svg width="14" height="14"><line class="bp-life" x1="7" x2="7" y1="0" y2="14"/></svg> unchanged</span><span><svg width="14" height="14"><rect class="bp-press" data-level="3" x="1" y="1" width="12" height="12" rx="2"/></svg> open feedback</span><span class="bp-legend-note">Revisions are lettered as drawings are: no I or O.</span></div>`;
}

// ---------------------------------------------------------------- the page

const ICON: Record<string, string> = { ok: "✓", fail: "✗", warn: "!", unknown: "?", na: "–" };
const fact = (state: "ok" | "warn" | "fail" | "na", label: string, value: string, tip = ""): string =>
  `<div class="bp-fact"${tip ? ` data-tip="${esc(tip)}"` : ""}><span class="bp-state ${state}" aria-label="${state}">${ICON[state]}</span><span class="bp-fact-label">${esc(label)}</span><span class="bp-fact-value">${value}</span></div>`;

function jobLine(j: JobStatus, idle: string): string {
  if (j.state === "running") return `<span class="bp-job run">running since ${esc(ago(j.since))}</span>`;
  if (j.state === "queued") return `<span class="bp-job">waiting its turn</span>`;
  if (!j.last) return `<span class="bp-job">${esc(idle)}</span>`;
  return `<span class="bp-job ${j.last.ok ? "ok" : "bad"}" data-tip="${esc(j.last.message || "")}">${j.last.ok ? "✓" : "✗"} ${esc((j.last.message || "").split("\n")[0])} · ${esc(ago(j.last.at))}</span>`;
}

export async function page(ctx: BpCtx): Promise<string> {
  const S = st(ctx);
  const now = Date.now();
  const readme = eng.readText(path.join(ctx.dir, "README.md"));
  const m = eng.parseReadme(readme);
  const problems = eng.checkMethod(m, readme);
  const back = eng.pointedAt(m);
  const titles = new Map(m.rules.map(r => [r.n, r.title]));

  let fbText = "", fbErr: string | null = null;
  try { fbText = eng.readText(eng.feedbackFile(ctx.dir)); } catch (e) { fbErr = errMsg(e); }
  const log = eng.parseFeedback(fbText);
  const sum = eng.summarize(log, m);
  const fbOpen = log.items.filter(i => i.status === "open"), fbAcc = log.items.filter(i => i.status === "accepted");
  const fbDone = log.items.filter(i => i.status === "changed" || i.status === "declined").reverse();

  const repo = await readRepo(ctx.dir);
  if (repo.ok && (!S.revs || S.revs.head !== repo.head) && ctx.jobStatus("history").state === "idle") void ctx.job("history", () => readRevisions(ctx, repo.head));
  const revs = S.revs ? S.revs.list : [];
  const cur = revs[revs.length - 1];

  // the project's own folder and name (a worktree previewing this page still reads the project's mail)
  const project = projectOf(ctx);
  let mail: eng.Request[] = [], archived: eng.Request[] = [], mailErr: string | null = null;
  try {
    mail = eng.readMessages(path.join(ctx.projects, project, "InMail"));
    archived = eng.readMessages(path.join(ctx.projects, "InMail Archive", project));
  } catch (e) { mailErr = errMsg(e); }
  const reqs = new Map<string, eng.Request[]>();
  for (const q of archived) { const r = eng.answeredBy(q, revs); if (r) reqs.set(r.sha, [...(reqs.get(r.sha) || []), q]); }
  const fbBy = new Map<string, eng.Feedback[]>();
  for (const f of log.items) if (f.status === "changed" && f.rev) { const r = revs.find(x => x.sha.startsWith(f.rev!)); if (r) fbBy.set(r.sha, [...(fbBy.get(r.sha) || []), f]); }

  // ---- hero: the drawing sheet ----
  const say = m.lede.find(p => /vade mecum/i.test(p)) || "";
  const firstSentence = (m.intro.match(/^.*?\.(\s|$)/) || [m.intro])[0].trim();
  const sync = !repo.ok ? { cls: "warn", text: "No git history" }
    : repo.ahead == null ? { cls: "warn", text: "Not on GitHub yet" }
    : repo.ahead > 0 ? { cls: "warn", text: `${repo.ahead} to push` }
    : repo.behind ? { cls: "warn", text: `${repo.behind} behind GitHub` }
    : { cls: "ok", text: "Published" };
  const runs = S.github ? S.github.runs : [];
  const ci = runs.find(r => r.headSha === repo.head) || null;
  const titleBlock = `<div class="bp-titleblock" aria-label="Title block">
    <div class="bp-tb-cell bp-tb-wide"><span>Project</span><b>VADE · the method</b></div>
    <div class="bp-tb-cell bp-tb-rev" data-tip="${esc(cur ? `REV ${cur.letter} is revision ${revs.length} of main: ${cur.short}, ${dLong(cur.at)}.\nDrawings skip the letters I and O, which read as 1 and 0.` : "Reading the history…")}"><span>Rev</span><b>${esc(cur ? cur.letter : "…")}</b></div>
    <div class="bp-tb-cell"><span>Date</span><b>${esc(cur ? dLong(cur.at).toUpperCase() : "—")}</b></div>
    <div class="bp-tb-cell"><span>Scale</span><b>${m.rules.length} : ${m.foundations.length}</b><i>rules to foundations</i></div>
    <div class="bp-tb-cell" data-tip="${esc(repo.pushedAt ? `GitHub has main as of ${ago(repo.pushedAt)}` : "")}"><span>Status</span><b class="${sync.cls}">${esc(sync.text.toUpperCase())}</b></div>
    <div class="bp-tb-cell bp-tb-wide" data-tip="${esc(problems.length ? problems.map(p => `${p.where}: ${p.problem}`).join("\n") : "Every rule numbered in order, each with its Why, every reference to a rule that exists.")}"><span>Checked</span><b class="${problems.length ? "fail" : "ok"}">${problems.length ? `${problems.length} PROBLEM${problems.length === 1 ? "" : "S"}` : "README ✓"}${ci ? ` · CI ${ci.conclusion === "success" ? "✓" : ci.conclusion ? "✗" : "…"}` : ""}</b></div>
    <div class="bp-tb-cell"><span>Sheet</span><b>1 OF 1</b></div>
  </div>`;
  const hero = `<section class="bp-sheet bp-hero">
    <div class="bp-hero-text">
      <div class="bp-eyebrow">Drawing · personal projects, run with an AI agent</div>
      <div class="bp-mark" aria-label="VADE">VADE</div>
      <div class="bp-expand"><span>Vault</span><span>Agents</span><span>Dashboards</span><span>Engines</span><em>+ connectors</em></div>
      <p class="bp-intro">${md(firstSentence).replace(/^<p>|<\/p>$/g, "")}</p>
      ${say ? `<p class="bp-say">${md(say).replace(/^<p>|<\/p>$/g, "")}</p>` : ""}
      ${titleBlock}
    </div>
    <div class="bp-hero-drawing">${modelSvg(m, sum.byPart)}</div>
  </section>`;

  // ---- the strip of numbers ----
  const weekAgo = now - 7 * 86400000;
  const before = [...revs].reverse().find(r => r.at < weekAgo);
  const first = revs[0];
  const kpis: { v: string; l: string; s: string; tip?: string }[] = [
    { v: String(m.rules.length), l: "rules", s: before ? `+${m.rules.length - before.count} this week` : "", tip: m.parts.map(p => `${p.name}: ${p.rules.length}`).join("\n") },
    { v: String(revs.length || "…"), l: "revisions", s: cur ? `${cur.letter} landed ${ago(cur.at, now)}` : "reading…" },
    { v: first ? String(Math.max(0, Math.floor((now - first.at) / 86400000))) : "…", l: "days old", s: first ? `since ${dLong(first.at)}` : "" },
    { v: compact(m.words), l: "words", s: before ? `${m.words - before.words >= 0 ? "+" : ""}${compact(m.words - before.words)} this week` : "" },
    { v: String(fbOpen.length + fbAcc.length), l: "feedback open", s: fbAcc.length ? `${fbAcc.length} accepted, waiting` : fbOpen.length ? "waiting for a look" : "nothing waiting" },
    { v: String(archived.length), l: "requests answered", s: mail.length ? `${mail.length} waiting in InMail` : "InMail is empty" },
  ];
  const kpiHtml = `<div class="bp-kpis">${kpis.map(k => `<div class="bp-kpi"${k.tip ? ` data-tip="${esc(k.tip)}"` : ""}><div class="bp-kpi-value">${esc(k.v)}</div><div class="bp-kpi-label">${esc(k.l)}</div><div class="bp-kpi-sub">${esc(k.s)}</div></div>`).join("")}</div>`;
  const syncline = `<div class="bp-syncline"><b>${m.rules.length}</b> rules in <b>${m.parts.length}</b> parts · <b>${m.foundations.length}</b> foundations · REV <b>${esc(cur ? cur.letter : "…")}</b>${cur ? ` landed <b>${esc(ago(cur.at, now))}</b>` : ""} · GitHub <b>${esc(sync.text.toLowerCase())}</b>${S.github ? ` (asked ${esc(ago(S.github.at, now))})` : ""} · drawn <b>${esc(new Date(now).toTimeString().slice(0, 5))}</b></div>`;

  // ---- evolution ----
  const hist = ctx.jobStatus("history");
  let evolution: string;
  if (!revs.length) {
    evolution = `<div class="bp-empty">${hist.state !== "idle" ? "Reading the history from git…" : hist.last && !hist.last.ok ? `The history couldn't be read: ${esc(hist.last.message)}` : repo.ok ? "Reading the history from git…" : "This folder has no git history to draw."}</div>`;
  } else {
    const ptTip = (r: eng.Revision, what: string): string => `REV ${r.letter} · ${dLong(r.at)}\n${what}\n${eng.describe(r.subject, r.detail)}`;
    const rulesPts = revs.map(r => ({ t: r.at, v: r.count, tip: ptTip(r, `${r.count} rules${r.born.length ? ` (+${r.born.length})` : ""}`) }));
    const wordPts = revs.map(r => ({ t: r.at, v: r.words, tip: ptTip(r, `${r.words.toLocaleString("en-AU")} words`) }));
    evolution = `<div class="bp-charts">${stepChart("Rules", rulesPts, now, v => String(Math.round(v)))}${stepChart("Words in the README", wordPts, now, v => compact(Math.round(v)))}</div>
      <h3 class="bp-sub">Every rule's life, revision by revision</h3>
      ${lifelines(revs, m, sum, reqs, fbBy, titles)}`;
  }
  const evolutionTile = `<section class="bp-tile bp-tile--wide bp-paper" id="bp-evolution">
    <div class="bp-tile-head"><h2>Evolution</h2><span class="bp-tile-meta">${revs.length ? `${plural(revs.length, "revision")} of main since ${esc(dLong(revs[0].at))} · hover a mark, click it for its rule` : ""}</span></div>
    ${evolution}</section>`;

  // ---- feedback ----
  const ruleOptions = m.parts.map(p => `<optgroup label="${esc(p.name)}">${p.rules.map(n => `<option value="${n}">${n} · ${esc(titles.get(n) || "")}</option>`).join("")}</optgroup>`).join("");
  const pips = (c: eng.Cost): string => `<span class="bp-pips" data-tip="${esc(`Cost: ${eng.COSTS[c]}`)}" aria-label="${esc(eng.COSTS[c])}">${[1, 2, 3].map(i => `<i class="${i <= c ? "on" : ""}"></i>`).join("")}</span>`;
  const ruleChip = (n: number | null): string => n == null ? `<span class="bp-chip">whole method</span>` : `<a class="bp-chip bp-chip-rule" href="#bp-rule-${n}" data-tip="${esc(titles.get(n) || "No such rule now")}">rule ${n}</a>`;
  const card = (f: eng.Feedback): string => {
    const btns = f.status === "open"
      ? `<button class="bp-btn go" data-action="fbStatus" data-arg="${esc(JSON.stringify({ id: f.id, status: "accepted" }))}">Accept</button>
         <form class="bp-inline" data-action="fbStatus" data-arg="${esc(JSON.stringify({ id: f.id, status: "declined" }))}"><input name="note" placeholder="Why not?" aria-label="Why decline ${esc(f.id)}"><button class="bp-btn stop" type="submit">Decline</button></form>`
      : f.status === "accepted"
      ? `<button class="bp-btn go" data-action="fbStatus" data-arg="${esc(JSON.stringify({ id: f.id, status: "changed" }))}" data-confirm="${esc(`Mark ${f.id} changed in ${repo.short}, the commit main is on now?`)}">Changed it</button>
         <button class="bp-btn" data-action="fbStatus" data-arg="${esc(JSON.stringify({ id: f.id, status: "open" }))}">Back to open</button>`
      : `<button class="bp-btn" data-action="fbStatus" data-arg="${esc(JSON.stringify({ id: f.id, status: "open" }))}">Reopen</button>`;
    const rev = f.rev ? revs.find(r => r.sha.startsWith(f.rev!)) : undefined;
    return `<article class="bp-fb-card ${f.status}" id="bp-fb-${esc(f.id)}">
      <div class="bp-fb-top"><b class="bp-fb-id">${esc(f.id)}</b>${ruleChip(f.rule)}${pips(f.cost)}<span class="bp-fb-when" data-tip="${esc(f.at)}">${esc(f.from)} · ${esc(ago(Date.parse(f.at), now))}</span></div>
      <p class="bp-fb-text">${esc(f.text)}</p>
      ${f.note ? `<p class="bp-fb-note">${esc(f.note)}</p>` : ""}
      ${f.status === "changed" ? `<p class="bp-fb-note">Changed${rev ? ` in REV ${esc(rev.letter)}` : f.rev ? ` in ${esc(f.rev.slice(0, 7))}` : ""}${f.statusAt ? `, ${esc(ago(Date.parse(f.statusAt), now))}` : ""}.</p>` : ""}
      <div class="bp-fb-btns">${btns}</div></article>`;
  };
  const partBars = (() => {
    const max = Math.max(1, ...m.parts.map(p => sum.byPart[p.key] || 0), sum.general);
    const rows = [...m.parts.map(p => ({ name: p.name, key: p.key, w: sum.byPart[p.key] || 0 })), { name: "The whole method", key: "", w: sum.general }];
    if (!sum.weight) return `<div class="bp-empty">Nothing hurts yet. Open feedback shows here by part, weighed by what it costs.</div>`;
    return `<div class="bp-bars" role="table" aria-label="Open feedback by part, weighed by cost">${rows.map(r => `<div class="bp-bar-row" role="row"${r.key ? ` data-tip="${esc(`${r.name}: open feedback weighing ${r.w}`)}"` : ""}><span class="bp-bar-name" role="cell">${esc(r.name)}</span><span class="bp-bar" role="cell"><span class="bp-bar-fill" style="width:${((r.w / max) * 100).toFixed(1)}%"></span></span><span class="bp-bar-val" role="cell">${r.w || "–"}</span></div>`).join("")}</div>`;
  })();
  const flow = `<div class="bp-flow">
    <div class="bp-flow-step"><b>${sum.counts.open}</b><span>open</span></div><span class="bp-flow-arrow" aria-hidden="true">→</span>
    <div class="bp-flow-step"><b>${sum.counts.accepted}</b><span>accepted</span></div><span class="bp-flow-arrow" aria-hidden="true">→</span>
    <div class="bp-flow-step done"><b>${sum.counts.changed}</b><span>changed</span></div>
    <div class="bp-flow-step quiet"><b>${sum.counts.declined}</b><span>declined</span></div></div>`;
  const loader = path.join(ctx.projects, ".typescript", "register.cts");
  const cli = `node -r "${loader}" "${path.join(ctx.dir, "engine.ts")}" feedback add "<what's slow, and what the method could change>" --rule <n> --cost 2 --from <project>`;
  const fbBad = log.bad.length ? `<div class="bp-error">The feedback log has ${plural(log.bad.length, "line")} it can't read, kept as they are: ${log.bad.map(b => `line ${b.line} ${esc(b.why)}`).join("; ")}.</div>` : "";
  const feedbackTile = `<section class="bp-tile bp-tile--wide" id="bp-feedback">
    <div class="bp-tile-head"><h2>Feedback</h2><span class="bp-tile-meta">what's slow, clumsy or missing, and what the method could change</span></div>
    ${fbErr ? `<div class="bp-error">The feedback log can't be read: ${esc(fbErr)}</div>` : ""}${fbBad}
    <div class="bp-fb">
      <form class="bp-fb-form" data-action="feedback">
        <label class="bp-field"><span>What isn't efficient enough?</span>
          <textarea name="text" rows="4" required placeholder="Where the method makes you or an agent do more than it should, and what could change. One problem per note."></textarea></label>
        <div class="bp-fb-row">
          <label class="bp-field"><span>About</span><select name="rule"><option value="">The whole method</option>${ruleOptions}</select></label>
          <label class="bp-field"><span>It costs</span><select name="cost"><option value="1">${esc(eng.COSTS[1])}</option><option value="2" selected>${esc(eng.COSTS[2])}</option><option value="3">${esc(eng.COSTS[3])}</option></select></label>
          <button class="bp-btn primary" type="submit">Pin it to the board</button>
        </div>
        <div class="bp-fb-cli">Agents in any project add it with <code class="bp-copy" data-copy="${esc(cli)}" data-tip="Click to copy">engine.ts feedback add</code> · <span class="bp-link" data-action="review" data-tip="Copies a prompt that asks Claude to review the open feedback and propose changes">Ask Claude to review it</span></div>
      </form>
      <div class="bp-fb-side">${flow}<h3 class="bp-sub">Where it hurts, by part</h3>${partBars}</div>
    </div>
    <div class="bp-board">
      <div class="bp-col"><h3 class="bp-sub">Open <span>${fbOpen.length}</span></h3>${fbOpen.length ? fbOpen.map(card).join("") : `<div class="bp-empty">Nothing open. When something in the method costs time, pin it here.</div>`}</div>
      <div class="bp-col"><h3 class="bp-sub">Accepted <span>${fbAcc.length}</span></h3>${fbAcc.length ? fbAcc.map(card).join("") : `<div class="bp-empty">Accepted feedback waits here until the change lands.</div>`}</div>
      <div class="bp-col"><h3 class="bp-sub">Done <span>${fbDone.length}</span></h3>${fbDone.length ? fbDone.slice(0, 6).map(card).join("") + (fbDone.length > 6 ? `<details class="bp-more"><summary>${fbDone.length - 6} more</summary>${fbDone.slice(6).map(card).join("")}</details>` : "") : `<div class="bp-empty">Changed and declined feedback ends up here.</div>`}</div>
    </div></section>`;

  // ---- the method: foundations, then every rule ----
  const lastTouched = (n: number): eng.Revision | undefined => [...revs].reverse().find(r => r.born.includes(n) || r.changed.includes(n));
  const bornIn = (n: number): eng.Revision | undefined => revs.find(r => r.born.includes(n));
  const fbOn = (n: number): eng.Feedback[] => log.items.filter(f => f.rule === n && (f.status === "open" || f.status === "accepted"));
  const ruleHtml = (r: eng.Rule): string => {
    const lt = lastTouched(r.n), b = bornIn(r.n), fb = fbOn(r.n);
    const changedIn = revs.filter(x => x.changed.includes(r.n)).map(x => x.letter);
    const search = `${r.n} ${r.title} ${r.body}`.toLowerCase().replace(/\s+/g, " ");
    const links = (ns: number[]): string => ns.map(n => `<a class="bp-ref" href="#bp-rule-${n}" data-tip="${esc(titles.get(n) || "")}">${n}</a>`).join(", ");
    return `<details class="bp-rule" id="bp-rule-${r.n}" data-search="${esc(search)}">
      <summary><span class="bp-rule-n">${r.n}</span><span class="bp-rule-title">${esc(r.title)}</span><span class="bp-rule-chips">${fb.length ? `<span class="bp-chip bp-chip-fb" data-tip="${esc(fb.map(f => `${f.id}: ${f.text.slice(0, 100)}`).join("\n"))}">${fb.length} open</span>` : ""}${lt ? `<span class="bp-chip" data-tip="${esc(`Last touched in REV ${lt.letter}, ${dLong(lt.at)}`)}">${esc(lt.letter)}</span>` : ""}</span></summary>
      <div class="bp-rule-body">${md(r.body)}</div>
      <div class="bp-rule-foot">
        ${b ? `<span>Written in REV <b>${esc(b.letter)}</b>${changedIn.length ? `, changed in ${changedIn.map(esc).join(", ")}` : ""}</span>` : ""}
        ${r.refs.length ? `<span>Points at ${links(r.refs)}</span>` : ""}
        ${back[r.n] ? `<span>Pointed at by ${links(back[r.n])}</span>` : ""}
        <a class="bp-link" href="#bp-feedback" data-fb-rule="${r.n}">Feedback on this rule</a>
      </div></details>`;
  };
  const partHtml = (p: eng.Part): string => {
    const row = m.model.find(x => x.part.toLowerCase() === p.name.toLowerCase());
    return `<div class="bp-part" id="bp-part-${esc(p.key)}">
      <div class="bp-part-head"><span class="bp-part-name">${esc(p.name)}</span><span class="bp-part-tag">${esc(p.tagline)}</span><span class="bp-part-count">${p.rules.length}</span></div>
      ${row ? `<dl class="bp-spec"><dt>Its job</dt><dd>${esc(row.job)}</dd><dt>Never</dt><dd>${esc(row.never)}</dd></dl>` : ""}
      ${p.rules.map(n => m.rules.find(r => r.n === n)!).map(ruleHtml).join("")}</div>`;
  };
  const methodTile = `<section class="bp-tile bp-tile--wide" id="bp-method">
    <div class="bp-tile-head"><h2>The method</h2><span class="bp-tile-meta"><span class="bp-link" data-open="${esc(project)}/README">read the README as a page</span>${repo.github ? ` · <span class="bp-link" data-url="${esc(`https://github.com/${repo.github}`)}">on GitHub</span>` : ""}</span></div>
    <div class="bp-foundations">${m.foundations.map(f => `<div class="bp-foundation"><span class="bp-foundation-n">${f.n}</span><b>${esc(f.title)}</b><p>${esc(f.body)}</p></div>`).join("")}</div>
    <div class="bp-filterbar"><input class="bp-filter" type="search" placeholder="Find a rule: worktree, secrets, phone, undo…" aria-label="Find a rule"><span class="bp-filter-count">${plural(m.rules.length, "rule")}</span>
      <span class="bp-link" data-bp-expand="1">open all</span> · <span class="bp-link" data-bp-expand="0">close all</span></div>
    ${problems.length ? `<div class="bp-error">README.md has ${plural(problems.length, "problem")}: ${problems.map(p => `${esc(p.where)} ${esc(p.problem)}`).join("; ")}.</div>` : ""}
    <div class="bp-parts">${m.parts.map(partHtml).join("")}</div></section>`;

  // ---- the repo ----
  const tools = S.tools;
  const ciLine = S.github ? (S.github.error ? fact("warn", "GitHub's check", esc(S.github.error))
    : ci ? fact(ci.conclusion === "success" ? "ok" : ci.conclusion ? "fail" : "warn", "GitHub's check", `<span class="bp-link" data-url="${esc(ci.url)}">${esc(ci.conclusion || ci.status)}</span> · ${esc(ago(Date.parse(ci.createdAt), now))}`, ci.displayTitle)
    : runs[0] ? fact("na", "GitHub's check", `none for ${esc(repo.short)} yet; last <span class="bp-link" data-url="${esc(runs[0].url)}">${esc(runs[0].conclusion || runs[0].status)}</span>`)
    : fact("na", "GitHub's check", "none yet")) : fact("na", "GitHub's check", "asking…");
  const repoTile = `<section class="bp-tile" id="bp-repo"><div class="bp-tile-head"><h2>The repository</h2><span class="bp-tile-meta">${repo.github ? `<span class="bp-link" data-url="${esc(`https://github.com/${repo.github}`)}">open on GitHub</span>` : "public"}</span></div>
    <div class="bp-facts">
      ${fact(repo.branch === "main" ? "ok" : "warn", "Branch", `${esc(repo.branch)}${repo.short ? ` at <code>${esc(repo.short)}</code>` : ""}`)}
      ${fact(repo.dirty ? "warn" : "ok", "Working tree", repo.dirty ? `${plural(repo.dirty, "file")} not committed` : "clean")}
      ${fact(sync.cls === "ok" ? "ok" : "warn", "GitHub", `${esc(sync.text)}${repo.pushedAt ? ` · its main is from ${esc(ago(repo.pushedAt, now))}` : ""}`)}
      ${ciLine}
      ${fact(repo.hooksPath === ".githooks" ? "ok" : "fail", "Leak check hooks", repo.hooksPath === ".githooks" ? "wired (.githooks)" : `not wired: run <code>git config core.hooksPath .githooks</code>`)}
      ${fact(repo.machineHooks === "found" ? "ok" : repo.machineHooks === "none" ? "na" : "warn", "Machine's own hooks", repo.machineHooks === "found" ? "found, run first" : repo.machineHooks === "none" ? "none set" : "named but missing")}
      ${fact(tools ? (tools.gitleaks ? "ok" : "fail") : "na", "gitleaks", tools ? (tools.gitleaks ? esc(tools.gitleaks) : "not installed: secrets go unchecked") : "…")}
      ${fact(repo.blocklist ? "ok" : "fail", "Blocklist", repo.blocklist ? `${plural(repo.blocklist, "entry", "entries")}, never shown` : "missing: the leak check fails closed")}
      ${fact(repo.allowed != null ? "ok" : "na", "Allowed identities", repo.allowed != null ? plural(repo.allowed, "identity", "identities") : "none")}
      ${fact(repo.worktrees.length ? "warn" : "ok", "Worktrees", repo.worktrees.length ? repo.worktrees.map(esc).join(", ") : "none open")}
    </div></section>`;

  // ---- health ----
  const h = readHealth(ctx);
  const healthTile = `<section class="bp-tile" id="bp-health"><div class="bp-tile-head"><h2>Project health</h2><span class="bp-tile-meta">${h.row ? (h.row.ok ? "follows every rule" : `${plural(h.row.fails, "rule")} broken`) : ""}${h.checksAt ? ` · checks ${esc(ago(h.checksAt, now))}` : ""}</span></div>
    ${h.error ? `<div class="bp-empty">${esc(h.error)}</div>` : !h.row ? `<div class="bp-empty">Project health doesn't list this folder.</div>`
      : `<div class="bp-facts">${h.rules.map(r => { const c = h.row!.cells[r.id]; if (!c) return ""; const s = (["ok", "fail", "warn", "na"].includes(c.state) ? c.state : "warn") as "ok" | "fail" | "warn" | "na"; return fact(s, r.label + (r.rule ? ` · rule ${r.rule}` : ""), esc(c.text), c.why); }).join("")}</div>`}
  </section>`;

  // ---- InMail ----
  const rel = (f: string): string => path.relative(ctx.projects, f).split(path.sep).join("/").replace(/\.md$/, "");
  const msgRow = (q: eng.Request, archivedRow: boolean): string => {
    const r = archivedRow ? eng.answeredBy(q, revs) : null;
    return `<div class="bp-row" data-open="${esc(rel(q.file))}"><span class="bp-row-main">${esc(q.subject)}</span><span class="bp-row-meta">${esc(q.from)}${q.sent ? ` · ${esc(dShort(q.sent))}` : ""}${r ? ` · REV ${esc(r.letter)}` : ""}</span></div>`;
  };
  const inboxTile = `<section class="bp-tile" id="bp-inbox"><div class="bp-tile-head"><h2>InMail</h2><span class="bp-tile-meta">requests from other projects</span></div>
    ${mailErr ? `<div class="bp-error">${esc(mailErr)}</div>` : ""}
    <h3 class="bp-sub">Waiting <span>${mail.length}</span></h3>
    ${mail.length ? `<div class="bp-list">${mail.map(q => msgRow(q, false)).join("")}</div>` : `<div class="bp-empty">Nothing waiting.</div>`}
    <h3 class="bp-sub">Answered <span>${archived.length}</span></h3>
    ${archived.length ? `<div class="bp-list">${archived.slice(0, 6).map(q => msgRow(q, true)).join("")}</div>` : `<div class="bp-empty">None yet.</div>`}
  </section>`;

  // ---- actions ----
  const ahead = repo.ahead || 0;
  // the one primary button is the push, and only while there's something to push
  const jobBtn = (key: string, label: string, idle: string, extra = ""): string => {
    const j = ctx.jobStatus(key);
    return `<div class="bp-action"><button class="bp-btn${key === "push" && ahead ? " primary" : ""}" data-action="${key}"${extra} ${j.state !== "idle" ? "disabled" : ""}>${esc(j.state === "running" ? `${label}…` : label)}</button>${jobLine(j, idle)}</div>`;
  };
  const run = `node -r ../.typescript/register.cts engine.ts`;
  const cmds: [string, string][] = [
    [`${run} status`, "the method in numbers"], [`${run} check`, "numbering, reasons, references"],
    [`${run} history`, "every revision"], [`${run} feedback`, "what's open"],
    [`bash scripts/test-leak-check.sh && node ../.typescript/check.cts`, "the check"], [`bash scripts/leak-check.sh --all`, "the whole history"],
  ];
  const actionsTile = `<section class="bp-tile" id="bp-actions"><div class="bp-tile-head"><h2>Actions</h2><span class="bp-tile-meta">each is a command too</span></div>
    <div class="bp-actions">
      ${jobBtn("check", "Run the check", "the leak check's tests, then tsc and the tests")}
      ${jobBtn("leaks", "Leak-check every commit", "gitleaks and the blocklist over the whole history")}
      ${jobBtn("push", ahead ? `Push ${plural(ahead, "commit")} to GitHub` : "Push to GitHub", ahead ? "public: only when you mean it" : "nothing to push", ` data-confirm="${esc(`Push main to the public repo on GitHub${repo.github ? ` (${repo.github})` : ""}? The hooks run the leak check first.`)}"`)}
      ${jobBtn("github", "Ask GitHub again", "fetches, then asks for its last checks")}
    </div>
    <div class="bp-cmds">${cmds.map(([c, n]) => `<div class="bp-cmd" data-copy="${esc(c)}"><code>${esc(c)}</code><span>${esc(n)}</span></div>`).join("")}</div>
  </section>`;

  return `<div class="bp-root">${hero}${syncline}${kpiHtml}<div class="bp-grid">${evolutionTile}${feedbackTile}${methodTile}${repoTile}${healthTile}${inboxTile}${actionsTile}</div></div>`;
}

// ---------------------------------------------------------------- live and actions

/** While a page is open: GitHub every ten minutes, gitleaks' version once. */
export function live(ctx: BpCtx): () => void {
  const tick = (): void => {
    const S = st(ctx);
    if (!S.tools) void ctx.job("tools", () => readTools(ctx));
    if (!S.github || Date.now() - S.github.at > 10 * 60000) void ctx.job("github", () => refreshGitHub(ctx));
  };
  tick();
  const t = setInterval(tick, 60000);
  return () => clearInterval(t);
}

const obj = (arg: unknown): Record<string, unknown> => {
  if (arg && typeof arg === "object") return arg as Record<string, unknown>;
  if (typeof arg === "string") { try { const o = JSON.parse(arg); if (o && typeof o === "object") return o; } catch { /* a plain string */ } }
  return {};
};

export const actions = {
  feedback(ctx: BpCtx, arg: unknown): ActionResult {
    const a = obj(arg);
    const m = eng.parseReadme(eng.readText(path.join(ctx.dir, "README.md")));
    const res = eng.saveFeedback(eng.feedbackFile(ctx.dir), c => eng.addFeedback(c, { text: a.text, rule: a.rule, cost: a.cost, from: a.from || "you" }, { rules: m.rules.map(r => r.n) }));
    return res.ok ? `${res.message} It's on the board.` : { ok: false, message: res.error };
  },
  async fbStatus(ctx: BpCtx, arg: unknown): Promise<ActionResult> {
    const a = obj(arg);
    let rev = "";
    if (a.status === "changed") { const r = await git(ctx.dir, ["rev-parse", "main"]); if (r.ok) rev = r.out.trim(); }
    const res = eng.saveFeedback(eng.feedbackFile(ctx.dir), c => eng.setStatus(c, a.id, a.status, { note: a.note, rev }));
    return res.ok ? res.message : { ok: false, message: res.error };
  },
  review(ctx: BpCtx): ActionResult {
    const log = eng.parseFeedback(eng.readText(eng.feedbackFile(ctx.dir)));
    const open = log.items.filter(i => i.status === "open" || i.status === "accepted");
    if (!open.length) return { ok: false, message: "There's no open feedback to review." };
    const prompt = `Review Blueprint's open feedback: run \`node -r ../.typescript/register.cts engine.ts feedback\` here. For each piece, say whether the method should change, and propose the smallest change to README.md that answers it (keep the rule numbers stable; a new rule takes the next number), or say why it shouldn't change. Don't edit yet: list the proposals for me to pick. ${open.length === 1 ? "There is 1 piece." : `There are ${open.length} pieces.`}`;
    return { message: "A review prompt is on the clipboard: paste it into a Claude session in Blueprint.", copy: prompt };
  },
  check(ctx: BpCtx): ActionResult { void ctx.job("check", () => runCheck(ctx.dir)); return "Running the check…"; },
  leaks(ctx: BpCtx): ActionResult { void ctx.job("leaks", () => runLeaks(ctx.dir)); return "Leak-checking every commit…"; },
  push(ctx: BpCtx): ActionResult {
    if (ctx.remote) return { ok: false, message: "Push from the PC: a public push waits for you there." };
    void ctx.job("push", () => runPush(ctx)); return "Pushing to GitHub…";
  },
  github(ctx: BpCtx): ActionResult { void ctx.job("github", () => refreshGitHub(ctx)); return "Asking GitHub…"; },
};
