#!/usr/bin/env python3
"""경주 메인(4개 언어)과 경주 카테고리 허브(4 x 4) 페이지를 부산 페이지에서 만들어 낸다.

부산 메인/허브를 원본으로 삼아 제목, 설명, 히어로, 색 테마, 링크만 경주용으로 바꾼다.
그래서 부산 페이지의 공통 디자인이 바뀌면 이 스크립트를 다시 돌리면 경주에도 똑같이 반영된다.
글 목록은 krambles-render.js 가 data/*.json 에서 city 값(gyeongju + korea)으로 걸러서 그린다.

  python3 tools/build_gyeongju_pages.py
  python3 tools/prerender_hubs.py      # 허브 정적 타일 갱신
"""
import json, os, re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BOARDS = ['trip-planner', 'getting-around', 'taste', 'long-stay']
COVER = {'trip-planner': 'e2e572eb339f', 'getting-around': '4f31b1f34755', 'taste': '280c41e02d2d', 'long-stay': '210f18aed626'}
COVER_OLD = {'trip-planner': '1e013af324b8', 'getting-around': 'b3c5539db8e6', 'taste': '9c33e9632854', 'long-stay': 'a785919b0837'}
PIN = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-6.5-5.6-6.5-11A6.5 6.5 0 0 1 18.5 10c0 5.4-6.5 11-6.5 11Z"/><circle cx="12" cy="10" r="2.4"/></svg>'

MAIN_THEME = """<style id="gyeongju-theme">
  :root { --paper: #f2ede4; --paper-raised: #faf7f1;
    --shelf-trip: #f5f9ec; --shelf-transit: #edf6fc; --shelf-taste: #fef3e7; --shelf-stay: #fcf9e1;
    --gj-trip: #3d7a70; --gj-transit: #1e6fa3; --gj-taste: #9e2f4c; --gj-stay: #5d6a2c; }
  @media (prefers-color-scheme: dark) { :root { --paper: #1d1915; --paper-raised: #26211b;
    --shelf-trip: #26301c; --shelf-transit: #1a2c38; --shelf-taste: #382a1c; --shelf-stay: #34301a; } }
  .tile--slate .tile-more { background: var(--gj-trip); color: #fdf8f0; }
  .tile--navy .tile-more { background: var(--gj-transit); color: #fdf8f0; }
  .tile--coral .tile-more { background: var(--gj-taste); color: #fdf8f0; }
  .tile--marigold .tile-more { background: var(--gj-stay); color: #fdf8f0; }
  @media (max-width: 760px) { .hero-photo img { object-position: 50% 50%; -webkit-mask-image: linear-gradient(to bottom, transparent 0, #000 22%, #000 84%, transparent 100%); mask-image: linear-gradient(to bottom, transparent 0, #000 22%, #000 84%, transparent 100%); } }
  @media (min-width: 761px) {
    .hero-visual { max-width: 470px; flex-basis: 420px; }
    .hero-photo img { aspect-ratio: 4 / 3; }
  }
  .hero-img-wrap { position: relative; }
  .photo-credit { position: absolute; right: 8px; bottom: 6px; font-size: 0.62rem; line-height: 1; color: rgba(255,255,255,0.55); text-shadow: 0 0 3px rgba(0,0,0,0.35); pointer-events: none; }
  .photo-credit .m { display: none; }
  @media (max-width: 760px) { .photo-credit { bottom: 5%; right: 16px; color: var(--ink-soft); opacity: 0.75; text-shadow: none; } .photo-credit .m { display: inline; } .photo-credit .d { display: none; } }
</style>
"""

HUB_THEME = """<style id="gyeongju-theme">
  :root { --paper: %s; --paper-raised: #faf7f1; --coral: %s; --coral-ink: %s; }
  @media (prefers-color-scheme: dark) { :root { --paper: %s; --paper-raised: #26211b; } }
  .logo span { color: #d9532a !important; }
</style>
"""
HUB_COL = {  # paper, accent, accent-ink, dark paper
    'trip-planner': ('#f5f9ec', '#3d7a70', '#2a5b53', '#26301c'),
    'getting-around': ('#edf6fc', '#3a8fb7', '#10394d', '#1a2c38'),
    'taste': ('#fef3e7', '#9e2f4c', '#7a2239', '#382a1c'),
    'long-stay': ('#fcf9e1', '#5d6a2c', '#465020', '#34301a'),
}

