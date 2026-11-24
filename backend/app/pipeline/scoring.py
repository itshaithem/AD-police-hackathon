"""Explainable noisy-OR scoring: score = 100 × (1 − ∏(1 − wᵢ)) over triggered signals.

Each signal carries an English and an Arabic reason. Allowlisted official domains are forced to Safe.
"""
from urllib.parse import urlsplit

from .url_features import registered_domain

SCAM_AT, SUSPICIOUS_AT = 70, 40


def _rd(url: str) -> str:
    host = (urlsplit(url).hostname or "").lower()
    return registered_domain(host) or host


def verdict_for(sc: int) -> str:
    return "scam" if sc >= SCAM_AT else "suspicious" if sc >= SUSPICIOUS_AT else "safe"


def score(f, intel, sb, content, visual, llm, ml_p):
    S = []

    def add(i, w, en, ar):
        S.append({"id": i, "weight": round(w, 3), "reason_en": en, "reason_ar": ar})

    if f["allowlisted"]:
        return 2, "safe", [{"id": "official_domain", "weight": 0,
                            "reason_en": f"Official domain ({f['official_brand'] or f['domain']})",
                            "reason_ar": "نطاق رسمي معتمد"}]

    bi = f["brand_imitation"]
    if bi:
        w = {"homoglyph": .65, "typosquat": .6, "keyword": .5}[bi["kind"]]
        add("brand_imitation", w, f"Domain imitates {bi['brand'].upper()} ({bi['kind']}: {bi['detail']})",
            f"النطاق ينتحل علامة {bi['brand'].upper()}")
    if f["punycode"]:
        add("punycode", .35, "Uses look-alike Unicode characters (punycode)", "يستخدم أحرفاً مشابهة (Punycode)")
    if f["is_ip"]:
        add("ip_host", .35, "Link points to a raw IP address", "الرابط يشير إلى عنوان IP مباشر")
    if f["suspicious_tld"]:
        add("tld", .15, f"High-abuse domain ending .{f['tld']}", "امتداد نطاق شائع الاستخدام في الاحتيال")
    if f["free_host"]:
        add("free_host", .15, "Hosted on a free website builder", "مستضاف على منصة مجانية")

    age = (intel.get("whois") or {}).get("age_days")
    if age is not None and age < 7:
        add("new_domain", .5, f"Domain registered {age} days ago", f"تم تسجيل النطاق قبل {age} أيام")
    elif age is not None and age < 30:
        add("young_domain", .3, f"Domain registered {age} days ago", f"تم تسجيل النطاق قبل {age} يوماً")
    ca = (intel.get("tls") or {}).get("cert_age_days")
    if ca is not None and ca < 3:
        add("new_cert", .2, "TLS certificate issued in the last 3 days", "شهادة أمان صادرة خلال آخر 3 أيام")

    if f.get("parked"):
        add("parked", .05, f"Parked or for sale (redirects to {f['parked']}): not active yet, worth monitoring",
            "النطاق معروض للبيع أو مركون: غير نشط بعد، يستحق المراقبة")
    # Redirects only count when they cross registered domains (http→https→www→/en on one site is normal).
    chain = sb.get("redirect_chain") or []
    chain_domains = list(dict.fromkeys(_rd(c) for c in chain if "://" in c))
    if not f.get("parked") and (f["shortener"] or f.get("redirected_from") or len(chain_domains) >= 2):
        hops = max(len(chain_domains) - 1, 1)
        add("redirects", .2, f"Hidden behind {hops} cross-site redirect(s) / short link",
            "مخفي خلف روابط تحويل أو رابط مختصر")
    # Cloaking: crawlers and phones end up on different sites (not just www/m./language variants).
    bv, fu = sb.get("bot_view") or {}, sb.get("final_url") or ""
    if bv.get("final_url") and fu and (bv.get("status") or 0) < 400 and _rd(bv["final_url"]) != _rd(fu):
        add("cloaking", .45, "Shows a different site to crawlers than to phones (cloaking)",
            "يعرض موقعاً مختلفاً لأدوات الفحص مقارنة بالهواتف (إخفاء)")

    asks = content.get("asks_for", [])
    if "card" in asks or "cvv" in asks:
        add("asks_card", .55, "Page asks for card number / CVV", "الصفحة تطلب رقم البطاقة")
    if "otp" in asks:
        add("asks_otp", .45, "Page asks for a one-time password (OTP)", "الصفحة تطلب رمز التحقق OTP")
    if "emirates_id" in asks:
        add("asks_eid", .4, "Page asks for Emirates ID", "الصفحة تطلب رقم الهوية الإماراتية")
    if "password" in asks:
        add("asks_password", .3, "Page has a login/password form", "الصفحة تحتوي نموذج تسجيل دخول")
    # Mentioning a brand is normal (news, shops); it counts when the page also wants data or the domain imitates it.
    if content.get("brands_mentioned") and (asks or bi):
        add("brand_text", .35, f"Page claims to be {', '.join(content['brands_mentioned']).upper()} on a non-official domain",
            "الصفحة تدّعي أنها جهة رسمية على نطاق غير رسمي")
    if len(content.get("urgency", [])) >= 2 or (content.get("urgency") and asks):
        add("urgency", .15, "Pressure language: " + ", ".join(content["urgency"][:3]), "لغة استعجال وتهديد")

    if visual and visual.get("best_brand"):
        vb, vs = visual["best_brand"], visual.get("similarity", 0)
        others = sorted((x for k, x in (visual.get("all") or {}).items() if k != vb), reverse=True)
        margin = vs - (others[0] if others else 0)
        claimed = {(bi or {}).get("brand")} | set(content.get("brands_mentioned") or [])
        pct = int(vs * 100)
        en, ar = f"{pct}% visually similar to the real {vb.upper()} page", f"مطابقة بصرية {pct}% مع الصفحة الرسمية"
        if vs >= .88:
            add("visual_clone", .7, en, ar)
        elif vs >= .80 and margin >= .03 and vb in claimed:
            # Moderate similarity counts only when it points at the same brand the domain/page claims.
            add("visual_clone", .5, en, ar)
    if llm and llm.get("is_scam"):
        c = float(llm.get("confidence", .5))
        add("llm", .6 * c, f"AI analyst: {llm.get('intent', 'likely scam')}",
            "المحلل الذكي: " + (llm.get("summary_ar") or "احتيال محتمل"))
    if ml_p is not None and ml_p > .5:
        add("ml_url", .5 * ml_p, f"URL pattern model: {int(ml_p * 100)}% phishing-like",
            f"نموذج الروابط: {int(ml_p * 100)}% احتمال تصيد")

    prod = 1.0
    for s in S:
        prod *= (1 - s["weight"])
    sc = round(100 * (1 - prod))
    S.sort(key=lambda s: -s["weight"])
    return sc, verdict_for(sc), S
