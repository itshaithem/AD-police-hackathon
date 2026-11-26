const seen = new Set(); // hostnames already sent for scanning from this page
const resultsByHost = new Map(); // hostname -> last known scan result, for anchors added after the result arrived
const errorsByHost = new Map(); // hostname -> last error message
const pendingChecks = new Map(); // hostname -> resolver functions waiting on a scan (see waitForResult)

// Reloading/updating the extension invalidates chrome.* APIs in any content script still attached
// to an already-open tab — every call throws "Extension context invalidated" until that tab reloads.
function extensionAlive() {
  return !!(chrome.runtime && chrome.runtime.id);
}

// Bare "http(s)://..." URLs written as plain text (not inside an <a>) are invisible to the
// a[href] scan below. Wrap them in real <a> tags so the rest of the pipeline treats them
// identically to a normal link. Self-terminating: once wrapped, no bare URL text remains for
// the next mutation-triggered pass to find.
const URL_RE = /\bhttps?:\/\/[^\s<>"')\]]+/g;
const SKIP_TAGS = new Set(['A', 'SCRIPT', 'STYLE', 'NOSCRIPT', 'TEXTAREA']);

function linkifyTextNodes() {
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const p = node.parentElement;
      if (!p || SKIP_TAGS.has(p.tagName) || p.isContentEditable) return NodeFilter.FILTER_REJECT;
      URL_RE.lastIndex = 0;
      return URL_RE.test(node.nodeValue) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
    },
  });
  const nodes = [];
  let n;
  while ((n = walker.nextNode())) nodes.push(n);

  for (const node of nodes) {
    const text = node.nodeValue;
    const frag = document.createDocumentFragment();
    let last = 0;
    let changed = false;
    URL_RE.lastIndex = 0;
    let m;
    while ((m = URL_RE.exec(text))) {
      const url = m[0].replace(/[.,;:!?]+$/, '');
      if (!url) continue;
      changed = true;
      frag.append(text.slice(last, m.index));
      const a = document.createElement('a');
      a.href = url;
      a.textContent = url;
      a.dataset.scamshieldAutolink = '1';
      a.style.cssText = 'color:inherit;text-decoration:underline dotted;';
      frag.append(a);
      last = m.index + url.length;
    }
    if (!changed) continue;
    frag.append(text.slice(last));
    node.replaceWith(frag);
  }
}

// Scans the page's own visible text once per page load (not just its links) for scam content —
// urgency language, brand impersonation, requests for sensitive info — via the same backend
// pipeline a link scan uses. See backend/app/pipeline/__init__.py:run_email_scan. Runs on every
// page (not just webmail); the backend skips its own expensive LLM step when the cheap heuristics
// find nothing, so an ordinary page costs little beyond the one heuristic pass.
let pageContentScanId = null; // set once per page load; guards against re-sending on every mutation

function scanPageContent() {
  if (pageContentScanId) return;
  const text = document.body?.innerText?.trim();
  if (!text || text.length < 40) return;
  pageContentScanId = `p${Date.now()}_${Math.random().toString(36).slice(2)}`;
  // Gmail-specific extras (subject/sender) when present; harmless no-ops on any other site.
  const subject = document.querySelector('h2.hP')?.textContent?.trim() || document.title || '';
  const sender = document.querySelector('span.gD[email]')?.getAttribute('email') || '';
  try {
    chrome.runtime.sendMessage({ type: 'SCAN_EMAIL', id: pageContentScanId, subject, sender, body: text.slice(0, 20000) });
  } catch {
    pageContentScanId = null; // stale content script; dies until the tab reloads
  }
}

function showPageContentBanner(result) {
  if (document.getElementById('scamshield-page-banner')) return;
  const lv = levelOf(result.score);
  const box = document.createElement('div');
  box.id = 'scamshield-page-banner';
  box.style.cssText = `position:fixed;top:0;left:0;right:0;z-index:2147483647;padding:10px 16px;
    background:#1a1f2e;color:#f2e9da;border-bottom:3px solid ${LEVEL_COLOR[lv]};
    font:14px/1.4 system-ui,sans-serif;display:flex;align-items:center;justify-content:space-between;
    gap:12px;box-shadow:0 4px 12px rgba(0,0,0,.3);`;
  const label = lv === 'scam' ? 'a likely scam' : 'suspicious';
  const text = document.createElement('div');
  const strong = document.createElement('strong');
  strong.style.color = LEVEL_COLOR[lv];
  strong.textContent = '⚠ ScamShield: ';
  text.append(strong, document.createTextNode(
    `This page's content looks like ${label} (${result.score}/100) — ${result.llm?.summary_en || result.reasons?.[0]?.reason_en || 'review it carefully.'}`));
  const close = document.createElement('button');
  close.textContent = '✕';
  close.style.cssText = 'background:none;border:none;color:inherit;cursor:pointer;font-size:16px;flex:none;';
  close.onclick = () => box.remove();
  box.append(text, close);
  document.body.prepend(box);
}