MAIN = {
 'en': dict(
   title='Gyeongju Travel Guides Built Around Real Pain Points | K-Rambles',
   desc='Fact-checked Gyeongju guides: getting there from Busan or Seoul, walking routes between the royal tombs, and what is actually worth your time.',
   head='Gyeongju, walk through a <em>thousand years</em>.',
   lede='A whole city as an open-air museum. Fact-checked Gyeongju guides.',
   cta='Want to explore beyond Gyeongju?', city='Busan',
   alt='Gyeongju, royal tombs by Hwangnidan-gil', cap='Gyeongju, royal tombs by Hwangnidan-gil',
   cd='© Gyeongju City', cm='© Gyeongju City (Choi Sun-seop)',
   search='Search all pins — Hwangnidan-gil, KTX, convenience store...',
   foot='K-Rambles · fact-checked Gyeongju guides'),
 'ko': dict(
   title='진짜 문제부터 해결하는 경주 여행 정보 | K-Rambles',
   desc='부산이나 서울에서 경주 가는 법, 왕릉 사이 걷기 코스, 실제로 시간 들일 만한 곳까지 직접 확인하고 검증해서 정리한 경주 가이드.',
   head='경주, <em>천년</em>을 걷다.',
   lede='도시 전체가 지붕 없는 박물관. 팩트체크한 경주 가이드.',
   cta='경주 밖도 둘러보고 싶다면?', city='부산',
   alt='경주, 황리단길 옆 신라 왕릉', cap='경주, 황리단길 옆 신라 왕릉',
   cd='ⓒ경주시', cm='ⓒ경주시(최순섭)',
   search='모든 핀 검색 — 황리단길, KTX, 편의점...',
   foot='K-Rambles · 팩트체크된 경주 가이드'),
 'vi': dict(
   title='Kinh nghiệm du lịch Gyeongju, giải quyết đúng vấn đề thực tế | K-Rambles',
   desc='Hướng dẫn Gyeongju đã được kiểm chứng: cách đi từ Busan hoặc Seoul, lộ trình đi bộ giữa các lăng mộ hoàng gia và những nơi thực sự đáng ghé.',
   head='Gyeongju, dạo bước qua <em>nghìn năm</em>.',
   lede='Cả thành phố là bảo tàng ngoài trời. Hướng dẫn Gyeongju đã được kiểm chứng.',
   cta='Muốn khám phá thêm ngoài Gyeongju?', city='Busan',
   alt='Gyeongju, lăng mộ hoàng gia bên Hwangnidan-gil', cap='Gyeongju, lăng mộ hoàng gia bên Hwangnidan-gil',
   cd='© Gyeongju City', cm='© Gyeongju City (Choi Sun-seop)',
   search='Tìm trong các bài viết — Hwangnidan-gil, KTX...',
   foot='K-Rambles · hướng dẫn Gyeongju đã kiểm chứng'),
 'th': dict(
   title='คู่มือเที่ยวคย็องจูที่แก้ปัญหาจริงของนักท่องเที่ยว | K-Rambles',
   desc='คู่มือคย็องจูที่ตรวจสอบแล้ว: วิธีเดินทางจากปูซานหรือโซล เส้นทางเดินเที่ยวระหว่างสุสานหลวง และที่ที่คุ้มค่าเวลาจริง ๆ',
   head='คย็องจู เดินผ่าน<em>พันปี</em>',
   lede='ทั้งเมืองคือพิพิธภัณฑ์กลางแจ้ง คู่มือคย็องจูที่ตรวจสอบข้อเท็จจริงแล้ว',
   cta='อยากไปเที่ยวนอกคย็องจูบ้างไหม?', city='ปูซาน',
   alt='คย็องจู สุสานหลวงข้างถนนฮวังนิดัน', cap='คย็องจู สุสานหลวงข้างถนนฮวังนิดัน',
   cd='© Gyeongju City', cm='© Gyeongju City (Choi Sun-seop)',
   search='ค้นหาบทความ — ฮวังนิดันกิล, KTX...',
   foot='K-Rambles · คู่มือคย็องจูที่ตรวจสอบข้อเท็จจริงแล้ว'),
}

