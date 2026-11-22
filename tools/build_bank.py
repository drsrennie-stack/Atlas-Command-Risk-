#!/usr/bin/env python3
"""
build_bank.py  -  Atlas Command question bank importer

Reads COPIES of the existing card sources and writes a private bank file the
game server loads. Nothing in the source repos is changed.

  Recall Rx anatomy    bio004-card-bank.js        (multiple choice, as written)
  Recall Rx physiology bio005-card-bank.js        (multiple choice, as written)
  Loops                loops/index.html + images  (image identification, typed answer)
  Rounds               rounds/sets/*.json         (image + marker, typed answer)

Rules applied
  * A Loops station with more than one answer blank is left out.
  * A Rounds structure is one question with one marker. Sets are used only if
    they are listed for the system in systems.json.
  * No distractors are written. Recall Rx cards keep their own four options.
    Loops and Rounds stay typed-answer.
  * Every automatic tag (territory, histology) is listed in the review report.

Usage
  python3 tools/build_bank.py --bio004 PATH --bio005 PATH --loops DIR --rounds DIR [--system nervous]
"""
import argparse, csv, json, os, re, shutil, subprocess, sys
from concurrent.futures import ThreadPoolExecutor
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)

def load_js_object(path, marker):
    s = open(path, encoding="utf-8").read()
    i = s.index("{", s.index(marker))
    return json.JSONDecoder().raw_decode(s[i:])[0]

def load_loops(index_html):
    s = open(index_html, encoding="utf-8").read()
    i = s.index("window.LOOPS_ENGINE_CONTENT")
    body = re.sub(r"/\*.*?\*/", "", s[s.index("{", i):], flags=re.S)
    return json.JSONDecoder().raw_decode(body)[0]

def norm(t):
    return re.sub(r"\s+", " ", t.strip())

def tag_territory(text, rules):
    hits = [tid for tid, pats in rules.items() if any(re.search(p, text, re.I) for p in pats["include"])
            and not any(re.search(p, text, re.I) for p in pats.get("exclude", []))]
    return hits

