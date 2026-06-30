(() => {
  'use strict';

  const canvas = document.getElementById('game-canvas');
  const ctx = canvas.getContext('2d');
  const scoreEl = document.getElementById('score');
  const livesEl = document.getElementById('lives');
  const menuOverlay = document.getElementById('menu-overlay');
  const defeatOverlay = document.getElementById('defeat-overlay');
  const victoryOverlay = document.getElementById('victory-overlay');
  const pauseOverlay = document.getElementById('pause-overlay');
  const defeatMessage = document.getElementById('defeat-message');
  const victoryMessage = document.getElementById('victory-message');
  const playBtn = document.getElementById('play-btn');
  const restartBtn = document.getElementById('restart-btn');
  const nextWaveBtn = document.getElementById('next-wave-btn');
  const resumeBtn = document.getElementById('resume-btn');
  const musicToggle = document.getElementById('music-toggle');

  canvas.width = CONFIG.canvas.width;
  canvas.height = CONFIG.canvas.height;

  const STATE = {
    MENU: 'menu',
    SPAWNING: 'spawning',
    PLAYING: 'playing',
    PAUSED: 'paused',
    GAME_OVER: 'gameOver',
    VICTORY: 'victory',
  };

  const keys = new Set();
  let gameState = STATE.MENU;
  let wave = 1;
  let score = 0;
  let lives = CONFIG.player.lives;
  let lastTime = 0;
  let hitPauseTimer = 0;
  let shakeTimer = 0;
  let shakeAmplitude = 0;
  let audioEnabled = CONFIG.audio.enabled;
  let audioCtx = null;
  let bassTimer = 0;
  let bassNoteIndex = 0;
  let nextUfoSpawn = 0;

  let player = null;
  let playerBullet = null;
  let enemyBullets = [];
  let aliens = [];
  let formation = { x: 0, y: 0, dir: 1, stepTimer: 0, animFrame: 0, animTimer: 0 };
  let bunkers = [];
  let ufo = null;
  let particles = [];
  let enemyFireTimer = 0;

  // --- Audio ---

  function getAudioContext() {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    return audioCtx;
  }

  function resumeAudio() {
    const ctx = getAudioContext();
    if (ctx.state === 'suspended') ctx.resume();
  }

  function playTone({ frequency = 440, duration = 0.1, type = 'square', volume = 0.15, ramp = 1.2 }) {
    if (!audioEnabled) return;
    const actx = getAudioContext();
    const now = actx.currentTime;
    const osc = actx.createOscillator();
    const gain = actx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(frequency, now);
    osc.frequency.exponentialRampToValueAtTime(frequency * ramp, now + duration * 0.4);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(volume * CONFIG.audio.masterVolume, now + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    osc.connect(gain);
    gain.connect(actx.destination);
    osc.start(now);
    osc.stop(now + duration + 0.02);
  }

  function sfxShoot() {
    playTone({ frequency: 520, duration: 0.08, type: 'square', volume: 0.12, ramp: 1.5 });
  }

  function sfxEnemyShoot() {
    playTone({ frequency: 180, duration: 0.12, type: 'sawtooth', volume: 0.1, ramp: 0.7 });
  }

  function sfxHit() {
    playTone({ frequency: 280, duration: 0.06, type: 'square', volume: 0.14, ramp: 0.8 });
  }

  function sfxDeath() {
    playTone({ frequency: 120, duration: 0.25, type: 'sawtooth', volume: 0.18, ramp: 0.4 });
  }

  function sfxPlayerHit() {
    playTone({ frequency: 90, duration: 0.35, type: 'sawtooth', volume: 0.22, ramp: 0.3 });
  }

  function sfxSpawn() {
    playTone({ frequency: 220, duration: 0.15, type: 'sine', volume: 0.1, ramp: 1.8 });
  }

  function sfxUfo() {
    playTone({ frequency: 640, duration: 0.2, type: 'triangle', volume: 0.12, ramp: 0.6 });
  }

  function updateBassLoop(dt) {
    if (!audioEnabled || gameState !== STATE.PLAYING) return;
    const alive = aliens.filter((a) => a.alive).length;
    const total = CONFIG.aliens.rows * CONFIG.aliens.cols;
    const ratio = alive / total;
    const interval =
      CONFIG.audio.bassMinIntervalMs +
      (CONFIG.audio.bassMaxIntervalMs - CONFIG.audio.bassMinIntervalMs) * ratio;

    bassTimer += dt;
    if (bassTimer >= interval) {
      bassTimer = 0;
      const note = CONFIG.audio.bassNotes[bassNoteIndex % CONFIG.audio.bassNotes.length];
      bassNoteIndex += 1;
      playTone({
        frequency: note,
        duration: CONFIG.audio.bassNoteDuration,
        type: 'sine',
        volume: 0.2,
        ramp: 0.95,
      });
    }
  }

  // --- Particles & Effects ---

  function spawnParticles(x, y, count, color = CONFIG.colors.particle) {
    for (let i = 0; i < count; i += 1) {
      const angle = Math.random() * Math.PI * 2;
      const speed = CONFIG.effects.particleSpeed * (0.4 + Math.random() * 0.8);
      particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: CONFIG.effects.particleLifeMs,
        maxLife: CONFIG.effects.particleLifeMs,
        color: Math.random() > 0.5 ? color : CONFIG.colors.particleBright,
        size: 1 + Math.random() * 2,
      });
    }
  }

  function spawnGroundTrail(x, y, moveDir) {
    const { particleCount, lifeMs, speed, spread } = CONFIG.player.moveTrail;
    for (let i = 0; i < particleCount; i += 1) {
      particles.push({
        x: x + (Math.random() - 0.5) * spread,
        y: y + (Math.random() - 0.5) * 2,
        vx: -moveDir * speed * (0.35 + Math.random() * 0.65) + (Math.random() - 0.5) * 18,
        vy: (Math.random() - 0.5) * 6,
        life: lifeMs,
        maxLife: lifeMs,
        color: CONFIG.colors.player,
        size: 1 + Math.random() * 1.5,
        ground: true,
      });
    }
  }

  function triggerShake(amplitude = CONFIG.effects.shakeAmplitude, duration = CONFIG.effects.shakeDurationMs) {
    shakeTimer = duration;
    shakeAmplitude = amplitude;
  }

  function triggerHitPause(ms = CONFIG.effects.hitPauseMs) {
    hitPauseTimer = Math.max(hitPauseTimer, ms);
  }

  function getShakeOffset() {
    if (shakeTimer <= 0) return { x: 0, y: 0 };
    const progress = 1 - shakeTimer / CONFIG.effects.shakeDurationMs;
    const amp = shakeAmplitude * (1 - progress);
    return {
      x: Math.sin(shakeTimer * 0.085) * amp,
      y: Math.cos(shakeTimer * 0.11) * amp * 0.55,
    };
  }

  function updateEffects(dt) {
    if (hitPauseTimer > 0) hitPauseTimer -= dt;
    if (shakeTimer > 0) shakeTimer = Math.max(0, shakeTimer - dt);

    particles = particles.filter((p) => {
      p.life -= dt;
      p.x += p.vx * (dt / 1000);
      p.y += p.vy * (dt / 1000);
      if (p.ground) {
        p.vx *= 0.9;
        p.vy *= 0.85;
      } else {
        p.vy += 120 * (dt / 1000);
      }
      return p.life > 0;
    });

    for (const alien of aliens) {
      if (alien.flash > 0) alien.flash -= dt;
    }
    if (player && player.hitFlash > 0) player.hitFlash -= dt;
    if (ufo && ufo.flash > 0) {
      ufo.flash -= dt;
      if (ufo.dying && ufo.flash <= 0) ufo = null;
    }
  }

  // --- Alien type lookup ---

  function getAlienTypeForRow(row) {
    for (const type of CONFIG.aliens.types) {
      if (type.rows.includes(row)) return type;
    }
    return CONFIG.aliens.types[CONFIG.aliens.types.length - 1];
  }

  function getAlienSpeed() {
    const alive = aliens.filter((a) => a.alive).length;
    const total = CONFIG.aliens.rows * CONFIG.aliens.cols;
    if (total === 0) return CONFIG.aliens.baseSpeed;
    const ratio = 1 - alive / total;
    return CONFIG.aliens.baseSpeed + (CONFIG.aliens.maxSpeed - CONFIG.aliens.baseSpeed) * ratio;
  }

  // --- Bunkers ---

  function createBunkerMask() {
    const { width, height, cellSize } = CONFIG.bunkers;
    const cols = Math.floor(width / cellSize);
    const rows = Math.floor(height / cellSize);
    const mask = [];
    for (let r = 0; r < rows; r += 1) {
      mask[r] = [];
      for (let c = 0; c < cols; c += 1) {
        const nx = (c / cols) * 2 - 1;
        const ny = r / rows;
        const inArch = ny < 0.35 && Math.abs(nx) < 0.35;
        const inBody = ny >= 0.25 && Math.abs(nx) < 0.95 - ny * 0.5;
        mask[r][c] = inArch || inBody;
      }
    }
    return mask;
  }

  function initBunkers() {
    const { count, width, marginX, yOffset } = CONFIG.bunkers;
    const spacing = (CONFIG.canvas.width - marginX * 2 - width * count) / (count - 1);
    bunkers = [];
    for (let i = 0; i < count; i += 1) {
      bunkers.push({
        x: marginX + i * (width + spacing),
        y: CONFIG.canvas.height - yOffset,
        mask: createBunkerMask(),
        cellSize: CONFIG.bunkers.cellSize,
      });
    }
  }

  function damageBunker(bunker, bx, by) {
    const { cellSize, damageRadius } = CONFIG.bunkers;
    const cols = bunker.mask[0].length;
    const rows = bunker.mask.length;
    const cx = Math.floor((bx - bunker.x) / cellSize);
    const cy = Math.floor((by - bunker.y) / cellSize);
    let hit = false;
    for (let r = cy - damageRadius; r <= cy + damageRadius; r += 1) {
      for (let c = cx - damageRadius; c <= cx + damageRadius; c += 1) {
        if (r >= 0 && r < rows && c >= 0 && c < cols && bunker.mask[r][c]) {
          const dx = c - cx;
          const dy = r - cy;
          if (dx * dx + dy * dy <= damageRadius * damageRadius) {
            bunker.mask[r][c] = false;
            hit = true;
          }
        }
      }
    }
    if (hit) {
      spawnParticles(bx, by, CONFIG.effects.particleCount.bunkerHit);
      sfxHit();
    }
    return hit;
  }

  function bunkerCollision(bullet) {
    for (const bunker of bunkers) {
      const bw = bunker.mask[0].length * bunker.cellSize;
      const bh = bunker.mask.length * bunker.cellSize;
      if (
        bullet.x >= bunker.x &&
        bullet.x <= bunker.x + bw &&
        bullet.y >= bunker.y &&
        bullet.y <= bunker.y + bh
      ) {
        if (damageBunker(bunker, bullet.x, bullet.y)) return true;
      }
    }
    return false;
  }

  // --- Entity init ---

  function createPlayer() {
    return {
      x: CONFIG.canvas.width / 2,
      y: CONFIG.canvas.height - CONFIG.player.yOffset,
      width: CONFIG.player.width,
      height: CONFIG.player.height,
      fireCooldown: 0,
      invincible: 0,
      hitFlash: 0,
      shootRecoil: 0,
      moveTrailTimer: 0,
      visible: true,
    };
  }

  function initAliens() {
    aliens = [];
    const { rows, cols, startX, startY, width, height, hGap, vGap } = CONFIG.aliens;
    for (let row = 0; row < rows; row += 1) {
      for (let col = 0; col < cols; col += 1) {
        const type = getAlienTypeForRow(row);
        aliens.push({
          row,
          col,
          x: startX + col * (width + hGap),
          y: startY + row * (height + vGap),
          width,
          height,
          alive: true,
          type,
          flash: 0,
        });
      }
    }
    formation = {
      x: 0,
      y: 0,
      dir: 1,
      stepTimer: 0,
      animFrame: 0,
      animTimer: 0,
    };
  }

  function resetWave() {
    player = createPlayer();
    playerBullet = null;
    enemyBullets = [];
    particles = [];
    ufo = null;
    enemyFireTimer = 0;
    nextUfoSpawn = performance.now() + randomRange(CONFIG.ufo.minSpawnMs, CONFIG.ufo.maxSpawnMs);
    initAliens();
    initBunkers();
    bassTimer = 0;
    bassNoteIndex = 0;
  }

  function startGame(fromWave = 1) {
    resumeAudio();
    wave = fromWave;
    score = fromWave > 1 ? score : 0;
    lives = CONFIG.player.lives;
    resetWave();
    updateHud();
    hideAllOverlays();
    gameState = STATE.SPAWNING;
    spawnParticles(CONFIG.canvas.width / 2, CONFIG.canvas.height / 2, CONFIG.effects.particleCount.spawn);
    sfxSpawn();
    setTimeout(() => {
      if (gameState === STATE.SPAWNING) gameState = STATE.PLAYING;
    }, CONFIG.timing.spawnDelayMs);
  }

  function startNextWave() {
    wave += 1;
    score += CONFIG.scoring.waveBonus;
    resetWave();
    updateHud();
    hideAllOverlays();
    gameState = STATE.SPAWNING;
    spawnParticles(CONFIG.canvas.width / 2, CONFIG.canvas.height / 2, CONFIG.effects.particleCount.spawn);
    sfxSpawn();
    setTimeout(() => {
      if (gameState === STATE.SPAWNING) gameState = STATE.PLAYING;
    }, CONFIG.timing.spawnDelayMs);
  }

  // --- UI ---

  function updateHud() {
    scoreEl.textContent = String(score);
    livesEl.textContent = String(lives);
  }

  function hideAllOverlays() {
    menuOverlay.classList.add('hidden');
    defeatOverlay.classList.add('hidden');
    victoryOverlay.classList.add('hidden');
    pauseOverlay.classList.add('hidden');
  }

  function showOverlay(overlay) {
    hideAllOverlays();
    overlay.classList.remove('hidden');
  }

  function gameOver(reason) {
    gameState = STATE.GAME_OVER;
    defeatMessage.textContent = reason;
    showOverlay(defeatOverlay);
  }

  function victory() {
    gameState = STATE.VICTORY;
    victoryMessage.textContent = `Wave ${wave} cleared! +${CONFIG.scoring.waveBonus} bonus`;
    showOverlay(victoryOverlay);
  }

  // --- Input ---

  window.addEventListener('keydown', (e) => {
    keys.add(e.code);
    if (e.code === 'Space') e.preventDefault();
    if (e.code === 'KeyP' && gameState === STATE.PLAYING) {
      gameState = STATE.PAUSED;
      showOverlay(pauseOverlay);
    } else if (e.code === 'KeyP' && gameState === STATE.PAUSED) {
      gameState = STATE.PLAYING;
      hideAllOverlays();
    }
  });

  window.addEventListener('keyup', (e) => keys.delete(e.code));

  playBtn.addEventListener('click', () => startGame(1));
  restartBtn.addEventListener('click', () => startGame(1));
  nextWaveBtn.addEventListener('click', () => startNextWave());
  resumeBtn.addEventListener('click', () => {
    gameState = STATE.PLAYING;
    hideAllOverlays();
  });

  musicToggle.addEventListener('click', () => {
    audioEnabled = !audioEnabled;
    musicToggle.textContent = audioEnabled ? 'Audio: On' : 'Audio: Off';
    if (audioEnabled) resumeAudio();
  });

  // --- Update helpers ---

  function randomRange(min, max) {
    return min + Math.random() * (max - min);
  }

  function rectsOverlap(a, b) {
    const ax = a.x - a.width / 2;
    const ay = a.y - a.height / 2;
    const bx = b.x - b.width / 2;
    const by = b.y - b.height / 2;
    return ax < bx + b.width && ax + a.width > bx && ay < by + b.height && ay + a.height > by;
  }

  function bulletBox(bullet) {
    return {
      x: bullet.x,
      y: bullet.y - bullet.height / 2,
      width: bullet.width,
      height: bullet.height,
    };
  }

  function getAliveAliens() {
    return aliens.filter((a) => a.alive);
  }

  function getFormationBounds() {
    const alive = getAliveAliens();
    if (alive.length === 0) return null;
    let minX = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const a of alive) {
      const ax = a.x + formation.x;
      const ay = a.y + formation.y;
      minX = Math.min(minX, ax);
      maxX = Math.max(maxX, ax + a.width);
      maxY = Math.max(maxY, ay + a.height);
    }
    return { minX, maxX, maxY };
  }

  function easeOutBack(t) {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2;
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function getNotchTransform(shootRecoil) {
    const { notch, shootRecoilMs, shootCompressPhase } = CONFIG.player;
    if (shootRecoil <= 0) return { slide: 0 };

    const progress = 1 - shootRecoil / shootRecoilMs;
    if (progress < shootCompressPhase) {
      const p = progress / shootCompressPhase;
      return { slide: lerp(0, notch.travel, p) };
    }

    const p = (progress - shootCompressPhase) / (1 - shootCompressPhase);
    const release = easeOutBack(p);
    const overshoot = notch.travel * 0.15 * Math.max(0, 1 - release);
    return { slide: Math.max(0, lerp(notch.travel, 0, release) - overshoot) };
  }

  function getPlayerNotchGeometry(shootRecoil) {
    const { width, height, notch } = CONFIG.player;
    const halfW = width / 2;
    const halfH = height / 2;
    const { slide } = getNotchTransform(shootRecoil);
    const apexY = player.y - halfH;
    const plungerTop = apexY - notch.protrusion + slide;
    const plungerBottom = plungerTop + notch.height;

    return {
      halfW,
      halfH,
      apexY,
      baseY: player.y + halfH,
      notchHalfW: notch.width / 2,
      plungerTop,
      plungerBottom,
      muzzleX: player.x,
      muzzleY: plungerTop,
    };
  }

  function getDefenseLineY() {
    if (player) return player.y - player.height;
    return CONFIG.canvas.height - CONFIG.player.yOffset - CONFIG.player.height;
  }

  function updatePlayer(dt) {
    if (!player || !player.visible) return;

    const half = player.width / 2;
    let moveDir = 0;
    if (keys.has('ArrowLeft') || keys.has('KeyA')) {
      player.x -= CONFIG.player.speed * (dt / 1000);
      moveDir = -1;
    }
    if (keys.has('ArrowRight') || keys.has('KeyD')) {
      player.x += CONFIG.player.speed * (dt / 1000);
      moveDir = 1;
    }
    player.x = Math.max(half + 4, Math.min(CONFIG.canvas.width - half - 4, player.x));

    if (moveDir !== 0) {
      player.moveTrailTimer -= dt;
      if (player.moveTrailTimer <= 0) {
        player.moveTrailTimer = CONFIG.player.moveTrail.intervalMs;
        const { baseY } = getPlayerNotchGeometry(player.shootRecoil);
        spawnGroundTrail(player.x, baseY, moveDir);
      }
    }

    if (player.fireCooldown > 0) player.fireCooldown -= dt;
    if (player.invincible > 0) player.invincible -= dt;
    if (player.shootRecoil > 0) player.shootRecoil = Math.max(0, player.shootRecoil - dt);

    if ((keys.has('Space') || keys.has('ArrowUp')) && !playerBullet && player.fireCooldown <= 0) {
      const { muzzleX, muzzleY } = getPlayerNotchGeometry(0);
      playerBullet = {
        x: muzzleX,
        y: muzzleY,
        width: CONFIG.projectile.width,
        height: CONFIG.projectile.height,
        friendly: true,
      };
      player.fireCooldown = CONFIG.player.fireCooldownMs;
      player.shootRecoil = CONFIG.player.shootRecoilMs;
      spawnParticles(muzzleX, muzzleY, CONFIG.effects.particleCount.shot, CONFIG.colors.playerThrust);
      sfxShoot();
    }
  }

  function updateFormation(dt) {
    const speed = getAlienSpeed();
    formation.stepTimer += dt;
    formation.animTimer += dt;

    if (formation.animTimer >= CONFIG.aliens.animIntervalMs) {
      formation.animTimer = 0;
      formation.animFrame = 1 - formation.animFrame;
    }

    const stepInterval = 600 / speed;
    if (formation.stepTimer < stepInterval) return;
    formation.stepTimer = 0;

    const bounds = getFormationBounds();
    if (!bounds) return;

    const margin = 8;
    const nextMinX = bounds.minX + formation.dir * 4;
    const nextMaxX = bounds.maxX + formation.dir * 4;

    if (nextMinX <= margin || nextMaxX >= CONFIG.canvas.width - margin) {
      formation.dir *= -1;
      formation.y += CONFIG.aliens.dropDistance;
      if (player && bounds.maxY + CONFIG.aliens.dropDistance >= getDefenseLineY()) {
        gameOver('The invaders reached your defenses.');
      }
    } else {
      formation.x += formation.dir * 4;
    }
  }

  function fireEnemyBullet() {
    if (enemyBullets.length >= CONFIG.projectile.maxEnemyBullets) return;
    const alive = getAliveAliens();
    if (alive.length === 0) return;

    const colMap = new Map();
    for (const a of alive) {
      const existing = colMap.get(a.col);
      if (!existing || a.row > existing.row) colMap.set(a.col, a);
    }

    const shooters = Array.from(colMap.values());
    const shooter = shooters[Math.floor(Math.random() * shooters.length)];
    enemyBullets.push({
      x: shooter.x + formation.x + shooter.width / 2,
      y: shooter.y + formation.y + shooter.height,
      width: CONFIG.projectile.width,
      height: CONFIG.projectile.height,
      friendly: false,
    });
    sfxEnemyShoot();
  }

  function updateEnemyFire(dt) {
    enemyFireTimer += dt;
    if (enemyFireTimer >= CONFIG.projectile.enemyFireIntervalMs) {
      enemyFireTimer = 0;
      if (Math.random() < CONFIG.projectile.enemyFireChance) fireEnemyBullet();
    }
  }

  function updateUfo(dt, now) {
    if (ufo) {
      if (!ufo.dying) {
        ufo.x += ufo.dir * CONFIG.ufo.speed * (dt / 1000);
        if (ufo.x < -CONFIG.ufo.width || ufo.x > CONFIG.canvas.width + CONFIG.ufo.width) {
          ufo = null;
        }
      }
      return;
    }

    if (now >= nextUfoSpawn && gameState === STATE.PLAYING) {
      const dir = Math.random() > 0.5 ? 1 : -1;
      ufo = {
        x: dir > 0 ? -CONFIG.ufo.width : CONFIG.canvas.width + CONFIG.ufo.width,
        y: CONFIG.ufo.y,
        width: CONFIG.ufo.width,
        height: CONFIG.ufo.height,
        dir,
        score: CONFIG.ufo.scores[Math.floor(Math.random() * CONFIG.ufo.scores.length)],
        flash: 0,
      };
      nextUfoSpawn = now + randomRange(CONFIG.ufo.minSpawnMs, CONFIG.ufo.maxSpawnMs);
      sfxUfo();
    }
  }

  function killAlien(alien) {
    alien.alive = false;
    alien.flash = CONFIG.effects.flashMs;
    const ax = alien.x + formation.x + alien.width / 2;
    const ay = alien.y + formation.y + alien.height / 2;
    score += alien.type.score;
    updateHud();
    spawnParticles(ax, ay, CONFIG.effects.particleCount.death);
    sfxDeath();
    triggerHitPause();
    triggerShake(CONFIG.effects.shakeAmplitude * 0.6);

    if (getAliveAliens().length === 0) victory();
  }

  function killUfo() {
    if (!ufo || ufo.dying) return;
    const pts = ufo.score;
    score += pts;
    updateHud();
    spawnParticles(ufo.x + ufo.width / 2, ufo.y + ufo.height / 2, CONFIG.effects.particleCount.ufoDeath);
    ufo.flash = CONFIG.effects.flashMs;
    ufo.dying = true;
    sfxDeath();
    triggerHitPause(CONFIG.effects.hitPauseMs * 1.5);
    triggerShake(CONFIG.effects.shakeAmplitude * 1.2);
  }

  function damagePlayer() {
    if (!player || player.invincible > 0 || !player.visible) return;
    lives -= 1;
    updateHud();
    player.invincible = CONFIG.player.invincibleMs;
    player.hitFlash = CONFIG.effects.flashMs;
    spawnParticles(player.x, player.y, CONFIG.effects.particleCount.death, CONFIG.colors.playerFlash);
    sfxPlayerHit();
    triggerHitPause(CONFIG.effects.playerHitPauseMs);
    triggerShake(CONFIG.effects.playerShakeAmplitude);

    if (lives <= 0) {
      player.visible = false;
      gameOver('You ran out of lives.');
    } else {
      player.visible = false;
      setTimeout(() => {
        if (gameState === STATE.PLAYING || gameState === STATE.SPAWNING) {
          player = createPlayer();
          player.invincible = CONFIG.player.invincibleMs;
          player.visible = true;
          enemyBullets = [];
        }
      }, CONFIG.timing.respawnDelayMs);
    }
  }

  function updateBullets(dt) {
    const dtSec = dt / 1000;

    if (playerBullet) {
      playerBullet.y -= CONFIG.projectile.playerSpeed * dtSec;
      if (playerBullet.y < 0) {
        playerBullet = null;
      } else if (bunkerCollision(playerBullet)) {
        playerBullet = null;
      } else {
        for (const alien of aliens) {
          if (!alien.alive) continue;
          const box = {
            x: alien.x + formation.x + alien.width / 2,
            y: alien.y + formation.y + alien.height / 2,
            width: alien.width,
            height: alien.height,
          };
          if (rectsOverlap(bulletBox(playerBullet), box)) {
            spawnParticles(playerBullet.x, playerBullet.y, CONFIG.effects.particleCount.hit);
            sfxHit();
            killAlien(alien);
            playerBullet = null;
            break;
          }
        }

        if (playerBullet && ufo) {
          const ufoBox = {
            x: ufo.x + ufo.width / 2,
            y: ufo.y + ufo.height / 2,
            width: ufo.width,
            height: ufo.height,
          };
          if (rectsOverlap(bulletBox(playerBullet), ufoBox)) {
            spawnParticles(playerBullet.x, playerBullet.y, CONFIG.effects.particleCount.hit);
            sfxHit();
            killUfo();
            playerBullet = null;
          }
        }
      }
    }

    enemyBullets = enemyBullets.filter((b) => {
      b.y += CONFIG.projectile.enemySpeed * dtSec;
      if (b.y > CONFIG.canvas.height) return false;
      if (bunkerCollision(b)) return false;

      if (player && player.visible && player.invincible <= 0) {
        const pBox = { x: player.x, y: player.y, width: player.width, height: player.height };
        if (rectsOverlap(bulletBox(b), pBox)) {
          damagePlayer();
          return false;
        }
      }
      return true;
    });
  }

  function update(dt, now) {
    if (gameState !== STATE.PLAYING && gameState !== STATE.SPAWNING) return;

    updateEffects(dt);
    if (hitPauseTimer > 0) {
      updateBassLoop(dt);
      return;
    }

    if (gameState === STATE.PLAYING) {
      updatePlayer(dt);
      updateFormation(dt);
      updateEnemyFire(dt);
      updateBullets(dt);
      updateUfo(dt, now);
      updateBassLoop(dt);
    }
  }

  // --- Drawing ---

  function drawBackground() {
    ctx.fillStyle = CONFIG.colors.background;
    ctx.fillRect(0, 0, CONFIG.canvas.width, CONFIG.canvas.height);

    ctx.strokeStyle = CONFIG.colors.playerLine;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, getDefenseLineY());
    ctx.lineTo(CONFIG.canvas.width, getDefenseLineY());
    ctx.stroke();
  }

  function drawPlayer() {
    if (!player || !player.visible) return;
    if (player.invincible > 0 && Math.floor(player.invincible / 100) % 2 === 0) return;

    const { x } = player;
    const color = player.hitFlash > 0 ? CONFIG.colors.playerFlash : CONFIG.colors.player;
    const {
      halfW,
      apexY,
      baseY,
      notchHalfW,
      plungerTop,
      plungerBottom,
    } = getPlayerNotchGeometry(player.shootRecoil);

    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.shadowColor = player.hitFlash > 0 ? CONFIG.colors.playerFlash : CONFIG.colors.playerGlow;
    ctx.shadowBlur = player.hitFlash > 0 ? 14 : 8;

    // Triangle body with flat apex built around the notch channel.
    ctx.beginPath();
    ctx.moveTo(x - halfW, baseY);
    ctx.lineTo(x - notchHalfW, apexY);
    ctx.lineTo(x + notchHalfW, apexY);
    ctx.lineTo(x + halfW, baseY);
    ctx.closePath();
    ctx.stroke();

    // Solid filled notch plunger built into the triangle top.
    const plungerLeft = x - notchHalfW;
    const plungerWidth = notchHalfW * 2;
    const plungerHeight = plungerBottom - plungerTop;

    ctx.fillStyle = color;
    ctx.fillRect(plungerLeft, plungerTop, plungerWidth, plungerHeight);

    ctx.shadowBlur = 0;
  }

  function drawAlien(alien) {
    const x = alien.x + formation.x;
    const y = alien.y + formation.y;
    const color = alien.flash > 0 ? CONFIG.colors.flash : CONFIG.colors.neon;
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.shadowColor = color;
    ctx.shadowBlur = alien.flash > 0 ? 14 : 4;

    const frame = formation.animFrame;
    const cx = x + alien.width / 2;
    const cy = y + alien.height / 2;

    if (alien.type.name === 'squid') {
      ctx.beginPath();
      ctx.moveTo(cx, y + 4);
      ctx.lineTo(x + 4, y + alien.height - 4);
      ctx.lineTo(x + alien.width - 4, y + alien.height - 4);
      ctx.closePath();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx - 8, y + 8);
      ctx.lineTo(cx - 12, y + 4);
      ctx.moveTo(cx + 8, y + 8);
      ctx.lineTo(cx + 12, y + 4);
      ctx.stroke();
    } else if (alien.type.name === 'crab') {
      ctx.strokeRect(x + 4, y + 6, alien.width - 8, alien.height - 10);
      const legOffset = frame ? 3 : -3;
      ctx.beginPath();
      ctx.moveTo(x + 4, y + alien.height - 6);
      ctx.lineTo(x - 4 + legOffset, y + alien.height);
      ctx.moveTo(x + alien.width - 4, y + alien.height - 6);
      ctx.lineTo(x + alien.width + 4 + legOffset, y + alien.height);
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.ellipse(cx, cy, alien.width / 2 - 2, alien.height / 2 - 2, 0, 0, Math.PI * 2);
      ctx.stroke();
      const tentacleY = y + alien.height - 6;
      for (let i = 0; i < 4; i += 1) {
        const tx = x + 6 + i * 7 + (frame ? 2 : 0);
        ctx.beginPath();
        ctx.moveTo(tx, tentacleY);
        ctx.lineTo(tx + (frame ? 2 : -2), y + alien.height);
        ctx.stroke();
      }
    }

    ctx.shadowBlur = 0;
  }

  function drawUfo() {
    if (!ufo) return;
    const color = ufo.flash > 0 ? CONFIG.colors.ufoFlash : CONFIG.colors.neon;
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.shadowColor = color;
    ctx.shadowBlur = ufo.flash > 0 ? 14 : 8;

    ctx.beginPath();
    ctx.ellipse(ufo.x + ufo.width / 2, ufo.y + ufo.height / 2, ufo.width / 2, ufo.height / 3, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(ufo.x + ufo.width / 2, ufo.y + 4, 8, Math.PI, 0);
    ctx.stroke();

    ctx.shadowBlur = 0;
  }

  function drawBunkers() {
    ctx.fillStyle = CONFIG.colors.player;
    ctx.shadowColor = CONFIG.colors.playerGlow;
    ctx.shadowBlur = 4;

    for (const bunker of bunkers) {
      const rows = bunker.mask.length;
      const cols = bunker.mask[0].length;
      for (let r = 0; r < rows; r += 1) {
        for (let c = 0; c < cols; c += 1) {
          if (bunker.mask[r][c]) {
            ctx.fillRect(
              bunker.x + c * bunker.cellSize,
              bunker.y + r * bunker.cellSize,
              bunker.cellSize,
              bunker.cellSize,
            );
          }
        }
      }
    }

    ctx.shadowBlur = 0;
  }

  function drawBullets() {
    ctx.shadowBlur = 6;

    if (playerBullet) {
      ctx.fillStyle = CONFIG.colors.player;
      ctx.shadowColor = CONFIG.colors.playerGlow;
      ctx.fillRect(
        playerBullet.x - playerBullet.width / 2,
        playerBullet.y - playerBullet.height,
        playerBullet.width,
        playerBullet.height,
      );
    }

    ctx.fillStyle = CONFIG.colors.neon;
    ctx.shadowColor = CONFIG.colors.neon;

    for (const b of enemyBullets) {
      ctx.fillRect(b.x - b.width / 2, b.y, b.width, b.height);
    }

    ctx.shadowBlur = 0;
  }

  function drawParticles(groundOnly = null) {
    for (const p of particles) {
      if (groundOnly === true && !p.ground) continue;
      if (groundOnly === false && p.ground) continue;

      const alpha = p.life / p.maxLife;
      if (p.color.startsWith('#')) {
        if (p.color === CONFIG.colors.player) {
          ctx.fillStyle = `rgba(20, 255, 170, ${alpha * 0.85})`;
        } else {
          ctx.fillStyle = `rgba(57, 255, 120, ${alpha})`;
        }
      } else {
        ctx.fillStyle = p.color;
      }
      ctx.fillRect(p.x, p.y, p.size, p.size);
    }
  }

  function render() {
    const shake = getShakeOffset();
    ctx.save();
    ctx.translate(shake.x, shake.y);

    drawBackground();
    drawBunkers();
    drawParticles(true);
    for (const alien of aliens) {
      if (alien.alive || alien.flash > 0) drawAlien(alien);
    }
    drawUfo();
    drawBullets();
    drawPlayer();
    drawParticles(false);

    ctx.restore();
  }

  function loop(now) {
    const dt = Math.min(now - lastTime, 50);
    lastTime = now;
    update(dt, now);
    render();
    requestAnimationFrame(loop);
  }

  // Initial state
  updateHud();
  requestAnimationFrame((now) => {
    lastTime = now;
    loop(now);
  });
})();
