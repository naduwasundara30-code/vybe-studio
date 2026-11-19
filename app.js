// VYBE STUDIO – front-end logic (plain JavaScript, no build step)
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const list = (arr) => `<ul>${(arr || []).map((x) => `<li>${esc(x)}</li>`).join("")}</ul>`;
const STORE = "vybe_campaigns";

let current = null;       // currently open campaign {id, inputs, result, tasksDone, performance}
let charts = [];

// ---------- Tabs ----------
document.querySelectorAll("#nav button").forEach((b) =>
  b.addEventListener("click", () => showTab(b.dataset.tab))
);
function showTab(id) {
  if (!document.getElementById(id)) id = "builder";
  document.querySelectorAll("#nav button").forEach((b) => b.classList.toggle("active", b.dataset.tab === id));
  document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("active", t.id === id));
  if (id === "history") renderHistory();
  window.scrollTo(0, 0);
}

// ---------- Storage (browser localStorage) ----------
const loadAll = () => JSON.parse(localStorage.getItem(STORE) || "[]");
const saveAll = (a) => localStorage.setItem(STORE, JSON.stringify(a));
// Saves a campaign on this device. touch=true marks it as changed (so the cloud copy is out of date).
function persist(touch = true, c = current) {
  if (!c) return false;
  if (touch) c.updatedAt = new Date().toISOString();
  const all = loadAll().filter((x) => x.id !== c.id);
  all.unshift(c);
  try { saveAll(all); } catch {
    toast("This device's storage is full. Export or delete old campaigns in History.", true);
    return false;
  }
  if (c === current) renderBar();
  return true;
}
const saveCurrent = () => persist(true);

// ---------- Small UI helpers ----------
let toastTimer;
function toast(msg, bad) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.toggle("bad", !!bad);
  t.classList.remove("hidden");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.add("hidden"), bad ? 6000 : 3500);
}
const slug = (s) => String(s || "campaign").trim().replace(/[^\w\-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "") || "campaign";
function download(name, content, type) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([content], { type }));
  a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
async function readJSON(res) {
  const json = await res.json().catch(() => ({ error: "Invalid response from server" }));
  if (!res.ok || json.error) throw new Error(json.error || "Request failed");
  return json;
}

// ---------- AI call ----------
async function callAI(module, data) {
  const res = await fetch("/.netlify/functions/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ module, data }),
  });
  const json = await res.json().catch(() => ({ error: "Invalid response from server" }));
  if (!res.ok || json.error) throw new Error(json.error || "Request failed");
  return json;
}

// ---------- 01 Builder ----------
let imageData = null;
// Downscale uploads so they fit in device storage and can be sent to the image AI as a reference.
function shrinkImage(file, max = 1024) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.width, img.height));
      const cv = document.createElement("canvas");
      cv.width = Math.round(img.width * k); cv.height = Math.round(img.height * k);
      const ctx = cv.getContext("2d");
      ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, cv.width, cv.height);
      ctx.drawImage(img, 0, 0, cv.width, cv.height);
      URL.revokeObjectURL(img.src);
      resolve(cv.toDataURL("image/jpeg", 0.85));
    };
    img.onerror = () => reject(new Error("Could not read this image."));
    img.src = URL.createObjectURL(file);
  });
}
$("#imageInput").addEventListener("change", async (e) => {
  const f = e.target.files[0];
  if (!f) return;
  try {
    imageData = await shrinkImage(f);
    $("#imagePreview").src = imageData; $("#imagePreview").classList.remove("hidden");
  } catch (err) { setStatus(err.message, true); }
});

