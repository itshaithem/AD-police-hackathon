const seen = new Set(); // hostnames already sent for scanning from this page
const resultsByHost = new Map(); // hostname -> last known scan result, for anchors added after the result arrived
const errorsByHost = new Map(); // hostname -> last error message
const pendingChecks = new Map(); // hostname -> resolver functions waiting on a scan (see waitForResult)

// Reloading/updating the extension invalidates chrome.* APIs in any content script still attached
// to an already-open tab — every call throws "Extension context invalidated" until that tab reloads.
function extensionAlive() {
  return !!(chrome.runtime && chrome.runtime.id);
}

function collectLinks() {
  if (!extensionAlive()) return;
  chrome.storage.local.get(['scanPaused'], (v) => {
    if (v.scanPaused) return;
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
