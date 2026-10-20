#!/usr/bin/env python3
"""루트의 llms.txt 를 data/*.json 에서 만듭니다 (AI 가 사이트 구조를 한눈에 파악하는 안내 문서).
새 글을 등록한 뒤 prerender_hubs.py 와 함께 실행하세요:  python3 tools/build_llms_txt.py
"""
import json, os, re, sys
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
BASE = "https://k-rambles.com"
SECTIONS = [("trip-planner", "Trip planning"), ("getting-around", "Getting around Busan"),
            ("taste", "Food"), ("long-stay", "Long-stay living")]
LANGS = [("en", "English", ""), ("ko", "Korean (한국어)", "ko/"), ("vi", "Vietnamese (Tiếng Việt)", "vi/"), ("th", "Thai (ภาษาไทย)", "th/")]

def clean(s): return re.sub(r"\s+", " ", s or "").strip()

out = ["""# K-Rambles

> Busan travel and long-stay information for visitors and foreign residents, checked against official sources (operator websites and official blogs, app-store listings tested by the author, Naver Map and Google Maps for transport, Busan local-government sites). Written by a Korean who has lived in Busan for decades. Available in English, Korean, Vietnamese and Thai. Each article shows its date; fares, schedules and opening details can change.

- About and method: %s/about.html
- Sitemap: %s/sitemap.xml
- Contact for corrections: see the About page
""" % (BASE, BASE)]
total = 0
for code, label, prefix in LANGS:
    out.append("## %s\n" % label)
    out.append("- Category pages: " + ", ".join("[%s](%s/%s%s/index.html)" % (n, BASE, prefix, s) for s, n in SECTIONS) + "\n")
    for sec, name in SECTIONS:
        items = json.load(open(os.path.join(ROOT, "data", "%s-%s.json" % (sec, code)), encoding="utf-8"))
        items = sorted(items, key=lambda i: i.get("date") or "0000-00-00", reverse=True)
        out.append("### %s\n" % name)
        for i in items:
            rel = "%s%s/%s" % (prefix, sec, i["url"])
            assert os.path.exists(os.path.join(ROOT, rel)), "파일 없음: " + rel
            out.append("- [%s](%s/%s)%s" % (clean(i["title"]).replace("[", "(").replace("]", ")"), BASE, rel,
                                            " — " + i["date"] if i.get("date") else ""))
            total += 1
        out.append("")
open(os.path.join(ROOT, "llms.txt"), "w", encoding="utf-8", newline="\n").write("\n".join(out).rstrip() + "\n")
print("llms.txt 작성: 글 링크 %d개" % total)