function collectLinks() {
  if (!extensionAlive()) return;
  chrome.storage.local.get(['scanPaused'], (v) => {
    // Re-check: this callback fires after an async round-trip, during which the extension can be
    // reloaded out from under an already-open tab, invalidating this whole context.
    if (!extensionAlive() || v.scanPaused) return;
    linkifyTextNodes();
    scanPageContent();
    const hostnames = new Set();
    for (const a of document.querySelectorAll('a[href]')) {
      if (a.dataset.scamshieldBadged) continue;
      let host;
      try {
        host = new URL(a.href).hostname;
      } catch {
        continue; // mailto:, tel:, javascript:, etc.
      }
      if (!host || host === location.hostname) continue;
      const known = resultsByHost.get(host);
      const err = errorsByHost.get(host);
      if (known) applyResult(a, host, known);
      else if (err) applyError(a, err);
      else if (!seen.has(host)) {
        seen.add(host);
        hostnames.add(host);
      }
    }
    if (hostnames.size) {
      try {
        chrome.runtime.sendMessage({ type: 'SCAN_LINKS', hostnames: [...hostnames] });
      } catch {
        // stale content script (extension reloaded since this page loaded); dies until the tab reloads
      }
    }
  });
}

function pill(text, color, title) {
  const span = document.createElement('span');
  span.dataset.scamshieldBadge = '1';
  span.textContent = text;
  span.title = title || '';
  span.style.cssText = `display:inline-block;margin-left:4px;padding:0 5px;border-radius:9px;
    background:${color};color:#fff;font:bold 0.72em/1.5 system-ui,sans-serif;cursor:help;vertical-align:middle;`;
  return span;
}

function badgeFor(result) {
  const lv = levelOf(result.score);
  return pill(`⚠ ${result.score}`, LEVEL_COLOR[lv], result.reasons?.[0]?.reason_en || '');
}

function showScamOverlay(score, reason, onContinue) {
  const box = document.createElement('div');
  box.style.cssText = `position:fixed;top:16px;right:16px;z-index:2147483647;max-width:320px;
    background:#1a1f2e;color:#f2e9da;border:2px solid ${LEVEL_COLOR.scam};border-radius:8px;
    padding:14px 16px;font:14px/1.4 system-ui,sans-serif;box-shadow:0 8px 24px rgba(0,0,0,.4);`;
  const title = document.createElement('div');
  title.style.cssText = `font-weight:700;color:${LEVEL_COLOR.scam};margin-bottom:6px;`;
  title.textContent = `⚠ Scam link (${score}/100)`;
  const body = document.createElement('div');
  body.style.marginBottom = '10px';
  body.textContent = reason || 'This destination looks like a scam.';
  box.append(title, body);
  const cancel = document.createElement('button');
  cancel.textContent = 'Cancel';
  cancel.style.cssText = 'margin-right:8px;padding:6px 10px;border:none;border-radius:4px;cursor:pointer;';
  const go = document.createElement('button');
  go.textContent = 'Open anyway';
  go.style.cssText = `padding:6px 10px;border:none;border-radius:4px;cursor:pointer;background:${LEVEL_COLOR.scam};color:#fff;`;
  cancel.onclick = () => box.remove();
  go.onclick = () => { box.remove(); onContinue(); };
  box.append(cancel, go);
  document.body.appendChild(box);
}

function applyResult(a, hostname, result) {
  if (levelOf(result.score) === 'safe' || a.dataset.scamshieldBadged) return;
  a.dataset.scamshieldBadged = '1';
  a.after(badgeFor(result));
  if (result.verdict === 'scam') {
    a.addEventListener('click', function handler(e) {
      e.preventDefault();
      e.stopPropagation();
      showScamOverlay(result.score, result.reasons?.[0]?.reason_en, () => {
        a.removeEventListener('click', handler, true);
        a.click();
      });
    }, { capture: true });
  }
}