# 허브: (title, dek, placeholder). dek 은 meta description 으로도 쓴다.
HUB = {
 'en': {
  'trip-planner': ('Gyeongju Trip Planner | K-Rambles', 'Royal tombs, old alleys and walking routes, everything for deciding where to actually go in Gyeongju.', 'Search this board — Hwangnidan-gil, Cheomseongdae...'),
  'getting-around': ('Getting Around Gyeongju | K-Rambles', "Getting to Gyeongju and around its spread-out sights, worked out and verified so you're not guessing at a bus stop.", 'Search this board — KTX, bus, Busan...'),
  'taste': ('Gyeongju Food Guide | K-Rambles', 'Food stories that go past the recipe: history, culture, and how to order each dish the right way.', 'Search this board — convenience store, snacks...'),
  'long-stay': ('Long Stay in Gyeongju | K-Rambles', 'For anyone staying weeks or months, not days: housing, visas and everyday practicalities.', 'Search this board — bank, ARC, phone plan...'),
 },
 'ko': {
  'trip-planner': ('경주 여행 계획 | K-Rambles', '왕릉, 오래된 골목, 걷기 코스까지 — 경주에서 어디로 갈지 정하는 데 필요한 모든 것.', '이 보드에서 검색 — 황리단길, 첨성대...'),
  'getting-around': ('경주 교통 완전정복 | K-Rambles', '경주까지 가는 길과 흩어진 명소 사이 이동법 — 버스 정류장 앞에서 헤매지 않도록 직접 확인하고 검증했다.', '이 보드에서 검색 — KTX, 버스, 부산...'),
  'taste': ('경주 맛집 가이드 | K-Rambles', '레시피 너머의 음식 이야기 — 역사와 문화, 그리고 메뉴별로 제대로 주문하는 법까지.', '이 보드에서 검색 — 편의점, 간식...'),
  'long-stay': ('경주 장기체류 가이드 | K-Rambles', '며칠이 아니라 몇 주, 몇 달을 지내는 사람들을 위해 — 주거, 비자, 그리고 생활 실무.', '이 보드에서 검색 — 은행, 외국인등록증, 요금제...'),
 },
 'vi': {
  'trip-planner': ('Lên kế hoạch du lịch Gyeongju | K-Rambles', 'Lăng mộ hoàng gia, ngõ phố cổ và lộ trình đi bộ — mọi thứ để quyết định thực sự nên đi đâu ở Gyeongju.', 'Tìm trong chuyên mục này — Hwangnidan-gil, Cheomseongdae...'),
  'getting-around': ('Cẩm nang giao thông Gyeongju | K-Rambles', 'Cách đến Gyeongju và di chuyển giữa các điểm tham quan nằm rải rác — đã tìm hiểu và kiểm chứng để bạn không phải đoán mò ở trạm xe buýt.', 'Tìm trong chuyên mục này — KTX, xe buýt, Busan...'),
  'taste': ('Ẩm thực Gyeongju | K-Rambles', 'Câu chuyện ẩm thực vượt ra ngoài công thức nấu ăn — lịch sử, văn hóa, và cách gọi món đúng điệu theo từng loại.', 'Tìm trong chuyên mục này — cửa hàng tiện lợi, đồ ăn vặt...'),
  'long-stay': ('Chuẩn bị lưu trú dài hạn ở Gyeongju | K-Rambles', 'Dành cho những ai ở lại vài tuần hay vài tháng, không chỉ vài ngày — nhà ở, visa, và những việc thực tế trong cuộc sống hằng ngày.', 'Tìm trong chuyên mục này — ngân hàng, ARC, gói cước...'),
 },
 'th': {
  'trip-planner': ('แผนเที่ยวคย็องจู | K-Rambles', 'สุสานหลวง ตรอกเก่า และเส้นทางเดินเที่ยว — ทุกอย่างที่ช่วยตัดสินใจว่าจะไปที่ไหนในคย็องจู', 'ค้นหาในหมวดนี้ — ฮวังนิดันกิล, ชอมซองแด...'),
  'getting-around': ('คู่มือการเดินทางในคย็องจู | K-Rambles', 'วิธีเดินทางไปคย็องจูและเดินทางระหว่างสถานที่เที่ยวที่อยู่กระจายกัน — ตรวจสอบแล้วเพื่อไม่ให้คุณต้องเดาที่ป้ายรถบัส', 'ค้นหาในหมวดนี้ — KTX, รถบัส, ปูซาน...'),
  'taste': ('คู่มืออาหารคย็องจู — กินอะไรดี | K-Rambles', 'เรื่องราวอาหารที่มากกว่าสูตรอาหาร — ประวัติศาสตร์ วัฒนธรรม และวิธีสั่งอาหารแต่ละเมนูให้ถูกต้อง', 'ค้นหาในหมวดนี้ — ร้านสะดวกซื้อ, ขนม...'),
  'long-stay': ('พำนักระยะยาวในคย็องจู — คู่มือใช้ชีวิตจริง | K-Rambles', 'สำหรับใครที่จะอยู่เป็นสัปดาห์หรือเป็นเดือน ไม่ใช่แค่ไม่กี่วัน — ที่พัก วีซ่า และเรื่องจำเป็นในชีวิตประจำวัน', 'ค้นหาในหมวดนี้ — ธนาคาร, ARC, แพ็กเกจมือถือ...'),
 },
}


