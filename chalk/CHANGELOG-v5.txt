CHALK — Gymnastics Session Builder (v5.10)
========================================

WHAT'S NEW IN v5.10 — GYMORGPRO'S HEADER ASSIGNMENTS NOW COME ACROSS
GymOrgPro's header manager assigns each lesson-plan banner to squads with its
"use for" chips — but those assignments are stored ON EACH HEADER, and Chalk
was only reading a top-level squad→header map that GymOrgPro never exports.
Every squad therefore fell back to the name guess, which happened to work for
squads named after their header (Springers) and silently failed for the rest
— most visibly the Competitive squads and cases like Foundation Cup → GPS.

Fixed in the bridge (no re-import needed — it applies on the next sync):

  • parseBackup() now builds the squad→header map from the headers' own
    "use for" lists (several field spellings accepted), a headerId stored on
    the squad, and any top-level map, in that rising priority. Squads and
    headers may be referenced by id or by name — both resolve.
  • resolveHeader() no longer dead-ends on a stale reference: if an assigned
    header was since removed in GymOrgPro, it falls through to the next
    source instead of losing the banner. A coach's Chalk-side pick now also
    outranks the backup's assignment (it's the more deliberate of the two);
    leaving the picker on "Auto" keeps GymOrgPro in charge.
  • The name guess now matches a header name anywhere in the squad name on a
    word boundary ("WAG Competitive 2" → Competitive), not just as a prefix.
  • The header picker's "Auto — …" label now shows the header that will
    actually be used (GymOrgPro's assignment if there is one), not the guess.

WHAT'S NEW IN v5.9 — THE NOTES BOX AT THE BOTTOM OF THE PLAN
The lesson plan now ends with a Notes block, the on-screen twin of the Notes box
at the bottom of the printed/Word document. It has two halves:

  • GymOrgPro's STANDING notes. GymOrgPro's Lesson Plans tab has a new "Lesson
    Plan Notes" text box, sitting between Warm-up and Warm-down. Whatever is
    typed there is the gym's standing text for every plan — water breaks, squad
    rules, upcoming events — and it flows straight through to Chalk (live, same
    read-only link as everything else) and shows at the top of the Notes block,
    tagged "GymOrgPro note". It's read-only here: edit it in GymOrgPro and it
    re-syncs.
  • This lesson's own notes. Underneath, a coach can type notes for the lesson
    on screen. They're saved per dated session, per browser, like the plans.

Both print into the Notes box of the exported Word document (standing notes
first, then the lesson's), and into Print / PDF. GymOrgPro's own bulk export does
the same, adding the session's warm-down notes from the Calendar tab underneath.


WHAT'S NEW IN v5.8 — DRAG SKILLS TO REORDER THEM
The up/down arrows are gone. Each row in a rotation now has a grip handle on the
right: press it and drag the row where you want it. The gap opens up under your
finger as you go, and the plan is rewritten when you let go. Drag to the top or
bottom edge of the plan column and it scrolls along with you, so a skill can be
moved further than one screenful.

It's built on pointer events, not HTML5 drag-and-drop, so it works with a finger
on a tablet exactly as it does with a mouse — HTML5 drag never fires on touch.
Keyboard still works too: tab to a handle and press the up/down arrow keys.

Order is per block, saved with the lesson, carried by "Copy previous", and it's
the order the Word document prints in.

FIXED IN v5.7.1 — THE PLAN NO LONGER JUMPS BACK TO THE TOP
Ticking a skill made the lesson plan scroll up to the warm-up / earlier
rotations, so the rotation you were filling scrolled out of view. Cause: the
plan's blocks and rows were defined INSIDE the plan component, which made them a
new component type on every render — React threw the whole plan away and rebuilt
it on each tick, which collapses the scrolling area and pins it back to the top.
They're now defined once, so React updates the rows in place: the scroll position
holds and the selected rotation stays put and stays selected.

WHAT'S NEW IN v5.7 — GYMORGPRO'S NOTES COME ACROSS + RE-ORDERABLE ROTATIONS

1. NOTES FROM GYMORGPRO APPEAR AS ITEMS IN THE ROTATION
Anything typed into GymOrgPro's lesson-plan pop-up for a session — a circuit's
KCP note, its Safety note, the Warm-down notes — now comes across into Chalk as
an item in the matching block, tagged "GymOrgPro note" (safety notes in amber).
They sit ABOVE the skills, as the brief for that station.

  • They stay GymOrgPro's: edit the note over there and it re-syncs here, live.
  • Delete one here and it stays deleted (that doesn't change GymOrgPro's text,
    so nothing re-adds it) — it's your lesson to shape.
  • They are NOT carried into other lessons by "Copy previous" — a note belongs
    to the lesson it was written for.
  • In the Word export, a KCP note prints as coaching points and a Safety note
    prints in the Safety column, in the circuit it belongs to.
  • Notes are matched to rotations by position, falling back to the station, so a
    note lands on the right circuit even in an odd two-sessions-in-a-day case.

2. RE-ORDER SKILLS INSIDE A ROTATION
Every row in the lesson plan now has up/down arrows. Rotations run in order, so
the plan should too: put the drill before the skill, the shape before the
tumble. Ordering is per block, saved with the lesson, carried by "Copy previous",
and it's the order the Word document prints in. New skills you tick are added to
the bottom of the block. (Plans built in earlier versions keep the order they're
already in — the first move you make just locks it in.)

WHAT'S NEW IN v5.6 — "COPY PREVIOUS" ON EVERY ROTATION
Each rotation block now has a "Copy previous" button next to Select / Adding
here. It looks BACKWARDS through this squad's lessons in the block, finds the
last time they were on THAT station — whenever that was, a week ago or three —
and copies the skills that were planned for it into this rotation.

That's the difference from "Prefill → same as last time", which copies the whole
previous LESSON. A squad might be on Floor 3 this Monday and not again for a
fortnight; "Copy previous" follows the station, not the calendar, so a coach can
repeat a rotation as-is or use it as the starting point and progress from there.

  • The button shows the date it would copy from (e.g. "Copy previous 14 Jul"),
    so you know what you're about to pull in before you click.
  • It goes dim when there's nothing behind it yet (first time on that station in
    this block, or that lesson was never planned).
  • It TOPS UP, never wipes: anything already in the rotation stays, so you can
    copy last time's skills and add the progression on top. Remove any you don't
    want with the X, as usual.
  • If a lesson visited the station twice, the later visit is the one copied.
  • The rotation becomes the selected block afterwards, ready for new ticks.
  • Warm-up and warm-down are untouched (they carry GymOrgPro's own items).

WHAT'S NEW IN v5.5 — OPEN A LESSON STRAIGHT FROM GYMORGPRO'S CALENDAR
In GymOrgPro's Calendar tab, every session row now has a "Chalk ↗" button (and
the lesson-plan pop-up has "Edit in Chalk ↗"). Click it and Chalk opens in a new
tab already on THAT lesson — right roster, right block, right squad, right date,
with the real rotation, coach and times loaded. No connecting, no picking a
roster, no hunting for the date.

How it works: the button opens Chalk with the lesson named in the address, e.g.
  https://camtmsmith.github.io/AshDream/?roster=default&block=calb_x
       &squad=sq_x&session=ses_x&date=2026-08-04
Chalk connects to that roster on the live (read-only) link and lands on the
matching lesson. The link carries POINTERS only — never a copy of the schedule —
so it can't go stale, and Chalk still can't write anything back to GymOrgPro.
Links are shareable/bookmarkable: send one to another coach and it opens the
same lesson for them.

Setup: in GymOrgPro's index.html, CHALK_URL (near FIREBASE_CONFIG at the top of
the script) points at where Chalk is hosted. It ships set to
https://camtmsmith.github.io/AshDream/ — change it if Chalk moves. Both apps must
be on the same Firebase project (they are).

