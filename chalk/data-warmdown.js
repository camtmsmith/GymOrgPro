// ============================================================================
// CHALK — WARM-DOWN ACTIVITIES  (new in v6)
//
// Same shape as CHALK_WARMUP in data.js:  { "Group name": [ {name, cues[]} ] }
// so the selector renders it with no special-casing — it is just another tab.
//
// Why it lives in its OWN file rather than being appended to data.js: data.js
// is a 780 kB generated dump of the club's skill documents, and regenerating
// it would wipe hand-written additions. Warm-down content is hand-maintained,
// so it gets a file a coach can actually open and edit. index.html loads this
// straight after data.js.
//
// Anything a coach adds through the in-app Skills Library (the "Edit skills"
// button) is stored as an OVERLAY on top of this — see chalk-library.js. This
// file stays the baseline that ships with the app.
//
// Ordering note: groups run roughly in the order a warm-down should be run —
// bring the heart rate down, unload the joints that took the session's load,
// then lengthen, then finish calm. A coach picking top-to-bottom gets a
// sensible warm-down without having to think about sequencing.
// ============================================================================
window.CHALK_WARMDOWN = {
  "Pulse lowering": [
    { name: "Easy jog to walk (2–3 min)", cues: ["Start at an easy jog and let it decay to a walk", "nose breathing if they can manage it", "no sprint finishes"] },
    { name: "Walking lengths with arm circles", cues: ["Big slow circles forwards then backwards", "shoulders loose, not braced", "2 lengths each direction"] },
    { name: "Easy trampoline / tumble-trak bouncing", cues: ["Low straight bounces only, no shapes, no saltos", "gets blood back out of the legs", "30–60 sec, then step off and walk"] },
    { name: "Slow animal walks (bear, crab)", cues: ["Deliberately slow — this is unloading, not conditioning", "1 length each"] },
    { name: "Skipping rope, easy pace", cues: ["Light and low", "60 sec", "stop before anyone is puffing again"] },
  ],

  "Joint unloading & mobility": [
    { name: "Wrist circles, rocks & flicks", cues: ["Both directions", "shake hands out between", "the single most-loaded joint in a gymnastics session — always do this"] },
    { name: "Wrist stretch, palms down then palms up", cues: ["Kneel with hands on the floor, rock gently", "hold 20–30 sec each way", "never force into pain"] },
    { name: "Shoulder circles & pendulum swings", cues: ["Let the arm hang and swing loosely", "small circles, then bigger", "unloads after bars, rings and pommel"] },
    { name: "Ankle circles & calf pumps", cues: ["Both directions, 10 each", "point and flex 10", "important after any landing or vault rotation"] },
    { name: "Neck rolls, half circles only", cues: ["Chin to chest, ear to shoulder and back", "never roll backwards through the neck", "slow"] },
    { name: "Cat / cow through the spine", cues: ["Move one vertebra at a time", "8–10 slow reps", "breathe out into the round shape"] },
    { name: "Thoracic rotations, seated or side-lying", cues: ["Open the top arm and follow it with the eyes", "8 each side", "hips stay still"] },
  ],

  "Static stretching — lower body": [
    { name: "Hamstring stretch — long sit, reach to toes", cues: ["Legs straight, chest reaching down the legs", "hold 30 sec", "no bouncing — the session is over"] },
    { name: "Pike stretch", cues: ["Chest and stomach towards the legs", "hold 30 sec", "arms relaxed, not pulling hard"] },
    { name: "Straddle stretch — centre, left, right", cues: ["Hold 30 sec each of the three positions", "knees facing the ceiling", "hips stay square in the side reaches"] },
    { name: "Front splits — left and right", cues: ["Hips square, both legs straight", "hold 60 sec each", "come out of it slowly"] },
    { name: "Side splits", cues: ["Hips in line with the feet, knees facing the ceiling", "hold 60 sec", "torso upright"] },
    { name: "Hip flexor / lunge stretch", cues: ["Push the hips forward, don't arch the lower back", "squeeze the back glute", "30 sec each leg — the big one after floor and vault"] },
    { name: "Pigeon / figure-four glute stretch", cues: ["30 sec each side", "front shin as parallel as is comfortable", "breathe rather than push"] },
    { name: "Quad stretch, standing or lying", cues: ["Knees together, hips pushed forward", "30 sec each leg"] },
    { name: "Calf & Achilles stretch at the wall", cues: ["Back heel down, back leg straight for calf", "then bend the back knee for Achilles", "30 sec each position, each leg"] },
    { name: "Butterfly stretch", cues: ["Feet in close, knees relaxing down", "30 sec", "sit tall rather than rounding over"] },
  ],

  "Static stretching — upper body": [
    { name: "Shoulder stretch on wallbars / ballet bar", cues: ["Hands on the bar, walk the feet back and let the chest sink", "hold 30 sec", "head neutral, ribs down"] },
    { name: "Dorsal (undergrip) hang", cues: ["Undergrip on the bar, bend the legs until the stretch is felt", "hold 20–30 sec", "excellent after a bars or rings rotation"] },
    { name: "Lat stretch, kneeling with hands on a box", cues: ["Sit the hips back towards the heels", "hold 30 sec", "armpits reaching towards the floor"] },
    { name: "Chest / pec stretch in a doorway or at the wall", cues: ["Forearm on the wall, rotate the chest away", "30 sec each side", "counteracts a session of pressing"] },
    { name: "Triceps overhead stretch", cues: ["Elbow up beside the ear, gentle pull", "30 sec each arm"] },
    { name: "Forearm & finger stretch", cues: ["Fingers back, then fingers down", "20 sec each", "always after grips, rings or a heavy pommel set"] },
    { name: "Stick dislocates, slow and wide", cues: ["Wide grip on a stick, over and back 8–10 times", "no shrugging", "mobility, not a strength exercise"] },
  ],

  "Spine & back release": [
    { name: "Knees to chest, gentle rock", cues: ["Lie on the back, hug the knees", "small rocks side to side", "30 sec"] },
    { name: "Supine spinal twist", cues: ["Knees drop to one side, shoulders stay down", "30 sec each side", "breathe out into it"] },
    { name: "Child's pose", cues: ["Knees wide, hips to heels, arms long", "hold 30–45 sec"] },
    { name: "Seal / cobra stretch — gentle", cues: ["Only to comfort, never into lower-back pinching", "20 sec", "skip it if anyone's back is sore"] },
    { name: "Legs up the wall", cues: ["2–3 min", "great after a heavy legs or vault session", "coach can run the session debrief while they hold it"] },
  ],

  "Soft tissue & recovery": [
    { name: "Foam roll — quads", cues: ["Slow, 30–45 sec each leg", "pause on tight spots and breathe rather than grinding"] },
    { name: "Foam roll — calves", cues: ["30–45 sec each leg", "cross the other leg on top for more pressure"] },
    { name: "Foam roll — lats & upper back", cues: ["30–45 sec each side", "no rolling on the lower back"] },
    { name: "Spiky ball / trigger ball — feet", cues: ["Roll the arch of each foot 30 sec", "the cheapest recovery in the gym"] },
    { name: "Trigger ball — glutes / hips", cues: ["30 sec each side", "sit on the ball, find the spot, breathe"] },
  ],

  "Breathing & settle": [
    { name: "Box breathing (4-4-4-4)", cues: ["In 4, hold 4, out 4, hold 4", "6–8 rounds", "settles them before they go back out to parents"] },
    { name: "Long-exhale breathing, lying down", cues: ["In for 4, out for 8", "2 min", "genuinely lowers heart rate — worth the time"] },
    { name: "Quiet lie-down / body scan", cues: ["2 min, lights down if you can", "particularly good after a fear-heavy session"] },
  ],

  "Review & finish": [
    { name: "Session debrief — what went well", cues: ["One thing each, out loud", "keeps the last memory of the session a positive one"] },
    { name: "Goal check-in for next session", cues: ["Name the one skill each gymnast is chasing next time", "30 sec each"] },
    { name: "Skill of the day / group acknowledgement", cues: ["Name a gymnast's effort, not just their result"] },
    { name: "Equipment pack-down", cues: ["Everyone contributes", "counts as part of the warm-down — keep them moving gently"] },
    { name: "Hydration & fuel reminder", cues: ["Water before they leave", "food within the hour after a hard session"] },
    { name: "Injury / soreness check", cues: ["Ask directly rather than waiting to be told", "note anything to follow up next session"] },
  ],
};
