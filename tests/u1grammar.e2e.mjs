// English Upper-Intermediate · Unit 1 Grammar: dropdowns, speaking blocks with transcripts, the translation check
// (rules for modal verbs + model words), the AI check (mocked), the teacher opens a student's work.
// Run: python3 -m http.server 5056 -d docs &  node tests/u1grammar.e2e.mjs
import { chromium } from "playwright";
import { readFileSync, mkdirSync } from "node:fs";
import assert from "node:assert/strict";
const BASE = "http://127.0.0.1:5056";
const SHOTS = process.env.SHOTS || "/tmp/shots-ui";
mkdirSync(SHOTS, { recursive: true });
const mock = readFileSync(new URL("./mock-fb.js", import.meta.url), "utf8");
const courseText = readFileSync(new URL("../content-private/course.json", import.meta.url), "utf8");
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1360, height: 950 } });
await ctx.route("**/js/fb.js*", (r) => r.fulfill({ contentType: "text/javascript", body: mock }));
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*" };
let aiCalls = 0, lastPrompt = "";
await ctx.route("https://api.languagetool.org/**", (r) => r.fulfill({ contentType: "application/json", headers: cors, body: '{"matches":[]}' }));
await ctx.route("https://api.groq.com/**", async (r) => {
  if (r.request().method() === "OPTIONS") return r.fulfill({ status: 204, headers: cors });
  aiCalls++;
  const user = JSON.parse(r.request().postData()).messages.at(-1).content; lastPrompt = user;
  const items = JSON.parse(user.match(/STUDENT'S ANSWERS \(JSON, one text per item\):\n(.*)/)[1]);
  const out = { items: {} };
  for (const [id, text] of Object.entries(items)) out.items[id] = {
    errors: /could pass/.test(text) ? [{ quote: "could pass", fix: "was able to pass", explain: "One success in the past: was able to.", type: "grammar" }] : [],
    target: /must have/.test(text) ? [{ quote: text.match(/must have \w+/)[0], structure: "deduction_past", ok: true }] : [],
    comment: "Good deductions.", level: "B2" };
  await r.fulfill({ contentType: "application/json", headers: cors, body: JSON.stringify({ choices: [{ message: { content: JSON.stringify(out) } }] }) });
});
const errors = [];
const open = async (url) => { const p = await ctx.newPage(); p.on("pageerror", (e) => errors.push(url + ": " + e.message)); p.on("dialog", (d) => d.accept()); await p.goto(BASE + url); return p; };
const step = (x) => console.log("•", x);

const t = await open("/teacher.html");
await t.evaluate(() => {
  localStorage.setItem("mock:auth", JSON.stringify({ "teacher@uni.ru": { uid: "T1", password: "secret1" }, "amara@uni.ru": { uid: "S1", password: "secret1" } }));
  localStorage.setItem("mock:db", JSON.stringify({ "teachers/T1": { name: "Teacher" } }));
});
await t.reload();
await t.fill("#auth-form [name=email]", "teacher@uni.ru"); await t.fill("#auth-form [name=password]", "secret1"); await t.click("#auth-submit");
await t.waitForSelector("#tool-nav .sb-item");
step("Import the course");
await t.click('a[href="#tools/content"]');
await t.evaluate((c) => { document.querySelector("#import-text").value = c; }, courseText);
await t.click("[data-act=import]"); await t.waitForSelector("#import-status:has-text(\"✓ Imported\")");
await t.evaluate(() => {
  const d = JSON.parse(localStorage.getItem("mock:db"));
  d["groups/AO"] = { name: "Amara", openUnits: ["u1"], releasedUnits: [] };
  d["users/S1"] = { name: "Amara Okafor", email: "amara@uni.ru", groupId: "AO" };
  localStorage.setItem("mock:db", JSON.stringify(d));
});
await t.reload(); await t.waitForSelector("#tool-nav .sb-item");

step("Student: the Grammar section, dropdowns, speaking blocks, translations");
const s = await open("/index.html");
await s.fill("#auth-form [name=email]", "amara@uni.ru"); await s.fill("#auth-form [name=password]", "secret1"); await s.click("#auth-submit");
await s.waitForSelector(".sb-item");
await s.goto(BASE + "/index.html#u1/grammar");
await s.waitForSelector('[data-ex="g2"]');
assert.equal(await s.locator('select[data-ex="g2"]').count(), 10);
assert.equal(await s.locator('select[data-ex="g7"]').count(), 8);
assert.ok(await s.locator(".spk").count() + await s.locator("[data-spk]").count() >= 4, "speaking blocks");
assert.equal(await s.locator('textarea[data-ex="g12"][readonly]').count(), 1, "transcript box is read-only");
await s.screenshot({ path: SHOTS + "/student-grammar.png", fullPage: false });
// answers: a dropdown, a rewrite, a translation with a typical mistake, a transcript (as Whisper would fill it)
await s.selectOption('select[data-ex="g2"][data-item="1"]', "Could");
await s.selectOption('select[data-ex="g9"][data-item="1"]', "must have + past participle");
await s.fill('[data-ex="g3"][data-item="5"]', "They could pass the exams.");
await s.fill('textarea[data-ex="gtr1"][data-item="3"]', "After three attempts Lukas could pass the statistics exam.");
await s.fill('textarea[data-ex="gtr2"][data-item="2"]', "He mustn't have cheated in the exam: he has always been a very motivated student.");
await s.evaluate(() => { const ta = document.querySelector('textarea[data-ex="g12"][data-item="1"]'); ta.removeAttribute("readonly"); ta.value = "They must be sitting an exam. She must had prepared badly and yesterday she could pass nothing. They can't be in a café, they must have been working for hours."; ta.dispatchEvent(new Event("input", { bubbles: true })); });
await s.waitForTimeout(3500);
const db = await s.evaluate(() => JSON.parse(localStorage.getItem("mock:db")));
const ans = db["submissions/u1__S1"]?.answers || {};
assert.equal(ans.g2?.["1"], "Could"); assert.match(ans.gtr1?.["3"] || "", /could pass/); assert.match(ans.g12?.["1"] || "", /must had/);

step("Teacher: Answers shown with the student's work on the unit page");
await t.goto(BASE + "/teacher.html#u1/grammar"); await t.waitForSelector('[data-ex="g2"]');
await t.waitForSelector(".viewas-bar select");
await t.selectOption(".viewas-bar select", "S1");
await t.waitForSelector(".viewas-bar.on");
const val = await t.inputValue('[data-ex="g3"][data-item="5"]');
assert.equal(val, "They could pass the exams.");
await t.screenshot({ path: SHOTS + "/teacher-viewas.png" });

step("Teacher: check exercise g3 – the rewrite with 'could' for one success is wrong, the key is not shown to the student");
await t.selectOption(".viewas-bar select", "");
const g3bar = t.locator('[data-act="check-ex"][data-ex="g3"]');
if (await g3bar.count()) { await g3bar.first().click(); await t.waitForTimeout(1500); }
const db2 = await t.evaluate(() => JSON.parse(localStorage.getItem("mock:db")));
const er = db2["exerciseResults/u1__S1"]?.items?.g3?.["5"];
assert.ok(er && er.ok === false, "g3/5 marked wrong"); assert.equal(er.correct, "", "no model sentence for a rewrite");

step("Teacher: Check the translations (LanguageTool + course rules + model words)");
await t.locator('[data-act="check-writing"][data-ex="gtr1"]').click();
await t.waitForFunction(() => JSON.parse(localStorage.getItem("mock:db"))["exerciseResults/u1__S1"]?.feedback?.gtr1, null, { timeout: 20000 });
const fb1 = (await t.evaluate(() => JSON.parse(localStorage.getItem("mock:db"))))["exerciseResults/u1__S1"].feedback.gtr1["3"];
assert.ok(fb1.issues.some((i) => i.rule === "COULD_SINGLE_PAST"), "rule: could for one success");
assert.ok(fb1.translation && fb1.modelWords, "model words compared");
assert.ok(fb1.target.some((x) => x.id === "modal_ability"), "structure found");
await t.locator('[data-act="check-writing"][data-ex="gtr2"]').click();
await t.waitForFunction(() => JSON.parse(localStorage.getItem("mock:db"))["exerciseResults/u1__S1"]?.feedback?.gtr2, null, { timeout: 20000 });
const fb2 = (await t.evaluate(() => JSON.parse(localStorage.getItem("mock:db"))))["exerciseResults/u1__S1"].feedback.gtr2["2"];
assert.ok(fb2.issues.some((i) => i.rule === "MUSTNT_HAVE"), "rule: mustn't have");

step("Teacher: AI key (Groq, mocked) – Check the speaking now");
await t.evaluate(() => localStorage.setItem("t:aiCheck", JSON.stringify({ provider: "groq", key: "gsk_test", on: true })));
await t.reload(); await t.waitForSelector('[data-ex="g12"]');
await t.locator('[data-act="check-writing"][data-ex="g12"]').click();
await t.waitForFunction(() => JSON.parse(localStorage.getItem("mock:db"))["exerciseResults/u1__S1"]?.feedback?.g12, null, { timeout: 20000 });
const fb3 = (await t.evaluate(() => JSON.parse(localStorage.getItem("mock:db"))))["exerciseResults/u1__S1"].feedback.g12["1"];
assert.equal(fb3.engine, "ai"); assert.ok(aiCalls >= 1);
assert.ok(fb3.issues.some((i) => i.rule === "MODAL_HAD"), "course rule added to the AI feedback");
assert.match(lastPrompt, /Deductions about the past/); assert.match(lastPrompt, /postgraduate|B2/);
const dbAll = JSON.stringify(await t.evaluate(() => localStorage.getItem("mock:db")));
assert.ok(!dbAll.includes("gsk_test"), "the key is never in the database");

step("Student sees the feedback");
await s.reload(); await s.waitForSelector('[data-ex="g12"]');
await s.waitForSelector(".wfb");
await s.locator('.wfb').first().scrollIntoViewIfNeeded();
await s.screenshot({ path: SHOTS + "/student-feedback.png" });
const st = await s.textContent("#content");
assert.match(st, /Grammar of the module in your/); assert.match(st, /Unit words in this sentence/);
assert.ok(!/Estimated level/.test(st), "no AI level for the student");

step("Speaking progress and the Grammar checker page");
await t.goto(BASE + "/teacher.html#tools/speaking"); await t.waitForSelector("#view .prog-ctl, #view .box", { timeout: 15000 });
await t.goto(BASE + "/teacher.html#tools/checker"); await t.waitForSelector("#try-text");
assert.match(await t.textContent("#view"), /Deductions about the present/);
await t.screenshot({ path: SHOTS + "/teacher-checker.png" });
if (errors.length) { console.log("PAGE ERRORS", errors); process.exit(1); }
console.log("ALL OK"); await browser.close();
