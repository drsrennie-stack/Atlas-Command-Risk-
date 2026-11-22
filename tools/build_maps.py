#!/usr/bin/env python3
"""Draws the simple game boards for every system except nervous (that one is hand drawn in public/maps/nervous.js).
Boards are schematic and are labeled "simplified board, not to scale" in the game. Edit a shape here and run this file again."""
import json, os
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'public', 'maps')
def ell(cx, cy, rx, ry): return f"M{cx-rx} {cy} A{rx} {ry} 0 1 0 {cx+rx} {cy} A{rx} {ry} 0 1 0 {cx-rx} {cy} Z"
def rr(x, y, w, h, r=16):
    r = min(r, w/2, h/2)
    return f"M{x+r} {y} H{x+w-r} A{r} {r} 0 0 1 {x+w} {y+r} V{y+h-r} A{r} {r} 0 0 1 {x+w-r} {y+h} H{x+r} A{r} {r} 0 0 1 {x} {y+h-r} V{y+r} A{r} {r} 0 0 1 {x+r} {y} Z"
def sh(d, at, label=None, line=None): return {"d": d, "at": at, "label": label or [at[0], at[1] + 48], "line": line}
BODY = "M500 30 C545 30 560 70 552 110 C548 135 530 150 528 165 C600 175 660 190 690 215 C720 250 720 520 705 580 C690 600 665 595 660 575 L650 340 C640 420 610 470 600 500 L600 780 L515 780 L500 530 L485 780 L400 780 L400 500 C390 470 360 420 350 340 L340 575 C335 595 310 600 295 580 C280 520 280 250 310 215 C340 190 400 175 472 165 C470 150 452 135 448 110 C440 70 455 30 500 30 Z"
M = {}
M['cells'] = {"main": {"caption": "One cell on the left. The four tissue types on the right.", "decor": ["M640 155 H860", "M640 315 H860", "M640 475 H860", "M640 635 H860"], "shapes": {
  "membrane": sh(ell(290, 400, 240, 270), [72, 400], [150, 96], [[150, 104], [150, 190]]),
  "organelles": sh(ell(290, 400, 200, 230), [290, 560], [290, 606]),
  "nucleus": sh(ell(290, 330, 90, 90), [290, 318]),
  "epithelial": sh(rr(600, 90, 300, 130, 22), [750, 142]), "connective": sh(rr(600, 250, 300, 130, 22), [750, 302]),
  "muscle": sh(rr(600, 410, 300, 130, 22), [750, 462]), "nervoustissue": sh(rr(600, 570, 300, 130, 22), [750, 622])}}}
M['integumentary'] = {"main": {"caption": "A block of skin cut from top to bottom. The surface is at the top.", "decor": ["M160 165 C260 150 360 180 460 165 C560 150 640 180 700 165", "M160 600 C300 570 520 620 700 590"], "shapes": {
  "epidermis": sh(rr(150, 130, 560, 86, 12), [600, 166], [600, 106]),
  "dermis": sh(rr(150, 226, 560, 250, 12), [600, 330]),
  "hypodermis": sh(rr(150, 486, 560, 180, 12), [600, 560]),
  "hair": sh("M282 40 H318 V400 C318 440 282 440 282 400 Z", [300, 300], [210, 76], [[236, 80], [280, 100]]),
  "glands": sh(ell(430, 380, 62, 62), [430, 372]),
  "nails": sh(rr(760, 130, 180, 96, 26), [850, 170])}}}
M['skeletal'] = {"main": {"caption": "A simple skeleton seen from the front.", "decor": [], "shapes": {
  "skull": sh(ell(500, 92, 62, 70), [500, 84]),
  "thoracic": sh(ell(430, 290, 62, 96) + " " + ell(570, 290, 62, 96), [410, 280], [410, 420]),
  "vertebral": sh(rr(484, 168, 32, 330, 14), [500, 340], [600, 452], [[568, 448], [520, 420]]),
  "pectoral": sh(rr(330, 172, 146, 24, 12) + " " + rr(524, 172, 146, 24, 12), [620, 184], [700, 150]),
  "upperlimb": sh(rr(262, 206, 42, 330, 20) + " " + rr(696, 206, 42, 330, 20), [283, 360], [190, 380], [[236, 376], [260, 372]]),
  "pelvic": sh(ell(432, 548, 66, 46) + " " + ell(568, 548, 66, 46), [432, 544], [330, 610]),
  "lowerlimb": sh(rr(412, 606, 44, 186, 20) + " " + rr(544, 606, 44, 186, 20), [566, 690], [680, 700], [[640, 696], [592, 692]])}}}