If a link can't be resolved (the lesson was deleted, or it belongs to a different
GymOrgPro location than the one that's active), Chalk says so and drops you into
the normal GymOrgPro panel to pick a lesson by hand.

WHAT'S NEW IN v5.4 — WARM-UP / WARM-DOWN ITEMS ARE EDITABLE
GymOrgPro's warm-up and warm-down items (Leg Strength, Shaping, Stretch Program,
Splits, etc.) now come across as individual entries in the Warm-up and Warm-down
blocks, each with its duration and an X to remove it. Drop the ones that don't
apply to a particular lesson and add your own skills alongside them. Removals are
per lesson and stick - and they carry through to the exported Word document,
where the items you kept appear in the Activity/Duration table exactly as
GymOrgPro lays it out.

Also fixed: connecting to GymOrgPro now actually opens the pre-selected roster.
Previously it filled the roster dropdown but never loaded it, so blocks, squads
and lessons stayed empty until you manually picked a different roster.

WHAT'S NEW IN v5.3 — PICK ANY SKILL INTO ANY BLOCK + DIAGRAMS IN WORD
Select a block on the left (a rotation, the Warm-up, or the Warm-down) and it
shows "Adding here". EVERY skill you then tick goes into that block - no matter
which apparatus it comes from. So you can put a shaping drill on the Beam
rotation, or conditioning into the Warm-up. The block stays selected when you
change apparatus tabs, so you can pull skills from several apparatus into the
one rotation. The old "Additional skills" catch-all is gone - nothing is
stranded any more.

