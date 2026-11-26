const seen = new Set(); // hostnames already sent for scanning from this page
const resultsByHost = new Map(); // hostname -> last known scan result, for anchors added after the result arrived

function collectLinks() {
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
    if (known) applyResult(a, host, known);
    else if (!seen.has(host)) {
      seen.add(host);
      hostnames.add(host);
    }
  }
  if (hostnames.size) chrome.runtime.sendMessage({ type: 'SCAN_LINKS', hostnames: [...hostnames] });
}

function badgeFor(result) {
  const span = document.createElement('span');
  const lv = levelOf(result.score);
  span.textContent = ` [${result.score}]`;
  span.title = result.reasons?.[0]?.reason_en || '';
  span.style.cssText = `color:${LEVEL_COLOR[lv]};font-weight:bold;font-size:0.85em;cursor:help;`;
  return span;
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

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'SCAN_RESULT') {
    resultsByHost.set(msg.hostname, msg.result);
    for (const a of document.querySelectorAll('a[href]')) {
      let host;
      try { host = new URL(a.href).hostname; } catch { continue; }
      if (host === msg.hostname) applyResult(a, host, msg.result);
    }
  }
});

collectLinks();
let debounce;
new MutationObserver(() => {
  clearTimeout(debounce);
  debounce = setTimeout(collectLinks, 1500);
}).observe(document.body, { childList: true, subtree: true });
