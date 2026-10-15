// Focused check of Unit 1 (Warm-up + Reading) with the real course.json on the mock Firebase.
// Run: python3 -m http.server 5055 -d docs &  node tests/u1.e2e.mjs
import { chromium } from "playwright";
import { readFileSync, mkdirSync } from "node:fs";
import assert from "node:assert/strict";

const BASE = "http://127.0.0.1:5055";
const SHOTS = process.env.SHOTS || "/tmp/shots-u1";
mkdirSync(SHOTS, { recursive: true });
const mock = readFileSync(new URL("./mock-fb.js", import.meta.url), "utf8");
const course = readFileSync(new URL("../content-private/course.json", import.meta.url), "utf8");
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" }).catch(() => chromium.launch());
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
await ctx.route("**/js/fb.js*", (r) => r.fulfill({ contentType: "text/javascript", body: mock }));
const errors = [];
await ctx.route("https://api.languagetool.org/**", async (r) => {
  const text = new URLSearchParams(r.request().postData()).get("text") || "";
  const i = text.indexOf("has went");
  const matches = i < 0 ? [] : [{ offset: i, length: 8, message: "The past participle of 'go' is 'gone'.", shortMessage: "Wrong verb form",
    replacements: [{ value: "has gone" }], rule: { issueType: "grammar", category: { name: "Grammar" } } }];
  await r.fulfill({ contentType: "application/json", headers: { "Access-Control-Allow-Origin": "*" }, body: JSON.stringify({ matches }) });
});
const page = async (url) => { const p = await ctx.newPage(); p.on("pageerror", (e) => errors.push(url + ": " + e.message)); p.on("dialog", (d) => d.accept()); await p.goto(BASE + url); return p; };
const sel = (ex, it) => `[data-ex="${ex}"][data-item="${it}"]`;
const step = (t) => console.log("•", t);

const t = await page("/teacher.html");
await t.evaluate(() => {
  localStorage.setItem("mock:auth", JSON.stringify({ "teacher@uni.ru": { uid: "T1", password: "secret1" } }));
  localStorage.setItem("mock:db", JSON.stringify({ "teachers/T1": { name: "Teacher" } }));
});
await t.reload();
await t.fill("#auth-form [name=email]", "teacher@uni.ru");
await t.fill("#auth-form [name=password]", "secret1");
await t.click("#auth-submit");
await t.waitForSelector("#tool-nav .sb-item");

step("Import");
await t.click('a[href="#tools/content"]');
await t.waitForSelector("#import-text");
await t.evaluate((c) => { document.querySelector("#import-text").value = c; }, course);
await t.click("[data-act=import]");
await t.waitForSelector('td:has-text("Education")');
const db = await t.evaluate(() => JSON.parse(localStorage.getItem("mock:db")));
const pub = JSON.stringify(db["unitContent/u1"]);
assert.ok(!pub.includes('"answer"'), "no keys in unitContent");
assert.ok(!pub.includes("Hi, I’m Slava"), "no listening script in unitContent");
assert.ok(!pub.includes("Suggested answer"), "no teacher notes in unitContent");
assert.equal(db["answerKeys/u1"].exercises.r4["1"], "E");

await t.click('.sb-uh[data-unit="u1"]');
await t.click('.sb-item:has-text("Warm-up")');
await t.waitForSelector(".tnote");
await t.screenshot({ path: `${SHOTS}/01-teacher-warmup.png` });

step("Group, student, open unit");
await t.click('a[href="#tools/groups"]');
await t.waitForSelector("#g-name");
await t.fill("#g-name", "Anna");
await t.fill("#g-code", "anna-1");
await t.click("[data-act=create-group]");
await t.waitForSelector("code:text('ANNA-1')");
const s = await page("/index.html");
await s.click("[data-mode=register]");
await s.fill("[name=name]", "Anna Petrova");
await s.fill("[name=email]", "anna@mail.ru");
await s.fill("[name=password]", "pass123");
await s.fill("[name=group]", "anna-1");
await s.click("#auth-submit");
await s.waitForSelector("text=No units are open yet");
await t.click('a[href="#tools/access"]');
await t.click("[data-act=toggle-open][data-unit=u1]");
await s.waitForSelector('.sb-uh[data-unit="u1"][data-can-open="1"]', { timeout: 5000 });
await s.click('.sb-uh[data-unit="u1"]');
await s.click('.sb-item:has-text("Warm-up")');
await s.waitForSelector("#ex-w1");
await s.screenshot({ path: `${SHOTS}/02-student-warmup-top.png` });

step("Warm-up answers");
await s.fill(sel("w2", "1"), "biology");
await s.fill(sel("w2", "2"), "Computer science");
await s.fill(sel("w2", "3"), "Music");
for (const [i, v] of [["1", "state"], ["2", "primary"], ["3", "public"], ["4", "private"], ["5", "nursery"], ["6", "sixth form"]]) await s.selectOption(sel("w4", i), v);
await s.selectOption(sel("w3", "6"), "point");
await s.fill(sel("w9", "7"), "IB");
await s.fill(sel("w9", "10"), "22");
const fc = s.locator(".fc").first();
await fc.scrollIntoViewIfNeeded();
assert.ok((await fc.textContent()).includes("/mæθs/"), "transcription on the front");
await fc.screenshot({ path: `${SHOTS}/03-fc-front.png` });
await fc.locator(".fc-card").click();
await s.waitForTimeout(600);
await fc.screenshot({ path: `${SHOTS}/04-fc-back.png` });
await s.locator(".post").first().scrollIntoViewIfNeeded();
await s.screenshot({ path: `${SHOTS}/05-posts.png` });
await s.locator("#ex-w2").scrollIntoViewIfNeeded();
await s.locator(".pics").first().screenshot({ path: `${SHOTS}/06-missing-pictures.png` });
await s.locator("#save-state", { hasText: /Saved|saved/ }).waitFor({ timeout: 5000 });

