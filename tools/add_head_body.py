#!/usr/bin/env python3
"""<head>/<body>/</html> 태그가 없는 페이지에 명시적으로 넣습니다 (idempotent).

왜 필요한가: 브라우저는 태그가 없어도 자동 보정하지만 Bing 의 SEO 분석 도구는
<head> 안의 title/description 을 못 찾아 "Title tag missing" 오류를 냅니다.
HTML 파서가 '<head> 영역'으로 판단하는 것과 똑같은 규칙으로 경계를 찾아 넣으므로
브라우저가 만드는 DOM 은 바뀌지 않습니다.

사용:  python3 tools/add_head_body.py          # 적용
       python3 tools/add_head_body.py --check  # 바뀔 파일만 출력
새 글을 만든 뒤에도 한 번 실행하세요.
"""
import glob, os, re, sys
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
HEAD_VOID = re.compile(r"<(meta|link|base)\b[^>]*>", re.I)
HEAD_RAW = re.compile(r"<(title|style|script|noscript)\b[^>]*>", re.I)

def convert(s):
    if re.search(r"<head[\s>]", s, re.I): return None
    m = re.match(r"(\s*<!DOCTYPE html>\s*<html[^>]*>)", s, re.I)
    if not m: raise ValueError("시작 구조가 예상과 다름")
    pos = m.end(); n = len(s)
    # 맨 앞 주석은 파서가 <head> 밖(<html> 바로 아래)에 두므로 같은 위치를 유지
    lead = m.end()
    while True:
        w = re.compile(r"\s*").match(s, lead).end()
        if not s.startswith("<!--", w): break
        e = s.find("-->", w); assert e > 0; lead = e + 3
    head_at = lead
    pos = lead
    while True:
        w = re.compile(r"\s*").match(s, pos); p = w.end()
        if s.startswith("<!--", p):
            e = s.find("-->", p); assert e > 0; pos = e + 3; continue
        v = HEAD_VOID.match(s, p)
        if v: pos = v.end(); continue
        r = HEAD_RAW.match(s, p)
        if r:
            e = re.compile(r"</%s\s*>" % r.group(1), re.I).search(s, r.end()); assert e, "닫는 태그 없음"
            pos = e.end(); continue
        boundary = p; break
    body = s[boundary:]
    assert body.strip(), "본문 없음"
    return s[:head_at] + "\n<head>" + s[head_at:boundary].rstrip("\n") + "\n</head>\n<body>\n" + body.rstrip() + "\n</body>\n</html>\n"

def main():
    check = "--check" in sys.argv; n = 0
    for p in sorted(glob.glob(os.path.join(ROOT, "**", "*.html"), recursive=True)):
        rel = os.path.relpath(p, ROOT)
        if rel.startswith(("assets/", "tools/", "1stock")): continue
        s = open(p, encoding="utf-8", newline="").read()
        try: out = convert(s)
        except Exception as ex: print("건너뜀", rel, ex); continue
        if out is None: continue
        n += 1
        if not check: open(p, "w", encoding="utf-8", newline="").write(out)
    print("변경 %d개 파일%s" % (n, " (미리보기)" if check else ""))
    if check and n: sys.exit(1)  # 푸시 전 검사: <head>/<body> 가 빠진 페이지가 있으면 실패로 끝남
main()
