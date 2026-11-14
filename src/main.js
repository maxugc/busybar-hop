// Hop: an endless runner for BUSY Bar. A frog jumps over mushrooms and rocks.
// Start/Pause jumps. OK pauses. Back pauses during a run, and exits otherwise.
// MIT licensed, see LICENSE.

const APP = "io.github.maxugc.hop";
const DRAW_URL = "http://localhost/api/display/draw";
const DEBUG_FPS = false;

// Screen and layout (front screen is 72x16)
const W = 72;
const GROUND_Y = 14;                 // grass row; dirt is row 15
const FROG_X = 6;
const FROG_H = 7;
const FROG_BASE_Y = GROUND_Y - FROG_H; // frog's top row when standing
const PANEL_X = 17;                  // text panel on the right of the frog

// Jump: rises JUMP_RISE px and lands AIR_TIME s after take-off
const JUMP_RISE = 7;
const AIR_TIME = 0.66;
const GRAVITY = (8 * JUMP_RISE) / (AIR_TIME * AIR_TIME);
const JUMP_SPEED = (4 * JUMP_RISE) / AIR_TIME;
const JUMP_BUFFER = 0.15;            // a press this early before landing still counts

// Running speed in px/s
const START_SPEED = 36;
const MAX_SPEED = 72;
const SPEED_GAIN = 0.8;              // px/s gained per second of running

const STEP = 1 / 60;                 // physics step
const MIN_FRAME_MS = 30;
const RESTART_DELAY_MS = 600;

// Obstacles. box = hitbox inside the image: [dx, dy, w, h]. Hitboxes skip
// the rounded top row of the caps and the frog's legs, so a jump that looks
// clear is clear. tools/sim.js checks every layout can be beaten.
const KINDS = {
  mushroom: { img: "images/mushroom.png", w: 6, h: 6, box: [1, 1, 4, 5] },
  tall: { img: "images/mushroom_tall.png", w: 6, h: 7, box: [1, 1, 4, 6] },
  rock: { img: "images/rock.png", w: 7, h: 4, box: [1, 1, 5, 3] },
  bee: { img: "images/bee_a.png", img2: "images/bee_b.png", w: 6, h: 4, box: [0, 1, 6, 3], y: 2 },
};
const FROG_BOX = [1, 1, 6, 5];
const SLOTS = 4;

// ---------------------------------------------------------------- state

let mode = "title";                  // title | play | paused | over
let speed = START_SPEED;
let runTime = 0;
let distance = 0;
let groundShift = 0;
let frogRise = 0;                    // px above the ground
let frogVy = 0;                      // px/s, up is positive
let jumpQueued = 0;                  // seconds left on a buffered press
let nextSpawn = 0;                   // px of travel until the next obstacle
let overAt = 0;
let newBest = false;
let best = loadBest();
let obstacles = [];
for (let i = 0; i < SLOTS; i++) obstacles.push({ on: false, kind: null, x: 0, y: 0 });

let stopped = false;
let timer = 0;
let lastTick = Date.now();
let ledColor = null;
let fps = 0;
let frames = 0;
let fpsSince = Date.now();
let jsMs = 0;                        // debug: script time per frame
let netMs = 0;                       // debug: draw request time per frame
let jsSum = 0;
let netSum = 0;

// ---------------------------------------------------------------- storage

function loadBest() {
  try {
    if (typeof localStorage !== "undefined") {
      return parseInt(localStorage.getItem("best") || "0", 10) || 0;
    }
  } catch (e) {}
  return 0;
}

function saveBest(value) {
  try {
    if (typeof localStorage !== "undefined") localStorage.setItem("best", String(value));
  } catch (e) {}
}

// ---------------------------------------------------------------- game

function score() {
  return Math.floor(distance / 5);
}

function resetRun() {
  speed = START_SPEED;
  runTime = 0;
  distance = 0;
  frogRise = 0;
  frogVy = 0;
  jumpQueued = 0;
  nextSpawn = 40;
  newBest = false;
  for (let i = 0; i < SLOTS; i++) obstacles[i].on = false;
}

function startRun() {
  resetRun();
  mode = "play";
  jumpQueued = JUMP_BUFFER;
}

function gameOver() {
  mode = "over";
  overAt = Date.now();
  const s = score();
  if (s > best) {
    best = s;
    newBest = true;
    saveBest(best);
  }
  ledColor = "#FF2020FF";
}

function freeSlot() {
  for (let i = 0; i < SLOTS; i++) if (!obstacles[i].on) return obstacles[i];
  return null;
}

function place(kindName, x) {
  const slot = freeSlot();
  if (!slot) return false;
  const k = KINDS[kindName];
  slot.on = true;
  slot.kind = kindName;
  slot.x = x;
  slot.y = k.y !== undefined ? k.y : GROUND_Y - k.h;
  return true;
}