def pre(lang):
    return '' if lang == 'en' else lang + '/'


def sub1(pat, rep, s, flags=re.S):
    out, n = re.subn(pat, lambda m: rep, s, count=1, flags=flags)
    assert n == 1, pat
    return out


def head_urls(s, path):
    """canonical / hreflang 을 경주 경로로."""
    s = re.sub(r'<link rel="canonical"[^>]*>\n', '', s)
    s = re.sub(r'<link rel="alternate" hreflang="[^"]+"[^>]*>\n', '', s)
    return s, path


def set_head(s, lang, path, title, desc):
    s = re.sub(r'<link rel="canonical"[^>]*>\s*', '', s)
    s = re.sub(r'<link rel="alternate" hreflang="[^"]+"[^>]*>\s*', '', s)
    links = '<link rel="canonical" href="https://k-rambles.com/%s%s">\n' % (pre(lang), path)
    for l in ('ko', 'en', 'vi', 'th'):
        links += '<link rel="alternate" hreflang="%s" href="https://k-rambles.com/%s%s">\n' % (l, pre(l), path)
    links += '<link rel="alternate" hreflang="x-default" href="https://k-rambles.com/%s">\n' % path
    s = sub1(r'<title>[^<]*</title>\s*', '<title>%s</title>\n' % title + links, s)
    s = sub1(r'<meta name="description" content="[^"]*">', '<meta name="description" content="%s">' % desc.replace('"', '&quot;'), s)
    s = re.sub(r'<meta name="kr-city" content="[^"]*">', '', s)
    s = s.replace('</head>', '<meta name="kr-city" content="gyeongju">\n</head>', 1)
    return s