$("#fillDemo").addEventListener("click", () => {
  const today = new Date();
  const end = new Date(today.getTime() + 30 * 864e5);
  const d = (x) => x.toISOString().slice(0, 10);
  const demo = {
    brandName: "Brew & Bloom Café", industry: "Food & Beverage", businessSize: "Micro (1-9)", location: "Colombo, Sri Lanka",
    links: "instagram.com/brewbloom", product: "Iced Matcha Latte", category: "Beverages", priceMin: 900, priceMax: 1400,
    features: "Organic Japanese matcha, oat milk option, low sugar, served in reusable cups",
    usp: "The only café in the area with ceremonial-grade matcha and a plastic-free policy",
    audience: "University students and young professionals", ageRange: "18-32", gender: "All", income: "Middle",
    interests: "Health, aesthetics, cafés, sustainability", painPoints: "Expensive specialty drinks, too much sugar",
    competitors: "Starbucks, local cafés", campaignName: "Matcha Monsoon Launch", objective: "Product launch",
    startDate: d(today), endDate: d(end), budget: 500, currency: "USD", expectedRevenue: 2500, expectedROI: 400,
    currentStrategy: "Occasional Instagram posts, no paid ads", tone: "Friendly",
  };
  const f = $("#campaignForm");
  Object.entries(demo).forEach(([k, v]) => { if (f.elements[k]) f.elements[k].value = v; });
});

$("#campaignForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  const inputs = Object.fromEntries(fd.entries());
  inputs.channels = fd.getAll("channels");
  if (inputs.endDate < inputs.startDate) return setStatus("End date must be after start date.", true);

  const btn = $("#generateBtn");
  btn.disabled = true;
  setStatus("Generating your campaign with AI… (about 10–20 seconds)");
  try {
    const result = await callAI("campaign", inputs);
    current = { id: Date.now().toString(), createdAt: new Date().toISOString(), inputs, image: imageData, result, tasksDone: {}, performance: null, insights: null, images: [], chat: [] };
    if (!persist()) { current.image = null; persist(); } // image may be too big for storage
    renderAll();
    setStatus("Campaign generated and saved.");
    showTab("analysis");
  } catch (err) {
    setStatus("Error: " + err.message, true);
  } finally {
    btn.disabled = false;
  }
});
function setStatus(msg, bad) { const s = $("#status"); s.textContent = msg; s.style.color = bad ? "#B23B2E" : "var(--green)"; }

function renderAll() {
  renderAnalysis(); renderStrategy(); renderContent(); renderPlan(); renderDashboard(); renderBar(); renderChat();
}

// ---------- 02 Analysis ----------
function renderAnalysis() {
  const a = current.result.analysis || {};
  const p = a.fourPs || {}, sg = a.segmentation || {}, sw = a.swot || {}, fn = a.salesFunnel || {}, an = a.ansoff || {};
  const quads = ["Market Penetration", "Product Development", "Market Development", "Diversification"];
  $("#analysisOut").className = "";
  $("#analysisOut").innerHTML = `
    <div class="card" style="margin-bottom:14px"><h3>${esc(current.inputs.campaignName)}</h3><p>${esc(current.result.summary)}</p></div>
    <h2>4Ps of Marketing</h2>
    <div class="grid">${["product", "price", "place", "promotion"].map((k) => `<div class="card"><h3>${k[0].toUpperCase() + k.slice(1)}</h3>${esc(p[k])}</div>`).join("")}</div>
    <div class="grid">
      <div class="card"><h3>Target market</h3>${esc(a.targetMarket)}</div>
      <div class="card"><h3>Value proposition</h3>${esc(a.valueProposition)}</div>
      <div class="card"><h3>Positioning</h3>${esc(a.positioning)}</div>
    </div>
    <h2>Segmentation variables</h2>
    <div class="grid">${Object.entries(sg).map(([k, v]) => `<div class="card"><h3>${esc(k)}</h3>${esc(v)}</div>`).join("")}</div>
    <h2>SWOT analysis</h2>
    <div class="swot">
      <div class="s"><h3>Strengths</h3>${list(sw.strengths)}</div><div class="w"><h3>Weaknesses</h3>${list(sw.weaknesses)}</div>
      <div class="o"><h3>Opportunities</h3>${list(sw.opportunities)}</div><div class="t"><h3>Threats</h3>${list(sw.threats)}</div>
    </div>
    <div class="grid" style="margin-top:16px">
      <div class="card"><h3>Sales funnel</h3><div class="funnel">
        ${["awareness", "interest", "desire", "action"].map((k, i) => `<div style="width:${100 - i * 15}%;opacity:${1 - i * 0.15}"><b>${k.toUpperCase()}</b><br>${esc(fn[k])}</div>`).join("")}
      </div></div>
      <div class="card"><h3>Ansoff matrix</h3>
        <div class="ansoff">${quads.map((q) => `<div class="${(an.quadrant || "").toLowerCase().includes(q.toLowerCase()) ? "on" : ""}">${q}</div>`).join("")}</div>
        <p>${esc(an.reason)}</p></div>
      <div class="card"><h3>Lead generation</h3>${list(a.leadGeneration)}</div>
    </div>
    <h2>KPIs &amp; budget</h2>
    <div class="grid">
      <div class="card"><h3>KPI targets</h3>${list((current.result.kpis || []).map((k) => `${k.name}: ${k.target}`))}</div>
      <div class="card"><canvas id="budgetChart"></canvas></div>
    </div>`;
  const b = current.result.budgetSplit || [];
  new Chart($("#budgetChart"), { type: "doughnut", data: { labels: b.map((x) => x.channel), datasets: [{ data: b.map((x) => x.amount), backgroundColor: palette }] }, options: { plugins: { title: { display: true, text: `Budget split (${current.inputs.currency})` } } } });
}
const palette = ["#4A6658", "#C19A5B", "#8FB3A0", "#E2C79A", "#2F4239", "#A87C3D", "#BFD4C8"];