function spawn() {
  const s = score();
  const r = Math.random();
  let width = 0;
  let extra = 0;
  // Harder kinds unlock with score: they need the extra speed to be clearable.
  if (s > 150 && r < 0.15) {
    place("bee", W);
    width = KINDS.bee.w;
    extra = 12;
  } else if (s > 120 && r < 0.27) {
    // A mushroom and a rock together, in either order
    const first = Math.random() < 0.5 ? "mushroom" : "rock";
    place(first, W);
    place(first === "rock" ? "mushroom" : "rock", W + KINDS[first].w + 1);
    width = KINDS.mushroom.w + KINDS.rock.w + 1;
  } else if (s > 80 && r < 0.45) {
    place("tall", W);
    width = KINDS.tall.w;
  } else if (r < 0.7) {
    place("mushroom", W);
    width = KINDS.mushroom.w;
  } else {
    place("rock", W);
    width = KINDS.rock.w;
  }
  // Room to land and take off again, plus some randomness.
  const gap = speed * (AIR_TIME + 0.3) + Math.random() * speed * 0.9 + extra;
  nextSpawn = width + gap;
}

function hits(o) {
  const k = KINDS[o.kind];
  const fx = FROG_X + FROG_BOX[0];
  const fy = FROG_BASE_Y - frogRise + FROG_BOX[1];
  const ox = o.x + k.box[0];
  const oy = o.y + k.box[1];
  return fx < ox + k.box[2] && ox < fx + FROG_BOX[2] && fy < oy + k.box[3] && oy < fy + FROG_BOX[3];
}

function step(dt) {
  runTime += dt;
  speed = Math.min(MAX_SPEED, START_SPEED + SPEED_GAIN * runTime);
  const move = speed * dt;
  distance += move;
  groundShift = (groundShift + move) % 16;

  // Jump
  if (jumpQueued > 0) jumpQueued -= dt;
  if (frogRise <= 0 && jumpQueued > 0) {
    frogVy = JUMP_SPEED;
    jumpQueued = 0;
  }
  if (frogRise > 0 || frogVy > 0) {
    frogVy -= GRAVITY * dt;
    frogRise += frogVy * dt;
    if (frogRise <= 0) {
      frogRise = 0;
      frogVy = 0;
    }
  }

  // Obstacles
  nextSpawn -= move;
  if (nextSpawn <= 0) spawn();
  for (let i = 0; i < SLOTS; i++) {
    const o = obstacles[i];
    if (!o.on) continue;
    o.x -= move;
    if (o.x < -KINDS[o.kind].w) o.on = false;
    else if (hits(o)) {
      gameOver();
      return;
    }
  }
}

function update(dt) {
  if (mode !== "play") return;
  let left = dt;
  while (left > 0 && mode === "play") {
    const d = Math.min(STEP, left);
    step(d);
    left -= d;
  }
}

// ---------------------------------------------------------------- drawing
// The bar keeps every element it was given until the same id is sent again,
// so each frame sends only the elements that changed. "shown" holds a short
// key per id describing what is on screen, which is far cheaper on the bar's
// small JS engine than serialising every element every frame.

const HIDDEN_X = -200;
let shown = {};

// Every byte of a draw request costs time on the bar, so images leave out
// "align" (they anchor top-left by default). z_index has to go with every
// update: the bar loses an element's layer when an update leaves it out
// (seen on the device as text slipping under the game-over panel).
function image(out, id, path, x, y, z) {
  const key = path + "|" + x + "|" + y;
  if (shown[id] === key) return;
  shown[id] = key;
  out.push({ id: id, type: "image", path: path, x: x, y: y, z_index: z });
}

function label(out, id, value, x, y, align, font, color, z) {
  const key = value + "|" + x + "|" + color;
  if (shown[id] === key) return;
  shown[id] = key;
  out.push({ id: id, type: "text", text: value, x: x, y: y, align: align, font: font, color: color, z_index: z });
}

function panel(out, visible) {
  const key = visible ? "on" : "off";
  if (shown.panel === key) return;
  shown.panel = key;
  out.push(visible
    ? { id: "panel", type: "rectangle", x: PANEL_X, y: 0, width: W - PANEL_X, height: 16, fill: "solid", fill_colors: ["#000000E0"], border_width: 0, z_index: 7 }
    : { id: "panel", type: "rectangle", x: HIDDEN_X, y: 0, width: 1, height: 1, fill: "none", border_width: 0, z_index: 7 });
}

