# Atlas Command

A multiplayer anatomy and physiology territory game. Twelve body systems.

Built 2026-11-17. Created by Dr. Sharilyn Rennie.

## Read this first

- This is a small web app with a server. It is not a single HTML file, because real multiplayer and a private answer key both need a server.
- It runs and has been tested on one computer with many browser windows. It is not on the internet yet. You put it online in Step 2 below (about 15 minutes, one time).
- The repo that holds this folder must be PRIVATE. The folder contains your question bank and answer keys.

## What works now, and what needs setup

| Feature | Status |
|---|---|
| Host creates a room, students join by code or link from their own devices | Works. Needs the server online (Step 2) for devices outside your computer. |
| Lobby with names and team assignment | Works |
| Shared map, turn order, questions, scores | Works. The server holds the match. |
| Server checks every move and every answer | Works |
| Reconnect after a dropped connection | Works. Same browser returns to the same seat. |
| Host pause, resume, end match | Works |
| Individual mode (2 to 6 players) and team mode (2 to 6 teams, up to 80 students) | Works. Same engine. |
| Rotating spokesperson, teammate suggestions | Works |
| Claim, Reinforce, Challenge with a defender answer | Works |
| Optional match timer with disclosed scoring | Works |
| Recall Rx cards (anatomy and physiology) | Imported as written, with their own four options. Counts per system are below. |
| Loops image stations | Imported as typed-answer questions, single structure only. The pictures are read from your Loops site while the game runs (see "Loops images"). |
| Rounds sets | Only sets with one tagged structure are used. Three sets qualify, and two of those have no image file in the repo, so one Rounds question is in the game. Sets with more than one tagged structure are left out, per your rule. The marker display is built but has not been used in a browser match yet. |
| CSV or JSON import with check and preview | Works (import.html) |
| Opening sequence, captions, skip, replay | Works |
| Sound and reduced motion controls | Works |
| End of match summary, missed questions, Practice next | Works, for the current match only |
| Progress saved across sessions or devices | Not built. Nothing is stored after a room closes. |
| Teacher accounts tied to Kajabi purchases | Not built. For the trial, one teacher code protects room creation. See docs/ARCHITECTURE.md. |
| Rooms survive a server restart | Not built. A restart ends open rooms. |
| Twelve body systems | Works. Each one played a full simulated match and a short browser match. The nervous board is hand drawn. The other eleven boards are simple diagrams. |
| Body plan cards (terminology, cavities, Introduction Loop) | Not in a system yet. They need their own board. |

## What is in each system

| System | Territories | Recall Rx anatomy | Recall Rx physiology | Loops | Rounds | Total |
|---|---|---|---|---|---|---|
| Cells and Tissues | 7 | 271 | 849 | 1 | 0 | 1121 |
| Integumentary System | 6 | 83 | 0 | 0 | 0 | 83 |
| Skeletal System | 7 | 601 | 0 | 64 | 0 | 665 |
| Muscular System | 8 | 672 | 376 | 225 | 1 | 1274 |
| Nervous System | 11 | 879 | 1224 | 133 | 0 | 2236 |
| Endocrine System | 7 | 110 | 319 | 0 | 0 | 429 |
| Cardiovascular System | 8 | 1377 | 772 | 91 | 0 | 2240 |
| Lymphatic and Immune System | 7 | 238 | 108 | 0 | 0 | 346 |
| Respiratory System | 8 | 306 | 413 | 72 | 0 | 791 |
| Digestive System | 7 | 300 | 206 | 87 | 0 | 593 |
| Urinary System | 7 | 141 | 484 | 55 | 0 | 680 |
| Reproductive System | 8 | 240 | 132 | 24 | 0 | 396 |

A card can sit in more than one system (for example the Circle of Willis Loop is in nervous and cardiovascular).

## Loops images

The Loops pictures are not in this folder. That keeps the repo under 100 files so it uploads in one drag. The server fetches each picture from `https://drsrennie-stack.github.io/loops/images/` when a question needs it and passes it to students through a one-time address.

- Your Loops site has to stay online at that address.
- When the server starts it checks that address. If it cannot reach it, image questions are switched off and the log says so. Everything else still works.
- I could not reach that address from my build environment, so this was tested against a local copy of your Loops repo, not the live site. Check the server log on first start for the line `Loops images: reachable`.
- To keep copies on the server instead, run the importer without `--loops-remote`. It copies the frames into data/images.

## Step 1. Try it on your computer

1. Install Node.js (the LTS version) from nodejs.org. One time.
2. Open Terminal, go to this folder, and run:

   ```
   TEACHER_CODE=choose-a-code node server/server.js
   ```

   On Windows PowerShell: `$env:TEACHER_CODE="choose-a-code"; node server/server.js`
3. Open http://localhost:8787 in a browser. Create a room with your teacher code.
4. Open two or three private windows, go to the same address, and join with the room code.
5. Start the match from the host window.

Devices on the same Wi-Fi can also join at `http://YOUR-COMPUTER-IP:8787` while Terminal stays open.

## Step 2. Put it online (Render)

