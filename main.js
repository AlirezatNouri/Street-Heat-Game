const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

const ui = {
  cash: document.getElementById("cashValue"),
  heat: document.getElementById("heatValue"),
  health: document.getElementById("healthValue"),
  vehicle: document.getElementById("vehicleValue"),
  missionLabel: document.getElementById("missionLabel"),
  missionText: document.getElementById("missionText"),
  status: document.getElementById("statusText"),
};

const WORLD = {
  width: 2600,
  height: 1800,
  roadWidth: 170,
  blockSize: 430,
};

const keys = new Set();
const bullets = [];
const particles = [];
const drops = [];
const npcs = [];
const cars = [];
const police = [];

const rand = (min, max) => Math.random() * (max - min) + min;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

const camera = { x: 0, y: 0 };

const missions = [
  {
    label: "Mission 1",
    text: "Collect 3 cash drops scattered across the city.",
    check: (state) => state.cashCollected >= 3,
  },
  {
    label: "Mission 2",
    text: "Reach heat level 2, then break line of sight until the cops give up.",
    check: (state) => state.reachedHeat2 && state.heat === 0,
  },
  {
    label: "Mission 3",
    text: "Steal a moving civilian car without getting busted.",
    check: (state) => state.carjackedMovingVehicle,
  },
];

const state = {
  time: 0,
  cash: 0,
  cashCollected: 0,
  heat: 0,
  heatTimer: 0,
  cooldowns: {
    fire: 0,
    interact: 0,
    damageFlash: 0,
  },
  missionIndex: 0,
  gameOver: false,
  busted: false,
  reachedHeat2: false,
  carjackedMovingVehicle: false,
};

const player = {
  x: 800,
  y: 700,
  vx: 0,
  vy: 0,
  angle: 0,
  radius: 15,
  health: 100,
  maxHealth: 100,
  sprint: 1,
  inCar: null,
  fireRecoil: 0,
  invincible: 0,
};

function makeDrop() {
  return {
    x: rand(180, WORLD.width - 180),
    y: rand(180, WORLD.height - 180),
    radius: 14,
    value: 100,
    pulse: rand(0, Math.PI * 2),
  };
}

function makePedestrian() {
  const onHorizontal = Math.random() > 0.5;
  return {
    type: "pedestrian",
    x: rand(120, WORLD.width - 120),
    y: rand(120, WORLD.height - 120),
    vx: onHorizontal ? rand(-45, 45) : 0,
    vy: onHorizontal ? 0 : rand(-45, 45),
    radius: 12,
    alive: true,
    panic: 0,
    tint: `hsl(${rand(180, 360)}, 65%, 60%)`,
  };
}

function makeCivilianCar(x = rand(200, WORLD.width - 200), y = rand(200, WORLD.height - 200)) {
  const horizontal = Math.random() > 0.5;
  const speed = rand(90, 150);
  return {
    type: "civilian",
    x,
    y,
    vx: horizontal ? (Math.random() > 0.5 ? speed : -speed) : 0,
    vy: horizontal ? 0 : (Math.random() > 0.5 ? speed : -speed),
    width: 46,
    height: 24,
    health: 70,
    driver: true,
    occupiedByPlayer: false,
    color: `hsl(${rand(5, 210)}, 72%, 56%)`,
    hitFlash: 0,
  };
}

function makePoliceCar() {
  const edge = Math.floor(rand(0, 4));
  const spawn = [
    { x: rand(50, WORLD.width - 50), y: 60 },
    { x: WORLD.width - 60, y: rand(50, WORLD.height - 50) },
    { x: rand(50, WORLD.width - 50), y: WORLD.height - 60 },
    { x: 60, y: rand(50, WORLD.height - 50) },
  ][edge];

  return {
    type: "police",
    x: spawn.x,
    y: spawn.y,
    vx: 0,
    vy: 0,
    width: 52,
    height: 26,
    health: 110,
    driver: true,
    occupiedByPlayer: false,
    color: "#1d2b53",
    siren: rand(0, Math.PI * 2),
    hitFlash: 0,
  };
}

function spawnWorld() {
  drops.length = 0;
  npcs.length = 0;
  cars.length = 0;
  police.length = 0;
  bullets.length = 0;
  particles.length = 0;

  for (let i = 0; i < 8; i += 1) drops.push(makeDrop());
  for (let i = 0; i < 18; i += 1) npcs.push(makePedestrian());
  for (let i = 0; i < 9; i += 1) cars.push(makeCivilianCar());
}

