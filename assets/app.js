// ASCII Aquarium for Arduino UNO Q - browser renderer + simulation.
// Ported from the ESP32 "Cheap Yellow Display" sketch (v2.39). The tank is
// simulated in a 240px-tall virtual world; the width follows the window's
// aspect ratio so it fills any monitor.

(() => {
  'use strict';

  // ---------------------------------------------------------------- helpers
  const TAU = Math.PI * 2;
  const rand = (a, b) => a + Math.random() * (b - a);
  const randInt = (a, b) => Math.floor(rand(a, b));
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const rgb = (r, g, b) => `rgb(${r | 0},${g | 0},${b | 0})`;
  const scaleRgb = ([r, g, b], k) => rgb(r * k, g * k, b * k);
  const hexToRgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));

  // Optional link to the UNO Q Python side (feeds the LED matrix too).
  let link = null;
  try { link = new WebUI(); } catch (_) { /* running as a plain page */ }
  const tell = (name, data) => { try { link && link.send_message(name, data); } catch (_) {} };

  // --------------------------------------------------------------- settings
  const DEFAULTS = {
    fish: 16, bubbles: 10, sway: 1.1, seaweedLength: 1.35, seaweedRandom: 0.35,
    autoFeed: 0, octopusFreq: 12, seahorseFreq: 2, snailFreq: 2, jellyFreq: 1,
    bg: 'dithered', bgColor: '#0008ff', rainbow: false, autoSky: false, matrixOn: true,
    clock: 'off', clock24: false, clockColor: '#2a5cff',
  };
  let settings = { ...DEFAULTS };
  try { Object.assign(settings, JSON.parse(localStorage.getItem('ascii-aquarium') || '{}')); } catch (_) {}
  const saveSettings = () => { try { localStorage.setItem('ascii-aquarium', JSON.stringify(settings)); } catch (_) {} };

  // ------------------------------------------------------------------ world
  const H = 240;
  let W = 320;
  let SEA = H - 36;
  const canvas = document.getElementById('tank');
  const ctx = canvas.getContext('2d');
  let pxScale = 1;
  let CW = 7.8; // monospace advance in world units

  const FONT = '13px "Courier New", ui-monospace, Menlo, monospace';
  const SMALL_FONT = '10px "Courier New", ui-monospace, Menlo, monospace';

  function resize() {
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(innerWidth * dpr);
    canvas.height = Math.round(innerHeight * dpr);
    pxScale = canvas.height / H;
    W = clamp(Math.round(H * innerWidth / innerHeight), 240, 640);
    SEA = H - 36;
    ctx.setTransform(pxScale, 0, 0, pxScale, 0, 0);
    ctx.font = FONT;
    CW = ctx.measureText('M').width;
    gradientCache = null;
    flowersDirty = true;
  }

  // ----------------------------------------------------------------- fish
  const SPECIES = [
    ['><>', [80, 200, 120]], ['>)))\'>', [0, 150, 255]], ['oO0', [255, 192, 203]],
    ['><((( \'>', [255, 184, 0]], ['~~{o}', [238, 130, 238]], ['><(((o>', [255, 0, 0]],
    ['><((((>`', [255, 165, 0]], ['><((( \'>', [0, 180, 170]], ['}>{{{{* >', [95, 20, 190]],
    ['><((( *>', [200, 120, 255]], ['>(\')>', [255, 158, 200]], ['>\'>', [255, 255, 0]],
  ];
  const ALT_COLORS = [[0, 255, 255], [255, 0, 255], [255, 255, 255], [135, 206, 235],
    [255, 215, 0], [255, 165, 0], [173, 255, 47], [128, 128, 128]];
  const MIRROR = { '>': '<', '<': '>', '(': ')', ')': '(', '{': '}', '}': '{', '[': ']', ']': '[' };
  const mirrorGlyph = (s) => [...s].reverse().map((c) => MIRROR[c] || c).join('');
  SPECIES.forEach((s) => { s[2] = mirrorGlyph(s[0]); });

  const depthBrightness = () => {
    const r = Math.random();
    return r < 0.28 ? rand(0.48, 0.64) : r < 0.70 ? rand(0.66, 0.84) : rand(0.88, 1.0);
  };

  let fishPool = [];
  function makeFish(spread) {
    const type = randInt(0, SPECIES.length);
    const f = {
      type, w: SPECIES[type][0].length * CW,
      color: Math.random() < 0.2 ? ALT_COLORS[randInt(0, ALT_COLORS.length)] : SPECIES[type][1],
      depth: depthBrightness(),
      x: spread ? rand(10, W - 60) : rand(-42, W + 12),
      y: rand(20, SEA - 10), vx: Math.random() < 0.5 ? -1 : 1, vy: rand(-0.22, 0.22),
      speed: rand(14, 30), phase: rand(0, TAU), wander: rand(0.4, 1.3),
    };
    return f;
  }
  function respawnFish() {
    fishPool = [];
    for (let i = 0; i < settings.fish; i++) fishPool.push(makeFish(true));
  }
  function syncFishCount() {
    while (fishPool.length < settings.fish) fishPool.push(makeFish(false));
    if (fishPool.length > settings.fish) fishPool.length = settings.fish;
  }

  // flakes + bubbles
  const MAX_FLAKES = 48;
  let flakes = [];
  function spawnFlake(x, y) {
    if (flakes.length >= MAX_FLAKES) return;
    flakes.push({ x, y, vy: rand(22, 48), color: rgb(randInt(220, 256), randInt(118, 166), randInt(0, 34)) });
    pelletCount++;
    if (pelletCount >= CTHULHU_PELLETS && !octopus.active) {
      octopus.next = Math.min(octopus.next || Infinity, now + rand(6, 18));
    }
  }
  const CTHULHU_PELLETS = 1000;
  let pelletCount = 0;
  try { pelletCount = +localStorage.getItem('ascii-aquarium-pellets') || 0; } catch (_) {}

  function feedAt(x, y, n = 3) {
    for (let i = 0; i < n; i++) spawnFlake(clamp(x + rand(-8, 8), 6, W - 6), clamp(y + rand(-6, 6), 6, SEA));
    tell('feed');
  }

  let bubbles = [];
  const bubbleColor = () => rgb(randInt(0, 5) * 8, randInt(8, 24) * 4 + 40, randInt(45, 106) * 2 + 40);
  function resetBubble(b, spread) {
    b.baseX = rand(8, W - 8); b.x = b.baseX;
    b.y = spread ? rand(4, H + 48) : rand(H - 4, H + 48);
    b.vy = rand(12, 28); b.phase = rand(0, TAU); b.amp = rand(2, 7); b.color = bubbleColor();
  }
  function syncBubbles() {
    while (bubbles.length < settings.bubbles) { const b = {}; resetBubble(b, true); bubbles.push(b); }
    if (bubbles.length > settings.bubbles) bubbles.length = settings.bubbles;
  }

  // ------------------------------------------------------------- visitors
  const octopus = { active: false, cthulhu: false, x: 0, y: 0, baseY: 0, vx: 0, phase: 0, colorPhase: 0, next: 0 };
  const seahorse = { active: false, right: false, x: 0, y: 0, baseY: 0, vx: 0, phase: 0, finPhase: 0, next: 0 };
  const snail = { active: false, right: false, x: 0, y: 0, vx: 0, phase: 0, next: 0 };
  const jelly = { active: false, x: 0, y: 0, baseY: 0, vx: 0, phase: 0, next: 0 };

  const interval = (perHour) => (perHour > 0 ? 3600 / perHour : 0);
  const sched = (v, perHour) => { v.next = perHour > 0 ? now + interval(perHour) : 0; };

  function spawnOctopus(center, forceCthulhu) {
    const fromLeft = Math.random() < 0.5;
    octopus.active = true;
    octopus.cthulhu = forceCthulhu || pelletCount >= CTHULHU_PELLETS || (!center && Math.random() < 0.01);
    if (octopus.cthulhu) { pelletCount = 0; persistPellets(); }
    const sp = octopus.cthulhu ? rand(3.4, 5.8) : rand(4.5, 8);
    octopus.vx = (fromLeft ? 1 : -1) * sp;
    octopus.x = center ? W / 2 : fromLeft ? -42 : W + 42;
    octopus.baseY = center ? SEA * 0.53 : rand(36, SEA - 48);
    octopus.y = octopus.baseY;
    octopus.phase = rand(0, TAU); octopus.colorPhase = rand(0, TAU);
    sched(octopus, settings.octopusFreq);
  }
  function spawnSeahorse(center) {
    const fromLeft = Math.random() < 0.5;
    seahorse.active = true; seahorse.right = fromLeft;
    seahorse.vx = (fromLeft ? 1 : -1) * rand(1.6, 2.9) * 1.35;
    seahorse.x = center ? W / 2 - 16 : fromLeft ? -48 : W + 48;
    seahorse.baseY = center ? SEA * 0.46 : rand(34, SEA - 56);
    seahorse.y = seahorse.baseY; seahorse.phase = rand(0, TAU); seahorse.finPhase = rand(0, TAU);
    sched(seahorse, settings.seahorseFreq);
  }
  function spawnSnail(center) {
    const fromLeft = Math.random() < 0.5;
    snail.active = true; snail.right = fromLeft;
    snail.vx = (fromLeft ? 1 : -1) * rand(2.2, 3.7);
    snail.x = center ? W / 2 - 9 : fromLeft ? -46 : W + 46;
    snail.y = H - 15; snail.phase = rand(0, TAU);
    sched(snail, settings.snailFreq);
  }
  function spawnJelly(center) {
    const fromLeft = Math.random() < 0.5;
    jelly.active = true;
    jelly.x = center ? W / 2 - 12 : fromLeft ? -34 : W + 34;
    jelly.baseY = SEA * 0.48; jelly.y = jelly.baseY;
    jelly.vx = (fromLeft ? 1 : -1) * rand(2.2, 4); jelly.phase = rand(0, TAU);
    sched(jelly, settings.jellyFreq);
  }
  function persistPellets() { try { localStorage.setItem('ascii-aquarium-pellets', String(pelletCount)); } catch (_) {} }

  function updateVisitors(dt) {
    const t = now;
    if (!octopus.active) {
      if (!octopus.next) sched(octopus, settings.octopusFreq);
      else if (t >= octopus.next) spawnOctopus(false);
    } else {
      octopus.x += octopus.vx * dt;
      octopus.y = octopus.baseY + Math.sin(t * 0.45 + octopus.phase) * 6;
      if ((octopus.vx > 0 && octopus.x > W + 42) || (octopus.vx < 0 && octopus.x < -42)) octopus.active = false;
    }
    if (!seahorse.active) {
      if (!seahorse.next) sched(seahorse, settings.seahorseFreq);
      else if (t >= seahorse.next) spawnSeahorse(false);
    } else {
      const pulse = 1 + Math.sin(t * 0.55 + seahorse.phase) * 0.18;
      seahorse.x += seahorse.vx * pulse * dt;
      seahorse.y = seahorse.baseY + Math.sin(t * 0.82 + seahorse.phase) * 4.5 + Math.sin(t * 2.15 + seahorse.phase * 1.7) * 0.9;
      if ((seahorse.vx > 0 && seahorse.x > W + 48) || (seahorse.vx < 0 && seahorse.x < -48)) seahorse.active = false;
    }
    if (!snail.active) {
      if (settings.snailFreq <= 0) snail.next = 0;
      else if (!snail.next) sched(snail, settings.snailFreq);
      else if (t >= snail.next) spawnSnail(false);
    } else {
      snail.x += snail.vx * (1 + Math.sin(t * 2.2 + snail.phase) * 0.18) * dt;
      if ((snail.vx > 0 && snail.x > W + 46) || (snail.vx < 0 && snail.x < -46)) snail.active = false;
    }
    if (!jelly.active) {
      if (settings.jellyFreq <= 0) jelly.next = 0;
      else if (!jelly.next) sched(jelly, settings.jellyFreq);
      else if (t >= jelly.next) spawnJelly(false);
    } else {
      const pw = Math.sin(t * 1.55 + jelly.phase);
      const pulse = pw > 0 ? pw * pw : 0;
      jelly.x += (jelly.vx + Math.sin(t * 0.38 + jelly.phase) * 2) * dt;
      jelly.baseY += -pulse * 3.2 * dt + Math.sin(t * 0.22 + jelly.phase) * 0.42 * dt;
      jelly.y = clamp(jelly.baseY + Math.sin(t * 0.72 + jelly.phase) * 5 - pulse * 2.5, 24, SEA - 34);
      if (jelly.x < -34 || jelly.x > W + 34 || jelly.baseY < 10) jelly.active = false;
    }
  }

  // Things the fish steer around: [active, cx, cy, radiusX, radiusY, strength, clearX, clearY]
  function obstacles() {
    const out = [];
    if (octopus.active) {
      const c = octopus.cthulhu;
      out.push([octopus.x, octopus.y + 8, 76 * (c ? 1.55 : 1), 34 * (c ? 1.55 : 1), 8 * (c ? 1.85 : 1), 46 * (c ? 1.3 : 1), 22 * (c ? 1.3 : 1)]);
    }
    if (seahorse.active) out.push([seahorse.x + 15, seahorse.y + 24, 58, 38, 6, 34, 28]);
    if (snail.active) out.push([snail.x + 9, snail.y + 7, 30, 18, 4, 20, 12]);
    if (jelly.active) out.push([jelly.x + 12, jelly.y + 15, 42, 38, 4.6, 30, 26]);
    return out;
  }

  // ----------------------------------------------------------- simulation
  const AVOID_X = 52, AVOID_Y = 20, AVOID_STRENGTH = 4.2, CENTER_Y = 7;

  function updateFish(dt) {
    const n = fishPool.length;
    const cx = new Array(n), cy = new Array(n);
    fishPool.forEach((f, i) => { cx[i] = f.x + f.w / 2; cy[i] = f.y + CENTER_Y; });
    const obs = obstacles();

    for (let i = 0; i < n; i++) {
      const f = fishPool[i];
      f.vx += Math.cos(f.phase + now * 0.9) * 0.45 * f.wander * dt;
      f.vy += Math.sin(f.phase * 1.7 + now * 0.7) * 0.22 * dt;

      let avx = 0, avy = 0, ax = 0, ay = 0, near = 0, rx = 0, ry = 0, rc = 0;
      for (let j = 0; j < n; j++) {
        if (j === i) continue;
        const o = fishPool[j];
        if (o.type === f.type) {
          const dx = o.x - f.x, dy = o.y - f.y;
          if (dx * dx + dy * dy < 3600) { avx += o.vx; avy += o.vy; ax += o.x; ay += o.y; near++; }
        }
        let sdx = cx[j] - cx[i]; const sdy = cy[j] - cy[i];
        if (sdx > W / 2) sdx -= W;
        if (sdx < -W / 2) sdx += W;
        const sx = sdx / AVOID_X, sy = sdy / AVOID_Y, d2 = sx * sx + sy * sy;
        if (d2 > 0.0001 && d2 < 1) {
          const dist = Math.hypot(sdx, sdy) + 0.0001;
          const push = (1 - d2) ** 2;
          rx -= (sdx / dist) * push; ry -= (sdy / dist) * push; rc++;
        }
      }
      if (near) {
        avx /= near; avy /= near; ax /= near; ay /= near;
        f.vx += (avx - f.vx) * 0.45 * dt; f.vy += (avy - f.vy) * 0.25 * dt;
        f.vx += (ax - f.x) * 0.0018; f.vy += (ay - f.y) * 0.0012;
      }

      // chase food
      let best = -1, bestD2 = 140 * 140;
      for (let k = 0; k < flakes.length; k++) {
        const dx = flakes[k].x - f.x, dy = flakes[k].y - f.y, d2 = dx * dx + dy * dy;
        if (d2 < bestD2) { bestD2 = d2; best = k; }
      }
      if (best >= 0) {
        const dx = flakes[best].x - f.x, dy = flakes[best].y - f.y, d = Math.hypot(dx, dy) + 0.0001;
        f.vx += (dx / d) * 0.95 * dt; f.vy += (dy / d) * 0.95 * dt;
        if (d < 8) flakes.splice(best, 1);
      }

      // steer around visitors
      for (const [ox, oy, rX, rY, str] of obs) {
        const dx = cx[i] - ox, dy = cy[i] - oy;
        const sx = dx / rX, sy = dy / rY, d2 = sx * sx + sy * sy;
        if (d2 > 0.0001 && d2 < 1) {
          const dist = Math.hypot(dx, dy) + 0.0001, push = (1 - d2) ** 2;
          f.vx += (dx / dist) * push * str * dt; f.vy += (dy / dist) * push * str * dt;
        }
      }
      if (rc) { f.vx += (rx / rc) * AVOID_STRENGTH * dt; f.vy += (ry / rc) * AVOID_STRENGTH * dt; }

      if (f.y < 18) f.vy += 0.8 * dt;
      if (f.y > SEA - 8) f.vy -= 0.8 * dt;

      let mag = Math.hypot(f.vx, f.vy);
      if (mag < 0.0001) { f.vx = 1; f.vy = 0; mag = 1; }
      f.vx /= mag; f.vy /= mag;
      const spd = f.speed + Math.sin(now * 3.2 + f.phase) * 4;
      f.x += f.vx * spd * dt; f.y += f.vy * spd * dt;

      // never swim through a visitor
      for (const [ox, oy, , , , clX, clY] of obs) {
        const dx = f.x + f.w / 2 - ox, dy = f.y + CENTER_Y - oy;
        if ((dx / clX) ** 2 + (dy / clY) ** 2 < 1) {
          const dist = Math.hypot(dx / clX, dy / clY) || 0.01;
          f.x = ox + (dx / clX / dist) * clX - f.w / 2; f.y = oy + (dy / clY / dist) * clY - CENTER_Y;
        }
      }

      const pad = f.w + 10;
      if (f.x > W + pad) { f.x = -pad; f.depth = depthBrightness(); }
      if (f.x < -pad) { f.x = W + pad; f.depth = depthBrightness(); }
      f.y = clamp(f.y, 14, SEA - 6);
    }
  }

  function updateAutoFeed(dt) {
    if (settings.autoFeed <= 0) { autoFeed.next = 0; return; }
    if (autoFeed.drops > 0) {
      autoFeed.timer -= dt;
      if (autoFeed.timer <= 0) {
        const k = 9 - autoFeed.drops;
        let p = k / 8; if (!autoFeed.ltr) p = 1 - p;
        spawnFlake(clamp(16 + p * (W - 32) + rand(-5, 5), 10, W - 10), rand(8, 22));
        autoFeed.drops--; autoFeed.timer = autoFeed.gap;
        if (autoFeed.drops === 0) tell('feed');
      }
    }
    if (!autoFeed.next) autoFeed.next = now + interval(settings.autoFeed);
    else if (now >= autoFeed.next) {
      autoFeed.drops = 9; autoFeed.ltr = Math.random() < 0.5; autoFeed.timer = 0;
      autoFeed.gap = rand(1.2, 2.8) / 8;
      autoFeed.next = now + interval(settings.autoFeed);
    }
  }
  const autoFeed = { next: 0, drops: 0, ltr: true, timer: 0, gap: 0.2 };

  function update(dt) {
    syncFishCount(); syncBubbles();
    updateFish(dt);
    updateVisitors(dt);
    updateAutoFeed(dt);
    for (let i = flakes.length - 1; i >= 0; i--) {
      const f = flakes[i];
      f.y += f.vy * dt; f.x += Math.sin(now * 1.2 + i) * 8 * dt;
      if (f.y > SEA) flakes.splice(i, 1);
    }
    for (const b of bubbles) {
      b.y -= b.vy * dt; b.x = b.baseX + Math.sin(now * 1.8 + b.phase) * b.amp;
      if (b.y < -10) resetBubble(b, false);
    }
  }

  // ------------------------------------------------------------ background
  // Gradient stops/brightness copied from the firmware.
  const G_STOPS = [0, 18, 42, 74, 112, 156, 204, 232, 255];
  const G_BRIGHT = [255, 228, 198, 164, 126, 90, 58, 30, 0];
  const GRAD_H = 80;
  let gradientCache = null, gradientKey = '';
  const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

  function gradientColorAt(top, t255) {
    let i = 0;
    while (i < G_STOPS.length - 2 && t255 > G_STOPS[i + 1]) i++;
    const span = G_STOPS[i + 1] - G_STOPS[i] || 1;
    const k = clamp((t255 - G_STOPS[i]) / span, 0, 1);
    const b = (G_BRIGHT[i] + (G_BRIGHT[i + 1] - G_BRIGHT[i]) * k) / 255;
    return top.map((c) => c * b);
  }

  function drawGradient(top, dithered) {
    const key = `${top.map(Math.round)}|${dithered}|${W}|${pxScale}`;
    if (!gradientCache || key !== gradientKey) {
      gradientKey = key;
      const w = Math.ceil(W * pxScale), h = Math.ceil(GRAD_H * pxScale);
      const off = document.createElement('canvas'); off.width = w; off.height = h;
      const octx = off.getContext('2d'), img = octx.createImageData(w, h);
      const levels = dithered ? 8 : 255; // fewer levels + Bayer matrix = the retro dithered look
      for (let y = 0; y < h; y++) {
        const col = gradientColorAt(top, (y / h) * 255);
        for (let x = 0; x < w; x++) {
          const o = (y * w + x) * 4;
          const th = dithered ? (BAYER[(y & 3) * 4 + (x & 3)] + 0.5) / 16 : 0;
          for (let c = 0; c < 3; c++) {
            const v = col[c] / 255 * levels;
            img.data[o + c] = dithered ? Math.min(255, (Math.floor(v + th) / levels) * 255) : col[c];
          }
          img.data[o + 3] = 255;
        }
      }
      octx.putImageData(img, 0, 0);
      gradientCache = off;
    }
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(gradientCache, 0, 0, canvas.width, Math.ceil(GRAD_H * pxScale));
    ctx.restore();
  }

  const hsv = (h) => {
    const f = (n) => { const k = (n + h * 6) % 6; return 255 * (1 - Math.max(0, Math.min(k, 4 - k, 1))); };
    return [f(5), f(3), f(1)];
  };
  function skyColor() {
    const d = new Date(), hr = d.getHours() + d.getMinutes() / 60;
    const night = [108, 6, 220], sunrise = [255, 128, 20], day = hexToRgb(settings.bgColor), sunset = [255, 96, 16];
    const slots = [[6, sunrise], [9, day], [18, sunset], [21, night]];
    let a, b, k;
    if (hr < 6) { a = [21 - 24, night]; b = slots[0]; }
    else if (hr >= 21) { a = slots[3]; b = [6 + 24, sunrise]; }
    else { let i = 0; while (i < 3 && hr >= slots[i + 1][0]) i++; a = slots[i]; b = slots[i + 1]; }
    k = clamp((hr - a[0]) / (b[0] - a[0]), 0, 1);
    return a[1].map((c, i) => c + (b[1][i] - c) * k);
  }

  const FLOWER_BASE = [[70, 70, 58, [0, 26, 76]], [248, 72, 58, [0, 22, 66]], [202, 156, 28, [116, 108, 18]]];
  let flowers = FLOWER_BASE.map(([cx, cy, r, c]) => ({ cx, cy, r, rot: 6.28, c }));
  let flowersDirty = true;
  function shuffleFlowers() {
    const pal = [[0, 26, 76], [60, 10, 90], [90, 20, 40], [10, 70, 60], [116, 108, 18], [100, 40, 10]];
    flowers = [
      { cx: rand(42, 98), cy: rand(50, 86), r: rand(50, 63), rot: rand(0, TAU), c: pal[randInt(0, 6)] },
      { cx: W - rand(42, 98), cy: rand(48, 90), r: rand(50, 63), rot: rand(0, TAU), c: pal[randInt(0, 6)] },
      { cx: W * rand(0.5, 0.78), cy: rand(124, SEA - 18), r: rand(20, 34), rot: rand(0, TAU), c: pal[randInt(0, 6)] },
    ];
  }
  function drawFlowers() {
    ctx.lineWidth = 2.4; ctx.lineJoin = 'round';
    for (const fl of flowers) {
      ctx.strokeStyle = rgb(...fl.c); ctx.beginPath();
      for (let i = 0; i <= 80; i++) {
        const th = fl.rot + (TAU * i) / 80, petal = 0.5 + 0.5 * Math.sin(th * 5), r = fl.r * (0.58 + 0.42 * petal);
        const x = fl.cx + Math.cos(th) * r, y = fl.cy + Math.sin(th) * r;
        i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      }
      ctx.stroke();
    }
  }

  function drawBackground() {
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
    if (settings.bg === 'black') return;
    if (settings.bg === 'flowers') { drawFlowers(); return; }
    let top = hexToRgb(settings.bgColor);
    if (settings.autoSky) top = skyColor();
    else if (settings.rainbow) top = hsv((now % 120) / 120);
    drawGradient(top, settings.bg === 'dithered');
  }

  // --------------------------------------------------------------- drawing
  function drawSeaweed() {
    const roots = Math.max(12, Math.round(W / 26.7));
    for (let i = 0; i < roots; i++) {
      const bx = 10 + (i * (W - 20)) / (roots - 1);
      const amp = 5 + (i % 4) * 2;
      const sway = Math.sin(now * (0.8 + 0.09 * i) * settings.sway + i * 0.7) * amp;
      const noise = Math.sin(i * 2.173 + 0.61);
      const bladeH = clamp(32 * settings.seaweedLength * (1 + settings.seaweedRandom * noise), 18, 72);
      const y0 = H - 2;
      const pt = (u) => {
        const body = Math.sin(now * (1.05 + i * 0.025) * settings.sway - u * 5.1 + i * 0.72);
        const rip = Math.sin(now * 0.72 * settings.sway + u * 9 + i * 1.31);
        return [bx + sway * u * (0.2 + u * 0.8) + body * (1.5 + bladeH * 0.055) * u * u + rip * 1.2 * u, y0 - bladeH * u];
      };
      ctx.lineWidth = 1.1; ctx.lineCap = 'round';
      let [px, py] = [bx, y0];
      for (let s = 1; s <= 7; s++) {
        const u = s / 7, [x, y] = pt(u);
        ctx.strokeStyle = u < 0.38 ? '#007d00' : u < 0.76 ? '#00ff00' : '#adff2f';
        ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(x, y); ctx.stroke();
        if (u < 0.78) { ctx.strokeStyle = '#007d00'; ctx.beginPath(); ctx.moveTo(px + 1, py); ctx.lineTo(x + 1, y); ctx.stroke(); }
        px = x; py = y;
      }
      const branches = clamp(Math.floor(bladeH / 14), 2, 5);
      for (let b = 0; b < branches; b++) {
        const u = Math.min(0.88, 0.3 + b * 0.14 + ((i + b) % 3) * 0.018);
        const [x, y] = pt(u);
        const side = (i + b) & 1 ? 1 : -1, len = 5.5 + ((i * 3 + b * 5) % 5);
        const wig = Math.sin(now * (1.1 + i * 0.03) * settings.sway + i + b * 1.7) * 1.2;
        ctx.strokeStyle = b & 1 ? '#007d00' : '#00ff00';
        ctx.beginPath(); ctx.moveTo(x, y);
        ctx.lineTo(x + side * (len * 0.58 + Math.abs(sway) * 0.05) + wig, y - len * 0.78); ctx.stroke();
      }
    }
  }

  function drawFish() {
    ctx.font = FONT; ctx.textBaseline = 'top'; ctx.textAlign = 'left';
    const base = now * 5.6;
    for (const f of fishPool) {
      const txt = f.vx >= 0 ? SPECIES[f.type][0] : SPECIES[f.type][2];
      ctx.fillStyle = scaleRgb(f.color, f.depth);
      for (let c = 0; c < txt.length; c++) {
        if (txt[c] === ' ') continue;
        const wave = Math.sin(base + f.phase + c * 0.85) * 1.5;
        ctx.fillText(txt[c], Math.round(f.x + c * CW), Math.round(f.y + wave));
      }
    }
  }

  function drawText(s, x, y, color, font = FONT, align = 'left') {
    ctx.font = font; ctx.fillStyle = color; ctx.textAlign = align; ctx.textBaseline = 'top';
    ctx.fillText(s, Math.round(x), Math.round(y));
  }

  function drawFlakesAndBubbles() {
    ctx.font = FONT; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const f of flakes) { ctx.fillStyle = f.color; ctx.fillText('*', f.x, f.y); }
    for (const b of bubbles) { ctx.fillStyle = b.color; ctx.fillText('o', b.x, b.y); }
  }

  function drawOctopus() {
    if (!octopus.active) return;
    const t = now, cx = Math.round(octopus.x), cy = Math.round(octopus.y);
    if (octopus.cthulhu) {
      const col = rgb(8 + 5 * Math.sin(t * 0.1 + octopus.colorPhase), 82 + 24 * Math.sin(t * 0.13 + octopus.colorPhase + 1.7), 34 + 10 * Math.sin(t * 0.09 + octopus.colorPhase + 3.1));
      const frame = (t * 3 + octopus.phase) & 1;
      drawText('(;,,;)', cx, cy + Math.sin(t * 1.1 + octopus.phase) * 1.4 - 8, col, FONT, 'center');
      drawText(frame ? '((()))' : '(()())', cx, cy + 7 + Math.sin(t * 1.8 + octopus.phase) * 1.6, col, FONT, 'center');
      return;
    }
    const col = rgb(205 + 42 * Math.sin(t * 0.18 + octopus.colorPhase), 78 + 38 * Math.sin(t * 0.13 + octopus.colorPhase + 2.1), 178 + 58 * Math.sin(t * 0.16 + octopus.colorPhase + 4.2));
    const tw = Math.sin(t * 1.25 + octopus.phase) * 1.4;
    ctx.font = FONT; ctx.fillStyle = col; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillText('(', cx - 13, cy + tw - 8); ctx.fillText('.', cx - 3, cy - 13); ctx.fillText('.', cx + 7, cy - 13); ctx.fillText(')', cx + 16, cy - tw - 8);
    const glyphs = '((()))', xs = [-24, -16, -8, 2, 10, 18];
    for (let i = 0; i < 6; i++) {
      const w = Math.sin(t * 1.75 + octopus.phase + i * 0.72);
      ctx.fillText(glyphs[i], cx + xs[i] + w * 1.4, cy + 5 + w * 2.2);
    }
  }

  const HORSE = ['  ^^  ', ' / o) ', '[__-/ ', '  /|  ', ' / |  ', ' \\ |  ', '  ( ) ', '  \\_/ '];
  function drawSeahorse() {
    if (!seahorse.active) return;
    const t = now, s = seahorse, x = Math.round(s.x), y = Math.round(s.y);
    const sway = Math.sin(t * 1.15 + s.phase) * 1.2;
    const col = rgb(238 + 12 * Math.sin(t * 0.11 + s.phase), 142 + 18 * Math.sin(t * 0.16 + s.phase + 1.4), 48 + 12 * Math.sin(t * 0.13 + s.phase + 2.8));
    ctx.font = SMALL_FONT; ctx.fillStyle = col; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    const mir = { '/': '\\', '\\': '/', '[': ']', ']': '[', '(': ')', ')': '(', '<': '>', '>': '<' };
    HORSE.forEach((line, row) => {
      for (let c = 0; c < 6; c++) {
        let g = line[c] || ' '; if (g === ' ') continue;
        let col2 = c;
        if (s.right) { col2 = 5 - c; g = mir[g] || g; }
        ctx.fillText(g, x + col2 * 5 + (row >= 1 && row <= 3 ? sway : 0), y + row * 6);
      }
    });
    ctx.fillStyle = rgb(255, 188, 82);
    ctx.fillText(Math.sin(t * 12 + s.finPhase) > 0 ? '~' : '-', (s.right ? x + 5 : x + 20) + Math.sin(t * 10 + s.finPhase) * 1.2, y + 24);
  }

  function drawSnail() {
    if (!snail.active) return;
    const t = now, s = snail, x = Math.round(s.x), y = s.y;
    const col = rgb(228 + 14 * Math.sin(t * 0.16 + s.phase), 116 + 16 * Math.sin(t * 0.13 + s.phase + 1.3), 34 + 8 * Math.sin(t * 0.11 + s.phase + 2.6));
    const stalk = Math.sin(t * 1.6 + s.phase) > 0;
    if (s.right) { drawText('@', x, y, col); drawText(stalk ? '/' : '|', x + 11, y, col); }
    else { drawText(stalk ? '\\' : '|', x, y, col); drawText('@', x + 7, y, col); }
  }

  function drawJelly() {
    if (!jelly.active) return;
    const t = now, j = jelly, x = Math.round(j.x), y = Math.round(j.y);
    const rows = [[' .-. ', '(   )', ' \\|/ ', ' /~\\ '], [' _-_ ', '(   )', '  |  ', ' ~ ~ ']][(t * 1.05 + j.phase) & 1];
    const sw = Math.sin(t * 1.45 + j.phase) * 1.4;
    const col = rgb(92 + 20 * Math.sin(t * 0.12 + j.phase), 188 + 24 * Math.sin(t * 0.16 + j.phase + 1.2), 236 + 16 * Math.sin(t * 0.1 + j.phase + 2.5));
    drawText(rows[0], x, y, col, SMALL_FONT); drawText(rows[1], x, y + 7, col, SMALL_FONT);
    drawText(rows[2], x + sw, y + 15, col, SMALL_FONT); drawText(rows[3], x - sw, y + 23, col, SMALL_FONT);
  }

  // Clock -------------------------------------------------------------------
  const BIG = {
    '0': [' ### ', '#   #', '#   #', '#   #', ' ### '], '1': ['  #  ', ' ##  ', '  #  ', '  #  ', ' ### '],
    '2': [' ### ', '    #', ' ### ', '#    ', '#####'], '3': ['#### ', '    #', ' ### ', '    #', '#### '],
    '4': ['#   #', '#   #', '#####', '    #', '    #'], '5': ['#####', '#    ', '#### ', '    #', '#### '],
    '6': [' ### ', '#    ', '#### ', '#   #', ' ### '], '7': ['#####', '    #', '   # ', '  #  ', '  #  '],
    '8': [' ### ', '#   #', ' ### ', '#   #', ' ### '], '9': [' ### ', '#   #', ' ####', '    #', ' ### '],
    ':': ['  ', ' #', '  ', ' #', '  '], ' ': ['   ', '   ', '   ', '   ', '   '],
    'A': [' ### ', '#   #', '#####', '#   #', '#   #'], 'P': ['#### ', '#   #', '#### ', '#    ', '#    '],
    'M': ['#   #', '## ##', '# # #', '#   #', '#   #'],
  };
  function timeString(withMeridiem) {
    const d = new Date();
    let h = d.getHours(), suffix = '';
    if (!settings.clock24) { suffix = h >= 12 ? ' PM' : ' AM'; h = h % 12 || 12; }
    return `${h}:${String(d.getMinutes()).padStart(2, '0')}${withMeridiem ? suffix : ''}`;
  }
  function drawClock() {
    if (settings.clock === 'off') return;
    const col = settings.clockColor;
    if (settings.clock === 'small') { drawText(timeString(true), W / 2, 4, col, FONT, 'center'); return; }
    const str = timeString(false);
    const cell = 3.4, gap = 2;
    let total = 0; for (const ch of str) total += (BIG[ch] || BIG[' '])[0].length * cell + gap;
    let x = (W - total) / 2; const y = 82;
    ctx.fillStyle = col; ctx.globalAlpha = 0.85;
    for (const ch of str) {
      const g = BIG[ch] || BIG[' '];
      g.forEach((row, ry) => [...row].forEach((p, rx) => { if (p === '#') ctx.fillRect(x + rx * cell, y + ry * cell * 1.15, cell - 0.6, cell * 1.15 - 0.6); }));
      x += g[0].length * cell + gap;
    }
    ctx.globalAlpha = 1;
  }

  function render() {
    drawBackground();
    drawClock();
    drawSeaweed();
    drawJelly();
    drawFlakesAndBubbles();
    drawFish();
    drawSnail();
    drawSeahorse();
    drawOctopus();
  }

  // ------------------------------------------------------------------ loop
  let now = performance.now() / 1000, last = now, frames = 0;
  function frame(ts) {
    now = ts / 1000;
    const dt = Math.min(0.05, now - last); last = now;
    if (!document.hidden) { update(dt); render(); }
    if (++frames % 600 === 0) persistPellets();
    requestAnimationFrame(frame);
  }

  // -------------------------------------------------------------------- UI
  const panel = document.getElementById('panel'), gear = document.getElementById('gear');
  const FREQS = [[0, 'Never'], [1, '1 / hour'], [2, '2 / hour'], [4, '4 / hour'], [6, '6 / hour'], [12, '12 / hour'], [60, 'Every minute']];
  document.querySelectorAll('select.freq').forEach((sel) => FREQS.forEach(([v, l]) => sel.add(new Option(l, v))));

  function syncControls() {
    document.querySelectorAll('[data-key]').forEach((el) => {
      const v = settings[el.dataset.key];
      if (el.type === 'checkbox') el.checked = !!v; else el.value = v;
      const out = el.parentElement.querySelector('output'); if (out) out.textContent = v;
    });
  }
  document.querySelectorAll('[data-key]').forEach((el) => {
    el.addEventListener('input', () => {
      const k = el.dataset.key;
      settings[k] = el.type === 'checkbox' ? el.checked : el.type === 'range' || (el.tagName === 'SELECT' && /^\d+$/.test(el.value)) ? +el.value : el.value;
      const out = el.parentElement.querySelector('output'); if (out) out.textContent = settings[k];
      if (k === 'octopusFreq') sched(octopus, settings.octopusFreq);
      if (k === 'seahorseFreq') sched(seahorse, settings.seahorseFreq);
      if (k === 'snailFreq') sched(snail, settings.snailFreq);
      if (k === 'jellyFreq') sched(jelly, settings.jellyFreq);
      if (k === 'matrixOn') tell('matrix', { enabled: settings.matrixOn });
      if (k === 'bgColor') settings.rainbow = settings.autoSky ? settings.rainbow : false;
      saveSettings(); syncControls();
    });
  });

  const actions = {
    feed: () => { for (let i = 0; i < 9; i++) spawnFlake(16 + (i / 8) * (W - 32), rand(8, 22)); tell('feed'); },
    respawn: respawnFish,
    octopus: () => spawnOctopus(true, false),
    cthulhu: () => spawnOctopus(true, true),
    seahorse: () => spawnSeahorse(true),
    snail: () => spawnSnail(true),
    jelly: () => spawnJelly(true),
    flowers: () => { shuffleFlowers(); settings.bg = 'flowers'; saveSettings(); syncControls(); },
  };
  document.querySelectorAll('[data-action]').forEach((b) => b.addEventListener('click', () => actions[b.dataset.action]()));

  function showTab(name) {
    document.querySelectorAll('#tabs button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === name)));
    document.querySelectorAll('[data-pane]').forEach((p) => { p.hidden = p.dataset.pane !== name; });
  }
  document.querySelectorAll('#tabs button').forEach((b) => b.addEventListener('click', () => showTab(b.dataset.tab)));

  function togglePanel(open = panel.hidden) {
    panel.hidden = !open; gear.hidden = open;
    if (open) { syncControls(); panel.querySelector('#tabs button[aria-selected="true"]').focus(); } else gear.focus();
  }
  gear.addEventListener('click', () => togglePanel(true));
  document.getElementById('close').addEventListener('click', () => togglePanel(false));

  // Tap / click the glass to feed.
  canvas.addEventListener('pointerdown', (e) => {
    if (!panel.hidden) { togglePanel(false); return; }
    feedAt((e.clientX / innerWidth) * W, (e.clientY / innerHeight) * H);
  });

  const toggleFullscreen = () => {
    if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen?.().catch(() => {});
  };
  addEventListener('keydown', (e) => {
    if (e.target.matches('input, select, textarea') || e.metaKey || e.ctrlKey) return;
    const k = e.key.toLowerCase();
    if (k === 'f') actions.feed();
    else if (k === 's') togglePanel();
    else if (k === 'escape') togglePanel(false);
    else if (k === 'enter' && panel.hidden) toggleFullscreen();
    else if (k === 'o') actions.octopus();
    else if (k === 'h') actions.seahorse();
    else if (k === 'n') actions.snail();
    else if (k === 'j') actions.jelly();
  });

  // Hide the gear when nobody is around (it's a wall display).
  let idleTimer;
  const wake = () => { document.body.classList.remove('idle'); clearTimeout(idleTimer); idleTimer = setTimeout(() => document.body.classList.add('idle'), 4000); };
  ['pointermove', 'pointerdown', 'keydown'].forEach((ev) => addEventListener(ev, wake, { passive: true }));
  wake();

  if (link) link.on_connect(() => tell('matrix', { enabled: settings.matrixOn }));

  addEventListener('resize', () => { resize(); respawnFlowersIfNeeded(); });
  function respawnFlowersIfNeeded() { if (flowersDirty) { shuffleFlowers(); flowersDirty = false; } }

  resize(); shuffleFlowers(); flowersDirty = false;
  respawnFish(); syncBubbles(); syncControls();
  requestAnimationFrame(frame);
})();