1. In your GitHub repo, delete the `atlas` folder from the earlier upload. Then unzip this package, open the unzipped folder, select everything inside it, and drag it all onto the repo's upload page in one go. `render.yaml` and `package.json` must end up at the top level of the repo. The repo must be PRIVATE.
2. Make an account at render.com. Choose New, then Blueprint, and pick the repo. Render reads `render.yaml`.
3. When asked for TEACHER_CODE, type the code you want teachers to use.
4. Use a paid always-on plan for class. Free plans go to sleep, and a sleeping or restarted server drops open rooms.
5. Render gives you an address like `https://atlas-command.onrender.com`. That address is the game.

Any host that runs Node 18 or newer works the same way (Railway, Fly.io, a small VPS). There is nothing to install or build. The start command is `node server/server.js`.

GitHub Pages cannot run this. Pages only serves files and has no server.

## Step 3. Kajabi

Embed the game on a Kajabi page with your usual iframe code. The iframe ID is `atlas-command`.

- Student page (open): the game address. Students join with a room code. No purchase.
- Teacher membership page (gated by Kajabi): the same address plus the teacher code in the page text.

What Kajabi does and does not do is in docs/ARCHITECTURE.md.

## Step 4. Test before class

1. In Terminal, run `node test/simulate.js`. It plays fifteen full matches against the real server with simulated students, at least one in every system, and checks 900+ things (illegal moves refused, no answers sent early, reconnects, pause, timers). The last line should say `0 failed`.
2. Online, run one match with three devices: phone, laptop, tablet.
3. Turn one device's Wi-Fi off for 10 seconds mid-match and back on. It should return to its seat.
4. Read the reports folder. See "Your review" below.

## Your review before students play

Nothing was written for students. Every question, option and explanation is yours, copied as written. These parts are new and need your eyes:

1. **reports/import-report-SYSTEM.csv** (one per system) lists every imported card with its tags. The `needs_review` column marks cards where a tag was set automatically:
   - territory, set from the card's topic or from its wording. Cards with no territory are "system-wide" and can be asked for any territory in that system.
   - gross or histology, set from wording. This is the roughest tag. Check it before you run a histology-only match.
   - extra accepted spellings on Loops answers (for example "Vagus Nerve" for "CN X Vagus Nerve")
2. **reports/left-out-SYSTEM.csv** lists what was left out and why: Loops stations with two answers, Rounds sets with more than one tagged structure, and cards from a shared topic that belong to another system. In the nervous system, Spinal Cord Loop station 3 (frame s05) shows "Dura Mater" on the question image, so it was left out. The source slide may need a fix.
   - I looked at every nervous system question image myself. For the other systems a text reader checked each question image for its own answer and found none. That check can miss stylized text, so skim those Loops before a class uses them.
3. **The map connection notes** in data/systems.json. I wrote 104 one-line anatomy statements across the twelve systems (for example "The pyloric sphincter opens into the duodenum"). Students see them. Please confirm each. Three to look at first: the endocrine feedback lines, "Epinephrine from the adrenal medulla inhibits insulin release from the islets", and the two reproductive lines marked "same embryonic origin", which are there so the male and female boards connect.
4. **Level mapping.** Foundations uses DOK 1 cards. High school uses DOK 1 and 2. College uses all three and leans to DOK 2 and 3. These are your college course cards, so the vocabulary is the same at every level. Only the thinking level changes.
5. **Typed answers.** A small spelling slip is accepted (1 letter for words of 6 to 9 letters, 2 for longer). The host cannot yet overrule a marked answer.

## Rebuilding the banks from your repos

Your repos are never changed. The importer reads them and writes copies into data/. Run it once per system.

```
python3 tools/build_bank.py --system digestive --loops-remote --ocr \
  --bio004 path/to/new-build-bio4-solano/bio004-card-bank.js \
  --bio005 path/to/battleship-neuro/bio005-card-bank.js \
  --loops  path/to/loops \
  --rounds path/to/new-build-bio4-solano/rounds
```

Needs Python 3 and Pillow (`pip install pillow`). `--ocr` also needs Tesseract. Restart the server after.

To use Rounds sets with more than one tagged structure, add `"roundsMaxStructures": 20` to that system in data/systems.json and run the importer again. Each structure then becomes its own question with one marker.

## Changing or adding a system

1. data/systems.json holds each system's territories, connections (true statements only), Recall Rx topics, Loops and Rounds sets.
2. The nervous board is public/maps/nervous.js. The other boards are drawn by tools/build_maps.py. Edit a shape there and run it.
3. A new system also needs its script tag in public/index.html.

## Folder map

| Path | What it is |
|---|---|
| server/server.js | Rooms, connections, turn timers, what each person may see |
| server/engine.js | The rules |
| server/bank.js | Question picking, answer checking, import checking |
| public/ | What the browser loads. No questions or answers are in here. |
| data/bank-SYSTEM.json | Private question banks with answer keys, one per system |
| data/images/rounds/ | Copies of the Rounds images used |
| data/systems.json | Territories, connections and card lists per system |
| tools/build_bank.py | Importer |
| tools/build_maps.py | Draws the eleven simple boards |
| test/simulate.js | Automated match test |
| reports/ | Import report and left-out list |
| docs/RULES.md | The ruleset |
| docs/ARCHITECTURE.md | How it fits together, Kajabi, content protection |
| compliance-notes.md | Accessibility notes |