function resetGame() {
  state.time = 0;
  state.cash = 0;
  state.cashCollected = 0;
  state.heat = 0;
  state.heatTimer = 0;
  state.missionIndex = 0;
  state.gameOver = false;
  state.busted = false;
  state.reachedHeat2 = false;
  state.carjackedMovingVehicle = false;
  state.cooldowns.fire = 0;
  state.cooldowns.interact = 0;
  state.cooldowns.damageFlash = 0;

  player.x = 800;
  player.y = 700;
  player.vx = 0;
  player.vy = 0;
  player.angle = 0;
  player.health = 100;
  player.inCar = null;
  player.invincible = 0;

  spawnWorld();
  setStatus("Cruise the city and start trouble.");
  syncMission();
}

function setStatus(text) {
  ui.status.textContent = text;
}

function syncMission() {
  const mission = missions[state.missionIndex];
  if (!mission) {
    ui.missionLabel.textContent = "Final";
    ui.missionText.textContent = "City locked down. You own the streets.";
    return;
  }
  ui.missionLabel.textContent = mission.label;
  ui.missionText.textContent = mission.text;
}

function completeMission() {
  state.missionIndex += 1;
  if (state.missionIndex >= missions.length) {
    setStatus("All missions cleared. Keep causing chaos.");
  } else {
    setStatus(`${missions[state.missionIndex - 1].label} complete.`);
  }
  syncMission();
}

function raiseHeat(amount, reason) {
  state.heat = clamp(state.heat + amount, 0, 5);
  state.heatTimer = 10;
  if (state.heat >= 2) state.reachedHeat2 = true;
  setStatus(reason);
}

function lowerHeat(dt) {
  const activeChasers = police.some((cop) => dist(cop, player.inCar || player) < 240);
  if (!activeChasers && state.heat > 0) {
    state.heatTimer -= dt;
    if (state.heatTimer <= 0) {
      state.heat = Math.max(0, state.heat - 1);
      state.heatTimer = 8;
      if (state.heat === 0) setStatus("Police search called off.");
    }
  }
}

function isRoad(x, y) {
  const localX = x % WORLD.blockSize;
  const localY = y % WORLD.blockSize;
  return localX < WORLD.roadWidth || localY < WORLD.roadWidth;
}

function carSpeed(car) {
  return Math.hypot(car.vx, car.vy);
}

function spawnPoliceIfNeeded() {
  const target = state.heat === 0 ? 0 : Math.min(1 + state.heat, 6);
  while (police.length < target) {
    police.push(makePoliceCar());
  }
  while (police.length > target) {
    police.pop();
  }
}

function getPlayerEntity() {
  return player.inCar || player;
}

function enterNearestCar() {
  if (player.inCar) return;
  let closest = null;
  let closestDistance = 999;
  for (const car of cars) {
    const d = dist(car, player);
    if (d < 42 && d < closestDistance) {
      closest = car;
      closestDistance = d;
    }
  }
  if (!closest) return;

  const wasMoving = carSpeed(closest) > 55;
  closest.occupiedByPlayer = true;
  closest.driver = false;
  player.inCar = closest;
  if (wasMoving) {
    state.carjackedMovingVehicle = true;
    raiseHeat(1, "Carjacking reported.");
  }
  setStatus("Vehicle acquired.");
}

function exitCar() {
  if (!player.inCar) return;
  const car = player.inCar;
  player.inCar = null;
  car.occupiedByPlayer = false;
  player.x = clamp(car.x + 36, 20, WORLD.width - 20);
  player.y = clamp(car.y + 36, 20, WORLD.height - 20);
  player.vx = car.vx * 0.25;
  player.vy = car.vy * 0.25;
  setStatus("Back on foot.");
}

function fireBullet() {
  if (state.cooldowns.fire > 0 || state.gameOver) return;
  const source = getPlayerEntity();
  const angle = player.angle;
  const speed = player.inCar ? 600 : 520;
  bullets.push({
    x: source.x + Math.cos(angle) * 20,
    y: source.y + Math.sin(angle) * 20,
    vx: Math.cos(angle) * speed + (player.inCar ? player.inCar.vx * 0.3 : player.vx * 0.2),
    vy: Math.sin(angle) * speed + (player.inCar ? player.inCar.vy * 0.3 : player.vy * 0.2),
    life: 1.2,
  });
  state.cooldowns.fire = player.inCar ? 0.17 : 0.22;
  player.fireRecoil = 1;
}

