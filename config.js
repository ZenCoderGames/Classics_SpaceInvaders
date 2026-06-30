const CONFIG = {
  canvas: {
    width: 640,
    height: 540,
  },

  colors: {
    neon: '#39ff78',
    neonDim: 'rgba(57, 255, 120, 0.55)',
    neonFaint: 'rgba(57, 255, 120, 0.25)',
    background: '#020504',
    flash: '#ffffff',
    playerFlash: '#ff3b5c',
    ufoFlash: '#ffdc50',
    player: '#14ffaa',
    playerGlow: 'rgba(20, 255, 170, 0.55)',
    playerLine: 'rgba(20, 255, 170, 0.5)',
    playerThrust: 'rgba(20, 255, 170, 0.65)',
    particle: '#39ff14',
    particleBright: '#b8ff9e',
  },

  player: {
    width: 36,
    height: 20,
    speed: 280,
    yOffset: 20,
    lives: 3,
    fireCooldownMs: 250,
    invincibleMs: 2000,
    notch: {
      width: 9,
      height: 10,
      protrusion: 5,
      travel: 5,
    },
    shootRecoilMs: 140,
    shootCompressPhase: 0.32,
    moveTrail: {
      intervalMs: 45,
      particleCount: 2,
      lifeMs: 320,
      speed: 55,
      spread: 12,
    },
  },

  projectile: {
    width: 3,
    height: 12,
    playerSpeed: 420,
    enemySpeed: 220,
    maxEnemyBullets: 3,
    enemyFireIntervalMs: 1000,
    enemyFireChance: 0.5,
  },

  aliens: {
    rows: 5,
    cols: 11,
    width: 32,
    height: 24,
    hGap: 14,
    vGap: 14,
    startX: 48,
    startY: 56,
    baseSpeed: 5,
    maxSpeed: 40,
    dropDistance: 6,
    animIntervalMs: 480,
    types: [
      { name: 'squid', score: 30, rows: [0] },
      { name: 'crab', score: 20, rows: [1, 2] },
      { name: 'octopus', score: 10, rows: [3, 4] },
    ],
  },

  ufo: {
    width: 48,
    height: 20,
    y: 28,
    speed: 90,
    minSpawnMs: 8000,
    maxSpawnMs: 18000,
    scores: [50, 100, 150, 200, 300],
  },

  bunkers: {
    count: 4,
    width: 56,
    height: 40,
    yOffset: 120,
    marginX: 72,
    cellSize: 2,
    damageRadius: 4,
  },

  scoring: {
    waveBonus: 500,
  },

  effects: {
    hitPauseMs: 80,
    playerHitPauseMs: 120,
    flashMs: 100,
    shakeDurationMs: 220,
    shakeAmplitude: 5,
    playerShakeAmplitude: 7,
    particleCount: {
      spawn: 12,
      shot: 4,
      hit: 10,
      death: 18,
      bunkerHit: 6,
      ufoDeath: 24,
    },
    particleLifeMs: 420,
    particleSpeed: 180,
  },

  audio: {
    enabled: true,
    masterVolume: 0.35,
    bassNotes: [110, 98, 87, 78],
    bassMinIntervalMs: 420,
    bassMaxIntervalMs: 900,
    bassNoteDuration: 0.18,
  },

  timing: {
    spawnDelayMs: 600,
    respawnDelayMs: 1500,
  },
};
