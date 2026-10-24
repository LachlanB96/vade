// Blueprint's engine: the README read as data and checked, revisions from git, archived requests, the feedback
// log, and the CLI. On a made-up method and scratch repos (fixture.ts), except one test that reads the real
// README.md, so a broken rule number or a reference to no rule fails the check.
import test, { after } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import * as eng from "../engine";
import { README_V1, README_V2, scratch, isolateGit, repoWithHistory } from "./fixture";

const TMP = scratch("engine");
after(() => fs.rmSync(TMP, { recursive: true, force: true }));
isolateGit(TMP);

test("the README as data: intro, foundations, parts, rules with their reasons and references, the model", () => {
  const m = eng.parseReadme(README_V2);
  assert.equal(m.intro, "VADE is a method for testing a garden. Every project lives in one folder.");
  assert.ok(m.lede.some(p => p.includes("vade mecum")));
  assert.deepEqual(m.foundations.map(f => [f.n, f.title]), [[1, "One record"], [2, "One rulebook"]]);
  assert.deepEqual(m.parts.map(p => [p.key, p.name, p.tagline, p.rules]), [["vault", "Vault", "the record", [1, 2]], ["agents", "Agents", "judgement", [3]]]);
  assert.deepEqual(m.rules.map(r => [r.n, r.title, r.part]), [[1, "One home for the garden", "vault"], [2, "One folder per bed", "vault"], [3, "Every bed briefs its gardener", "agents"]]);
  assert.equal(m.rules[0].why, "one place to look.");
  assert.deepEqual(m.rules[0].refs, [2]);
  assert.deepEqual(m.rules[1].refs, [1]);
  assert.match(m.rules[2].body, /## not a heading/, "a heading inside a code fence is the rule's text");
  assert.deepEqual(m.model, [{ part: "Vault", job: "Keeps the record", holds: "Logs and notes", never: "Hold secrets" }]);
  assert.ok(m.words > 50);
});

test("a README from before the rules gives empty lists", () => {
  const m = eng.parseReadme("# Old\n\nJust a note.\n");
  assert.deepEqual([m.rules, m.parts, m.foundations, m.model], [[], [], [], []]);
  assert.equal(m.intro, "Just a note.");
});

test("references to rules, however they're written", () => {
  assert.deepEqual(eng.refsIn("see rule 7, and Rule 12 still holds"), [7, 12]);
  assert.deepEqual(eng.refsIn("(rules 37 and 45)"), [37, 45]);
  assert.deepEqual(eng.refsIn("rules 4, 12 and 38, or rules 1 or 2"), [1, 2, 4, 12, 38]);
  assert.deepEqual(eng.refsIn("the rules below are one way"), []);
});

test("the check finds a gap in the numbering, a rule without its reason and a reference to no rule", () => {
  assert.deepEqual(eng.checkMethod(eng.parseReadme(README_V2), README_V2), []);
  const bad = README_V2.replace("#### 2. One folder per bed", "#### 4. One folder per bed").replace("**Why:** the folder is the context.", "").replace("see rule 1", "see rule 9");
  const problems = eng.checkMethod(eng.parseReadme(bad), bad).map(p => `${p.where}: ${p.problem}`);
  assert.ok(problems.some(p => /^rule 4: is rule number 2 in order/.test(p)), problems.join("\n"));
  assert.ok(problems.some(p => /^rule 4: has no \*\*Why:\*\* line/.test(p)));
  assert.ok(problems.some(p => /^README\.md:\d+: points at rule 9, and the rules run 1 to 3/.test(p)));
});

test("the real README is in order: every rule numbered, under a part, with its reason, every reference real", () => {
  const text = fs.readFileSync(path.join(__dirname, "..", "README.md"), "utf8");
  const m = eng.parseReadme(text);
  assert.ok(m.rules.length >= 46);
  assert.equal(m.foundations.length, 6);
  assert.deepEqual(m.parts.map(p => p.name), ["Vault", "Agents", "Dashboards", "Engines", "Connectors", "Across projects"]);
  assert.deepEqual(eng.checkMethod(m, text), []);
  assert.deepEqual(eng.pointedAt(m)[38]?.includes(2), true, "rule 2 points at rule 38");
});

test("revision letters skip I and O, as drawings do", () => {
  assert.deepEqual([0, 7, 8, 12, 19, 20, 21].map(eng.letter), ["A", "H", "J", "N", "Y", "AA", "AB"]);
  assert.ok(!eng.LETTERS.includes("I") && !eng.LETTERS.includes("O"));
});

test("each revision against the last: rules written, changed, kept and gone", () => {
  const d = [eng.digest("a1", 1, "first", 1, README_V1), eng.digest("b2", 2, "Merge feat/beds: more", 2, README_V2), eng.digest("c3", 3, "trim", 1, README_V1)];
  const [a, b, c] = eng.compare(d);
  assert.deepEqual([a.letter, a.born, a.changed], ["A", [1, 2], []]);
  assert.deepEqual([b.letter, b.born, b.changed, b.count], ["B", [3], [1], 3]);
  assert.deepEqual([c.gone, c.changed], [[3], [1]]);
  assert.equal(b.foundationsChanged, false);
});

test("what a revision did, in a line", () => {
  assert.equal(eng.describe("Merge feat/beds: rule 3, and a tap. Check passed"), "Rule 3, and a tap");
  assert.equal(eng.describe("Merge docs/x", "Rule 9: a new one"), "Rule 9: a new one");
  assert.equal(eng.describe("Merge branch 'fix/y' into main", "Fix the tap"), "Fix the tap");
  assert.equal(eng.describe("Add the garden method"), "Add the garden method");
});

test("main's history from git: one revision per first-parent commit, cached by commit", async () => {
  const dir = path.join(TMP, "repo");
  repoWithHistory(dir);
  const cache = path.join(TMP, "local", "blueprint-history.json");
  const revs = await eng.readHistory(dir, cache);
  assert.deepEqual(revs.map(r => [r.letter, r.count, r.born, r.changed]), [["A", 2, [1, 2], []], ["B", 3, [3], [1]]]);
  assert.equal(revs[0].subject, "Add the garden method");
  assert.equal(new Date(revs[0].at).getFullYear(), 2026);
  assert.equal(revs[1].commits, 1, "the merge brought one commit");
  assert.ok(fs.existsSync(cache));
  const cached = JSON.parse(fs.readFileSync(cache, "utf8"));
  assert.equal(Object.keys(cached.revisions).length, 2);
  assert.deepEqual((await eng.readHistory(dir, cache)).map(r => r.sha), revs.map(r => r.sha), "the cache gives the same answer");
  fs.writeFileSync(cache, "{not json");
  assert.equal((await eng.readHistory(dir, cache)).length, 2, "a broken cache is rebuilt from git");
});

test("archived requests: their frontmatter, and the revision that answered each", () => {
  const box = path.join(TMP, "archive");
  fs.mkdirSync(box, { recursive: true });
  fs.writeFileSync(path.join(box, "a.md"), `---\nfrom: Garden\nto: Blueprint\nsent: 2026-10-01T09:00\nsubject: "Rule 3, please"\narchived: 2026-10-02T12:01\n---\n\nBody.\n`);
  fs.writeFileSync(path.join(box, "b.md"), `---\nfrom: Shed\nsent: 2026-10-05T09:00\nsubject: Later\n---\n`);
  fs.writeFileSync(path.join(box, "note.txt"), "not a message");
  const msgs = eng.readMessages(box);
  assert.deepEqual(msgs.map(q => [q.from, q.subject]), [["Shed", "Later"], ["Garden", "Rule 3, please"]]);
  assert.deepEqual(eng.readMessages(path.join(TMP, "no-such-folder")), []);
  const revs = eng.compare([eng.digest("a", Date.parse("2026-09-30T00:00"), "x", 1, README_V1), eng.digest("b", Date.parse("2026-10-02T12:00"), "y", 1, README_V2)]);
  assert.equal(eng.answeredBy(msgs[1], revs)?.letter, "B");
  assert.equal(eng.answeredBy(msgs[0], revs), null, "not archived yet");
});

test("feedback: added with the next id, refused with a reason, a double press is one", () => {
  const now = new Date("2026-10-24T10:00:00Z");
  let c = "";
  const a = eng.addFeedback(c, { text: "  Watering takes three steps  ", rule: "2", cost: "3", from: "Garden" }, { rules: [1, 2, 3], now });
  assert.ok(a.ok);
  c = a.content;
  assert.deepEqual([a.item.id, a.item.text, a.item.rule, a.item.cost, a.item.from, a.item.status], ["F1", "Watering takes three steps", 2, 3, "Garden", "open"]);
  const again = eng.addFeedback(c, { text: "Watering takes three steps", rule: 2, cost: 3, from: "Garden" }, { rules: [1, 2, 3], now: new Date(now.getTime() + 30000) });
  assert.ok(again.ok && again.content === c && again.item.id === "F1" && /Already on the board as F1/.test(again.message));
  const b = eng.addFeedback(c, { text: "No rule for compost" }, { rules: [1, 2, 3], now });
  assert.ok(b.ok);
  assert.deepEqual([b.item.id, b.item.rule, b.item.cost, b.item.from], ["F2", null, 2, "you"]);
  for (const [input, re] of [
    [{ text: "  " }, /empty/], [{ text: "x", rule: 9 }, /no rule 9\. The rules run 1 to 3/], [{ text: "x", cost: 5 }, /cost is 1 .* not "5"/],
  ] as [eng.FbInput, RegExp][]) {
    const r = eng.addFeedback(c, input, { rules: [1, 2, 3], now });
    assert.ok(!r.ok && re.test(r.error), JSON.stringify(input));
  }
});

test("feedback moves along by appending, and refuses a step that makes no sense", () => {
  let c = (eng.addFeedback("", { text: "one" }, { now: new Date() }) as { content: string }).content;
  const acc = eng.setStatus(c, "f1", "accepted");
  assert.ok(acc.ok); c = acc.content;
  assert.equal(c.trim().split("\n").length, 2, "an event appended, nothing rewritten");
  const dup = eng.setStatus(c, "F1", "accepted");
  assert.ok(!dup.ok && /already accepted/.test(dup.error));
  const done = eng.setStatus(c, "1", "changed", { rev: "abc1234def", note: "rule 2 now says so" });
  assert.ok(done.ok); c = done.content;
  assert.deepEqual([done.item.status, done.item.rev, done.item.note], ["changed", "abc1234def", "rule 2 now says so"]);
  const re = eng.setStatus(c, "F1", "reopen");
  assert.ok(re.ok && re.item.status === "open" && re.item.rev === null);
  const none = eng.setStatus(c, "F7", "declined");
  assert.ok(!none.ok && /No feedback "F7"\. They run F1 to F1/.test(none.error));
  const badStatus = eng.setStatus(c, "F1", "maybe");
  assert.ok(!badStatus.ok && /isn't a status/.test(badStatus.error));
});

test("a feedback line it can't read is kept and flagged, and the rest still reads", () => {
  const good = (eng.addFeedback("", { text: "kept" }) as { content: string }).content;
  const log = eng.parseFeedback(`${good}{oops\n{"type":"status","id":"F9","status":"open"}\n{"type":"poke","id":"F1"}\n{"type":"status","id":"F1","status":"later"}\n`);
  assert.deepEqual(log.items.map(i => [i.id, i.status]), [["F1", "open"]]);
  assert.deepEqual(log.bad.map(b => b.line), [2, 3, 4, 5]);
  assert.match(log.bad[1].why, /no earlier line adds/);
});

test("saving feedback re-reads the file, writes only a change, and writes atomically", () => {
  const file = path.join(TMP, "fb", "private", "feedback.jsonl");
  const r = eng.saveFeedback(file, c => eng.addFeedback(c, { text: "first" }));
  assert.ok(r.ok && fs.readFileSync(file, "utf8").includes('"id":"F1"'));
  const before = fs.statSync(file).mtimeMs;
  const refused = eng.saveFeedback(file, c => eng.addFeedback(c, { text: "" }));
  assert.ok(!refused.ok);
  assert.equal(fs.statSync(file).mtimeMs, before, "a refusal writes nothing");
  assert.deepEqual(fs.readdirSync(path.dirname(file)), ["feedback.jsonl"], "no temporary file left");
});

test("open feedback weighed by rule, by part and on the whole method", () => {
  const m = eng.parseReadme(README_V2);
  let c = "";
  for (const f of [{ text: "a", rule: 1, cost: 3 }, { text: "b", rule: 3, cost: 1 }, { text: "c", cost: 2 }, { text: "d", rule: 2, cost: 2 }])
    c = (eng.addFeedback(c, f, { rules: [1, 2, 3] }) as { content: string }).content;
  c = (eng.setStatus(c, "F4", "declined") as { content: string }).content;
  const s = eng.summarize(eng.parseFeedback(c), m);
  assert.deepEqual(s.counts, { open: 3, accepted: 0, changed: 0, declined: 1 });
  assert.deepEqual(s.byRule, { 1: 3, 3: 1 });
  assert.deepEqual(s.byPart, { vault: 3, agents: 1 });
  assert.deepEqual([s.general, s.weight], [2, 6]);
});

test("the CLI: help, check, feedback add and its status verbs, --dry and --json", async () => {
  const dir = path.join(TMP, "cli");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "README.md"), README_V2);
  const out: string[] = [], err: string[] = [];
  const io = { out: (s: string) => out.push(s), err: (s: string) => err.push(s) };
  const run = (...a: string[]): Promise<number> => { out.length = 0; err.length = 0; return eng.main(a, io, dir); };
  assert.equal(await run("help"), 0);
  assert.match(out[0], /feedback add/);
  assert.equal(await run("check"), 0);
  assert.match(out[0], /in order: 3 rules/);
  assert.equal(await run("feedback", "add", "Compost", "has", "no", "rule", "--cost", "3", "--from", "Shed", "--dry"), 0);
  assert.match(out[0], /^Would do: Added F1/);
  assert.ok(!fs.existsSync(eng.feedbackFile(dir)), "--dry saves nothing");
  assert.equal(await run("feedback", "add", "Compost has no rule", "--rule", "2", "--from", "Shed"), 0);
  assert.equal(out[0], "Added F1 on rule 2.");
  assert.equal(await run("feedback", "add", "x", "--rule", "8"), 1);
  assert.match(err[0], /no rule 8/);
  assert.equal(await run("feedback", "decline", "F1", "--note", "compost is a bed"), 0);
  assert.equal(out[0], "F1 is declined.");
  assert.equal(await run("feedback"), 0);
  assert.equal(out[0], "No open feedback.");
  assert.equal(await run("feedback", "--all", "--json"), 0);
  assert.deepEqual(JSON.parse(out[0]).map((i: eng.Feedback) => [i.id, i.status, i.note]), [["F1", "declined", "compost is a bed"]]);
  fs.appendFileSync(eng.feedbackFile(dir), "{broken\n");
  assert.equal(await run("check"), 1);
  assert.match(out[0], /private\/feedback\.jsonl:3: isn't JSON/);
  assert.equal(await run("nonsense"), 2);
});