// ---------- 03 Strategy + Gantt ----------
function renderStrategy() {
  const s = current.result.strategy || {}, tasks = s.tasks || [];
  const start = new Date(current.inputs.startDate), end = new Date(current.inputs.endDate);
  const span = Math.max(1, (end - start) / 864e5 + 1);
  const phaseColor = { "Pre-launch": "#8FB3A0", Launch: "#4A6658", Growth: "#C19A5B", Review: "#A87C3D" };
  const rows = tasks.map((t) => {
    const ts = Math.max(0, (new Date(t.start) - start) / 864e5);
    const te = Math.min(span, (new Date(t.end) - start) / 864e5 + 1);
    const left = (ts / span) * 100, width = Math.max(2, ((te - ts) / span) * 100);
    return `<div class="grow"><div class="gname">${esc(t.title)}<br><span class="tag">${esc(t.channel)}</span></div>
      <div class="gtrack"><div class="gbar" title="${esc(t.start)} → ${esc(t.end)}" style="left:${left}%;width:${width}%;background:${phaseColor[t.phase] || "#4A6658"}">${esc(t.phase)}</div></div></div>`;
  }).join("");
  $("#strategyOut").className = "";
  $("#strategyOut").innerHTML = `
    <div class="card" style="margin-bottom:14px"><h3>Strategy overview</h3><p>${esc(s.overview)}</p></div>
    <h2>Campaign time plan (Gantt chart)</h2>
    <div class="gantt"><div class="ghead"><span>${esc(current.inputs.startDate)}</span><span>${esc(current.inputs.endDate)}</span></div>${rows}</div>
    <p class="muted">${Object.entries(phaseColor).map(([k, c]) => `<span class="tag" style="background:${c};color:#fff">${k}</span>`).join(" ")}</p>
    <h2>Task details</h2>
    <div class="grid">${tasks.map((t) => `<div class="card"><h3>${esc(t.title)}</h3><span class="tag">${esc(t.phase)}</span> <span class="tag">${esc(t.channel)}</span><p>${esc(t.description)}</p><small>${esc(t.start)} → ${esc(t.end)}</small></div>`).join("")}</div>`;
}

