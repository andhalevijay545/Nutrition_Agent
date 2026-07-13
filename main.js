/* ============================================================
   NUTRITION AGENT — Frontend Logic
   Chat UI | BMI Calculator | Meal Planner | Family Profiles
   ============================================================ */

"use strict";

// ──────────────────────────────────────────────────────────
//  State
// ──────────────────────────────────────────────────────────
const State = {
  theme:        localStorage.getItem("nutriTheme") || "light",
  activeTab:    "chat",
  familyMembers: JSON.parse(localStorage.getItem("nutriFamily") || "[]"),
  bmiResult:    null,
  planGenerated: false,
};

// ──────────────────────────────────────────────────────────
//  DOM Refs
// ──────────────────────────────────────────────────────────
const $ = id => document.getElementById(id);
const $$ = sel => document.querySelectorAll(sel);

// ──────────────────────────────────────────────────────────
//  Theme
// ──────────────────────────────────────────────────────────
function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  const icon = $("themeToggle").querySelector("i");
  icon.className = theme === "dark" ? "bi bi-sun-fill" : "bi bi-moon-stars-fill";
  localStorage.setItem("nutriTheme", theme);
}

function toggleTheme() {
  State.theme = State.theme === "dark" ? "light" : "dark";
  applyTheme(State.theme);
}

// ──────────────────────────────────────────────────────────
//  Tab Navigation
// ──────────────────────────────────────────────────────────
function switchTab(tabName) {
  // Hide all sections
  $$(".tab-section").forEach(s => s.classList.remove("active"));
  $$(".nav-btn").forEach(b => b.classList.remove("active"));

  // Show target
  const section = $(`tab-${tabName}`);
  if (section) section.classList.add("active");

  const btn = document.querySelector(`.nav-btn[data-tab="${tabName}"]`);
  if (btn) btn.classList.add("active");

  State.activeTab = tabName;

  // Close sidebar on mobile
  if (window.innerWidth < 992) closeSidebar();
}

// ──────────────────────────────────────────────────────────
//  Sidebar (mobile)
// ──────────────────────────────────────────────────────────
function openSidebar() {
  $("sidebar").classList.add("open");
  $("sidebarOverlay").classList.add("active");
}
function closeSidebar() {
  $("sidebar").classList.remove("open");
  $("sidebarOverlay").classList.remove("active");
}

// ──────────────────────────────────────────────────────────
//  Toast Notification
// ──────────────────────────────────────────────────────────
function showToast(message, type = "info") {
  const toast    = $("appToast");
  const toastBody= $("toastBody");
  toastBody.textContent = message;
  toast.className = `toast align-items-center text-bg-${type === "error" ? "danger" : type === "success" ? "success" : "secondary"} border-0`;
  const bsToast   = new bootstrap.Toast(toast, { delay: 3500 });
  bsToast.show();
}

// ──────────────────────────────────────────────────────────
//  Status Check
// ──────────────────────────────────────────────────────────
async function checkStatus() {
  try {
    const res  = await fetch("/api/status");
    const data = await res.json();

    const dot  = $("statusDot");
    const text = $("statusText");
    const badge= $("modelBadge");

    if (data.status === "ready") {
      dot.classList.add("connected");
      text.textContent = "AI Connected";
      badge.textContent = `Model: ${data.model.split("/").pop()}`;
    } else {
      dot.classList.add("disconnected");
      text.textContent = "Not Configured";
      badge.textContent = "Add IBM credentials to .env";
    }
  } catch {
    $("statusText").textContent = "Connection error";
  }
}

// ──────────────────────────────────────────────────────────
//  Chat — Send Message
// ──────────────────────────────────────────────────────────
function getActiveProfile() {
  if (State.familyMembers.length === 0) return null;
  return { family: State.familyMembers };
}

