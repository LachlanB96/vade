// ============================================================
// Blueprint's engine: the method in README.md read as data, how it grew (main's revisions, from git), the
// requests other projects sent it (their InMail, once archived), and the feedback log. VADE applied to itself:
// one file that is both the CLI and the module the dashboard imports (rules 22 and 23).
//
//   node -r ../.typescript/register.cts engine.ts help
//
// The decisions are pure: text in, new text or a refusal with a reason out. The caller saves (rule 24), through
// saveFeedback, which re-reads the file, applies the change and writes it atomically.
//
// Data:  README.md                 the method (rules, parts, foundations, the model)
//        private/feedback.jsonl    the feedback log, one event per line, appended only (rule 26). git-ignored and
//                                  refused by the leak check: feedback names real projects, and this repo is public
//        git, main's first parent  each landed change is a revision, lettered as drawings are (A, B, ... no I or O)
// ============================================================
import fs from "fs";
import path from "path";
import cp from "child_process";

/** The folder the engine reads: BLUEPRINT_DIR (a test's scratch copy, rule 28) or its own. */
export const DIR = process.env.BLUEPRINT_DIR || __dirname;
export const feedbackFile = (dir: string = DIR): string => path.join(dir, "private", "feedback.jsonl");

const errMsg = (e: unknown): string => String((e as Error | null)?.message ?? e);
const isMissing = (e: unknown): boolean => (e as NodeJS.ErrnoException | null)?.code === "ENOENT";
/** A file's text, or "" when it doesn't exist. Anything else (permissions) throws. */
export function readText(file: string): string {
  try { return fs.readFileSync(file, "utf8"); } catch (e) { if (isMissing(e)) return ""; throw e; }
}
/** Writes atomically: a temporary file beside it, then renamed over it, so a reader never sees half. */
export function writeAtomic(file: string, text: string): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, text);
  fs.renameSync(tmp, file);
}

// ---------------------------------------------------------------- the method

export interface Rule { n: number; title: string; part: string; body: string; why: string | null; refs: number[]; line: number }
export interface Part { key: string; name: string; tagline: string; rules: number[] }
export interface Foundation { n: number; title: string; body: string }
export interface ModelRow { part: string; job: string; holds: string; never: string }
/** intro: the first paragraph under the title. lede: every paragraph before the first section, the intro first. */
export interface Method { intro: string; lede: string[]; foundations: Foundation[]; parts: Part[]; rules: Rule[]; model: ModelRow[]; words: number; sections: string[] }

const slug = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
export const countWords = (text: string): number => (text.match(/\S+/g) || []).length;

/** The rule numbers a text points at: "rule 7", "Rule 12", "rules 37 and 45", "rules 4, 12 and 38". */
export function refsIn(text: string): number[] {
  const out = new Set<number>();
  for (const m of text.matchAll(/\brules? (\d+(?:(?:,? and |, | or )\d+)*)/gi)) for (const d of m[1].match(/\d+/g)!) out.add(Number(d));
  return [...out].sort((a, b) => a - b);
}

