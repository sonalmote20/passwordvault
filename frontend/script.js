
const $ = (id) => document.getElementById(id);

let credentials = [];
let unlocked = false;
let masterPassword = "";
let revealedIds = new Set();
let toastTimer;

const categories = ["Social", "Work", "Finance", "Shopping", "Other"];

function showToast(message) {
  $("toast").textContent = message;
  $("toast").classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $("toast").classList.remove("show"), 2600);
}

function showMessage(message, error = false) {
  $("message").textContent = message;
  $("message").classList.remove("hidden", "error");
  if (error) $("message").classList.add("error");
}

function hideMessage() {
  $("message").classList.add("hidden");
}

async function api(path, options = {}) {
  const headers = { ...(options.headers || {}) };

  if (options.body) headers["Content-Type"] = "application/json";
  if (unlocked) headers["X-Vault-Token"] = sessionToken;

  const response = await fetch(`/api${path}`, {
    ...options,
    headers
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || "Something went wrong.");
  }

  return data;
}

// Theme: saved locally in this browser.
function setTheme(theme) {
  document.body.classList.toggle("dark", theme === "dark");
  $("themeIcon").textContent = theme === "dark" ? "☀" : "☾";
  $("themeLabel").textContent = theme === "dark" ? "Light mode" : "Dark mode";
  localStorage.setItem("vaultly-theme", theme);
}

setTheme(localStorage.getItem("vaultly-theme") || "light");

$("themeToggle").addEventListener("click", () => {
  setTheme(document.body.classList.contains("dark") ? "light" : "dark");
});

let sessionToken = "";

function showAuth(initialized) {
  unlocked = false;
  sessionToken = "";
  masterPassword = "";
  credentials = [];
  document.body.classList.remove("locked");

  $("authPanel").classList.remove("hidden");
  $("vaultContent").classList.add("hidden");
  $("authTitle").textContent = initialized
    ? "Welcome back to your vault."
    : "A little privacy goes a long way.";
  $("authDescription").textContent = initialized
    ? "Enter your master password to unlock your credentials."
    : "Create a master password to protect your vault.";
  $("authSubmit").textContent = initialized
    ? "Unlock my vault →"
    : "Create secure vault →";
  $("confirmLabel").classList.toggle("hidden", initialized);
  $("confirmPassword").classList.toggle("hidden", initialized);
  $("confirmPassword").required = !initialized;
  $("masterPassword").value = "";
  $("confirmPassword").value = "";
  $("masterPassword").focus();
}

function showVault() {
  $("authPanel").classList.add("hidden");
  $("vaultContent").classList.remove("hidden");
  document.body.classList.remove("locked");
}

$("authForm").addEventListener("submit", async (event) => {
  event.preventDefault();

  const password = $("masterPassword").value;
  const confirmation = $("confirmPassword").value;
  const initialized = $("confirmPassword").classList.contains("hidden");

  if (password.length < 12) {
    showToast("Use a master password of at least 12 characters.");
    return;
  }

  if (!initialized && password !== confirmation) {
    showToast("The master passwords do not match.");
    return;
  }

  $("authSubmit").disabled = true;

  try {
    const result = await api(initialized ? "/unlock" : "/setup", {
      method: "POST",
      body: JSON.stringify({ master_password: password })
    });

    sessionToken = result.token;
    masterPassword = password;
    unlocked = true;
    showVault();
    await loadCredentials();
    showToast(initialized ? "Vault unlocked securely." : "Your vault is ready!");
  } catch (error) {
    showToast(error.message);
  } finally {
    $("authSubmit").disabled = false;
  }
});

async function loadCredentials() {
  try {
    const result = await api("/credentials");
    credentials = result.credentials || [];
    renderCredentials();
  } catch (error) {
    showToast(error.message);
  }
}