// ---------- 04 Image studio ----------
function renderContent() {
  const c = current.result.content || {};
  $("#contentOut").className = "";
  $("#contentOut").innerHTML = `
    ${current.image ? `<div class="card" style="margin-bottom:14px"><h3>Your product</h3><img src="${current.image}" class="preview"></div>` : ""}
    <h2>Visual concepts &amp; image prompts</h2>
    <p class="muted">Copy a prompt into a free image generator (ChatGPT, Gemini, Microsoft Designer or Canva).</p>
    <div class="grid">${(c.imagePrompts || []).map((p, i) => `
      <div class="card"><h3>${esc(p.title)}</h3>
        <span class="tag">${esc(p.platform)}</span> <span class="tag">${esc(p.size)}</span>
        <p><b>Feature shown:</b> ${esc(p.featureShown)}</p>
        <div class="prompt" id="p${i}">${esc(p.prompt)}</div>
        <button class="ghost" onclick="navigator.clipboard.writeText(document.getElementById('p${i}').innerText);this.textContent='Copied'">Copy prompt</button>
      </div>`).join("")}</div>
    <div class="grid">
      <div class="card"><h3>Captions</h3>${list(c.captions)}</div>
      <div class="card"><h3>Hashtags</h3><p>${(c.hashtags || []).map((h) => esc(h.startsWith("#") ? h : "#" + h)).join(" ")}</p></div>
    </div>`;
}

// ---------- 05 Action plan + notifications ----------
function renderPlan() {
  const tasks = (current.result.strategy?.tasks || []).map((t, i) => ({ ...t, i }));
  const today = new Date().toISOString().slice(0, 10);
  const soon = new Date(Date.now() + 3 * 864e5).toISOString().slice(0, 10);
  const groups = {
    "Overdue": tasks.filter((t) => !current.tasksDone[t.i] && t.end < today),
    "Do now (next 3 days)": tasks.filter((t) => !current.tasksDone[t.i] && t.end >= today && t.start <= soon),
    "Upcoming": tasks.filter((t) => !current.tasksDone[t.i] && t.start > soon),
    "Completed": tasks.filter((t) => current.tasksDone[t.i]),
  };
  $("#planOut").className = "";
  $("#planOut").innerHTML = Object.entries(groups).map(([g, ts]) => `
    <div class="card" style="margin:12px 0"><h3 class="${g === "Overdue" ? "overdue" : ""}">${g} (${ts.length})</h3>
      ${ts.map((t) => `<div class="task ${current.tasksDone[t.i] ? "done" : ""}">
        <input type="checkbox" ${current.tasksDone[t.i] ? "checked" : ""} onchange="toggleTask(${t.i}, this.checked)">
        <div><div class="ttl"><b>${esc(t.title)}</b> <span class="tag">${esc(t.channel)}</span></div>
        <small>${esc(t.start)} → ${esc(t.end)} · ${esc(t.description)}</small></div></div>`).join("") || "<small class='muted'>Nothing here.</small>"}
    </div>`).join("");
  const due = groups["Overdue"].length + groups["Do now (next 3 days)"].length;
  $("#badge").textContent = due;
  $("#badge").classList.toggle("hidden", due === 0);
  return groups;
}
window.toggleTask = (i, v) => { current.tasksDone[i] = v; saveCurrent(); renderPlan(); };

$("#notifyBtn").addEventListener("click", async () => {
  if (!current) return alert("Generate or open a campaign first.");
  if (!("Notification" in window)) return alert("This browser does not support notifications.");
  const perm = await Notification.requestPermission();
  if (perm !== "granted") return;
  const g = renderPlan();
  const next = [...g["Overdue"], ...g["Do now (next 3 days)"]];
  new Notification("VYBE STUDIO – next actions", { body: next.length ? next.slice(0, 3).map((t) => "• " + t.title).join("\n") : "You're all caught up." });
});

$("#icsBtn").addEventListener("click", () => {
  if (!current) return alert("Generate or open a campaign first.");
  const f = (d) => d.replace(/-/g, "");
  const ev = (current.result.strategy?.tasks || []).map((t, i) =>
    `BEGIN:VEVENT\r\nUID:vybe-${current.id}-${i}\r\nDTSTAMP:${new Date().toISOString().replace(/[-:]/g, "").slice(0, 15)}Z\r\nDTSTART;VALUE=DATE:${f(t.start)}\r\nDTEND;VALUE=DATE:${f(t.end)}\r\nSUMMARY:${t.title} (${t.channel})\r\nDESCRIPTION:${(t.description || "").replace(/\n/g, " ")}\r\nBEGIN:VALARM\r\nTRIGGER:-PT9H\r\nACTION:DISPLAY\r\nDESCRIPTION:${t.title}\r\nEND:VALARM\r\nEND:VEVENT`).join("\r\n");
  const ics = `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//VYBE STUDIO//EN\r\n${ev}\r\nEND:VCALENDAR`;
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([ics], { type: "text/calendar" }));
  a.download = `${current.inputs.campaignName}.ics`;
  a.click();
});

