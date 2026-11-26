importScripts('shared.js');

const CACHE_TTL_MS = 60 * 60 * 1000;
const CONCURRENCY = 2;

// Local dev defaults — this points at the docker-compose backend's own API_KEY (backend/.env,
// docker-compose.yml:39), so the extension scans with zero setup. Override the URL in Options
// if you point this at a different backend; the key only needs changing if that one rotates.
const DEFAULT_API_BASE = 'http://localhost:8000';
const DEFAULT_API_KEY = 'chs7e9mVP0fxS6_c-3aaafclVrC7kbL5';

let settings = { apiBase: DEFAULT_API_BASE, apiKey: DEFAULT_API_KEY };
chrome.storage.local.get(['apiBase'], (v) => {
  if (v.apiBase) settings.apiBase = v.apiBase;
});
chrome.storage.onChanged.addListener((changes) => {
  if (changes.apiBase) settings.apiBase = changes.apiBase.newValue || DEFAULT_API_BASE;
});

// hostname -> { score, verdict, reasons, ts }
const cache = new Map();
// tabId -> array of { hostname, score, verdict, reasons } for flagged (suspicious/scam) links seen on that tab
const flaggedPerTab = new Map();
// tabId -> array of { hostname, error }
const errorsPerTab = new Map();
// tabId -> count of hostnames queued but not yet delivered
const inFlightPerTab = new Map();
// tabId -> total hostnames scanned (success + error), for the popup summary line
const scannedPerTab = new Map();

const queue = [];
let active = 0;

function enqueue(hostname, tabId) {
  inFlightPerTab.set(tabId, (inFlightPerTab.get(tabId) || 0) + 1);
  queue.push({ hostname, tabId });
  pump();
}

function settled(tabId) {
  const n = (inFlightPerTab.get(tabId) || 1) - 1;
  if (n <= 0) inFlightPerTab.delete(tabId);
  else inFlightPerTab.set(tabId, n);
  scannedPerTab.set(tabId, (scannedPerTab.get(tabId) || 0) + 1);
}

function pump() {
  while (active < CONCURRENCY && queue.length) {
    const job = queue.shift();
    active++;
    scanOne(job.hostname, job.tabId).finally(() => {
      active--;
      pump();
    });
  }
}

async function scanOne(hostname, tabId) {
  const cached = cache.get(hostname);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
    deliver(hostname, cached, tabId);
    return;
  }
  try {
    const res = await fetch(`${settings.apiBase}/api/scan`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': settings.apiKey },
      body: JSON.stringify({ url: hostname, fast: true }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const r = await res.json();
    const result = { score: r.score ?? 0, verdict: r.verdict, reasons: r.reasons || [], ts: Date.now() };
    cache.set(hostname, result);
    deliver(hostname, result, tabId);
  } catch (e) {
    reportError(hostname, String(e.message || e), tabId);
  }
}

function reportError(hostname, error, tabId) {
  settled(tabId);
  const list = errorsPerTab.get(tabId) || [];
  list.push({ hostname, error });
  errorsPerTab.set(tabId, list);
  chrome.tabs.sendMessage(tabId, { type: 'SCAN_ERROR', hostname, error }).catch(() => {});
}

function deliver(hostname, result, tabId) {
  settled(tabId);
  chrome.tabs.sendMessage(tabId, { type: 'SCAN_RESULT', hostname, result }).catch(() => {});

  if (result.verdict === 'suspicious' || result.verdict === 'scam') {
    const list = flaggedPerTab.get(tabId) || [];
    list.push({ hostname, score: result.score, verdict: result.verdict, reasons: result.reasons });
    flaggedPerTab.set(tabId, list);
    chrome.action.setBadgeText({ tabId, text: String(list.length) });
    chrome.action.setBadgeBackgroundColor({ tabId, color: LEVEL_COLOR[levelOf(result.score)] });
  }

  if (result.verdict === 'scam' && !result._notified) {
    result._notified = true;
    chrome.notifications.create(`scam-${hostname}-${Date.now()}`, {
      type: 'basic',
      iconUrl: 'icons/icon128.png',
      title: 'Scam link detected',
      message: `${hostname} scored ${result.score}/100 — ${result.reasons[0]?.reason_en || 'looks like a scam'}.`,
    });
  }
}

// Email content scans (both Gmail auto-scan and the popup's paste box) go straight to the
// backend, bypassing the link queue above — they're rarer and user/page-triggered, not a flood
// of hostnames from one page load, so the extra concurrency bookkeeping isn't worth it here.
async function fetchEmailScan(subject, sender, body) {
  try {
    const res = await fetch(`${settings.apiBase}/api/scan/email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': settings.apiKey },
      body: JSON.stringify({ subject, sender, body }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return { ok: true, result: await res.json() };
  } catch (e) {
    return { ok: false, error: String(e.message || e) };
  }
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'SCAN_LINKS' && sender.tab) {
    for (const hostname of msg.hostnames) enqueue(hostname, sender.tab.id);
  }
  if (msg.type === 'SCAN_EMAIL' && sender.tab) {
    const tabId = sender.tab.id;
    fetchEmailScan(msg.subject, msg.sender, msg.body).then((r) => {
      if (r.ok) chrome.tabs.sendMessage(tabId, { type: 'EMAIL_SCAN_RESULT', id: msg.id, result: r.result }).catch(() => {});
    });
  }
  if (msg.type === 'SCAN_EMAIL_PASTE') {
    fetchEmailScan(msg.subject, msg.sender, msg.body).then(sendResponse);
    return true; // keep the message channel open for the async sendResponse above
  }
  if (msg.type === 'GET_TAB_FLAGS') {
    sendResponse({
      flagged: flaggedPerTab.get(msg.tabId) || [],
      errors: errorsPerTab.get(msg.tabId) || [],
      inFlight: inFlightPerTab.get(msg.tabId) || 0,
      scanned: scannedPerTab.get(msg.tabId) || 0,
      apiBase: settings.apiBase,
    });
  }
});

function clearTab(tabId) {
  flaggedPerTab.delete(tabId);
  errorsPerTab.delete(tabId);
  inFlightPerTab.delete(tabId);
  scannedPerTab.delete(tabId);
}

chrome.tabs.onRemoved.addListener(clearTab);

// Without this, flags/errors and the badge count from the previous page survive a navigation in
// the same tab — content.js re-scans the new page's links, but the old page's results never clear.
chrome.tabs.onUpdated.addListener((tabId, info) => {
  if (info.status === 'loading') {
    clearTab(tabId);
    chrome.action.setBadgeText({ tabId, text: '' });
  }
});