M['muscular'] = {"main": {"caption": "The body seen from the front, split into muscle regions.", "decor": [], "shapes": {
  "headneck": sh(ell(500, 88, 54, 62) + " " + rr(474, 146, 52, 40, 10), [500, 82], [640, 70], [[590, 70], [556, 80]]),
  "trunk": sh(rr(366, 192, 268, 148, 44), [500, 250]),
  "abdominal": sh(rr(412, 346, 176, 136, 22), [500, 396]),
  "arm": sh(rr(300, 214, 56, 150, 26) + " " + rr(644, 214, 56, 150, 26), [672, 280], [790, 284], [[742, 280], [702, 280]]),
  "forearm": sh(rr(282, 372, 56, 140, 24) + " " + rr(662, 372, 56, 140, 24), [690, 436], [820, 440], [[762, 436], [720, 436]]),
  "hand": sh(ell(300, 548, 32, 36) + " " + ell(700, 548, 32, 36), [700, 546], [820, 550], [[772, 546], [734, 546]]),
  "thigh": sh(rr(404, 490, 88, 162, 30) + " " + rr(508, 490, 88, 162, 30), [448, 560], [270, 640], [[340, 630], [402, 590]]),
  "leg": sh(rr(414, 660, 68, 132, 26) + " " + rr(518, 660, 68, 132, 26), [552, 720], [720, 724], [[660, 720], [588, 720]])}}}
M['cardiovascular'] = {"main": {"caption": "The four heart chambers in the middle, with the circuits around them. The right side of the heart is on the left of the picture.", "decor": [], "shapes": {
  "pulmonary": sh(rr(250, 70, 500, 96, 44), [500, 108]),
  "veins": sh(rr(70, 220, 170, 320, 44), [155, 340], [155, 420]),
  "ra": sh(rr(330, 240, 150, 124, 30), [405, 290]),
  "la": sh(rr(520, 240, 150, 124, 30), [595, 290]),
  "rv": sh("M330 380 H482 V596 C420 584 348 506 330 380 Z", [416, 446]),
  "lv": sh("M518 380 H670 C652 506 580 584 518 596 Z", [584, 446]),
  "aorta": sh(rr(760, 220, 170, 320, 44), [845, 340], [845, 420]),
  "coronary": sh(rr(360, 650, 280, 96, 44), [500, 688])}}}
M['lymphatic'] = {"main": {"caption": "The lymphatic organs laid out roughly where they sit in the body.", "backdrop": [BODY], "decor": [], "shapes": {
  "tonsils": sh(ell(500, 112, 56, 28), [500, 112], [640, 96], [[590, 98], [542, 112]]),
  "thymus": sh(ell(500, 250, 62, 46), [500, 244]),
  "ducts": sh(rr(482, 316, 36, 220, 18), [500, 400], [596, 470], [[560, 462], [522, 440]]),
  "spleen": sh(ell(600, 360, 52, 38), [600, 356], [760, 330], [[710, 334], [654, 350]]),
  "nodes": sh(ell(390, 330, 34, 28) + " " + ell(420, 520, 34, 28) + " " + ell(580, 520, 34, 28), [390, 330], [220, 300], [[278, 304], [354, 322]]),
  "marrow": sh(rr(420, 572, 44, 190, 20), [442, 650], [270, 660], [[330, 656], [416, 652]]),
  "capillaries": sh(ell(690, 500, 44, 60), [690, 496], [830, 500])}}}
M['respiratory'] = {"main": {"caption": "The airway from the nose down to the lungs, seen from the front.", "decor": [], "shapes": {
  "nasal": sh(rr(420, 30, 160, 70, 30), [500, 58], [690, 62]),
  "pharynx": sh(rr(456, 108, 88, 70, 20), [500, 136], [650, 142], [[600, 140], [548, 140]]),
  "larynx": sh(rr(460, 186, 80, 70, 16), [500, 214], [650, 222], [[604, 220], [544, 220]]),
  "trachea": sh(rr(478, 264, 44, 130, 14), [500, 320], [650, 320], [[602, 318], [526, 318]]),
  "lungs": sh(ell(270, 500, 150, 190) + " " + ell(730, 500, 150, 190), [220, 430], [220, 480]),
  "bronchi": sh("M478 402 H522 L650 492 L628 528 L500 446 L372 528 L350 492 Z", [500, 420], [500, 560]),
  "alveoli": sh(ell(760, 580, 66, 60), [760, 572]),
  "diaphragm": sh("M130 760 C300 706 700 706 870 760 L870 792 L130 792 Z", [500, 754], [500, 716])}}}
M['digestive'] = {"main": {"caption": "The digestive organs seen from the front.", "decor": [], "shapes": {
  "mouth": sh(rr(380, 30, 180, 72, 30), [470, 58], [660, 62]),
  "esophagus": sh(rr(446, 110, 48, 176, 20), [470, 190], [330, 190], [[404, 190], [444, 190]]),
  "liver": sh("M170 300 C250 256 400 262 440 300 L440 384 C380 404 260 404 184 372 Z", [300, 326]),
  "stomach": sh(ell(580, 350, 120, 76), [580, 340]),
  "pancreas": sh(rr(420, 440, 240, 46, 22), [540, 463], [790, 466], [[716, 464], [664, 464]]),
  "largeint": sh("M326 500 H674 V736 H620 V552 H380 V736 H326 Z", [352, 640], [220, 640], [[282, 640], [324, 640]]),
  "smallint": sh(ell(500, 650, 100, 76), [500, 640])}}}
