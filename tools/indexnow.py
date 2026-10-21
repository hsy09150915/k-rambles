#!/usr/bin/env python3
"""변경된 페이지 주소를 IndexNow(Bing 등)에 알립니다. GitHub Actions 에서 푸시 때마다 자동 실행됩니다.

  python3 tools/indexnow.py --before <커밋> --after <커밋>   # 두 커밋 사이에 바뀐 페이지만
  python3 tools/indexnow.py --all                            # 사이트맵의 모든 주소
  (--dry-run 을 붙이면 보내지 않고 목록만 출력)

보내는 주소는 사이트맵에 있는 대표 주소(canonical)로 한정합니다. (색인 금지 페이지 등은 자동 제외)
"""
import argparse, glob, json, os, re, subprocess, sys, urllib.request
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
HOST = "k-rambles.com"
KEY = next(os.path.basename(p)[:-4] for p in glob.glob(os.path.join(ROOT, "*.txt"))
           if re.fullmatch(r"[0-9a-f]{32}\.txt", os.path.basename(p)))
ENDPOINT = "https://api.indexnow.org/indexnow"

def sitemap_urls():
    return re.findall(r"<loc>([^<]+)</loc>", open(os.path.join(ROOT, "sitemap.xml"), encoding="utf-8").read())

def canonical(rel):
    p = os.path.join(ROOT, rel)
    if not os.path.exists(p): return None
    m = re.search(r'<link rel="canonical" href="([^"]+)"', open(p, encoding="utf-8").read())
    return m.group(1) if m else None

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--before"); ap.add_argument("--after", default="HEAD")
    ap.add_argument("--all", action="store_true"); ap.add_argument("--dry-run", action="store_true")
    a = ap.parse_args()
    smap = set(sitemap_urls())
    if a.all or not a.before or set(a.before) == {"0"}:
        urls = sorted(smap)
    else:
        files = subprocess.check_output(["git", "diff", "--name-only", a.before, a.after], cwd=ROOT, text=True).split()
        urls = sorted({u for f in files if f.endswith(".html") for u in [canonical(f)] if u and u in smap})
        if "sitemap.xml" in files:  # 사이트맵이 바뀌었으면 새로 추가된 주소도 포함
            old = subprocess.run(["git", "show", "%s:sitemap.xml" % a.before], cwd=ROOT, text=True, capture_output=True).stdout
            urls = sorted(set(urls) | (smap - set(re.findall(r"<loc>([^<]+)</loc>", old))))
    print("보낼 주소 %d개" % len(urls))
    for u in urls[:50]: print(" ", u)
    if len(urls) > 50: print("  ...")
    if not urls or a.dry_run: return
    body = json.dumps({"host": HOST, "key": KEY, "keyLocation": "https://%s/%s.txt" % (HOST, KEY), "urlList": urls[:10000]}).encode()
    req = urllib.request.Request(ENDPOINT, data=body, headers={"Content-Type": "application/json; charset=utf-8"})
    try:
        with urllib.request.urlopen(req, timeout=30) as r: print("IndexNow 응답:", r.status)
    except urllib.error.HTTPError as e:
        print("IndexNow 오류:", e.code, e.read()[:200]); sys.exit(1)
main()