function applyError(a, error) {
  if (a.dataset.scamshieldBadged) return;
  a.dataset.scamshieldBadged = '1';
  a.after(pill('?', '#555', `Could not scan this link: ${error}`));
}

// Resolves with the scan result for hostname, triggering a scan if one isn't already known/running.
// Resolves with null (treat as "unknown, let it through") on error or after timeoutMs — a page-hook.js
// navigation intercept must never hang forever waiting on a slow or dead backend.
function waitForResult(hostname, timeoutMs) {
  return new Promise((resolve) => {
    const known = resultsByHost.get(hostname);
    if (known) return resolve(known);
    if (errorsByHost.has(hostname)) return resolve(null);
    const list = pendingChecks.get(hostname) || [];
    list.push(resolve);
    pendingChecks.set(hostname, list);
    setTimeout(() => resolve(null), timeoutMs);
    if (!seen.has(hostname)) {
      seen.add(hostname);
      try {
        chrome.runtime.sendMessage({ type: 'SCAN_LINKS', hostnames: [hostname] });
      } catch {
        resolve(null);
      }
    }
  });
}

function settleChecks(hostname, result) {
  const list = pendingChecks.get(hostname);
  if (!list) return;
  pendingChecks.delete(hostname);
  list.forEach((resolve) => resolve(result));
}

// Bridge to page-hook.js, which runs in the page's own JS world (unlike this script) and therefore
// sees in-page navigation (location.href=, location.assign/replace, window.open) a plain <a href>
// scan can't catch — e.g. a <button onclick="location.href='...'"> instead of a real link.
document.addEventListener('scamshield:check-nav', (e) => {
  if (!extensionAlive()) return; // no ack -> page-hook.js fails open after its own short timeout
  let id, hostname;
  try { ({ id, hostname } = JSON.parse(e.detail)); } catch { return; }
  if (!id || !hostname) return;
  document.dispatchEvent(new CustomEvent(`scamshield:check-ack:${id}`));
  const respond = (proceed) =>
    document.dispatchEvent(new CustomEvent(`scamshield:decision:${id}`, { detail: JSON.stringify({ proceed }) }));
  waitForResult(hostname, 4000).then((result) => {
    if (result && result.verdict === 'scam') {
      showScamOverlay(result.score, result.reasons?.[0]?.reason_en, () => respond(true));
      // Cancel just closes the overlay without responding — navigation stays blocked, matching the
      // existing <a> click-interception behavior below.
    } else {
      respond(true);
    }
  });
});

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'SCAN_RESULT') {
    resultsByHost.set(msg.hostname, msg.result);
    settleChecks(msg.hostname, msg.result);
    for (const a of document.querySelectorAll('a[href]')) {
      let host;
      try { host = new URL(a.href).hostname; } catch { continue; }
      if (host === msg.hostname) applyResult(a, host, msg.result);
    }
  }
  if (msg.type === 'SCAN_ERROR') {
    errorsByHost.set(msg.hostname, msg.error);
    settleChecks(msg.hostname, null);
    for (const a of document.querySelectorAll('a[href]')) {
      let host;
      try { host = new URL(a.href).hostname; } catch { continue; }
      if (host === msg.hostname) applyError(a, msg.error);
    }
  }
  if (msg.type === 'EMAIL_SCAN_RESULT' && msg.id === pageContentScanId && levelOf(msg.result.score) !== 'safe') {
    showPageContentBanner(msg.result);
  }
  if (msg.type === 'RESCAN') {
    seen.clear();
    document.querySelectorAll('[data-scamshield-badged]').forEach((a) => delete a.dataset.scamshieldBadged);
    document.querySelectorAll('[data-scamshield-badge]').forEach((el) => el.remove());
    collectLinks();
  }
});

collectLinks();
let debounce;
const observer = new MutationObserver(() => {
  if (!extensionAlive()) { observer.disconnect(); return; }
  clearTimeout(debounce);
  debounce = setTimeout(collectLinks, 1500);
});
observer.observe(document.body, { childList: true, subtree: true });