// ---------- 06 Dashboard ----------
$("#csvInput").addEventListener("change", (e) => {
  const f = e.target.files[0];
  if (f) Papa.parse(f, { header: true, dynamicTyping: true, skipEmptyLines: true, complete: (r) => usePerformance(r.data) });
});
$("#sampleBtn").addEventListener("click", () =>
  Papa.parse("sample-performance.csv", { download: true, header: true, dynamicTyping: true, skipEmptyLines: true, complete: (r) => usePerformance(r.data) })
);
function usePerformance(rows) {
  if (!current) return alert("Generate or open a campaign first, then load performance data.");
  current.performance = rows; current.insights = null; saveCurrent(); renderDashboard();
}
function renderDashboard() {
  charts.forEach((c) => c.destroy()); charts = [];
  $("#insightOut").innerHTML = current?.insights ? insightHTML(current.insights) : "";
  const rows = current?.performance;
  $("#insightBtn").classList.toggle("hidden", !rows);
  if (!rows) { $("#kpis").innerHTML = ""; return; }
  const sum = (k) => rows.reduce((a, r) => a + (+r[k] || 0), 0);
  const T = { impressions: sum("impressions"), clicks: sum("clicks"), conversions: sum("conversions"), spend: sum("spend"), revenue: sum("revenue") };
  const kpi = [["Impressions", T.impressions.toLocaleString()], ["Clicks", T.clicks.toLocaleString()], ["CTR", (T.clicks / T.impressions * 100 || 0).toFixed(2) + "%"],
    ["Conversions", T.conversions], ["Conv. rate", (T.conversions / T.clicks * 100 || 0).toFixed(2) + "%"], ["Spend", T.spend.toFixed(0)],
    ["Revenue", T.revenue.toFixed(0)], ["ROI", ((T.revenue - T.spend) / T.spend * 100 || 0).toFixed(0) + "%"], ["Cost / conversion", (T.spend / T.conversions || 0).toFixed(2)]];
  $("#kpis").innerHTML = kpi.map(([k, v]) => `<div class="kpi">${k}<b>${v}</b></div>`).join("");

  const dates = [...new Set(rows.map((r) => r.date))].sort();
  const plats = [...new Set(rows.map((r) => r.platform))];
  const by = (key, field, val) => rows.filter((r) => r[key] === val).reduce((a, r) => a + (+r[field] || 0), 0);
  charts.push(new Chart($("#lineChart"), { type: "line", data: { labels: dates, datasets: [
    { label: "Clicks", data: dates.map((d) => by("date", "clicks", d)), borderColor: palette[0], tension: 0.3 },
    { label: "Conversions", data: dates.map((d) => by("date", "conversions", d)), borderColor: palette[1], tension: 0.3 }] },
    options: { plugins: { title: { display: true, text: "Clicks & conversions over time" } } } }));
  charts.push(new Chart($("#barChart"), { type: "bar", data: { labels: plats, datasets: [
    { label: "Spend", data: plats.map((p) => by("platform", "spend", p)), backgroundColor: palette[2] },
    { label: "Revenue", data: plats.map((p) => by("platform", "revenue", p)), backgroundColor: palette[0] }] },
    options: { plugins: { title: { display: true, text: "Spend vs revenue by platform" } } } }));
  charts.push(new Chart($("#pieChart"), { type: "pie", data: { labels: plats, datasets: [{ data: plats.map((p) => by("platform", "conversions", p)), backgroundColor: palette }] },
    options: { plugins: { title: { display: true, text: "Conversions by platform" } } } }));
  current.totals = T;
}
$("#insightBtn").addEventListener("click", async (e) => {
  e.target.disabled = true; $("#insightOut").innerHTML = "<p>Analysing performance…</p>";
  try {
    current.insights = await callAI("insights", { campaign: current.inputs, kpiTargets: current.result.kpis, totals: current.totals, rows: current.performance.slice(0, 60) });
    saveCurrent(); $("#insightOut").innerHTML = insightHTML(current.insights);
  } catch (err) { $("#insightOut").innerHTML = `<p class="overdue">${esc(err.message)}</p>`; }
  e.target.disabled = false;
});
const insightHTML = (r) => `<div class="card" style="margin:14px 0"><h3>AI performance summary</h3><p>${esc(r.summary)}</p></div>
  <div class="grid"><div class="card"><h3>Wins</h3>${list(r.wins)}</div><div class="card"><h3>Problems</h3>${list(r.problems)}</div><div class="card"><h3>Recommendations</h3>${list(r.recommendations)}</div></div>`;