async function sendMessage() {
  const input   = $("chatInput");
  const message = input.value.trim();
  if (!message) return;

  // Append user message
  appendMessage("user", message, getTimeStr());
  input.value = "";
  autoResizeTextarea(input);
  updateCharCount(input);

  // Disable send
  $("sendBtn").disabled = true;
  const typingId = showTypingIndicator();

  try {
    const res  = await fetch("/api/chat", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({
        message,
        profile: getActiveProfile(),
      }),
    });
    const data = await res.json();

    removeTypingIndicator(typingId);

    if (data.error) {
      appendMessage("bot", `⚠️ ${data.error}`, data.timestamp || getTimeStr());
    } else {
      appendMessage("bot", data.response, data.timestamp || getTimeStr());
    }
  } catch (err) {
    removeTypingIndicator(typingId);
    appendMessage("bot", "⚠️ Network error. Please check your connection.", getTimeStr());
  } finally {
    $("sendBtn").disabled = false;
    input.focus();
  }
}

// ──────────────────────────────────────────────────────────
//  Chat — Append Message to DOM
// ──────────────────────────────────────────────────────────
function appendMessage(role, text, time) {
  const messages = $("chatMessages");
  const div  = document.createElement("div");
  div.className = `message ${role === "bot" ? "bot-message" : "user-message"}`;

  const avatar = document.createElement("div");
  avatar.className = "msg-avatar";
  avatar.textContent = role === "bot" ? "🥗" : "👤";

  const bubble = document.createElement("div");
  bubble.className = "msg-bubble";

  const textDiv = document.createElement("div");
  textDiv.className = "msg-text";
  // Render markdown-like formatting
  textDiv.innerHTML = renderMarkdown(text);

  const timeDiv = document.createElement("div");
  timeDiv.className = "msg-time";
  timeDiv.textContent = time;

  bubble.appendChild(textDiv);
  bubble.appendChild(timeDiv);
  div.appendChild(avatar);
  div.appendChild(bubble);
  messages.appendChild(div);
  scrollToBottom(messages);
  return div;
}

// ──────────────────────────────────────────────────────────
//  Simple Markdown Renderer
// ──────────────────────────────────────────────────────────
function renderMarkdown(text) {
  if (!text) return "";
  return text
    // Bold **text**
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    // Italic *text*
    .replace(/\*(.*?)\*/g, "<em>$1</em>")
    // Headers ## ###
    .replace(/^### (.*)/gm, "<h6 class='mt-2 mb-1'>$1</h6>")
    .replace(/^## (.*)/gm,  "<h5 class='mt-2 mb-1'>$1</h5>")
    .replace(/^# (.*)/gm,   "<h4 class='mt-2 mb-1'>$1</h4>")
    // Bullet lists
    .replace(/^[\-\*] (.*)/gm, "<li>$1</li>")
    .replace(/(<li>.*<\/li>)/s, "<ul class='mb-1'>$1</ul>")
    // Numbered lists
    .replace(/^\d+\. (.*)/gm, "<li>$1</li>")
    // Code
    .replace(/`(.*?)`/g, "<code>$1</code>")
    // Line breaks
    .replace(/\n\n/g, "<br/><br/>")
    .replace(/\n/g,   "<br/>");
}

// ──────────────────────────────────────────────────────────
//  Typing Indicator
// ──────────────────────────────────────────────────────────
function showTypingIndicator() {
  const messages = $("chatMessages");
  const id       = "typing-" + Date.now();
  const div      = document.createElement("div");
  div.id         = id;
  div.className  = "message bot-message typing-indicator";
  div.innerHTML  = `
    <div class="msg-avatar">🥗</div>
    <div class="msg-bubble">
      <div class="msg-text">
        <div class="typing-dots">
          <span></span><span></span><span></span>
        </div>
      </div>
    </div>`;
  messages.appendChild(div);
  scrollToBottom(messages);
  return id;
}

function removeTypingIndicator(id) {
  const el = $(id);
  if (el) el.remove();
}

// ──────────────────────────────────────────────────────────
//  Clear Chat
// ──────────────────────────────────────────────────────────
async function clearChat() {
  if (!confirm("Clear conversation history?")) return;
  try {
    await fetch("/api/clear-chat", { method: "POST" });
  } catch {}
  const messages = $("chatMessages");
  // Keep welcome message, remove others
  const allMsgs = messages.querySelectorAll(".message:not(#welcomeMsg)");
  allMsgs.forEach(m => m.remove());
  showToast("Chat cleared", "success");
}

// ──────────────────────────────────────────────────────────
//  BMI Calculator
// ──────────────────────────────────────────────────────────
async function calculateBMI() {
  const weight   = parseFloat($("bmiWeight")?.value);
  const height   = parseFloat($("bmiHeight")?.value);
  const age      = parseInt($("bmiAge")?.value)     || 25;
  const gender   = $("bmiGender")?.value             || "male";
  const activity = $("bmiActivity")?.value           || "moderate";

  if (!weight || !height || weight < 20 || height < 50) {
    showToast("Please enter valid weight and height", "error"); return;
  }

  try {
    const res  = await fetch("/api/bmi", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ weight, height, age, gender, activity }),
    });
    const data = await res.json();
    if (data.error) { showToast(data.error, "error"); return; }

    State.bmiResult = data;
    renderBMIResults(data);
    updateDashboard(data);
  } catch {
    showToast("Calculation error", "error");
  }
}

