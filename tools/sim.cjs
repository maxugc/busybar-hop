// Fairness check: plays the real game logic headless at the bar's frame rate
// with a bot that searches for a surviving sequence of jumps. If the bot
// finds no way through, that obstacle layout can't be beaten.
//
// Run:  node tools/sim.cjs [fps] [runs] [seconds]
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const FPS = Number(process.argv[2] || 15);
const RUNS = Number(process.argv[3] || 20);
const SECONDS = Number(process.argv[4] || 150);
const HORIZON = Math.ceil(FPS * 1.6);

const src = fs.readFileSync(path.join(__dirname, "../src/main.js"), "utf8");

function makeGame(seed) {
  const ctx = {
    fetch: () => new Promise(() => {}),
    listen: () => () => {},
    setTimeout: () => 0,
    clearTimeout: () => {},
    Date,
    JSON,
    String,
    parseInt,
    Promise,
    __rng: seed >>> 0,
  };
  ctx.Math = Object.create(Math);
  vm.createContext(ctx);
  vm.runInContext(
    "Math.random = function () { __rng = (__rng * 1664525 + 1013904223) >>> 0; return __rng / 4294967296; };",
    ctx
  );
  vm.runInContext(src, ctx);
  vm.runInContext(
    `function __snap() { return JSON.stringify({ mode, speed, runTime, distance, groundShift, frogRise, frogVy, jumpQueued, nextSpawn, obstacles, rng: __rng, best, newBest }); }
     function __restore(t) { const o = JSON.parse(t); mode = o.mode; speed = o.speed; runTime = o.runTime; distance = o.distance;
       groundShift = o.groundShift; frogRise = o.frogRise; frogVy = o.frogVy; jumpQueued = o.jumpQueued; nextSpawn = o.nextSpawn;
       obstacles = o.obstacles; __rng = o.rng; best = o.best; newBest = o.newBest; }
     function __press() { onStart(); }
     function __step(dt) { update(dt); }
     function __state() { return { mode, score: score(), speed, onGround: frogRise <= 0 }; }`,
    ctx
  );
  return ctx;
}

function survives(g, depth, dt) {
  if (g.__state().mode !== "play") return false;
  if (depth === 0) return true;
  const s = g.__snap();
  g.__step(dt);
  if (survives(g, depth - 1, dt)) { g.__restore(s); return true; }
  g.__restore(s);
  if (!g.__state().onGround) return false;
  g.__press();
  g.__step(dt);
  const ok = survives(g, depth - 1, dt);
  g.__restore(s);
  return ok;
}

let impossible = 0;
let totalScore = 0;
let jumps = 0;
const dt = 1 / FPS;
for (let run = 0; run < RUNS; run++) {
  const g = makeGame(run * 7919 + 1);
  g.__press(); // title -> play (starts with a jump)
  let frames = SECONDS * FPS;
  while (frames-- > 0) {
    const s = g.__snap();
    g.__step(dt);
    if (survives(g, HORIZON, dt)) continue;
    g.__restore(s);
    if (g.__state().onGround) {
      g.__press();
      jumps++;
      g.__step(dt);
      if (survives(g, HORIZON, dt)) continue;
    }
    // No way through from here.
    impossible++;
    const st = g.__state();
    console.log(`run ${run}: no way through at score ${st.score}, speed ${st.speed.toFixed(1)} px/s`);
    console.log("  obstacles:", JSON.stringify(JSON.parse(g.__snap()).obstacles.filter((o) => o.on).map((o) => [o.kind, Math.round(o.x)])));
    break;
  }
  totalScore += g.__state().score;
}
console.log(`${FPS} fps, ${RUNS} runs x ${SECONDS}s: ${impossible} impossible spots, ${jumps} jumps, average final score ${Math.round(totalScore / RUNS)}`);