// ---------- 07 History ----------
function renderHistory() {
  const all = loadAll();
  $("#historyOut").innerHTML = all.length ? all.map((c) => `
    <div class="card hist" style="margin:10px 0">
      <div><b>${esc(c.inputs.campaignName)}</b> · ${esc(c.inputs.brandName)}<br>
      <small>${esc(c.inputs.objective)} · ${esc(c.inputs.startDate)} → ${esc(c.inputs.endDate)} · Budget ${esc(c.inputs.budget)} ${esc(c.inputs.currency)}
      ${c.totals ? ` · Actual ROI ${(((c.totals.revenue - c.totals.spend) / c.totals.spend) * 100).toFixed(0)}%` : ""}</small></div>
      <div><button class="ghost" onclick="openCampaign('${c.id}')">Open</button>
      <button class="ghost" onclick="reuseCampaign('${c.id}')">Reuse inputs</button>
      <button class="ghost" onclick="deleteCampaign('${c.id}')">Delete</button></div>
    </div>`).join("") : `<div class="empty">No saved campaigns yet.</div>`;
}
window.openCampaign = (id) => { current = loadAll().find((c) => c.id === id); renderAll(); showTab("analysis"); };
window.deleteCampaign = (id) => { if (confirm("Delete this campaign?")) { saveAll(loadAll().filter((c) => c.id !== id)); renderHistory(); } };
window.reuseCampaign = (id) => {
  const c = loadAll().find((x) => x.id === id), f = $("#campaignForm");
  Object.entries(c.inputs).forEach(([k, v]) => { if (f.elements[k] && k !== "channels") f.elements[k].value = v; });
  f.querySelectorAll("input[name=channels]").forEach((cb) => (cb.checked = c.inputs.channels.includes(cb.value)));
  showTab("builder");
};
$("#historyAIBtn").addEventListener("click", async (e) => {
  const all = loadAll();
  if (!all.length) return alert("No saved campaigns yet.");
  e.target.disabled = true; $("#historyAI").innerHTML = "<p>Looking at your past campaigns…</p>";
  try {
    const r = await callAI("history", all.slice(0, 10).map((c) => ({ inputs: c.inputs, budgetSplit: c.result.budgetSplit, results: c.totals || "no data yet", insights: c.insights?.summary })));
    $("#historyAI").innerHTML = `<div class="grid"><div class="card"><h3>Patterns</h3>${list(r.patterns)}</div><div class="card"><h3>Recommendations</h3>${list(r.recommendations)}</div><div class="card"><h3>Next campaign idea</h3><p>${esc(r.nextCampaignIdea)}</p></div></div>`;
  } catch (err) { $("#historyAI").innerHTML = `<p class="overdue">${esc(err.message)}</p>`; }
  e.target.disabled = false;
});

// ---------- Start: reopen latest campaign ----------
const latest = loadAll()[0];
if (latest) { current = latest; renderAll(); }

// ---------- Campaign toolbar + chat panel (basic wiring) ----------
function renderBar() {
  const bar = document.getElementById("campaignBar");
  if (!bar) return;
  bar.classList.toggle("hidden", !current);
  if (current) { $("#cbName").textContent = current.inputs?.campaignName || ""; $("#cbStatus").textContent = "Saved on this device"; }
}
function renderChat() {}
