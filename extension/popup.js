const VERDICT_LABEL = { scam: 'Scam', sus: 'Suspicious', safe: 'Safe' };

document.getElementById('openOptions').addEventListener('click', (e) => {
  e.preventDefault();
  chrome.runtime.openOptionsPage();
});

chrome.storage.local.get(['scanPaused'], (v) => {
  document.getElementById('pause').checked = !!v.scanPaused;
});
document.getElementById('pause').addEventListener('change', (e) => {
  chrome.storage.local.set({ scanPaused: e.target.checked });
});

function activeTab(cb) {
  chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => tab && cb(tab));
}

document.getElementById('rescan').addEventListener('click', () => {
  activeTab((tab) => chrome.tabs.sendMessage(tab.id, { type: 'RESCAN' }).catch(() => {}));
});

function render(resp) {
  const summary = document.getElementById('summary');
  const banner = document.getElementById('banner');
  const list = document.getElementById('list');
  const flagged = resp?.flagged || [];
  const errors = resp?.errors || [];
  const scanned = resp?.scanned || 0;
  const inFlight = resp?.inFlight || 0;

  summary.textContent = inFlight
    ? `Scanning ${inFlight} link${inFlight === 1 ? '' : 's'}…`
    : `${scanned} link${scanned === 1 ? '' : 's'} checked, ${flagged.length} flagged`;

  banner.textContent = '';
  if (errors.length) {
    const b = document.createElement('div');
    b.className = 'banner';
    b.textContent = `${resp.apiBase} unreachable — ${errors.length} link${errors.length === 1 ? '' : 's'} couldn't be scanned (${errors[0].error}).`;
    banner.appendChild(b);
  }

  list.textContent = '';
  if (!flagged.length) {
    list.className = 'empty';
    list.textContent = 'No suspicious links found yet.';
    return;
  }
  list.className = '';
  for (const f of flagged) {
    const row = document.createElement('div');
    row.className = 'item';
    row.style.borderLeftColor = LEVEL_COLOR[levelOf(f.score)];
    const score = document.createElement('div');
    score.className = 'score';
    score.style.color = LEVEL_COLOR[levelOf(f.score)];
    score.textContent = `${f.hostname} — ${f.score}/100 · ${VERDICT_LABEL[levelOf(f.score)]}`;
    row.appendChild(score);
    const reason = f.reasons?.[0]?.reason_en;
    if (reason) {
      const r = document.createElement('div');
      r.className = 'reason';
      r.textContent = reason;
      row.appendChild(r);
    }
    list.appendChild(row);
  }
}

function refresh() {
  activeTab((tab) => {
    chrome.runtime.sendMessage({ type: 'GET_TAB_FLAGS', tabId: tab.id }, render);
  });
}

refresh();
const poll = setInterval(refresh, 1000);
window.addEventListener('unload', () => clearInterval(poll));