def build_main(lang):
    d = MAIN[lang]
    s = open(os.path.join(ROOT, pre(lang), 'index.html'), encoding='utf-8').read()
    s = set_head(s, lang, 'gyeongju/', d['title'], d['desc'])
    s = s.replace('</head>', MAIN_THEME + '</head>', 1)
    s = sub1(r'<h1 class="headline">.*?</h1>', '<h1 class="headline">%s</h1>' % d['head'], s)
    s = sub1(r'<p class="lede">.*?</p>', '<p class="lede">%s</p>' % d['lede'], s)
    s = sub1(r'<p class="city-cta-text">.*?</p>', '<p class="city-cta-text">%s</p>' % d['cta'], s)
    s = sub1(r'<a class="city-pill" href="[^"]*">.*?</a>', '<a class="city-pill" href="/%s">%s%s →</a>' % (pre(lang), PIN, d['city']), s)
    hero = ('<div class="hero-img-wrap"><picture>\n'
            '        <source media="(max-width: 760px)" srcset="/assets/hero/gyeongju-wide.jpg" width="1200" height="750">\n'
            '        <img src="/assets/hero/gyeongju-landscape.jpg" width="1200" height="899" alt="%s" fetchpriority="high" decoding="async">\n'
            '      </picture><span class="photo-credit"><span class="d">%s</span><span class="m">%s</span></span></div>\n'
            '      <figcaption>%s</figcaption>') % (d['alt'], d['cd'], d['cm'], d['cap'])
    s = sub1(r'<picture>.*?</picture>\s*<figcaption>[^<]*</figcaption>', hero, s)
    s = sub1(r'(id="site-search" placeholder=")[^"]*', None, s) if False else re.sub(r'(id="site-search" placeholder=")[^"]*', lambda m: m.group(1) + d['search'], s, count=1)
    s = sub1(r'<span class="mono">K-Rambles · [^<]*</span>', '<span class="mono">%s</span>' % d['foot'], s)
    for b in BOARDS:
        s, n = re.subn(r'href="/%s%s/"' % (pre(lang), b), 'href="/%sgyeongju/%s/"' % (pre(lang), b), s)
        assert n == 1, (lang, b, n)
        s, n = re.subn(r'/assets/img/inl/%s\.png' % COVER_OLD[b], '/assets/img/inl/%s.png' % COVER[b], s)
        assert n == 1, (lang, b, 'cover')
        # renderHome: 경주 글 + 한국 공통 글만, 글 링크는 원래 게시판 폴더로
        s, n = re.subn(r"(\{ key: '%s', )" % b, r"\1articleBase: '/%s%s/', " % (pre(lang), b), s)
        assert n == 1, (lang, b, 'cfg')
    s, n = re.subn(r'KR\.renderHome\(\{', "KR.renderHome({\n    city: 'gyeongju',", s)
    assert n == 1
    s = s.replace('data-key="index"', 'data-key="gyeongju/index"')
    out = os.path.join(ROOT, pre(lang), 'gyeongju', 'index.html')
    os.makedirs(os.path.dirname(out), exist_ok=True)
    open(out, 'w', encoding='utf-8').write(s)
    return out


def build_hub(lang, b):
    title, dek, ph = HUB[lang][b]
    s = open(os.path.join(ROOT, pre(lang), b, 'index.html'), encoding='utf-8').read()
    s = set_head(s, lang, 'gyeongju/%s/' % b, title, dek)
    s = s.replace('</head>', HUB_THEME % HUB_COL[b] + '</head>', 1)
    s = sub1(r'<p class="hub-dek">[^<]*</p>', '<p class="hub-dek">%s</p>' % dek, s)
    s = sub1(r'(id="site-search" placeholder=")[^"]*', None, s) if False else re.sub(r'(id="site-search" placeholder=")[^"]*', lambda m: m.group(1) + ph, s, count=1)
    s, n = re.subn(r'<a class="logo" href="/%s">' % pre(lang), '<a class="logo" href="/%sgyeongju/">' % pre(lang), s)
    assert n == 1, (lang, b, 'logo')
    s, n = re.subn(r'KR\.renderHub\(\{', "KR.renderHub({\n    city: 'gyeongju',\n    articleBase: '/%s%s/'," % (pre(lang), b), s)
    assert n == 1
    s = s.replace('data-key="%s/index"' % b, 'data-key="gyeongju/%s/index"' % b)
    out = os.path.join(ROOT, pre(lang), 'gyeongju', b, 'index.html')
    os.makedirs(os.path.dirname(out), exist_ok=True)
    open(out, 'w', encoding='utf-8').write(s)
    return out


def translations():
    p = os.path.join(ROOT, 'data', 'translations.json')
    t = json.load(open(p, encoding='utf-8'))
    for key in ['gyeongju/index'] + ['gyeongju/%s/index' % b for b in BOARDS]:
        path = key[:-len('index')]  # 대표 주소(슬래시) 형식: gyeongju/, gyeongju/<board>/
        t[key] = {l: '/' + pre(l) + path for l in ('en', 'ko', 'vi', 'th')}
    json.dump(t, open(p, 'w', encoding='utf-8'), ensure_ascii=False, indent=2)
    open(p, 'a').write('\n')


if __name__ == '__main__':
    for lang in MAIN:
        print(build_main(lang))
        for b in BOARDS:
            print(build_hub(lang, b))
    translations()