function updatePlayer(dt) {
  const moveX = (keys.has("d") || keys.has("arrowright") ? 1 : 0) - (keys.has("a") || keys.has("arrowleft") ? 1 : 0);
  const moveY = (keys.has("s") || keys.has("arrowdown") ? 1 : 0) - (keys.has("w") || keys.has("arrowup") ? 1 : 0);
  const sprint = keys.has("shift") ? 1.5 : 1;
  const targetAngle = Math.atan2(moveY || Math.sin(player.angle), moveX || Math.cos(player.angle));
  player.angle = targetAngle;

  if (player.inCar) {
    const car = player.inCar;
    const accel = 340;
    car.vx += moveX * accel * dt;
    car.vy += moveY * accel * dt;
    const maxSpeed = 250;
    const speed = carSpeed(car);
    if (speed > maxSpeed) {
      car.vx = (car.vx / speed) * maxSpeed;
      car.vy = (car.vy / speed) * maxSpeed;
    }
    car.vx *= 0.985;
    car.vy *= 0.985;
    car.x = clamp(car.x + car.vx * dt, 20, WORLD.width - 20);
    car.y = clamp(car.y + car.vy * dt, 20, WORLD.height - 20);
    player.x = car.x;
    player.y = car.y;
  } else {
    const accel = 460 * sprint;
    player.vx += moveX * accel * dt;
    player.vy += moveY * accel * dt;
    const maxSpeed = 180 * sprint;
    const speed = Math.hypot(player.vx, player.vy);
    if (speed > maxSpeed) {
      player.vx = (player.vx / speed) * maxSpeed;
      player.vy = (player.vy / speed) * maxSpeed;
    }
    player.vx *= 0.86;
    player.vy *= 0.86;
    player.x = clamp(player.x + player.vx * dt, 15, WORLD.width - 15);
    player.y = clamp(player.y + player.vy * dt, 15, WORLD.height - 15);
  }
}

function updateCars(dt) {
  for (const car of cars) {
    if (car.occupiedByPlayer) continue;

    car.x += car.vx * dt;
    car.y += car.vy * dt;

    if (!isRoad(car.x, car.y)) {
      if (Math.abs(car.vx) > Math.abs(car.vy)) {
        car.vx *= -1;
      } else {
        car.vy *= -1;
      }
    }

    if (car.x < 50 || car.x > WORLD.width - 50) car.vx *= -1;
    if (car.y < 50 || car.y > WORLD.height - 50) car.vy *= -1;

    car.hitFlash = Math.max(0, car.hitFlash - dt * 5);

    if (dist(car, player) < 28 && carSpeed(car) > 120 && !player.inCar && player.invincible <= 0) {
      damagePlayer(16, "Hit by traffic.");
      raiseHeat(1, "Traffic incident reported.");
      player.invincible = 1;
    }
  }
}

function updatePedestrians(dt) {
  for (const npc of npcs) {
    if (!npc.alive) continue;
    if (npc.panic > 0) npc.panic -= dt;

    if (npc.panic > 0) {
      const away = Math.atan2(npc.y - player.y, npc.x - player.x);
      npc.vx = Math.cos(away) * 100;
      npc.vy = Math.sin(away) * 100;
    } else if (Math.random() < 0.01) {
      npc.vx = rand(-50, 50);
      npc.vy = rand(-50, 50);
    }

    npc.x = clamp(npc.x + npc.vx * dt, 20, WORLD.width - 20);
    npc.y = clamp(npc.y + npc.vy * dt, 20, WORLD.height - 20);

    if (dist(npc, player) < 90) npc.panic = 1.8;

    if (player.inCar && dist(npc, player.inCar) < 25) {
      npc.alive = false;
      raiseHeat(1, "Civilian hit. Units alerted.");
      burst(npc.x, npc.y, "#ff7d7d", 10);
    }
  }
}

function updatePolice(dt) {
  for (const cop of police) {
    const target = getPlayerEntity();
    const angle = Math.atan2(target.y - cop.y, target.x - cop.x);
    const speed = 145 + state.heat * 20;

    cop.vx += Math.cos(angle) * speed * dt;
    cop.vy += Math.sin(angle) * speed * dt;

    const currentSpeed = carSpeed(cop);
    const maxSpeed = 240 + state.heat * 15;
    if (currentSpeed > maxSpeed) {
      cop.vx = (cop.vx / currentSpeed) * maxSpeed;
      cop.vy = (cop.vy / currentSpeed) * maxSpeed;
    }

    cop.vx *= 0.97;
    cop.vy *= 0.97;
    cop.x = clamp(cop.x + cop.vx * dt, 20, WORLD.width - 20);
    cop.y = clamp(cop.y + cop.vy * dt, 20, WORLD.height - 20);
    cop.siren += dt * 8;
    cop.hitFlash = Math.max(0, cop.hitFlash - dt * 5);

    const chaseDistance = dist(cop, target);
    if (chaseDistance < 190) state.heatTimer = 10;

    if (chaseDistance < 36 && player.invincible <= 0) {
      damagePlayer(11, "Police rammed you.");
      player.invincible = 0.8;
    }
  }
}