function renderBMIResults(data) {
  const { bmi, tdee, water } = data;
  const container = $("bmiResults");

  // BMI gauge needle position (BMI 15–40 range → 0%–100%)
  const pct = Math.min(Math.max(((bmi.bmi - 15) / 25) * 100, 0), 100);

  container.innerHTML = `
    <div class="bmi-score-card" style="border-color:${bmi.color}33">
      <div class="bmi-score-number" style="color:${bmi.color}">${bmi.bmi}</div>
      <div class="bmi-score-category" style="color:${bmi.color}">${bmi.category}</div>
      <div class="bmi-gauge mt-3">
        <div class="bmi-gauge-needle" style="left:${pct}%"></div>
      </div>
      <div class="small text-muted mt-1">
        Healthy range: ${bmi.healthy_range}
      </div>
      <div class="mt-2 small" style="color:${bmi.color}">${bmi.advice}</div>
    </div>

    <div class="card-panel">
      <div class="panel-title">Daily Calorie Needs 🔥</div>
      <div class="calorie-grid">
        <div class="calorie-item">
          <div class="calorie-item-value">${tdee.maintenance}</div>
          <div class="calorie-item-label">Maintenance</div>
        </div>
        <div class="calorie-item">
          <div class="calorie-item-value">${tdee.weight_loss}</div>
          <div class="calorie-item-label">Weight Loss</div>
        </div>
        <div class="calorie-item">
          <div class="calorie-item-value">${tdee.weight_gain}</div>
          <div class="calorie-item-label">Weight Gain</div>
        </div>
        <div class="calorie-item">
          <div class="calorie-item-value">${tdee.bmr}</div>
          <div class="calorie-item-label">Base BMR</div>
        </div>
      </div>
    </div>

    <div class="card-panel">
      <div class="panel-title">💧 Daily Water Intake</div>
      <div class="d-flex align-items-center gap-3">
        <div style="font-size:2rem">💧</div>
        <div>
          <div style="font-size:1.6rem;font-weight:700;color:var(--accent)">
            ${water.total_liters} L
          </div>
          <div class="small text-muted">${water.glasses_8oz} glasses (8 oz each)</div>
        </div>
      </div>
    </div>
  `;
}

function updateDashboard(data) {
  const { bmi, tdee, water } = data;
  $("dashCalories").textContent = tdee.maintenance;
  $("dashProtein").textContent  = Math.round(tdee.maintenance * 0.25 / 4) + "g";
  $("dashWater").textContent    = water.total_liters;
  $("dashBMI").textContent      = bmi.bmi;

  // Update ring center
  const center = $("ringCenterCal");
  if (center) center.textContent = `${tdee.maintenance} kcal`;
}