step("Teacher checks w2, w4, w9");
await t.click('.sb-uh[data-unit="u1"]').catch(() => {});
await t.click('.sb-item:has-text("Warm-up")');
for (const ex of ["w2", "w3", "w4", "w9"]) { await t.waitForSelector(`[data-act="check-ex"][data-ex="${ex}"]`); await t.click(`[data-act="check-ex"][data-ex="${ex}"]`); }
await s.waitForSelector("#ex-w9 .ex-score", { timeout: 5000 });
assert.equal((await s.textContent("#ex-w2 .ex-score")).trim(), "2 / 3");
assert.equal((await s.textContent("#ex-w4 .ex-score")).trim(), "5 / 6");
assert.equal((await s.textContent("#ex-w9 .ex-score")).trim(), "2 / 11");
assert.equal((await s.textContent("#ex-w3 .ex-score")).trim(), "1 / 9");
await s.locator("#ex-w4").screenshot({ path: `${SHOTS}/07-w4-checked.png` });

step("Reading");
await s.click('.sb-item:has-text("Reading")');
await s.waitForSelector("#ex-r4");
for (const [i, v] of [["1", "E"], ["2", "G"], ["3", "A"], ["4", "F"], ["5", "C"], ["6", "H"], ["7", "B"]]) await s.selectOption(sel("r4", i), v);
await s.fill(sel("r8", "4"), "low income");
await s.fill(sel("r11", "5"), "competitor");
await s.fill(sel("r11", "9"), "excellance");
await s.fill(sel("r12", "5"), "catch a glimpse of");
await s.selectOption(sel("r10", "1"), "false friend");
await s.selectOption(sel("r10b", "1"), "a");
await s.fill(sel("r13", "1"), "Hi Helen, my school has went to an island. We study marine science and take the ferry every day. " + "It is a great hands-on learning experience. ".repeat(20));
await s.locator(".rtext").scrollIntoViewIfNeeded();
await s.screenshot({ path: `${SHOTS}/08-reading-text.png` });
await s.locator(".gapped").screenshot({ path: `${SHOTS}/09-gapped.png` });
await s.locator("#save-state", { hasText: /Saved|saved/ }).waitFor({ timeout: 5000 });
const studentText = await s.evaluate(() => document.body.innerText);
assert.ok(!/[←→⤴«»▼›▶]/.test(studentText), "no arrows");
assert.ok(!studentText.includes("Key:"), "no keys in student view");

await t.click('.sb-item:has-text("Reading")');
for (const ex of ["r4", "r8", "r10", "r10b", "r11", "r12"]) { await t.waitForSelector(`[data-act="check-ex"][data-ex="${ex}"]`); await t.click(`[data-act="check-ex"][data-ex="${ex}"]`); }
await s.waitForSelector("#ex-r12 .ex-score", { timeout: 5000 });
assert.equal((await s.textContent("#ex-r4 .ex-score")).trim(), "6 / 7");
assert.equal((await s.textContent("#ex-r8 .ex-score")).trim(), "1 / 5");
assert.equal((await s.textContent("#ex-r10 .ex-score")).trim(), "1 / 8");
assert.equal((await s.textContent("#ex-r10b .ex-score")).trim(), "1 / 4");
assert.equal((await s.textContent("#ex-r11 .ex-score")).trim(), "1 / 10");
assert.equal((await s.textContent("#ex-r12 .ex-score")).trim(), "1 / 7");
await s.locator("#ex-r4").screenshot({ path: `${SHOTS}/10-r4-checked.png` });
step("Writing check of the email (LanguageTool mocked)");
assert.ok(await t.locator("#ex-r6 .keyhint.model").count() >= 5, "model answers for the teacher");
await t.click('[data-act="check-writing"][data-ex="r13"]');
await s.waitForSelector("#ex-r13 .wfb", { timeout: 15000 });
assert.ok((await s.textContent("#ex-r13 .wfb")).includes("has gone"), "grammar feedback shown");
await s.locator("#ex-r13").screenshot({ path: `${SHOTS}/13-email-feedback.png` });
await t.screenshot({ path: `${SHOTS}/11-teacher-reading.png` });

step("Mobile");
await s.setViewportSize({ width: 390, height: 844 });
await s.locator(".rtext").scrollIntoViewIfNeeded();
await s.screenshot({ path: `${SHOTS}/12-mobile.png` });
const overflow = await s.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
assert.equal(overflow, false, "no horizontal scroll on mobile");

assert.deepEqual(errors, []);
console.log("\nALL STEPS PASSED");
await browser.close();