def accept_list(ans, alts):
    """Accepted spellings for a typed answer. Only mechanical variants, nothing invented."""
    out = [ans] + list(alts or [])
    for a in list(out):
        m = re.match(r"^(.*?)\s*\((.*?)\)\s*$", a)          # "Massa Intermedia (Interthalamic Adhesion)"
        if m:
            out += [m.group(1), m.group(2)]
        m = re.match(r"^CN\s+([IVX]+)\s+(.*)$", a)           # "CN X Vagus Nerve"
        if m:
            out += [m.group(2), re.sub(r"\s+nerve$", "", m.group(2), flags=re.I)]   # the name counts, with or without the numeral
        out.append(re.sub(r"\b3rd\b", "third", re.sub(r"\b4th\b", "fourth", a, flags=re.I), flags=re.I))
        out.append(re.sub(r"\bgrey\b", "gray", a, flags=re.I))
        out.append(re.sub(r"\bgray\b", "grey", a, flags=re.I))
    seen, res = set(), []
    for a in out:
        a = norm(a)
        if a and a.lower() not in seen:
            seen.add(a.lower()); res.append(a)
    return res

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--bio004"); ap.add_argument("--bio005"); ap.add_argument("--loops"); ap.add_argument("--rounds")
    ap.add_argument("--system", default="nervous")
    ap.add_argument("--loops-remote", action="store_true", help="do not copy Loops frames; the server reads them from the Loops site")
    ap.add_argument("--ocr", action="store_true", help="read each Loops question frame and leave out any that print their own answer")
    a = ap.parse_args()
    cfg = json.load(open(os.path.join(ROOT, "data", "systems.json"), encoding="utf-8"))["systems"][a.system]
    rules = cfg["territoryRules"]
    out, report, excluded = [], [], []

    def add(q, flags):
        q["system"] = a.system; q["review"] = flags
        out.append(q)
        report.append([q["id"], q["source"], q["type"], q["content"], q.get("anat") or "", q.get("territory") or "system-wide",
                       q["dok"], q.get("competency") or "", q["topic"], "; ".join(flags), norm(q.get("q", ""))[:140],
                       q.get("answerText", "")[:80]])

    def mc_cards(bank, src, content, topics):
        for m in bank["modules"]:
            for t in m["topics"]:
                spec = topics.get(t["id"])
                if spec is None: continue
                for c in t["cards"]:
                    cid = "%s:%s:%s" % (src, t["id"], c.get("id"))
                    opts = c.get("options") or []
                    ci = c.get("correctIndex")
                    text = c.get("q", "") + " " + (opts[ci] if isinstance(ci, int) and 0 <= ci < len(opts) else "")
                    if spec.get("onlyIf") and not re.search(spec["onlyIf"], text, re.I):
                        excluded.append([cid, src, "not about this system (topic is shared with another system)"]); continue
                    if len(opts) != 4 or not isinstance(ci, int) or not (0 <= ci < 4) or len(set(o.strip().lower() for o in opts)) != 4 or not c.get("q"):
                        excluded.append([cid, src, "card is not a clean four-option multiple choice"]); continue
                    why = c.get("why") or c.get("explanation") or ""
                    flags = []
                    if not why: flags.append("no explanation on card")
                    if spec.get("territory"):
                        terr = spec["territory"]; flags.append("territory set from the card's topic")
                    else:
                        hits = tag_territory(text, rules)
                        terr = hits[0] if len(hits) == 1 else None
                        if terr: flags.append("territory tagged automatically from wording")
                    anat = None
                    if content == "anatomy":
                        anat = spec.get("anat", "gross")
                        hrule = spec.get("histologyIf") or (cfg.get("histologyIf") if "anat" not in spec else None)
                        if hrule:
                            anat = "histology" if re.search(hrule, text, re.I) else "gross"
                            flags.append("gross/histology tagged automatically from wording")
                    add({"id": cid, "source": src, "type": "mc", "content": content, "anat": anat, "territory": terr,
                         "dok": int(c.get("dok") or 1), "competency": c.get("competencyId"), "topic": t["title"],
                         "q": c["q"], "options": opts, "correctIndex": ci, "why": why, "notes": c.get("notes") or [],
                         "answerText": opts[ci]}, flags)

    if a.bio004:
        mc_cards(load_js_object(a.bio004, "BIO004_CARD_BANK ="), "recallrx-bio004", "anatomy", cfg["recallRx"]["bio004"])
    if a.bio005:
        mc_cards(load_js_object(a.bio005, "BIO005_CARD_BANK ="), "recallrx-bio005", "physiology", cfg["recallRx"]["bio005"])

    img_out = os.path.join(ROOT, "data", "images")
    def copy_img(src, rel, copy=True):
        dst = os.path.join(img_out, rel)
        if copy:
            os.makedirs(os.path.dirname(dst), exist_ok=True)
            if not os.path.exists(dst): shutil.copyfile(src, dst)
        return rel, Image.open(src).size

    def shows_answer(qf, ans):
        """Read the words printed on the question frame. True if the answer is printed there."""
        if not a.ocr: return False
        try:
            txt = subprocess.run(["tesseract", qf, "-", "--psm", "11"], capture_output=True, text=True, timeout=60).stdout.lower()
        except Exception:
            return False
        txt = re.sub(r"[^a-z0-9 ]+", " ", txt)
        words = [w for w in re.sub(r"\(.*?\)", " ", ans.lower()).replace("/", " ").split() if len(re.sub(r"[^a-z]", "", w)) >= 4]
        words = [re.sub(r"[^a-z0-9]", "", w) for w in words]
        return bool(words) and all(w in txt for w in words)

    if a.loops:
        content = load_loops(os.path.join(a.loops, "index.html"))
        jobs = []
        for lp in content["loops"]:
            spec = cfg["loops"].get(lp["id"])
            if spec is None: continue
            for n, st in enumerate(lp["stations"]):
                sid = "loops:%s#%d" % (lp["id"], n)
                if len(st["ans"]) != 1:
                    excluded.append([sid, "loops", "more than one structure or answer blank on the station (%s)" % " / ".join(st["ans"])]); continue
                ans = st["ans"][0]
                if str(n) in spec.get("skipStations", {}):
                    excluded.append([sid, "loops", spec["skipStations"][str(n)]]); continue
                if spec.get("onlyIf") and not re.search(spec["onlyIf"], ans, re.I):
                    excluded.append([sid, "loops", "not about this system"]); continue
                qf = os.path.join(a.loops, "images", lp["dir"], "s%02d.jpg" % st["q"])
                af = os.path.join(a.loops, "images", lp["dir"], "s%02d.jpg" % st["a"])
                if not (os.path.exists(qf) and os.path.exists(af)):
                    excluded.append([sid, "loops", "image file missing"]); continue
                jobs.append((lp, spec, n, st, sid, ans, qf, af))
        with ThreadPoolExecutor(8) as ex:
            shown = list(ex.map(lambda j: shows_answer(j[6], j[5]), jobs))
        for (lp, spec, n, st, sid, ans, qf, af), bad in zip(jobs, shown):
            if bad:
                excluded.append([sid, "loops", "the question image prints its own answer (%s on frame s%02d)" % (ans, st["q"])]); continue
            qrel, size = copy_img(qf, "loops/%s/s%02d.jpg" % (lp["dir"], st["q"]), not a.loops_remote)
            arel, _ = copy_img(af, "loops/%s/s%02d.jpg" % (lp["dir"], st["a"]), not a.loops_remote)
            flags = []
            if spec.get("territory"):
                terr = spec["territory"]; flags.append("territory set from the Loop it came from")
            else:
                hits = tag_territory(ans, rules)
                terr = hits[0] if len(hits) == 1 else None
                if terr: flags.append("territory tagged automatically from the answer")
            acc = accept_list(ans, (st.get("alt") or {}).get(ans))
            if len(acc) > 1 + len((st.get("alt") or {}).get(ans) or []): flags.append("extra accepted spellings added: " + " | ".join(acc[1:]))
            add({"id": sid, "source": "loops", "type": "image", "content": "anatomy", "anat": spec.get("anat", "gross"),
                 "territory": terr, "dok": 1, "competency": None, "topic": lp["title"],
                 "q": "Follow the prompt on the image and type your answer.", "image": qrel, "answerImage": arel,
                 "w": size[0], "h": size[1], "accept": acc, "answerText": ans, "why": ""}, flags)

    if a.rounds:
        sets_dir = os.path.join(a.rounds, "sets")
        for fn in sorted(os.listdir(sets_dir)):
            sid0 = fn[:-5]
            if not any(re.match(p, sid0) for p in cfg.get("rounds", [])): continue
            s = json.load(open(os.path.join(sets_dir, fn), encoding="utf-8"))
            frames = {f["id"]: f for f in s["frames"]}
            if len(s["structures"]) > cfg.get("roundsMaxStructures", 1):
                excluded.append(["rounds:" + sid0, "rounds", "more than one structure tagged on the image (%d)" % len(s["structures"])]); continue
            for st in s["structures"]:
                f = frames.get(st["frame"]); sid = "rounds:%s#%s" % (sid0, st["id"])
                src = os.path.join(a.rounds, f["image"]) if f else ""
                if not f or not os.path.exists(src):
                    excluded.append([sid, "rounds", "image file missing"]); continue
                rel, _ = copy_img(src, "rounds/" + os.path.basename(f["image"]))
                hits = tag_territory(st["name"] + " " + s["title"], rules)
                add({"id": sid, "source": "rounds", "type": "image", "content": "anatomy", "anat": "gross",
                     "territory": hits[0] if len(hits) == 1 else None, "dok": 1, "competency": None, "topic": s["title"],
                     "q": "Name the marked structure.", "image": rel, "answerImage": None, "w": f["width"], "h": f["height"],
                     "marker": {"polygons": st["polygons"], "anchor": st["anchor"]},
                     "accept": accept_list(st["name"], st.get("aliases")), "answerText": st["name"],
                     "why": " ".join(st.get("facts") or [])}, [])

    json.dump({"system": a.system, "count": len(out), "questions": out},
              open(os.path.join(ROOT, "data", "bank-%s.json" % a.system), "w", encoding="utf-8"), ensure_ascii=False)
    os.makedirs(os.path.join(ROOT, "reports"), exist_ok=True)
    with open(os.path.join(ROOT, "reports", "import-report-%s.csv" % a.system), "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f); w.writerow(["id", "source", "type", "content", "gross_or_histology", "territory", "dok", "competency", "topic", "needs_review", "question", "answer"]); w.writerows(report)
    with open(os.path.join(ROOT, "reports", "left-out-%s.csv" % a.system), "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f); w.writerow(["id", "source", "reason"]); w.writerows(excluded)

    # summary
    from collections import Counter
    print("imported", len(out), "left out", len(excluded))
    print(Counter((q["source"], q["content"], q.get("anat")) for q in out))
    print("by territory", Counter(q.get("territory") or "system-wide" for q in out))
    print("left out reasons", Counter(e[2].split(" (")[0] for e in excluded))
    for terr in list(rules) + [None]:
        row = []
        for label, f in (("anat-gross", lambda q: q["content"] == "anatomy" and q["anat"] == "gross"),
                         ("anat-histo", lambda q: q["anat"] == "histology"), ("phys", lambda q: q["content"] == "physiology")):
            row.append("%s d1=%d d2=%d d3=%d" % ((label,) + tuple(sum(1 for q in out if q.get("territory") == terr and f(q) and q["dok"] == d) for d in (1, 2, 3))))
        print("%-13s" % (terr or "system-wide"), " | ".join(row))

if __name__ == "__main__":
    main()