// ──────────────────────────────────────────────────────────
//  Meal Plan Generator
// ──────────────────────────────────────────────────────────
async function generateMealPlan() {
  const goal      = $("planGoal")?.value     || "balanced diet";
  const calories  = parseInt($("planCalories")?.value) || 2000;
  const pref      = $("planPref")?.value     || "vegetarian";
  const days      = parseInt($("planDays")?.value) || 7;

  const planBtn    = $("generatePlanBtn");
  const planText   = $("planBtnText");
  const planLoader = $("planBtnLoader");
  const output     = $("mealPlanOutput");

  planText.classList.add("d-none");
  planLoader.classList.remove("d-none");
  planBtn.disabled = true;

  output.innerHTML = `<div class="empty-state">
    <div class="empty-icon" style="animation:pulse 1s infinite">⏳</div>
    <p>IBM Granite AI is crafting your meal plan…</p>
  </div>`;

  try {
    const res  = await fetch("/api/meal-plan", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({
        goal, calories, preferences: pref, days,
        family: State.familyMembers,
      }),
    });
    const data = await res.json();

    if (data.error) {
      output.innerHTML = `<div class="empty-state"><p style="color:var(--danger)">⚠️ ${data.error}</p></div>`;
    } else {
      output.innerHTML = renderMarkdown(data.plan);
      $("copyPlanBtn").style.display = "inline-flex";
      State.planGenerated = true;
      showToast("Meal plan generated!", "success");
    }
  } catch {
    output.innerHTML = `<div class="empty-state"><p style="color:var(--danger)">⚠️ Network error</p></div>`;
  } finally {
    planText.classList.remove("d-none");
    planLoader.classList.add("d-none");
    planBtn.disabled = false;
  }
}

// ──────────────────────────────────────────────────────────
//  Nutrition Lookup
// ──────────────────────────────────────────────────────────
async function nutritionLookup() {
  const q   = $("lookupInput")?.value.trim();
  const out = $("lookupResults");
  if (!q) { out.innerHTML = ""; return; }

  try {
    const res  = await fetch(`/api/nutrition-lookup?q=${encodeURIComponent(q)}`);
    const data = await res.json();

    if (!data.results || Object.keys(data.results).length === 0) {
      out.innerHTML = `<p class="text-muted small">No results for "<strong>${q}</strong>"</p>`;
      return;
    }

    let html = `<table class="nutrition-table">
      <thead><tr>
        <th>Food Item</th>
        <th>Calories</th>
        <th>Protein</th>
        <th>Carbs</th>
        <th>Fat</th>
      </tr></thead><tbody>`;

    for (const [item, vals] of Object.entries(data.results)) {
      html += `<tr>
        <td><strong>${item}</strong></td>
        <td>${vals.calories} kcal</td>
        <td>${vals.protein}g</td>
        <td>${vals.carbs}g</td>
        <td>${vals.fat}g</td>
      </tr>`;
    }
    html += "</tbody></table>";
    out.innerHTML = html;
  } catch {
    out.innerHTML = `<p class="text-muted small">Lookup failed</p>`;
  }
}

// ──────────────────────────────────────────────────────────
//  Family Profiles
// ──────────────────────────────────────────────────────────
const RELATION_EMOJI = {
  "Self": "🧑", "Spouse / Partner": "💑",
  "Child": "👧", "Parent": "👴",
  "Grandparent": "👵", "Sibling": "👫",
};

function addFamilyMember() {
  const name        = $("famName")?.value.trim();
  const age         = $("famAge")?.value;
  const relation    = $("famRelation")?.value;
  const goal        = $("famGoal")?.value;
  const restrictions = $("famRestrictions")?.value.trim() || "none";

  if (!name || !age) { showToast("Enter name and age", "error"); return; }

  const member = { name, age: parseInt(age), relation, goal, restrictions, id: Date.now() };
  State.familyMembers.push(member);
  localStorage.setItem("nutriFamily", JSON.stringify(State.familyMembers));

  // Reset form
  $("famName").value = "";
  $("famAge").value  = "";
  $("famRestrictions").value = "";

  renderFamilyList();
  showToast(`${name} added to family profile!`, "success");
}

function removeFamilyMember(id) {
  State.familyMembers = State.familyMembers.filter(m => m.id !== id);
  localStorage.setItem("nutriFamily", JSON.stringify(State.familyMembers));
  renderFamilyList();
}

