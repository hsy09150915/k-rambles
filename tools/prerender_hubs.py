#!/usr/bin/env python3
"""카테고리 목록(허브) 페이지 16개에 글 목록을 일반 HTML로 미리 채워 넣습니다.

왜 필요한가: 허브 페이지는 자바스크립트가 JSON을 읽어서 글 목록을 그립니다.
자바스크립트를 실행하지 않는 읽기 도구(일부 AI·검색 크롤러)에는 목록이 빈 페이지로 보입니다.
이 스크립트는 assets/js/krambles-render.js 의 tileHTML 과 같은 모양을 HTML 에 직접 써 둡니다.
(페이지가 열리면 자바스크립트가 JSON 으로 다시 그리므로 최신 상태는 항상 JSON 이 기준입니다.)

새 글을 data/*.json 에 등록한 뒤 이 스크립트를 한 번 실행하세요:
    python3 tools/prerender_hubs.py          # 적용
    python3 tools/prerender_hubs.py --check  # 바뀔 파일이 있으면 목록만 출력(수정 안 함)
"""
import glob, html, json, os, re, sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
START, END = "<!-- prerender:start -->", "<!-- prerender:end -->"
LIKE = {
    "ko": ("이 글 저장하기", "이 기기에만 저장돼요 — 다른 폰·브라우저로 바꾸면 사라져요. 인기 있는 글을 파악하는 데도 도움돼요."),
    "vi": ("Lưu bài này", "Chỉ lưu trên thiết bị này — đổi điện thoại hoặc trình duyệt khác sẽ mất. Cũng giúp chúng tôi biết bài nào được quan tâm nhiều."),
    "th": ("บันทึกบทความนี้", "บันทึกไว้ในอุปกรณ์นี้เท่านั้น — หากเปลี่ยนโทรศัพท์หรือเบราว์เซอร์ ข้อมูลจะหายไป นอกจากนี้ยังช่วยให้เรารู้ว่าบทความไหนได้รับความนิยม"),
    "en": ("Save this piece", "Saved on this device only — switch phones or browsers and it’s gone. Also helps us see what’s popular."),
}

def esc(s):
    s = "" if s is None else str(s)
    return (s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
             .replace('"', "&quot;").replace("'", "&#39;"))

def lang_of(text, rel):
    m = re.search(r'<html\b[^>]*\blang="([^"]+)"', text, re.I)
    l = (m.group(1) if m else "").lower()
    for k in ("ko", "vi", "th", "en"):
        if l.startswith(k): return k
    first = rel.split("/")[0]
    return first if first in ("ko", "vi", "th") else "en"

def tile(item, asset_base, lang):
    label, title = LIKE[lang]
    badge = '<span class="tile-photo-badge">%s</span>' % esc(item["badge"]) if item.get("badge") else ""
    alt = item.get("alt") or item.get("title")
    return ('<div class="tile tile--photo reveal">'
            '<a class="tile-photo-link" href="%s"><div class="tile-photo-frame"><img src="%s" alt="%s" loading="lazy">%s</div>'
            '<div class="tile-photo-body"><span class="tile-photo-label">%s</span><h3 class="tile-photo-title">%s</h3></div></a>'
            '<button class="tile-like-btn" data-like-id="%s" data-goatcounter-click="like:%s" aria-label="%s" aria-pressed="false" title="%s">'
            '<svg><use href="#i-heart"/></svg></button></div>') % (
        esc(item["url"]), esc(asset_base + item["thumb"]), esc(alt), badge, esc(item.get("label") or ""),
        esc(item["title"]), esc(item["like_id"]), esc(item["like_id"]), esc(label), esc(title))

def fill(template, n):
    t = re.sub(r"\{n:([^|}]*)\|([^}]*)\}", lambda m: m.group(1) if n == 1 else m.group(2), template)
    return t.replace("{n}", str(n))

def process(path):
    rel = os.path.relpath(path, ROOT)
    text = open(path, encoding="utf-8", newline="").read()
    cfg = re.search(r"KR\.renderHub\(\{(.*?)\}\);", text, re.S)
    if not cfg: return None
    c = cfg.group(1)
    jurl = re.search(r"jsonUrl:\s*'([^']+)'", c).group(1)
    base = (re.search(r"assetBase:\s*'([^']*)'", c) or [None, ""])[1]
    tmpl = re.search(r"countTemplate:\s*'([^']*)'", c)
    lang = lang_of(text, rel)
    items = json.load(open(os.path.join(ROOT, jurl.lstrip("/")), encoding="utf-8"))
    items = sorted(items, key=lambda i: i.get("date") or "0000-00-00", reverse=True)
    inner = START + "\n" + "".join(tile(i, base, lang) for i in items) + "\n" + END
    new = text
    if START in new:
        new = re.sub(re.escape(START) + r".*?" + re.escape(END), lambda m: inner, new, flags=re.S)
    else:
        pat = re.compile(r'(<div class="hub-grid">)\s*(</div>)')
        assert pat.search(new), rel + ": hub-grid 빈 상자를 찾지 못함"
        new = pat.sub(lambda m: m.group(1) + "\n" + inner + "\n" + m.group(2), new, count=1)
    if tmpl:
        txt = fill(tmpl.group(1), len(items))
        new = re.sub(r'(<p class="hub-count">)[^<]*(</p>)', lambda m: m.group(1) + txt + m.group(2), new, count=1)
    # JS 가 꺼진 환경에서도 목록이 보이도록(글 카드는 평소 JS 가 켜져야 보이는 애니메이션 상태)
    ns = "<noscript><style>.tile.reveal{opacity:1!important;transform:none!important}</style></noscript>"
    if ns not in new:
        new = new.replace("</head>", ns + "\n</head>", 1) if "</head>" in new else \
              re.sub(r"(<style>)", lambda m: ns + "\n" + m.group(1), new, count=1)
    return rel, text, new, len(items)

def main():
    check = "--check" in sys.argv
    changed = 0
    for p in sorted(glob.glob(os.path.join(ROOT, "**", "index.html"), recursive=True)):
        if "1stock" in p: continue
        r = process(p)
        if not r: continue
        rel, old, new, n = r
        if old != new:
            changed += 1
            if not check: open(p, "w", encoding="utf-8", newline="").write(new)
        print("%-34s 글 %2d개 %s" % (rel, n, "변경" if old != new else "최신"))
    print("변경 %d개 파일%s" % (changed, " (미리보기)" if check else ""))
main()
