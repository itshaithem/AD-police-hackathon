importScripts('shared.js');

const CACHE_TTL_MS = 60 * 60 * 1000;
const CONCURRENCY = 2;

let settings = { apiBase: 'http://localhost:8000', apiKey: '' };
chrome.storage.local.get(['apiBase', 'apiKey'], (v) => {
  if (v.apiBase) settings.apiBase = v.apiBase;
  if (v.apiKey) settings.apiKey = v.apiKey;
});
chrome.storage.onChanged.addListener((changes) => {
  if (changes.apiBase) settings.apiBase = changes.apiBase.newValue;
  if (changes.apiKey) settings.apiKey = changes.apiKey.newValue;
});

// hostname -> { score, verdict, reasons, ts }
const cache = new Map();
// tabId -> array of { hostname, score, verdict, reasons } for flagged (suspicious/scam) links seen on that tab
const flaggedPerTab = new Map();

const queue = [];
let active = 0;

function enqueue(hostname, tabId) {
  queue.push({ hostname, tabId });
  pump();
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
  if (!settings.apiKey) {
    chrome.tabs.sendMessage(tabId, { type: 'SCAN_ERROR', hostname, error: 'no API key set — open extension Options' }).catch(() => {});
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
    chrome.tabs.sendMessage(tabId, { type: 'SCAN_ERROR', hostname, error: String(e) }).catch(() => {});
  }
}

function deliver(hostname, result, tabId) {
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

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'SCAN_LINKS' && sender.tab) {
    for (const hostname of msg.hostnames) enqueue(hostname, sender.tab.id);
  }
  if (msg.type === 'GET_TAB_FLAGS') {
    sendResponse({ flagged: flaggedPerTab.get(msg.tabId) || [] });
  }
});

chrome.tabs.onRemoved.addListener((tabId) => flaggedPerTab.delete(tabId));

// Without this, flags and the badge count from the previous page survive a navigation in the
// same tab — content.js re-scans the new page's links, but the old page's results never clear.
chrome.tabs.onUpdated.addListener((tabId, info) => {
  if (info.status === 'loading') {
    flaggedPerTab.delete(tabId);
    chrome.action.setBadgeText({ tabId, text: '' });
  }
});