M['urinary'] = {"main": {"caption": "One kidney cut open, with the ureter, bladder and urethra below it.", "decor": [], "shapes": {
  "cortex": sh(ell(380, 290, 210, 240), [198, 290], [150, 70], [[160, 80], [196, 250]]),
  "medulla": sh(ell(404, 290, 150, 176), [290, 290], [290, 340]),
  "renalpelvis": sh(ell(460, 290, 76, 96), [452, 270], [452, 322]),
  "vessels": sh(rr(540, 196, 250, 60, 30), [700, 226], [820, 170]),
  "ureter": sh(rr(498, 384, 34, 226, 16), [515, 480], [640, 484], [[596, 482], [536, 482]]),
  "bladder": sh(ell(580, 668, 112, 62), [580, 660]),
  "urethra": sh(rr(563, 732, 34, 62, 12), [580, 760], [700, 766], [[654, 764], [600, 762]])}}}
M['reproductive'] = {
 "male": {"caption": "A diagram of the male tract. Follow the path sperm take: testis, ducts, glands, urethra.", "decor": ["M560 610 C640 600 660 560 668 520", "M640 250 C620 200 600 190 560 196", "M420 230 C380 250 350 270 340 300"], "shapes": {
  "testis": sh(ell(470, 620, 92, 82), [470, 612]),
  "ducts": sh(rr(640, 250, 60, 330, 28), [670, 400], [800, 404], [[748, 402], [704, 402]]),
  "glands": sh(rr(380, 150, 250, 82, 36), [505, 182]),
  "penis": sh(rr(300, 260, 62, 300, 28), [331, 400], [190, 404], [[250, 402], [298, 402]])}},
 "female": {"caption": "The female organs seen from the front.", "decor": [], "shapes": {
  "uterus": sh("M420 300 C420 240 580 240 580 300 L546 470 H454 Z", [500, 330]),
  "tube": sh(rr(250, 262, 176, 34, 17) + " " + rr(574, 262, 176, 34, 17), [330, 279], [330, 230]),
  "ovary": sh(ell(240, 366, 52, 38) + " " + ell(760, 366, 52, 38), [760, 362], [760, 430]),
  "vagina": sh(rr(462, 480, 76, 180, 26), [500, 560], [650, 564], [[592, 562], [542, 562]])}}}
M['endocrine'] = {"main": {"caption": "The endocrine glands in order from the head down. Sizes are not to scale.", "decor": [], "shapes": {
  "hypothalamus": sh(ell(430, 90, 96, 46), [430, 82]),
  "pineal": sh(ell(650, 96, 56, 40), [650, 90], [800, 96]),
  "pituitary": sh(ell(430, 206, 60, 44), [430, 198], [250, 206]),
  "thyroid": sh(ell(452, 334, 42, 54) + " " + ell(548, 334, 42, 54), [548, 326], [760, 330], [[640, 330], [594, 330]]),
  "adrenal": sh(ell(404, 470, 64, 32) + " " + ell(596, 470, 64, 32), [404, 468], [220, 470]),
  "pancreas": sh(rr(380, 544, 240, 58, 28), [500, 572], [760, 574]),
  "gonads": sh(ell(436, 696, 50, 42) + " " + ell(564, 696, 50, 42), [564, 692], [740, 700])}}}
for sid, views in M.items():
    out = {"viewBox": "0 0 1000 800", "views": {}}
    for vid, v in views.items():
        out["views"][vid] = {"caption": v["caption"], "backdrop": v.get("backdrop", []), "decor": v.get("decor", []),
            "shapes": {k: {"d": s["d"], "at": s["at"], "label": s["label"]} for k, s in v["shapes"].items()},
            "labelLines": {k: s["line"] for k, s in v["shapes"].items() if s["line"]}}
    with open(os.path.join(OUT, sid + ".js"), "w") as f:
        f.write("/* Atlas Command - board art for %s. Made by tools/build_maps.py. A simplified game board, not an assessed anatomy image. */\nwindow.ATLAS_MAPS = window.ATLAS_MAPS || {};\nwindow.ATLAS_MAPS.%s = %s;\n" % (sid, sid, json.dumps(out)))
    # every territory in systems.json must have a shape in one of its views
    cfg = json.load(open(os.path.join(OUT, '..', '..', 'data', 'systems.json')))["systems"][sid]
    for t in cfg["territories"]:
        for vw in t["views"]: assert t["id"] in views[vw]["shapes"], (sid, t["id"], vw)
    assert set(views) == {v["id"] for v in cfg["views"]}, sid
print("maps written:", ", ".join(M))