function renderFamilyList() {
  const list     = $("familyList");
  const planBtn  = $("familyPlanBtn");

  if (State.familyMembers.length === 0) {
    list.innerHTML = `<div class="empty-state">
      <div class="empty-icon">👨‍👩‍👧</div>
      <p>No family members added yet. Add members to generate group meal plans!</p>
    </div>`;
    if (planBtn) planBtn.style.display = "none";
    return;
  }

  if (planBtn) planBtn.style.display = "inline-flex";

  let html = '<div class="family-grid">';
  State.familyMembers.forEach(m => {
    const emoji = RELATION_EMOJI[m.relation] || "👤";
    html += `
      <div class="family-card">
        <button class="family-card-remove" onclick="removeFamilyMember(${m.id})" title="Remove">
          <i class="bi bi-x-lg"></i>
        </button>
        <div class="family-card-avatar">${emoji}</div>
        <div class="family-card-name">${escapeHtml(m.name)}</div>
        <div class="family-card-detail">${m.age} yrs · ${m.relation}</div>
        <div class="family-card-tag">${m.goal}</div>
        ${m.restrictions !== "none"
          ? `<div class="small text-muted mt-1">⚠️ ${escapeHtml(m.restrictions)}</div>`
          : ""}
      </div>`;
  });
  html += "</div>";
  list.innerHTML = html;
}

function generateFamilyPlan() {
  // Switch to meal planner tab and trigger generation
  switchTab("mealplan");
  setTimeout(generateMealPlan, 200);
}

// ──────────────────────────────────────────────────────────
//  Utilities
// ──────────────────────────────────────────────────────────
function getTimeStr() {
  return new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function scrollToBottom(el) {
  requestAnimationFrame(() => { el.scrollTop = el.scrollHeight; });
}

function autoResizeTextarea(el) {
  el.style.height = "auto";
  el.style.height = Math.min(el.scrollHeight, 130) + "px";
}

function updateCharCount(el) {
  const counter = $("charCount");
  if (counter) counter.textContent = `${el.value.length}/2000`;
}

function escapeHtml(str) {
  return str.replace(/&/g,"&amp;").replace(/</g,"&lt;")
            .replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}

async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    showToast("Copied to clipboard!", "success");
  } catch {
    showToast("Copy failed", "error");
  }
}

// ──────────────────────────────────────────────────────────
//  Event Listeners
// ──────────────────────────────────────────────────────────
function initEventListeners() {
  // Theme toggle
  $("themeToggle")?.addEventListener("click", toggleTheme);

  // Sidebar toggle (mobile)
  $("sidebarToggle")?.addEventListener("click", openSidebar);
  $("sidebarOverlay")?.addEventListener("click", closeSidebar);

  // Tab navigation
  $$(".nav-btn").forEach(btn => {
    btn.addEventListener("click", () => switchTab(btn.dataset.tab));
  });

  // Quick prompts
  $$(".quick-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      switchTab("chat");
      const input = $("chatInput");
      input.value = btn.dataset.prompt;
      autoResizeTextarea(input);
      updateCharCount(input);
      sendMessage();
    });
  });

  // Chat send
  $("sendBtn")?.addEventListener("click", sendMessage);
  $("chatInput")?.addEventListener("keydown", e => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });
  $("chatInput")?.addEventListener("input", function () {
    autoResizeTextarea(this);
    updateCharCount(this);
  });

  // Clear chat
  $("clearChatBtn")?.addEventListener("click", clearChat);

  // BMI
  $("calcBmiBtn")?.addEventListener("click", calculateBMI);
  [$("bmiWeight"), $("bmiHeight"), $("bmiAge")].forEach(el => {
    el?.addEventListener("keydown", e => { if (e.key === "Enter") calculateBMI(); });
  });

  // Meal plan
  $("generatePlanBtn")?.addEventListener("click", generateMealPlan);
  $("copyPlanBtn")?.addEventListener("click", () => {
    const text = $("mealPlanOutput")?.textContent || "";
    copyToClipboard(text);
  });

  // Family
  $("addMemberBtn")?.addEventListener("click", addFamilyMember);
  $("familyPlanBtn")?.addEventListener("click", generateFamilyPlan);

  // Nutrition lookup
  $("lookupBtn")?.addEventListener("click", nutritionLookup);
  $("lookupInput")?.addEventListener("keydown", e => {
    if (e.key === "Enter") nutritionLookup();
  });
}

// ──────────────────────────────────────────────────────────
//  Init
// ──────────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
  applyTheme(State.theme);
  initEventListeners();
  checkStatus();
  renderFamilyList();

  // Auto-focus chat input
  setTimeout(() => $("chatInput")?.focus(), 200);
});
