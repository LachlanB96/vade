// Blueprint's dashboard in the browser: one tooltip for every [data-tip] (on hover and on keyboard focus), a rule's
// whole lifeline lit while the pointer is on any of its marks, the rule finder, a jump from a mark to its rule (the
// rule opens and flashes), "Feedback on this rule" filling in the form, and which rules were open kept across
// redraws. The Dashboards server bundles this after its own client.ts, which provides window.dash.
import type { Dash } from "../Dashboards/client";

const dash = (window as unknown as { dash: Dash }).dash;
let tipEl: HTMLDivElement | null = null;
let hotCol = "";
let filter = "";
const opened = new Set<string>();

function tip(): HTMLDivElement {
  if (!tipEl) {
    tipEl = document.createElement("div");
    tipEl.className = "bp-tipbox";
    tipEl.setAttribute("role", "tooltip");
    document.body.appendChild(tipEl);
  }
  return tipEl;
}
function showTip(el: Element, x: number, y: number): void {
  const t = tip();
  const text = el.getAttribute("data-tip") || "";
  if (!text) { hideTip(); return; }
  if (t.textContent !== text) t.textContent = text;   // text, never HTML: tips carry commit messages and feedback
  t.classList.add("show");
  const r = t.getBoundingClientRect();
  let left = x + 14, top = y + 18;
  if (left + r.width > window.innerWidth - 8) left = Math.max(8, x - r.width - 14);
  if (top + r.height > window.innerHeight - 8) top = Math.max(8, y - r.height - 12);
  t.style.left = `${left}px`;
  t.style.top = `${top}px`;
}
function hideTip(): void { tipEl?.classList.remove("show"); }

function light(col: string): void {
  if (col === hotCol) return;
  for (const el of dash.root.querySelectorAll(".bp-hot")) el.classList.remove("bp-hot");
  hotCol = col;
  if (col) for (const el of dash.root.querySelectorAll(`[data-col="${CSS.escape(col)}"]`)) el.classList.add("bp-hot");
}

document.addEventListener("pointermove", e => {
  const target = e.target as Element | null;
  const el = target && target.closest ? target.closest("[data-tip]") : null;
  if (el && dash.root.contains(el)) showTip(el, e.clientX, e.clientY); else hideTip();
  const c = target && target.closest ? target.closest("[data-col]") : null;
  light(c && dash.root.contains(c) ? c.getAttribute("data-col") || "" : "");
});
document.addEventListener("pointerleave", () => { hideTip(); light(""); });
document.addEventListener("focusin", e => {
  const el = (e.target as Element).closest?.("[data-tip]");
  if (el && dash.root.contains(el)) { const r = el.getBoundingClientRect(); showTip(el, r.left + r.width / 2, r.bottom); }
});
document.addEventListener("focusout", hideTip);
window.addEventListener("scroll", hideTip, { passive: true });

// ---- the rule finder ----
function applyFilter(root: HTMLElement): void {
  const terms = filter.toLowerCase().split(/\s+/).filter(Boolean);
  let shown = 0;
  for (const part of root.querySelectorAll<HTMLElement>(".bp-part")) {
    let any = false;
    for (const r of part.querySelectorAll<HTMLElement>(".bp-rule")) {
      const hay = r.dataset.search || "";
      const ok = terms.every(t => hay.includes(t));
      r.hidden = !ok;
      if (ok) { any = true; shown++; }
    }
    part.hidden = !any;
  }
  const count = root.querySelector(".bp-filter-count");
  const total = root.querySelectorAll(".bp-rule").length;
  if (count) count.textContent = terms.length ? `${shown} of ${total} rules` : `${total} rules`;
}
document.addEventListener("input", e => {
  const el = e.target as HTMLInputElement;
  if (!el.classList || !el.classList.contains("bp-filter")) return;
  filter = el.value;
  applyFilter(dash.root);
});

// ---- open rules: kept across redraws, opened by a jump ----
document.addEventListener("toggle", e => {
  const d = e.target as HTMLDetailsElement;
  if (!d.classList || !d.classList.contains("bp-rule")) return;
  if (d.open) opened.add(d.id); else opened.delete(d.id);
}, true);

function jump(id: string): void {
  const el = document.getElementById(id);
  if (!el) return;
  if (el.classList.contains("bp-rule")) {
    (el as HTMLDetailsElement).open = true;
    opened.add(id);
    if (el.hidden) { filter = ""; const f = dash.root.querySelector<HTMLInputElement>(".bp-filter"); if (f) f.value = ""; applyFilter(dash.root); }
  }
  el.scrollIntoView({ behavior: "smooth", block: el.classList.contains("bp-rule") ? "center" : "start" });
  el.classList.remove("bp-flash");
  void (el as HTMLElement).offsetWidth;
  el.classList.add("bp-flash");
}
document.addEventListener("click", e => {
  const t = e.target as Element;
  const a = t.closest?.('a[href^="#bp-"]') as HTMLAnchorElement | null;
  if (a && dash.root.contains(a)) {
    e.preventDefault();
    const id = a.getAttribute("href")!.slice(1);
    history.replaceState(null, "", `#${id}`);
    const rule = a.getAttribute("data-fb-rule");
    if (rule) {
      const sel = dash.root.querySelector<HTMLSelectElement>('.bp-fb-form select[name="rule"]');
      if (sel) sel.value = rule;
      jump(id);
      dash.root.querySelector<HTMLTextAreaElement>('.bp-fb-form textarea')?.focus({ preventScroll: true });
      return;
    }
    jump(id);
    return;
  }
  const ex = t.closest?.("[data-bp-expand]");
  if (ex && dash.root.contains(ex)) {
    const open = ex.getAttribute("data-bp-expand") === "1";
    for (const d of dash.root.querySelectorAll<HTMLDetailsElement>(".bp-rule")) if (!d.hidden) d.open = open;
  }
});

dash.onDraw(root => {
  hotCol = "";
  hideTip();
  for (const id of opened) { const d = document.getElementById(id) as HTMLDetailsElement | null; if (d) d.open = true; }
  const f = root.querySelector<HTMLInputElement>(".bp-filter");
  if (f && filter && f.value !== filter) f.value = filter;
  applyFilter(root);
  if (location.hash.startsWith("#bp-rule-") && !opened.has(location.hash.slice(1))) jump(location.hash.slice(1));
});
