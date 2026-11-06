#!/usr/bin/env python3
"""음식 띠(Pick a dish)용 정사각형 썸네일을 만듭니다.

data/dishes.json 의 각 항목에서 src 사진을 320×320 으로 잘라 assets/thumbs/dishes/<slug>.jpg 에 저장해요.
crop 값은 0~1 사이 숫자예요. 0 이면 왼쪽(위), 1 이면 오른쪽(아래)에 붙여 자르고, 없으면 가운데(0.5)를 잘라요.
이미 파일이 있으면 건너뛰고, --force 를 주면 다시 만들어요.
    python3 tools/build_dish_thumbs.py
"""
import json, os, sys
from PIL import Image
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
OUT = os.path.join(ROOT, "assets/thumbs/dishes")
os.makedirs(OUT, exist_ok=True)
force = "--force" in sys.argv
made = 0
for d in json.load(open(os.path.join(ROOT, "data/dishes.json"), encoding="utf-8")):
    dst = os.path.join(OUT, d["slug"] + ".jpg")
    if os.path.exists(dst) and not force: continue
    im = Image.open(os.path.join(ROOT, d["src"].lstrip("/"))).convert("RGB")
    w, h = im.size; s = min(w, h)
    f = float(d.get("crop", 0.5))
    x = int((w - s) * f); y = int((h - s) * f)
    im.crop((x, y, x + s, y + s)).resize((320, 320), Image.LANCZOS).save(dst, quality=78, optimize=True)
    made += 1
print("썸네일 %d개 생성 (%s)" % (made, OUT))