function updateDrops(dt) {
  for (let i = drops.length - 1; i >= 0; i -= 1) {
    const drop = drops[i];
    drop.pulse += dt * 4;
    if (dist(drop, player) < 24) {
      state.cash += drop.value;
      state.cashCollected += 1;
      setStatus(`Cash secured: $${drop.value}.`);
      burst(drop.x, drop.y, "#ffd166", 12);
      drops.splice(i, 1);
      drops.push(makeDrop());
    }
  }
}

function updateBullets(dt) {
  for (let i = bullets.length - 1; i >= 0; i -= 1) {
    const bullet = bullets[i];
    bullet.x += bullet.vx * dt;
    bullet.y += bullet.vy * dt;
    bullet.life -= dt;

    if (
      bullet.life <= 0 ||
      bullet.x < 0 ||
      bullet.y < 0 ||
      bullet.x > WORLD.width ||
      bullet.y > WORLD.height
    ) {
      bullets.splice(i, 1);
      continue;
    }

    let removed = false;
    for (const npc of npcs) {
      if (npc.alive && dist(bullet, npc) < npc.radius + 3) {
        npc.alive = false;
        bullets.splice(i, 1);
        raiseHeat(1, "Shots fired. Police notified.");
        burst(npc.x, npc.y, "#ff8da1", 8);
        removed = true;
        break;
      }
    }
    if (removed) continue;

    for (const car of [...cars, ...police]) {
      if (Math.abs(bullet.x - car.x) < car.width / 2 && Math.abs(bullet.y - car.y) < car.height / 2) {
        car.health -= 22;
        car.hitFlash = 1;
        bullets.splice(i, 1);
        burst(bullet.x, bullet.y, "#c7d2ff", 5);
        if (car.type === "police") raiseHeat(1, "Officer under fire.");
        if (car.health <= 0) {
          burst(car.x, car.y, "#ffb36b", 18);
          if (car.occupiedByPlayer) {
            player.inCar = null;
            damagePlayer(25, "Your ride exploded.");
          }
          if (car.type === "police") {
            const index = police.indexOf(car);
            if (index >= 0) police.splice(index, 1);
            setStatus("Police cruiser disabled.");
          } else {
            const index = cars.indexOf(car);
            if (index >= 0) cars.splice(index, 1);
            cars.push(makeCivilianCar());
          }
        }
        removed = true;
        break;
      }
    }
    if (removed) continue;
  }
}

function burst(x, y, color, count) {
  for (let i = 0; i < count; i += 1) {
    particles.push({
      x,
      y,
      vx: rand(-120, 120),
      vy: rand(-120, 120),
      color,
      life: rand(0.3, 0.8),
    });
  }
}

function updateParticles(dt) {
  for (let i = particles.length - 1; i >= 0; i -= 1) {
    const p = particles[i];
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.life -= dt;
    if (p.life <= 0) particles.splice(i, 1);
  }
}

function damagePlayer(amount, message) {
  player.health = Math.max(0, player.health - amount);
  state.cooldowns.damageFlash = 0.35;
  setStatus(message);
  if (player.health <= 0) {
    state.gameOver = true;
    state.busted = true;
    setStatus("Busted. Press R to restart.");
  }
}

function updateMissionProgress() {
  const mission = missions[state.missionIndex];
  if (mission && mission.check(state)) completeMission();
}

function updateCamera() {
  const focus = getPlayerEntity();
  camera.x = clamp(focus.x - canvas.width / 2, 0, WORLD.width - canvas.width);
  camera.y = clamp(focus.y - canvas.height / 2, 0, WORLD.height - canvas.height);
}

function updateHUD() {
  ui.cash.textContent = `$${state.cash}`;
  ui.heat.textContent = `${state.heat}`;
  ui.health.textContent = `${Math.ceil(player.health)}`;
  ui.vehicle.textContent = player.inCar ? "Stolen Car" : "On Foot";
}