// Returns the elements that differ from what is on screen.
function frameChanges() {
  const out = [];

  // Ground: two 64 px tiles side by side (images can't be wider than 72 px)
  const shift = -Math.floor(groundShift);
  image(out, "g0", "images/floor.png", shift, GROUND_Y, 1);
  image(out, "g1", "images/floor.png", shift + 64, GROUND_Y, 1);

  // Frog
  let frog = "images/frog_run_a.png";
  if (mode === "over") frog = "images/frog_hit.png";
  else if (frogRise > 0) frog = "images/frog_jump.png";
  else if (mode === "play" && Math.floor(distance / 5) % 2 === 1) frog = "images/frog_run_b.png";
  image(out, "frog", frog, FROG_X, FROG_BASE_Y - Math.round(frogRise), 5);

  // Obstacles
  for (let i = 0; i < SLOTS; i++) {
    const o = obstacles[i];
    if (!o.on) {
      image(out, "o" + i, KINDS.rock.img, HIDDEN_X, 0, 3);
      continue;
    }
    const k = KINDS[o.kind];
    let path = k.img;
    if (k.img2 && Math.floor(distance / 4) % 2 === 1) path = k.img2;
    image(out, "o" + i, path, Math.round(o.x), o.y, 3);
  }

  // Score, top right, only during a run
  const scoreText = mode === "play" || mode === "paused" ? String(score()) : " ";
  label(out, "score", scoreText, W - 1, 0, "top_right", "tiny", "#FFFFFFFF", 6);

  // Text panel for the title, pause and game-over screens
  let line1 = null;
  let line2 = null;
  if (mode === "title") {
    line1 = "Press start";
    line2 = best > 0 ? "Best " + best : "to jump";
  } else if (mode === "paused") {
    line1 = "Paused";
    line2 = "Press start";
  } else if (mode === "over") {
    line1 = (newBest ? "Best " : "Score ") + score();
    line2 = Date.now() - overAt > RESTART_DELAY_MS ? "Press start" : " ";
  }
  const cx = PANEL_X + Math.floor((W - PANEL_X) / 2);
  panel(out, line1 !== null);
  if (line1 !== null) {
    label(out, "t1", line1, cx, 0, "top_mid", "small", newBest && mode === "over" ? "#FFD84AFF" : "#FFFFFFFF", 8);
    label(out, "t2", line2, cx, 8, "top_mid", "small", "#9AA4AEFF", 8);
  } else {
    label(out, "t1", " ", HIDDEN_X, 0, "top_mid", "small", "#FFFFFFFF", 8);
    label(out, "t2", " ", HIDDEN_X, 8, "top_mid", "small", "#FFFFFFFF", 8);
  }

  if (DEBUG_FPS) label(out, "fps", fps + " " + jsMs + " " + netMs, 1, 0, "top_left", "tiny", "#40C0FFFF", 9);
  return out;
}

// Notifications and reminders can draw over the game. While one is up the bar
// refuses our frames (409), and when it ends it has thrown our elements away.
// So a refused frame pauses a run and makes the next frame resend everything,
// and the idle screens resend everything every 2 s to come back on their own.
const IDLE_REFRESH_MS = 2000;
let lastFullDraw = 0;

function send(elements) {
  const body = { application_name: APP, elements: elements };
  if (ledColor) {
    body.led_notification_color = ledColor;
    ledColor = null;
  }
  return fetch(DRAW_URL, { method: "POST", body: JSON.stringify(body) }).then(
    function (res) {
      if (res && res.status && res.status !== 200) {
        shown = {};
        if (res.status === 409 && mode === "play") mode = "paused";
      }
    },
    function () {
      shown = {};
    }
  );
}

// ---------------------------------------------------------------- loop

function tick() {
  timer = 0;
  if (stopped) return;
  const now = Date.now();
  let dt = (now - lastTick) / 1000;
  lastTick = now;
  if (dt > 0.1) dt = 0.1;
  update(dt);

  frames++;
  if (now - fpsSince >= 1000) {
    fps = frames;
    jsMs = Math.round(jsSum / frames);
    netMs = Math.round(netSum / frames);
    frames = 0;
    jsSum = 0;
    netSum = 0;
    fpsSince = now;
  }

  if (mode !== "play" && now - lastFullDraw >= IDLE_REFRESH_MS) {
    shown = {};
    lastFullDraw = now;
  }
  const changes = frameChanges();
  const sentAt = Date.now();
  jsSum += sentAt - now;
  if (changes.length) send(changes).then(next, next);
  else next();

  function next() {
    netSum += Date.now() - sentAt;
    if (stopped) return;
    const idle = mode !== "play";
    const wait = (idle ? 100 : MIN_FRAME_MS) - (Date.now() - now);
    // Timers on the bar add a delay of their own, so when the frame already
    // took long enough, go straight to the next one.
    // next() always runs from a settled fetch, so calling tick() here does
    // not grow the stack from frame to frame.
    if (wait <= 0) tick();
    else timer = setTimeout(tick, wait);
  }
}

// ---------------------------------------------------------------- input

function onStart() {
  if (mode === "title") startRun();
  else if (mode === "play") jumpQueued = JUMP_BUFFER;
  else if (mode === "paused") {
    mode = "play";
    lastTick = Date.now();
  } else if (mode === "over" && Date.now() - overAt > RESTART_DELAY_MS) startRun();
}

function onOk() {
  if (mode === "play") mode = "paused";
  else if (mode === "paused") {
    mode = "play";
    lastTick = Date.now();
  }
}

function onBack() {
  if (mode === "play") mode = "paused";
  else quit();
}

function quit() {
  stopped = true;
  if (timer) clearTimeout(timer);
  setTimeout(unbind, 10);
}

const unbind = listen("input", function (event) {
  if (stopped) return;
  if (event.key === "start" && event.action === "press") onStart();
  else if (event.key === "ok" && event.action === "short") onOk();
  else if (event.key === "back" && event.action === "short") onBack();
});

tick();