function renderCredentials() {
  const search = $("searchInput").value.trim().toLowerCase();
  const category = $("categoryFilter").value;

  const filtered = credentials.filter((item) => {
    const matchesSearch =
      item.website.toLowerCase().includes(search) ||
      item.username.toLowerCase().includes(search);

    return matchesSearch &&
      (category === "all" || item.category === category);
  });

  $("totalCount").textContent = credentials.length;
  $("navCount").textContent = credentials.length;
  $("categoryCount").textContent = new Set(
    credentials.map((item) => item.category)
  ).size;
  $("resultCount").textContent =
    `${filtered.length} ${filtered.length === 1 ? "entry" : "entries"}`;

  const tbody = $("passwordList");
  tbody.replaceChildren();
  $("emptyState").classList.toggle("hidden", filtered.length !== 0);

  if (!filtered.length) {
    $("emptyState").querySelector("h3").textContent =
      credentials.length ? "No matching passwords found" :
      "Your vault is ready for its first secret";
    $("emptyState").querySelector("p").textContent =
      credentials.length ? "Try another search or category." :
      "Add a login and it will appear here, neatly organized.";
  }

  for (const item of filtered) {
    const tr = document.createElement("tr");

    const siteCell = document.createElement("td");
    const site = document.createElement("div");
    site.className = "site-cell";

    const logo = document.createElement("div");
    logo.className = "site-logo";
    logo.textContent = item.website.charAt(0).toUpperCase();

    const siteInfo = document.createElement("div");
    const siteName = document.createElement("span");
    siteName.className = "site-name";
    siteName.textContent = item.website;

    const siteSub = document.createElement("span");
    siteSub.className = "site-sub";
    siteSub.textContent = "Login credential";

    siteInfo.append(siteName, siteSub);
    site.append(logo, siteInfo);
    siteCell.append(site);

    const userCell = document.createElement("td");
    userCell.textContent = item.username;

    const passwordCell = document.createElement("td");
    const passwordText = document.createElement("span");
    passwordText.className = revealedIds.has(item.id)
      ? ""
      : "masked-password";
    passwordText.textContent = revealedIds.has(item.id)
      ? item.password
      : "••••••••••";
    passwordCell.append(passwordText);

    const categoryCell = document.createElement("td");
    const pill = document.createElement("span");
    pill.className = "category-pill";
    pill.textContent = item.category;
    categoryCell.append(pill);

    const actionCell = document.createElement("td");
    const actions = document.createElement("div");
    actions.className = "row-actions";

    const toggle = document.createElement("button");
    toggle.className = "small-action";
    toggle.textContent = revealedIds.has(item.id) ? "Hide" : "Show";
    toggle.addEventListener("click", () => {
      if (revealedIds.has(item.id)) revealedIds.delete(item.id);
      else revealedIds.add(item.id);
      renderCredentials();
    });

    const copy = document.createElement("button");
    copy.className = "small-action";
    copy.textContent = "Copy";
    copy.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(item.password);
        showToast("Password copied. Clear your clipboard when finished.");
      } catch {
        showToast("Clipboard unavailable. Use Show to view the password.");
      }
    });

    const remove = document.createElement("button");
    remove.className = "small-action";
    remove.textContent = "Delete";
    remove.addEventListener("click", async () => {
      if (!confirm(`Delete the saved login for ${item.website}?`)) return;
      try {
        await api(`/credentials/${encodeURIComponent(item.id)}`, {
          method: "DELETE"
        });
        revealedIds.delete(item.id);
        await loadCredentials();
        showToast("Credential deleted.");
      } catch (error) {
        showToast(error.message);
      }
    });

    actions.append(toggle, copy, remove);
    actionCell.append(actions);
    tr.append(siteCell, userCell, passwordCell, categoryCell, actionCell);
    tbody.append(tr);
  }
}

function openModal() {
  if (!unlocked) {
    showToast("Unlock your vault first.");
    return;
  }
  $("passwordForm").reset();
  $("sitePassword").type = "password";
  $("showInputBtn").textContent = "Show";
  $("passwordModal").classList.remove("hidden");
  $("website").focus();
}

function closeModal() {
  $("passwordModal").classList.add("hidden");
  $("passwordForm").reset();
}

["addBtn", "bannerAddBtn", "emptyAddBtn"].forEach((id) => {
  $(id).addEventListener("click", openModal);
});

$("closeModal").addEventListener("click", closeModal);
$("cancelModal").addEventListener("click", closeModal);

$("passwordModal").addEventListener("click", (event) => {
  if (event.target.dataset.close === "true") closeModal();
});

$("showInputBtn").addEventListener("click", () => {
  const input = $("sitePassword");
  input.type = input.type === "password" ? "text" : "password";
  $("showInputBtn").textContent = input.type === "password" ? "Show" : "Hide";
});

$("generateBtn").addEventListener("click", () => {
  // Generate with Web Crypto; require a secure browser context.
  if (!window.crypto?.getRandomValues) {
    showToast("Secure password generation is unavailable.");
    return;
  }

  const chars =
    "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%&*?";
  const random = new Uint32Array(24);
  crypto.getRandomValues(random);
  $("sitePassword").value = Array.from(random,
    (number) => chars[number % chars.length]).join("");
  $("sitePassword").type = "text";
  $("showInputBtn").textContent = "Hide";
});

$("passwordForm").addEventListener("submit", async (event) => {
  event.preventDefault();

  const entry = {
    website: $("website").value.trim(),
    username: $("username").value.trim(),
    password: $("sitePassword").value,
    category: $("category").value
  };

  if (!entry.website || !entry.username || !entry.password) {
    showToast("Please complete all fields.");
    return;
  }

  $("saveBtn").disabled = true;

  try {
    await api("/credentials", {
      method: "POST",
      body: JSON.stringify(entry)
    });
    closeModal();
    await loadCredentials();
    showToast("Password encrypted and saved.");
  } catch (error) {
    showToast(error.message);
  } finally {
    $("saveBtn").disabled = false;
  }
});

$("searchInput").addEventListener("input", renderCredentials);
$("categoryFilter").addEventListener("change", renderCredentials);
$("refreshBtn").addEventListener("click", loadCredentials);

$("allNav").addEventListener("click", () => {
  $("categoryFilter").value = "all";
  $("searchInput").value = "";
  renderCredentials();
});

$("dashboardNav").addEventListener("click", () => {
  $("categoryFilter").value = "all";
  $("searchInput").value = "";
  renderCredentials();
});

$("lockBtn").addEventListener("click", async () => {
  try {
    if (unlocked) await api("/lock", { method: "POST" });
  } catch {
    // Lock the local interface even if the server request fails.
  }
  unlocked = false;
  sessionToken = "";
  masterPassword = "";
  credentials = [];
  revealedIds.clear();
  showAuth(true);
  showToast("Vault locked.");
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") closeModal();

  if (event.key === "/" &&
      !["INPUT", "TEXTAREA"].includes(document.activeElement.tagName)) {
    event.preventDefault();
    $("searchInput").focus();
  }
});

async function initialize() {
  try {
    const result = await api("/status");
    showAuth(result.initialized);
  } catch {
    showMessage("Cannot connect to the backend. Start Docker Compose and try again.", true);
    $("authPanel").classList.remove("hidden");
    $("vaultContent").classList.add("hidden");
  }
}

initialize();