function handleInput(dt) {
  state.cooldowns.fire = Math.max(0, state.cooldowns.fire - dt);
  state.cooldowns.interact = Math.max(0, state.cooldowns.interact - dt);
  state.cooldowns.damageFlash = Math.max(0, state.cooldowns.damageFlash - dt);
  player.invincible = Math.max(0, player.invincible - dt);
  player.fireRecoil = Math.max(0, player.fireRecoil - dt * 4);

  if (keys.has(" ")) fireBullet();

  if (keys.has("e") && state.cooldowns.interact <= 0) {
    if (player.inCar) exitCar();
    else enterNearestCar();
    state.cooldowns.interact = 0.3;
  }
}

function update(dt) {
  if (state.gameOver) {
    if (keys.has("r")) resetGame();
    updateHUD();
    return;
  }

  state.time += dt;
  handleInput(dt);
  updatePlayer(dt);
  updateCars(dt);
  updatePedestrians(dt);
  updatePolice(dt);
  updateDrops(dt);
  updateBullets(dt);
  updateParticles(dt);
  lowerHeat(dt);
  spawnPoliceIfNeeded();
  updateMissionProgress();
  updateCamera();
  updateHUD();
}

function drawGrid() {
  ctx.fillStyle = "#1a2433";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  for (let x = 0; x < WORLD.width; x += WORLD.blockSize) {
    for (let y = 0; y < WORLD.height; y += WORLD.blockSize) {
      const sx = x - camera.x;
      const sy = y - camera.y;

      ctx.fillStyle = "#273447";
      ctx.fillRect(sx, sy, WORLD.roadWidth, WORLD.blockSize);
      ctx.fillRect(sx, sy, WORLD.blockSize, WORLD.roadWidth);

      ctx.fillStyle = "#202d3f";
      ctx.fillRect(sx + WORLD.roadWidth, sy + WORLD.roadWidth, WORLD.blockSize - WORLD.roadWidth, WORLD.blockSize - WORLD.roadWidth);

      for (let bx = sx + WORLD.roadWidth + 20; bx < sx + WORLD.blockSize - 20; bx += 60) {
        for (let by = sy + WORLD.roadWidth + 20; by < sy + WORLD.blockSize - 20; by += 60) {
          ctx.fillStyle = `rgba(255, 210, 120, ${0.03 + ((bx + by) % 120) / 4000})`;
          ctx.fillRect(bx, by, 36, 36);
        }
      }
    }
  }

  ctx.strokeStyle = "rgba(255, 240, 190, 0.2)";
  ctx.lineWidth = 3;
  for (let x = 0; x < WORLD.width; x += WORLD.blockSize) {
    const sx = x - camera.x;
    ctx.beginPath();
    ctx.moveTo(sx + WORLD.roadWidth / 2, -camera.y);
    ctx.lineTo(sx + WORLD.roadWidth / 2, WORLD.height - camera.y);
    ctx.stroke();
  }
  for (let y = 0; y < WORLD.height; y += WORLD.blockSize) {
    const sy = y - camera.y;
    ctx.beginPath();
    ctx.moveTo(-camera.x, sy + WORLD.roadWidth / 2);
    ctx.lineTo(WORLD.width - camera.x, sy + WORLD.roadWidth / 2);
    ctx.stroke();
  }
}