Warm-up and Warm-down are now full blocks, always present, that work exactly
like the rotations. GymOrgPro's standard warm-up/warm-down items still show as
the "Standard:" reference line, and any skills you add appear underneath them -
and in the Word export as proper Skill/KCP rows.

Skill DIAGRAMS are now embedded in the exported Word document, in the Skill
column next to the skill name (up to 2 per skill), scaled to fit. This needs the
new images-b64.js file, which holds the diagrams as data (a double-clicked
file:// page is not allowed to read its own image files, so the bytes have to be
inlined).

WHAT'S NEW IN v5.2 — WORD (.docx) LESSON PLAN EXPORT
Chalk now exports the SAME Word document GymOrgPro exports - same banner, same
TERM/WEEK/DAY/DATE/TIME and SQUAD/LENGTH/COACH lines, same Warm-up
Activity/Duration table, same "Circuit N - Station - X mins" bars with
Equipment/Skill/KCP/Safety tables, same Warm-down, Notes and green Key bar -
except Chalk FILLS IN the skills, with each skill's coaching points as its KCP.
Circuits you haven't planned still come out with blank rows to write on.

Three buttons under the lesson plan:
  Export this lesson (Word)   - one .docx for the lesson on screen
  Export squad's block        - one .docx per planned lesson for this squad, zipped
  Export whole block          - one .docx per planned lesson for EVERY squad, zipped
Batch exports skip lessons with no skills chosen yet. Files are named like
GymOrgPro's: 2026_Competitive_8_Term_3_block_Week_4_August_4_Tuesday.docx

No install, no internet needed for the export itself - the Word file is built in
the browser (chalk-docx.js). Skill diagrams ARE embedded (see v5.3 above).

WHAT'S NEW IN v5.1 — ROTATION-ACCURATE LESSON PLAN OUTPUT
The printed/PDF lesson plan is now built from the REAL GymOrgPro rotation, not
from a guess. It uses the squad name, the real date, coach, session length, the
squad's header banner, and each rotation's ACTUAL station name and minutes
(e.g. "Rotation 1 - Floor 2 - 15 mins"). Previously it titled the plan with the
Chalk level, split the manual "Mins" box evenly across circuits (inventing times
like "18 mins"), and listed any apparatus you'd picked from - even ones not in
the rotation.

Skills are now tied to the ROTATION SLOT, not just the apparatus. If a session
visits Floor twice (Floor 2 early, Floor 1 later), each gets its own skills.
Click "Add" on a rotation to aim the selector at it; the highlighted rotation is
where new ticks land. Skills picked for an apparatus that isn't in the rotation
are kept under "Additional skills" rather than silently appearing as a circuit.

WHAT'S NEW IN V5 — LESSON-PLAN LAYOUT + PER-SESSION PLANS
The page is now two halves. The LEFT is the lesson plan itself: session details
and header banner at the top, then it steps down through the warm-up, each
rotation (in the order GymOrgPro schedules them), and the warm-down — laid out
like the finished lesson-plan document. The RIGHT is the skill selector; tick a
skill and it drops into the matching rotation on the left. Click a rotation on
the left to jump the selector to that apparatus.

Every session keeps its OWN plan. Build lesson 1, move to lesson 2, jump around,
change squads or dates — each lesson's skills are saved and restored, nothing is
lost. "Prefill this session → same as last time" copies the previous lesson in
the sequence so you can build forward quickly. Plans are stored per session
(date + squad) and survive a reload.

WHAT'S NEW IN V5 — LIVE CONNECTION TO GYMORGPRO (no export/import)
GymOrgPro now publishes its schedule to a shared Firebase database, and Chalk
can read it directly. In the GymOrgPro panel, click "Connect to GymOrgPro",
pick a roster, and the squad rotations load automatically — no "Export backup"
step. Whenever someone saves a change in GymOrgPro, Chalk updates live (a green
"Live" chip shows when connected). The connection is READ-ONLY: Chalk can never
change a gym's schedule.

Needs internet (it reads the live database). Offline, the old "load a backup
.json" import still works exactly as before — it's now the fallback link under
the Connect button. The live connector lives in chalk-gymorg-live.js; delete
that one file and Chalk reverts cleanly to file-import-only.