/** README.md as data. A README from before the rules existed gives empty lists, never a throw. */
export function parseReadme(text: string): Method {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const parts: Part[] = [], rules: Rule[] = [], sections: string[] = [];
  const under: Record<string, string[]> = {};
  const head: string[] = [];
  let h2 = "", part: Part | null = null, rule: Rule | null = null, buf: string[] = [], fence = false;
  const flush = (): void => {
    if (rule) {
      rule.body = buf.join("\n").trim();
      const why = /^\*\*Why:\*\*\s*(.+)$/m.exec(rule.body);
      rule.why = why ? why[1].trim() : null;
      rule.refs = refsIn(rule.body).filter(n => n !== rule!.n);
    }
    buf = []; rule = null;
  };
  lines.forEach((line, i) => {
    if (/^```/.test(line)) fence = !fence;
    let m: RegExpExecArray | null;
    if (!fence && (m = /^## (.+)$/.exec(line))) { flush(); part = null; h2 = m[1].trim(); sections.push(h2); under[h2] = []; return; }
    if (!fence && h2 === "The rules" && (m = /^### ([^:]+?)(?::\s*(.+))?$/.exec(line))) {
      flush(); part = { key: slug(m[1]), name: m[1].trim(), tagline: (m[2] || "").trim(), rules: [] }; parts.push(part); return;
    }
    if (!fence && h2 === "The rules" && (m = /^#### (\d+)\.\s+(.+)$/.exec(line))) {
      flush();
      rule = { n: Number(m[1]), title: m[2].trim(), part: part ? part.key : "", body: "", why: null, refs: [], line: i + 1 };
      rules.push(rule); if (part) part.rules.push(rule.n); return;
    }
    if (rule) buf.push(line); else if (h2) under[h2].push(line); else head.push(line);
  });
  flush();

  const lede = head.filter(l => !/^# /.test(l)).join("\n").trim().split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);
  const intro = lede[0] || "";
  const foundations: Foundation[] = [];
  for (const l of under["Foundations"] || []) {
    const m = /^(\d+)\.\s+\*\*(.+?)\*\*\s*(.*)$/.exec(l);
    if (m) foundations.push({ n: Number(m[1]), title: m[2].replace(/[.:]$/, "").trim(), body: m[3].trim() });
  }
  const model: ModelRow[] = [];
  for (const l of under["The model"] || []) {
    const m = /^\|\s*\*\*(.+?)\*\*\s*\|(.+?)\|(.+?)\|(.+?)\|\s*$/.exec(l);
    if (m) model.push({ part: m[1].trim(), job: m[2].trim(), holds: m[3].trim(), never: m[4].trim() });
  }
  return { intro, lede, foundations, parts, rules, model, words: countWords(text), sections };
}

export interface Problem { where: string; problem: string }

/** What's wrong with the method as written: numbering, a rule without its reason, a reference to no rule. */
export function checkMethod(m: Method, text: string): Problem[] {
  const out: Problem[] = [];
  const nums = m.rules.map(r => r.n);
  nums.forEach((n, i) => { if (n !== i + 1) out.push({ where: `rule ${n}`, problem: `is rule number ${i + 1} in order: rules are numbered 1, 2, 3 and so on, with no gaps or repeats` }); });
  for (const r of m.rules) {
    if (!r.part) out.push({ where: `rule ${r.n}`, problem: "sits under no part heading (### Vault: ..., ### Agents: ...)" });
    if (!r.why) out.push({ where: `rule ${r.n}`, problem: "has no **Why:** line" });
  }
  const known = new Set(nums);
  text.replace(/\r\n?/g, "\n").split("\n").forEach((l, i) => {
    for (const n of refsIn(l)) if (!known.has(n)) out.push({ where: `README.md:${i + 1}`, problem: `points at rule ${n}, and the rules run 1 to ${nums.length}` });
  });
  m.foundations.forEach((f, i) => { if (f.n !== i + 1) out.push({ where: `foundation ${f.n}`, problem: `is foundation number ${i + 1} in order` }); });
  return out;
}

/** The rules that point at each rule (the other half of Rule.refs). */
export function pointedAt(m: Method): Record<number, number[]> {
  const out: Record<number, number[]> = {};
  for (const r of m.rules) for (const n of r.refs) (out[n] = out[n] || []).push(r.n);
  return out;
}

// ---------------------------------------------------------------- revisions

/** What a revision's README holds, as the history cache keeps it. */
export interface RevisionData {
  sha: string; at: number; subject: string; commits: number; words: number; foundations: number;
  rules: Record<string, { title: string; hash: string }>;
  detail?: string;   // a merge whose subject is only "Merge <branch>": its branch's last commit message
  fh?: string;       // the foundations' text, hashed
}
export interface Revision extends RevisionData {
  i: number; letter: string; short: string; count: number;
  born: number[]; changed: number[]; gone: number[]; foundationsChanged: boolean;
}

/** Revision letters as drawings have them: no I, O, Q, S, X or Z, which read as digits. A, ..., Y, then AA. */
export const LETTERS = "ABCDEFGHJKLMNPRTUVWY";
export function letter(i: number): string {
  let s = "", k = i + 1;
  while (k > 0) { const r = (k - 1) % LETTERS.length; s = LETTERS[r] + s; k = Math.floor((k - 1) / LETTERS.length); }
  return s;
}

/** FNV-1a, enough to tell whether a rule's text changed. */
function hash(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(16).padStart(8, "0");
}
const norm = (s: string): string => s.replace(/\s+/g, " ").trim();

export function digest(sha: string, at: number, subject: string, commits: number, readme: string, detail?: string): RevisionData {
  const m = parseReadme(readme);
  const rules: RevisionData["rules"] = {};
  for (const r of m.rules) rules[r.n] = { title: r.title, hash: hash(norm(r.title + "\n" + r.body)) };
  return { sha, at, subject, commits, words: m.words, foundations: m.foundations.length, rules,
    ...(detail ? { detail } : {}),
    ...(m.foundations.length ? { fh: hash(m.foundations.map(f => norm(f.title + f.body)).join("|")) } : {}) };
}

/** Each revision against the one before it: the rules it added, changed and removed. */
export function compare(datas: RevisionData[]): Revision[] {
  return datas.map((d, i) => {
    const prev = i ? datas[i - 1] : null;
    const nums = Object.keys(d.rules).map(Number).sort((a, b) => a - b);
    const before = prev ? prev.rules : {};
    const born = nums.filter(n => !before[n]);
    const changed = nums.filter(n => before[n] && before[n].hash !== d.rules[n].hash);
    const gone = Object.keys(before).map(Number).filter(n => !d.rules[n]).sort((a, b) => a - b);
    return { ...d, i, letter: letter(i), short: d.sha.slice(0, 7), count: nums.length, born, changed, gone,
      foundationsChanged: !!prev && prev.fh !== d.fh && d.foundations > 0 };
  });
}

const BARE_MERGE = /^Merge (branch )?'?[\w./-]+'?( into [\w./-]+)?$/;
/** What a revision did, in a line: a merge's own words without "Merge <branch>: " and "Check passed", or, for a
 *  merge that only names its branch, its branch's last commit message. */
export function describe(subject: string, detail?: string): string {
  const s = (BARE_MERGE.test(subject) && detail ? detail : subject)
    .replace(/^Merge (branch )?'?[\w./-]+'?:\s*/, "").replace(/\.?\s*Check passed\.?$/i, "").trim();
  return s ? s[0].toUpperCase() + s.slice(1) : subject;
}

interface Run { ok: boolean; code: number | null; out: string }
function git(dir: string, args: string[], timeout = 20000): Promise<Run> {
  return new Promise(res => cp.execFile("git", ["-C", dir, ...args], { windowsHide: true, timeout, maxBuffer: 1 << 26 },
    (err, out) => res({ ok: !err, code: err ? (typeof (err as { code?: unknown }).code === "number" ? (err as { code: number }).code : 1) : 0, out: String(out) })));
}

// 2: dates are when a revision was written (author date), not when it was last rewritten
const CACHE_VERSION = 2;
interface HistoryCache { version: typeof CACHE_VERSION; revisions: Record<string, RevisionData> }
export function readHistoryCache(file: string): HistoryCache {
  const text = readText(file);
  if (!text) return { version: CACHE_VERSION, revisions: {} };
  try { const c = JSON.parse(text) as HistoryCache; return c && c.version === CACHE_VERSION && c.revisions ? c : { version: CACHE_VERSION, revisions: {} }; }
  catch { return { version: CACHE_VERSION, revisions: {} }; }   // a cache: rebuilt from git, so a broken one is only slower
}

/** main's revisions from git, oldest first: each first-parent commit, its README read once and cached by commit. */
export async function readHistory(dir: string, cacheFile: string, branch = "main"): Promise<Revision[]> {
  const log = await git(dir, ["log", "--first-parent", "--format=%H%x1f%at%x1f%P%x1f%s", branch]);
  if (!log.ok) throw new Error(`git log ${branch} failed in ${path.basename(dir)}`);
  const cache = readHistoryCache(cacheFile);
  const rows = log.out.split("\n").filter(Boolean).map(l => { const [sha, at, parents, subject] = l.split("\x1f"); return { sha, at: Number(at) * 1000, parents: parents.split(" ").filter(Boolean), subject }; }).reverse();
  let dirty = false;
  const datas: RevisionData[] = [];
  for (const r of rows) {
    let d = cache.revisions[r.sha];
    if (!d) {
      const merge = r.parents.length > 1;
      const none: Run = { ok: true, code: 0, out: "" };
      const [readme, count, detail] = await Promise.all([
        git(dir, ["show", `${r.sha}:README.md`]),
        merge ? git(dir, ["rev-list", "--count", `${r.parents[0]}..${r.sha}`]) : Promise.resolve({ ...none, out: "1" }),
        merge && BARE_MERGE.test(r.subject) ? git(dir, ["log", "-1", "--format=%s", r.parents[1]]) : Promise.resolve(none),
      ]);
      // a merge's count includes the merge commit itself
      const commits = Math.max(1, (Number(count.out.trim()) || 1) - (merge ? 1 : 0));
      d = digest(r.sha, r.at, r.subject, commits, readme.ok ? readme.out : "", detail.out.trim() || undefined);
      cache.revisions[r.sha] = d; dirty = true;
    }
    datas.push(d);
  }
  if (dirty) { try { writeAtomic(cacheFile, JSON.stringify(cache)); } catch { /* only a cache */ } }
  return compare(datas);
}

// ---------------------------------------------------------------- requests (archived InMail)

export interface Request { file: string; from: string; sent: number | null; archived: number | null; subject: string }
const when = (s: string | undefined): number | null => { if (!s) return null; const t = Date.parse(s); return Number.isNaN(t) ? null : t; };

/** A message's frontmatter: from, sent, subject, archived. */
export function parseMessage(file: string, text: string): Request {
  const fm = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
  const f: Record<string, string> = {};
  for (const l of (fm ? fm[1] : "").split(/\r?\n/)) { const m = /^(\w+):\s*(.*)$/.exec(l); if (m) f[m[1]] = m[2].replace(/^"(.*)"$/, "$1").trim(); }
  return { file, from: f.from || "", sent: when(f.sent), archived: when(f.archived), subject: f.subject || path.basename(file, ".md") };
}

/** Every message in a folder (InMail, or its archive), newest first. A missing folder has none. */
export function readMessages(folder: string): Request[] {
  let names: string[] = [];
  try { names = fs.readdirSync(folder).filter(n => n.endsWith(".md")); } catch (e) { if (!isMissing(e)) throw e; }
  return names.map(n => parseMessage(path.join(folder, n), fs.readFileSync(path.join(folder, n), "utf8")))
    .sort((a, b) => (b.sent || 0) - (a.sent || 0));
}

/** The revision that answered a request: the last one that landed by the time it was archived (two minutes' grace). */
export function answeredBy(req: Request, revs: Revision[]): Revision | null {
  if (req.archived == null) return null;
  let best: Revision | null = null;
  for (const r of revs) if (r.at <= req.archived + 120000 && (req.sent == null || r.at >= req.sent)) best = r;
  return best;
}

// ---------------------------------------------------------------- feedback

export type Cost = 1 | 2 | 3;
export const COSTS: Record<Cost, string> = { 1: "minor", 2: "slows things down", 3: "costs real time" };
export const STATUSES = ["open", "accepted", "changed", "declined"] as const;
export type FbStatus = typeof STATUSES[number];
export interface FbAdd { type: "add"; id: string; at: string; from: string; text: string; rule: number | null; cost: Cost }
export interface FbSet { type: "status"; id: string; at: string; status: FbStatus; note?: string; rev?: string }
export type FbEvent = FbAdd | FbSet;
export interface Feedback {
  id: string; at: string; from: string; text: string; rule: number | null; cost: Cost;
  status: FbStatus; statusAt: string | null; note: string | null; rev: string | null; line: number;
}
export interface FbLog { items: Feedback[]; bad: { line: number; why: string }[] }
export type Change = { ok: true; content: string; item: Feedback; message: string } | { ok: false; error: string };

const isCost = (c: unknown): c is Cost => c === 1 || c === 2 || c === 3;

/** The log as items with their current status. A line it can't read is kept in the file and flagged (rule 25). */
export function parseFeedback(content: string): FbLog {
  const items: Feedback[] = [], bad: FbLog["bad"] = [];
  const byId = new Map<string, Feedback>();
  content.split(/\r?\n/).forEach((raw, i) => {
    const line = i + 1;
    if (!raw.trim()) return;
    let e: FbEvent;
    try { e = JSON.parse(raw); } catch { bad.push({ line, why: "isn't JSON" }); return; }
    if (!e || typeof e !== "object" || typeof e.id !== "string") { bad.push({ line, why: "has no id" }); return; }
    if (e.type === "add") {
      if (byId.has(e.id)) { bad.push({ line, why: `adds ${e.id} again` }); return; }
      if (typeof e.text !== "string" || !e.text.trim()) { bad.push({ line, why: `${e.id} has no text` }); return; }
      const it: Feedback = { id: e.id, at: String(e.at || ""), from: String(e.from || ""), text: e.text, rule: typeof e.rule === "number" ? e.rule : null,
        cost: isCost(e.cost) ? e.cost : 2, status: "open", statusAt: null, note: null, rev: null, line };
      byId.set(e.id, it); items.push(it);
    } else if (e.type === "status") {
      const it = byId.get(e.id);
      if (!it) { bad.push({ line, why: `sets the status of ${e.id}, which no earlier line adds` }); return; }
      if (!(STATUSES as readonly string[]).includes(e.status)) { bad.push({ line, why: `gives ${e.id} the status "${String(e.status)}"` }); return; }
      it.status = e.status; it.statusAt = String(e.at || ""); it.note = e.note || null; it.rev = e.status === "changed" ? (e.rev || null) : null;
    } else bad.push({ line, why: `is a "${String((e as { type?: unknown }).type)}" event, not add or status` });
  });
  return { items, bad };
}

const append = (content: string, e: FbEvent): string => (content && !content.endsWith("\n") ? content + "\n" : content) + JSON.stringify(e) + "\n";
const nextId = (items: Feedback[]): string => "F" + (Math.max(0, ...items.map(i => Number(i.id.slice(1)) || 0)) + 1);

export interface FbInput { text: unknown; rule?: unknown; cost?: unknown; from?: unknown }
/** Adds a piece of feedback. The same text from the same sender twice within two minutes is one (a double press). */
export function addFeedback(content: string, input: FbInput, o: { rules?: number[]; now?: Date } = {}): Change {
  const text = String(input.text ?? "").replace(/\r\n?/g, "\n").trim();
  if (!text) return { ok: false, error: "Say what's slow, clumsy or missing: the feedback is empty." };
  if (text.length > 4000) return { ok: false, error: `That's ${text.length} characters. Keep it under 4,000, or split it into one piece per problem.` };
  let rule: number | null = null;
  if (input.rule !== undefined && input.rule !== null && String(input.rule).trim() !== "") {
    rule = Number(String(input.rule).replace(/^rule\s*/i, ""));
    const rules = o.rules || [];
    if (!Number.isInteger(rule) || (rules.length && !rules.includes(rule)))
      return { ok: false, error: `There's no rule ${String(input.rule)}. The rules run 1 to ${rules.length ? Math.max(...rules) : "the last"}; leave it out for the whole method.` };
  }
  const cost = input.cost === undefined || input.cost === "" ? 2 : Number(input.cost);
  if (!isCost(cost)) return { ok: false, error: `The cost is 1 (${COSTS[1]}), 2 (${COSTS[2]}) or 3 (${COSTS[3]}), not "${String(input.cost)}".` };
  const from = String(input.from ?? "").trim().slice(0, 80) || "you";
  const now = o.now || new Date();
  const log = parseFeedback(content);
  const last = log.items[log.items.length - 1];
  if (last && last.text === text && last.from === from && last.rule === rule && now.getTime() - Date.parse(last.at) < 120000)
    return { ok: true, content, item: last, message: `Already on the board as ${last.id}.` };
  const e: FbAdd = { type: "add", id: nextId(log.items), at: now.toISOString(), from, text, rule, cost };
  const out = append(content, e);
  const item = parseFeedback(out).items.find(i => i.id === e.id)!;
  return { ok: true, content: out, item, message: `Added ${e.id}${rule ? ` on rule ${rule}` : ""}.` };
}

/** Moves a piece of feedback along: accepted (a change is coming), changed (it landed, in rev), declined, or open again. */
export function setStatus(content: string, id: unknown, status: unknown, o: { note?: unknown; rev?: unknown; now?: Date } = {}): Change {
  const log = parseFeedback(content);
  const key = String(id ?? "").trim().toUpperCase();
  const it = log.items.find(i => i.id.toUpperCase() === key || i.id.toUpperCase() === "F" + key);
  if (!it) return { ok: false, error: `No feedback "${String(id)}".${log.items.length ? ` They run F1 to ${log.items[log.items.length - 1].id}.` : " There's none yet."}` };
  const st = (status === "reopen" ? "open" : String(status ?? "")) as FbStatus;
  if (!(STATUSES as readonly string[]).includes(st)) return { ok: false, error: `"${String(status)}" isn't a status: accept, decline, changed or reopen.` };
  if (it.status === st) return { ok: false, error: `${it.id} is already ${st}.` };
  const note = String(o.note ?? "").trim().slice(0, 1000);
  const rev = String(o.rev ?? "").trim().slice(0, 40);
  const e: FbSet = { type: "status", id: it.id, at: (o.now || new Date()).toISOString(), status: st, ...(note ? { note } : {}), ...(st === "changed" && rev ? { rev } : {}) };
  const out = append(content, e);
  const item = parseFeedback(out).items.find(i => i.id === it.id)!;
  const said = { open: "is open again", accepted: "is accepted: a change is coming", changed: `is marked changed${rev ? ` in ${rev.slice(0, 7)}` : ""}`, declined: "is declined" }[st];
  return { ok: true, content: out, item, message: `${it.id} ${said}.` };
}

/** Applies a change to the log on disk: re-reads it first, writes only when it changed, atomically (rule 24). */
export function saveFeedback(file: string, change: (content: string) => Change): Change {
  const before = readText(file);
  const res = change(before);
  if (res.ok && res.content !== before) writeAtomic(file, res.content);
  return res;
}

export interface FbSummary { counts: Record<FbStatus, number>; byRule: Record<number, number>; byPart: Record<string, number>; general: number; weight: number }
/** Open feedback weighed by cost, by rule and by part, and how many sit at each status. */
export function summarize(log: FbLog, m: Method): FbSummary {
  const counts = { open: 0, accepted: 0, changed: 0, declined: 0 } as Record<FbStatus, number>;
  const byRule: Record<number, number> = {}, byPart: Record<string, number> = {};
  const partOf = new Map(m.rules.map(r => [r.n, r.part]));
  let general = 0, weight = 0;
  for (const it of log.items) {
    counts[it.status]++;
    if (it.status !== "open" && it.status !== "accepted") continue;
    weight += it.cost;
    if (it.rule == null) { general += it.cost; continue; }
    byRule[it.rule] = (byRule[it.rule] || 0) + it.cost;
    const p = partOf.get(it.rule) || "";
    byPart[p] = (byPart[p] || 0) + it.cost;
  }
  return { counts, byRule, byPart, general, weight };
}

// ---------------------------------------------------------------- the CLI

const HELP = `Blueprint's engine: the method, its revisions and its feedback.

  status                          the method in numbers, the latest revision, the feedback
  check                           what's wrong with README.md (numbering, a missing Why, a reference to no rule)
                                  and with the feedback log (lines it can't read)
  history                         every revision of main: what it added and changed
  feedback [--all]                the open and accepted feedback (--all: every piece)
  feedback add "<text>" [--rule N] [--cost 1|2|3] [--from <project>]
                                  adds feedback: what's slow, clumsy or missing, and what the method could change.
                                  cost: 1 ${COSTS[1]}, 2 ${COSTS[2]} (the default), 3 ${COSTS[3]}
  feedback accept|decline|changed|reopen <id> [--note "<why>"] [--rev <commit>]
                                  moves it along; changed records the commit that changed it (default: main now)

  --json                          on any command: machine-readable output
  --dry                           on add and the status verbs: shows the change without saving it
Data: README.md, private/feedback.jsonl (git-ignored), git. BLUEPRINT_DIR points it at a scratch copy.`;

function flags(argv: string[]): { pos: string[]; opt: Record<string, string | true> } {
  const pos: string[] = [], opt: Record<string, string | true> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) { const k = a.slice(2); const v = argv[i + 1]; if (v !== undefined && !v.startsWith("--") && !["json", "dry", "all"].includes(k)) { opt[k] = v; i++; } else opt[k] = true; }
    else pos.push(a);
  }
  return { pos, opt };
}
const day = (t: number): string => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };

export async function main(argv: string[], io: { out(s: string): void; err(s: string): void } = { out: s => process.stdout.write(s + "\n"), err: s => process.stderr.write(s + "\n") }, dir: string = DIR): Promise<number> {
  const { pos, opt } = flags(argv);
  const json = opt.json === true;
  const cmd = pos[0] || "help";
  const readme = readText(path.join(dir, "README.md"));
  const m = parseReadme(readme);
  const file = feedbackFile(dir);
  const show = (o: unknown, text: string): void => io.out(json ? JSON.stringify(o, null, 2) : text);

  if (cmd === "help") { io.out(HELP); return 0; }
  if (cmd === "status") {
    const log = parseFeedback(readText(file));
    const s = summarize(log, m);
    let revs: Revision[] = [];
    try { revs = await readHistory(dir, historyCacheFile()); } catch { /* not a repo: a scratch copy */ }
    const last = revs[revs.length - 1];
    show({ rules: m.rules.length, parts: m.parts.length, foundations: m.foundations.length, words: m.words, revisions: revs.length, latest: last ? { letter: last.letter, sha: last.short, at: last.at, subject: last.subject } : null, feedback: s.counts },
      `VADE: ${m.rules.length} rules in ${m.parts.length} parts, ${m.foundations.length} foundations, ${m.words.toLocaleString("en-AU")} words.\n` +
      (last ? `Revisions: ${revs.length}, the latest ${last.letter} (${last.short}) on ${day(last.at)}: ${describe(last.subject, last.detail)}.\n` : "Revisions: none read (not a git repo).\n") +
      `Feedback: ${s.counts.open} open, ${s.counts.accepted} accepted, ${s.counts.changed} changed, ${s.counts.declined} declined.`);
    return 0;
  }
  if (cmd === "check") {
    const problems = checkMethod(m, readme);
    const log = parseFeedback(readText(file));
    const known = new Set(m.rules.map(r => r.n));
    for (const b of log.bad) problems.push({ where: `private/feedback.jsonl:${b.line}`, problem: b.why });
    for (const it of log.items) if (it.rule != null && !known.has(it.rule)) problems.push({ where: `private/feedback.jsonl:${it.line}`, problem: `${it.id} is about rule ${it.rule}, which doesn't exist` });
    show({ ok: !problems.length, problems }, problems.length ? problems.map(p => `${p.where}: ${p.problem}`).join("\n") : `README.md and the feedback log are in order: ${m.rules.length} rules, each with its reason, and every reference points at one.`);
    return problems.length ? 1 : 0;
  }
  if (cmd === "history") {
    const revs = await readHistory(dir, historyCacheFile());
    show(revs.map(r => ({ letter: r.letter, sha: r.short, date: day(r.at), rules: r.count, words: r.words, born: r.born, changed: r.changed, subject: r.subject })),
      revs.map(r => `${r.letter.padEnd(3)} ${r.short} ${day(r.at)}  ${String(r.count).padStart(2)} rules  ${r.born.length ? `+${r.born.length} ` : ""}${r.changed.length ? `~${r.changed.length} ` : ""}${describe(r.subject, r.detail)}`).join("\n"));
    return 0;
  }
  if (cmd === "feedback") {
    const verb = pos[1];
    if (!verb) {
      const log = parseFeedback(readText(file));
      const list = opt.all ? log.items : log.items.filter(i => i.status === "open" || i.status === "accepted");
      show(list, list.length ? list.map(i => `${i.id}  ${i.status.padEnd(8)} ${i.rule ? `rule ${i.rule}` : "method"}  cost ${i.cost}  from ${i.from}  ${i.at.slice(0, 10)}\n    ${i.text.replace(/\n/g, "\n    ")}${i.note ? `\n    note: ${i.note}` : ""}`).join("\n") : "No open feedback.");
      return 0;
    }
    let res: Change;
    const dry = opt.dry === true;
    const apply = (f: (c: string) => Change): Change => dry ? f(readText(file)) : saveFeedback(file, f);
    if (verb === "add") {
      res = apply(c => addFeedback(c, { text: pos.slice(2).join(" "), rule: opt.rule === true ? undefined : opt.rule, cost: opt.cost === true ? undefined : opt.cost, from: opt.from === true ? undefined : opt.from }, { rules: m.rules.map(r => r.n) }));
    } else if (["accept", "decline", "changed", "reopen"].includes(verb)) {
      let rev = typeof opt.rev === "string" ? opt.rev : "";
      if (verb === "changed" && !rev) { const r = await git(dir, ["rev-parse", "--short", "main"]); if (r.ok) rev = r.out.trim(); }
      const status = ({ accept: "accepted", decline: "declined", changed: "changed", reopen: "open" } as Record<string, string>)[verb];
      res = apply(c => setStatus(c, pos[2], status, { note: typeof opt.note === "string" ? opt.note : "", rev }));
    } else { io.err(`No feedback command "${verb}". Try: add, accept, decline, changed, reopen.`); return 2; }
    if (!res.ok) { io.err(res.error); return 1; }
    show(res.item, (dry ? "Would do: " : "") + res.message);
    return 0;
  }
  io.err(`No command "${cmd}".\n\n${HELP}`);
  return 2;
}

/** The revision cache: machine state, rebuilt from git if it goes. */
export const historyCacheFile = (): string => path.join(process.env.LOCALAPPDATA || path.join(process.env.HOME || ".", ".cache"), "ObsidianDash", "blueprint-history.json");

if (require.main === module) main(process.argv.slice(2)).then(code => { process.exitCode = code; }, e => { process.stderr.write(errMsg(e) + "\n"); process.exitCode = 1; });