function drawDrop(drop) {
  const pulse = 1 + Math.sin(drop.pulse) * 0.15;
  const x = drop.x - camera.x;
  const y = drop.y - camera.y;
  ctx.beginPath();
  ctx.fillStyle = "#ffd166";
  ctx.arc(x, y, drop.radius * pulse, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.fillStyle = "#fff7d1";
  ctx.arc(x, y, drop.radius * 0.4 * pulse, 0, Math.PI * 2);
  ctx.fill();
}

function drawPedestrian(npc) {
  if (!npc.alive) return;
  const x = npc.x - camera.x;
  const y = npc.y - camera.y;
  ctx.fillStyle = npc.tint;
  ctx.beginPath();
  ctx.arc(x, y, npc.radius, 0, Math.PI * 2);
  ctx.fill();
}

function drawCar(car) {
  const x = car.x - camera.x;
  const y = car.y - camera.y;
  const angle = Math.atan2(car.vy, car.vx || 0.01);

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.fillStyle = car.hitFlash > 0 ? "#ffffff" : car.color;
  ctx.fillRect(-car.width / 2, -car.height / 2, car.width, car.height);
  ctx.fillStyle = "#0a1018";
  ctx.fillRect(-car.width / 4, -car.height / 2 + 3, car.width / 2, car.height - 6);
  if (car.type === "police") {
    const sirenOn = Math.sin(car.siren) > 0;
    ctx.fillStyle = sirenOn ? "#ff4d5c" : "#3db5ff";
    ctx.fillRect(-8, -car.height / 2 - 4, 16, 6);
  }
  ctx.restore();
}

function drawPlayer() {
  const x = player.x - camera.x;
  const y = player.y - camera.y;
  if (!player.inCar) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(player.angle);
    ctx.fillStyle = state.cooldowns.damageFlash > 0 ? "#ffd7d7" : "#7ef29a";
    ctx.beginPath();
    ctx.arc(0, 0, player.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#08111d";
    ctx.fillRect(8, -3, 16, 6);
    ctx.restore();
  }
}

function drawBullets() {
  ctx.fillStyle = "#fff3c2";
  for (const bullet of bullets) {
    ctx.beginPath();
    ctx.arc(bullet.x - camera.x, bullet.y - camera.y, 3, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawParticles() {
  for (const p of particles) {
    ctx.globalAlpha = clamp(p.life * 1.6, 0, 1);
    ctx.fillStyle = p.color;
    ctx.fillRect(p.x - camera.x, p.y - camera.y, 4, 4);
  }
  ctx.globalAlpha = 1;
}

function drawMinimap() {
  const mapW = 180;
  const mapH = 124;
  const x = canvas.width - mapW - 18;
  const y = 18;

  ctx.fillStyle = "rgba(3, 8, 18, 0.7)";
  ctx.fillRect(x, y, mapW, mapH);
  ctx.strokeStyle = "rgba(255, 255, 255, 0.12)";
  ctx.strokeRect(x, y, mapW, mapH);

  const scaleX = mapW / WORLD.width;
  const scaleY = mapH / WORLD.height;

  ctx.fillStyle = "#42516c";
  for (let gx = 0; gx < WORLD.width; gx += WORLD.blockSize) {
    ctx.fillRect(x + gx * scaleX, y, WORLD.roadWidth * scaleX, mapH);
  }
  for (let gy = 0; gy < WORLD.height; gy += WORLD.blockSize) {
    ctx.fillRect(x, y + gy * scaleY, mapW, WORLD.roadWidth * scaleY);
  }

  ctx.fillStyle = "#ffd166";
  for (const drop of drops) {
    ctx.fillRect(x + drop.x * scaleX - 2, y + drop.y * scaleY - 2, 4, 4);
  }

  ctx.fillStyle = "#ff6b6b";
  for (const cop of police) {
    ctx.fillRect(x + cop.x * scaleX - 2, y + cop.y * scaleY - 2, 4, 4);
  }

  ctx.fillStyle = "#7ef29a";
  const focus = getPlayerEntity();
  ctx.fillRect(x + focus.x * scaleX - 3, y + focus.y * scaleY - 3, 6, 6);
}

function drawOverlay() {
  drawMinimap();
  if (!state.gameOver) return;

  ctx.fillStyle = "rgba(4, 8, 16, 0.62)";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.textAlign = "center";
  ctx.fillStyle = "#ff8598";
  ctx.font = '700 48px "Orbitron"';
  ctx.fillText("BUSTED", canvas.width / 2, canvas.height / 2 - 20);
  ctx.fillStyle = "#eff4ff";
  ctx.font = '600 22px "Rajdhani"';
  ctx.fillText("Press R to restart your run", canvas.width / 2, canvas.height / 2 + 28);
  ctx.textAlign = "left";
}

function render() {
  drawGrid();
  drops.forEach(drawDrop);
  npcs.forEach(drawPedestrian);
  cars.forEach(drawCar);
  police.forEach(drawCar);
  drawPlayer();
  drawBullets();
  drawParticles();
  drawOverlay();
}

let lastTime = performance.now();
function loop(now) {
  const dt = Math.min((now - lastTime) / 1000, 0.033);
  lastTime = now;
  update(dt);
  render();
  requestAnimationFrame(loop);
}

window.addEventListener("keydown", (event) => {
  keys.add(event.key.toLowerCase());
  if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " "].includes(event.key)) {
    event.preventDefault();
  }
});

window.addEventListener("keyup", (event) => {
  keys.delete(event.key.toLowerCase());
});

resetGame();
requestAnimationFrame(loop);