Security note: the connection uses the same open ("test mode") database
GymOrgPro ships with, so no login is needed. If GymOrgPro's database rules are
later locked down, keep public READ on /rosters and /rosterIndex (or add
anonymous auth to both apps) so Chalk can still read.

WHAT'S NEW IN V4
A "GymOrgPro" panel that pulls a squad's rotation straight out of a GymOrgPro
schedule, so you don't have to re-type anything GymOrgPro already knows:

  1. In GymOrgPro: Organisation → Export backup, save the .json file.
  2. In Chalk: click the "GymOrgPro" pill (top right) → "Choose backup .json".
  3. Pick a Block and a Squad. Chalk lists every scheduled session for that
     squad, and works out the rotation (which station, for how long, in what
     order) straight from GymOrgPro's rotation grid for that day.
  4. Tap a rotation chip (e.g. "Floor · 15m") to jump straight to that
     apparatus tab, already switched to this squad's mapped level (and, for
     MAG apparatus, its ALP working level).
  5. Click "Prefill this session" to auto-tick skills — either fresh
     suggestions at the squad's current ALP level, or an exact copy of what
     was ticked last time this same slot ran (toggle between the two).
  6. "Next lesson" moves to the squad's next scheduled slot in the block and
     re-applies the same prefill logic, so working through a whole block only
     takes a few taps per session.

The first time you connect a gym's file, Chalk asks you to map each
GymOrgPro squad to a Chalk level and each station to a Chalk apparatus tab
(it guesses sensible defaults from the names first). Those mappings, plus a
history of what was ticked per session, are remembered in this browser via
localStorage — nothing is uploaded anywhere.

Chalk and GymOrgPro are separate files/artifacts with separate storage, so
this is a one-way, file-based hand-off (export from GymOrgPro → import into
Chalk), not a live connection. Re-export and re-load whenever the schedule
changes.

WHAT THIS IS (unchanged from V3)
A self-contained lesson/session plan builder that runs in any web browser.
Pick a squad level, choose the Warm-up and apparatus tabs, tick the skills
you want, and it builds a session plan you can Print / save as PDF or copy
as text. Skills that had a diagram in your original documents show it beside
them; click any thumbnail to enlarge.

ALP PATHWAY (MAG)
On any MAG apparatus (Floor, Pommel, Rings, Vault, P-Bars, H-Bar) you can
switch from "Club skills" to "ALP Pathway": skills grouped by family, each
with a difficulty (A/B/C) and a target development score (1-4) across ALP
Levels 1-9. Set the group's working level and the list matches their
ability — use "± 1 level" or "Full pathway" to pull in lower (Support) or
higher (Stretch) skills for mixed groups.

HOW TO RUN IT
1. Keep all the files together in this folder (don't move them apart):
      index.html
      app.jsx
      data.js
      gymorg-bridge.js
      images/   (folder of skill diagrams)
2. Double-click index.html — it opens in your default browser. Done.

You can also host the folder on any web server / shared drive and open
index.html from there.

NOTE: the app needs an internet connection every time it opens now (V4 loads
React, ReactDOM and Babel from a CDN alongside Tailwind/fonts, so app.jsx can
stay plain, readable JSX with no build step). If you need it to run 100%
offline, download those four scripts once and point the <script> tags at
local copies instead of the CDN URLs in index.html.

WHAT'S EASY TO CHANGE NEXT
- Edit the Warm-up list, skill text, or coaching points: it all lives in
  data.js (plain text — search for the skill name).
- Add your own diagrams: drop image files into images/ and reference the
  file name in data.js under that skill's "img" list.
- Station/level mappings and rotation history live in this browser's
  localStorage (keys prefixed "chalk-gymorg-"); clearing site data resets
  them back to auto-guessed defaults.
- Multi-user sync (so a whole coaching team shares the same mappings and
  prefill history instead of per-browser) is a natural next step if this
  gets hosted inside Claude.ai alongside GymOrgPro's own window.storage use.

FILES
  index.html         the page shell (CDN scripts + styling)
  app.jsx             the app (React, plain JSX — readable, no build step)
  data.js             all levels, apparatus, skills, coaching points, images
  gymorg-bridge.js    turns a GymOrgPro roster (file OR live) into rotations,
                      dated sessions, headers, warm-ups
  chalk-gymorg-live.js  read-only live link to GymOrgPro's Firebase (optional)
  chalk-docx.js       builds the Word (.docx) lesson plans (no libraries)
  images-b64.js       skill diagrams as data, so they can go into the Word file
  images/             skill diagrams
