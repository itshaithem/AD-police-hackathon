// Runs in the page's own JS world (manifest.json declares world:"MAIN"), unlike content.js which
// is isolated from the page and therefore blind to in-page JS navigation (e.g. a <button onclick=
// "location.href='...'">  instead of a real <a href>). This patches the navigation entry points a
// button's onclick can call, and asks content.js (via a DOM CustomEvent bridge, since this world
// has no chrome.* APIs) to scan the destination before letting it through.
(function () {
  function interceptNavigation(url, proceed) {
    try {
      if (!url) return proceed();
      let hostname;
      try { hostname = new URL(url, location.href).hostname; } catch { return proceed(); }
      if (!hostname || hostname === location.hostname) return proceed(); // same-site nav, not scam-relevant

      const id = `n${Date.now()}_${Math.random().toString(36).slice(2)}`;
      let acked = false;
      const onAck = () => { acked = true; };
      const onDecision = (e) => {
        document.removeEventListener(`scamshield:check-ack:${id}`, onAck);
        document.removeEventListener(`scamshield:decision:${id}`, onDecision);
        let allow = true;
        try { allow = JSON.parse(e.detail).proceed !== false; } catch { /* malformed -> fail open */ }
        if (allow) proceed();
      };
      document.addEventListener(`scamshield:check-ack:${id}`, onAck, { once: true });
      document.addEventListener(`scamshield:decision:${id}`, onDecision, { once: true });
      // Only guards against "nothing is listening" (extension missing/broken) — once acked, content.js
      // owns the wait (its own scan timeout, or indefinitely while a scam overlay awaits the user).
      setTimeout(() => {
        if (!acked) {
          document.removeEventListener(`scamshield:decision:${id}`, onDecision);
          proceed();
        }
      }, 500);
      document.dispatchEvent(new CustomEvent('scamshield:check-nav', { detail: JSON.stringify({ id, hostname }) }));
    } catch {
      proceed(); // never break the page's navigation over an unexpected error here
    }
  }

  try {
    const origOpen = window.open;
    window.open = function (url, ...rest) {
      if (!url) return origOpen.call(window, url, ...rest);
      // Can't hand back a live window handle until the scan clears, so popup-writing callers
      // (rare for plain navigation links) won't get a usable reference when blocked/delayed.
      let ret = null;
      interceptNavigation(url, () => { ret = origOpen.call(window, url, ...rest); });
      return ret;
    };
  } catch { /* window.open not patchable in this context; skip */ }

  try {
    const proto = Location.prototype;
    const origAssign = proto.assign;
    proto.assign = function (url) { interceptNavigation(url, () => origAssign.call(this, url)); };
    const origReplace = proto.replace;
    proto.replace = function (url) { interceptNavigation(url, () => origReplace.call(this, url)); };
    const hrefDesc = Object.getOwnPropertyDescriptor(proto, 'href');
    if (hrefDesc && hrefDesc.configurable && hrefDesc.get && hrefDesc.set) {
      Object.defineProperty(proto, 'href', {
        get: hrefDesc.get,
        set(url) { interceptNavigation(url, () => hrefDesc.set.call(this, url)); },
        configurable: true,
      });
    }
  } catch { /* Location.prototype not patchable (older browser); link-click scanning still works */ }
})();
