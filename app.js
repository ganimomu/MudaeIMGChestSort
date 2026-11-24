// ---------------------------------------------------------------------------
// Shared helpers (used by both the Grabber and the Uploader) + the Grabber tab
// ---------------------------------------------------------------------------
const API_BASE = "https://api.imgchest.com/v1";
const POST_URL_BASE = "https://imgchest.com/p/";
const MUDAE_SEPARATOR = " $ ";

const tokenField = document.getElementById("txtApi");
try {
    tokenField.value = localStorage.getItem("apiKey") || "";
} catch (e) { /* storage unavailable: token just won't persist */ }

function getToken() {
    return tokenField.value.trim();
}

function rememberToken() {
    try { localStorage.setItem("apiKey", getToken()); } catch (e) { /* ignore */ }
}

// ---- toast ---------------------------------------------------------------
let toastTimer;
function showToast(message) {
    const el = document.getElementById("liveToast");
    document.getElementById("toastBody").textContent = message;
    if (window.bootstrap) {
        bootstrap.Toast.getOrCreateInstance(el).show();
    } else { // Bootstrap CDN unreachable: minimal fallback
        el.classList.add("show");
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => el.classList.remove("show"), 4000);
    }
}

// ---- clipboard -----------------------------------------------------------
async function copyFrom(box) {
    try {
        await navigator.clipboard.writeText(box.value);
    } catch (e) { // insecure context or permission denied
        box.select();
        document.execCommand("copy");
    }
    showToast("Text copied to clipboard");
}

// ---- IMG Chest API -------------------------------------------------------
function parseAlbumId(input) {
    const s = (input || "").trim();
    const m = s.match(/imgchest\.com\/p\/([A-Za-z0-9]+)/i);
    if (m) return m[1];
    return /^[A-Za-z0-9]+$/.test(s) ? s : null; // bare ID
}

function describeApiError(res, body, raw = "") {
    if (res.status === 401) return "IMG Chest rejected the API token (401).";
    if (res.status === 429) return "IMG Chest rate limit reached (429). Wait a minute and try again.";
    let detail = body && body.message;
    if (body && body.errors && typeof body.errors === "object") {
        detail = Object.values(body.errors).flat().join(" ");
    }
    // No readable message: show (a short piece of) whatever the server sent
    if (!detail && raw) detail = raw.replace(/\s+/g, " ").trim().slice(0, 200);
    return `IMG Chest error ${res.status}${detail ? ": " + detail : ""}`;
}

async function apiRequest(path, options = {}) {
    let res;
    try {
        res = await fetch(API_BASE + path, {
            mode: "cors",
            ...options,
            headers: {
                "Authorization": "Bearer " + getToken(),
                "Accept": "application/json",
                ...(options.headers || {})
            }
        });
    } catch (e) {
        throw new Error("Couldn't reach IMG Chest (network problem, or the browser blocked the request).");
    }
    const raw = await res.text().catch(() => "");
    let body = null;
    try { body = JSON.parse(raw); } catch (e) { /* non-JSON body */ }
    if (!res.ok) throw new Error(describeApiError(res, body, raw));
    return body;
}

// Mudae wants "link $ link $ link"
function formatLinks(images) {
    return (images || [])
        .filter(Boolean)
        .slice()
        .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
        .map(img => img.link)
        .join(MUDAE_SEPARATOR);
}

// ---- tabs ----------------------------------------------------------------
function showTab(name) {
    document.querySelectorAll("[data-tab]").forEach(btn => {
        const active = btn.dataset.tab === name;
        btn.classList.toggle("active", active);
        btn.setAttribute("aria-selected", String(active));
        document.getElementById("panel-" + btn.dataset.tab).hidden = !active;
    });
}
document.querySelectorAll("[data-tab]").forEach(btn =>
    btn.addEventListener("click", () => showTab(btn.dataset.tab)));

// ---- Grabber -------------------------------------------------------------
const grabLinkField = document.getElementById("txtLink");

function setGrabberUrl(url) {
    grabLinkField.value = url;
}

async function grab() {
    if (!getToken()) return showToast("API Token not set");
    if (!grabLinkField.value.trim()) return showToast("Album URL not set");
    const albumId = parseAlbumId(grabLinkField.value);
    if (!albumId) return showToast("That doesn't look like an IMG Chest album URL");

    try {
        const data = await apiRequest("/post/" + albumId);
        rememberToken();
        document.getElementById("txtOut").value = formatLinks(data.data.images);
        document.getElementById("divCopy").removeAttribute("hidden");
    } catch (e) {
        showToast(e.message);
    }
}

document.getElementById("btnGrab").addEventListener("click", grab);
document.getElementById("btnCopy").addEventListener("click", () =>
    copyFrom(document.getElementById("txtOut")));

// Exposed for uploader.js
window.MudaeApp = {
    API_BASE, POST_URL_BASE, getToken, rememberToken, showToast, copyFrom,
    apiRequest, formatLinks, setGrabberUrl, showTab
};
