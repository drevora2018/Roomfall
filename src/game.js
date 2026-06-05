import { ENEMIES } from "./config/enemies.js";
import { GAME_CONSTANTS } from "./config/constants.js";
import { BUFFS, PERKS } from "./config/perks.js";
import { SKILL_TREE } from "./config/skills.js";
import { WEAPONS } from "./config/weapons.js";
import { AudioManager } from "./systems/audio.js";
import { generateRoom } from "./systems/roomGenerator.js";
import { createRng, deriveSeed } from "./systems/rng.js";
import { getCompanionScalar, getEnemyScalars, getPlayerRoomScalars, describeScalingMath } from "./systems/scaling.js";
import { applyShopPurchase, createShopState, getRerollCost } from "./systems/shop.js";
import { buySkill, canBuySkill, getAggregatedSkillEffects, getSkillLevel } from "./systems/skills.js";
import {
  clearMetaSave,
  clearRunSave,
  createDefaultMetaSave,
  loadMetaSave,
  loadRunSave,
  saveMetaSave,
  saveRunSave,
} from "./systems/storage.js";
import { clamp, distance, normalize } from "./systems/utils.js";

function withCenter(cell) {
  return { x: cell.x + 0.5, y: cell.y + 0.5 };
}

function angleFromTo(from, to) {
  return Math.atan2(to.y - from.y, to.x - from.x);
}

function getBuffTotals(buffIds) {
  return buffIds.reduce(
    (totals, id) => {
      const buff = BUFFS[id];
      if (!buff) {
        return totals;
      }
      for (const [key, value] of Object.entries(buff.effect)) {
        totals[key] = (totals[key] ?? 0) + value;
      }
      return totals;
    },
    {
      damageMultiplier: 0,
      fireRateMultiplier: 0,
      flatHp: 0,
      goldMultiplier: 0,
      flatSpeed: 0,
    },
  );
}

function hasPerk(perkIds, perkId) {
  return perkIds.includes(perkId);
}

export class Game {
  constructor({ canvas, ui, storage }) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.ui = ui;
    this.storage = storage;
    this.audio = new AudioManager();
    this.metaSave = loadMetaSave(storage);
    this.runSave = loadRunSave(storage);
    this.run = null;
    this.player = null;
    this.companion = null;
    this.room = null;
    this.enemies = [];
    this.projectiles = [];
    this.enemyProjectiles = [];
    this.notification = "";
    this.notificationUntil = 0;
    this.input = {
      up: false,
      down: false,
      left: false,
      right: false,
      firing: false,
      mouseX: 0,
      mouseY: 0,
    };
    this.overlay = "menu";
    this.hubTab = "shop";
    this.lastTime = 0;
    this.pauseOrigin = "playing";
    this.betweenRooms = false;
    this.roomQueued = false;
    this.gameOverSummary = "";
    this.renderInfo = {
      scale: 1,
      offsetX: 0,
      offsetY: 0,
    };
  }

  init() {
    this.audio.setMuted(this.metaSave.settings.muted);
    this.resize();
    this.bindInput();
    this.ui.render(this.getViewModel());
    window.requestAnimationFrame((time) => this.frame(time));
  }

  bindInput() {
    const onPointerDown = async () => {
      this.input.firing = true;
      await this.audio.unlock();
    };
    window.addEventListener("resize", () => this.resize());
    window.addEventListener("blur", () => {
      this.input.firing = false;
      if (this.overlay === null && this.run) {
        this.openPause();
      }
    });
    window.addEventListener("mousemove", (event) => {
      const rect = this.canvas.getBoundingClientRect();
      this.input.mouseX = event.clientX - rect.left;
      this.input.mouseY = event.clientY - rect.top;
    });
    window.addEventListener("mousedown", onPointerDown);
    window.addEventListener("mouseup", () => {
      this.input.firing = false;
    });
    window.addEventListener("keydown", async (event) => {
      if (event.code === "KeyW") this.input.up = true;
      if (event.code === "KeyS") this.input.down = true;
      if (event.code === "KeyA") this.input.left = true;
      if (event.code === "KeyD") this.input.right = true;
      if (event.code === "Tab") {
        event.preventDefault();
        await this.audio.unlock();
        if (this.overlay === "hub") {
          this.closeHub();
        } else {
          this.openHub("shop");
        }
      }
      if (event.code === "Escape") {
        event.preventDefault();
        await this.audio.unlock();
        if (this.overlay === "pause") {
          this.resume();
        } else {
          this.openPause();
        }
      }
    });
    window.addEventListener("keyup", (event) => {
      if (event.code === "KeyW") this.input.up = false;
      if (event.code === "KeyS") this.input.down = false;
      if (event.code === "KeyA") this.input.left = false;
      if (event.code === "KeyD") this.input.right = false;
    });
  }

  resize() {
    const ratio = window.devicePixelRatio || 1;
    const width = Math.floor(window.innerWidth * ratio);
    const height = Math.floor(window.innerHeight * ratio);
    this.canvas.width = width;
    this.canvas.height = height;
    this.canvas.style.width = `${window.innerWidth}px`;
    this.canvas.style.height = `${window.innerHeight}px`;
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.scale(ratio, ratio);
  }

  frame(time) {
    const delta = Math.min(0.033, (time - this.lastTime) / 1000 || 0);
    this.lastTime = time;
    this.update(time / 1000, delta);
    this.render(time / 1000);
    this.ui.render(this.getViewModel());
    window.requestAnimationFrame((next) => this.frame(next));
  }

  startNewRun() {
    this.metaSave = loadMetaSave(this.storage);
    const seed = Date.now();
    this.run = {
      seed,
      roomIndex: 1,
      gold: GAME_CONSTANTS.startGold,
      currentWeaponId: "pistol",
      ownedPerks: [],
      ownedBuffs: [],
      shopState: createShopState({
        seed,
        roomIndex: 1,
        rerolls: 0,
        currentWeaponId: "pistol",
        ownedPerks: [],
      }),
      bossProgress: 0,
    };
    this.player = {
      x: 0,
      y: 0,
      radius: 0.34,
      hp: GAME_CONSTANTS.basePlayerHp,
      maxHp: GAME_CONSTANTS.basePlayerHp,
      fireCooldown: 0,
      invuln: 0,
      angle: 0,
      goldMultiplier: 1,
      moveSpeed: GAME_CONSTANTS.basePlayerSpeed,
      damageMultiplier: 1,
      fireRateMultiplier: 1,
    };
    this.projectiles = [];
    this.enemyProjectiles = [];
    this.enemies = [];
    this.betweenRooms = false;
    this.gameOverSummary = "";
    this.notification = "Run started.";
    this.notificationUntil = performance.now() / 1000 + 2;
    this.enterRoom(1, false, null, this.run.shopState);
    clearRunSave(this.storage);
    this.overlay = null;
  }

  continueRun() {
    const saved = loadRunSave(this.storage);
    if (!saved.seed) {
      return;
    }
    this.metaSave = loadMetaSave(this.storage);
    this.run = {
      seed: saved.seed,
      roomIndex: saved.roomIndex,
      gold: saved.gold,
      currentWeaponId: saved.currentWeaponId,
      ownedPerks: saved.ownedPerks,
      ownedBuffs: saved.ownedBuffs,
      shopState: saved.shopState,
      bossProgress: saved.bossProgress,
    };
    this.player = {
      x: 0,
      y: 0,
      radius: 0.34,
      hp: saved.playerSnapshot?.hp ?? GAME_CONSTANTS.basePlayerHp,
      maxHp: saved.playerSnapshot?.maxHp ?? GAME_CONSTANTS.basePlayerHp,
      fireCooldown: 0,
      invuln: 0,
      angle: 0,
      goldMultiplier: 1,
      moveSpeed: GAME_CONSTANTS.basePlayerSpeed,
      damageMultiplier: 1,
      fireRateMultiplier: 1,
    };
    this.projectiles = [];
    this.enemyProjectiles = [];
    this.enemies = [];
    this.betweenRooms = false;
    this.enterRoom(this.run.roomIndex, true, saved.playerSnapshot, saved.shopState);
    this.notification = `Continued at room ${this.run.roomIndex}.`;
    this.notificationUntil = performance.now() / 1000 + 2;
    this.overlay = null;
  }

  returnToMenu() {
    this.overlay = "menu";
  }

  openHub(tab = "shop") {
    if (!this.run || this.overlay === "gameOver" || this.overlay === "menu") {
      return;
    }
    this.hubTab = tab;
    this.overlay = "hub";
  }

  closeHub() {
    if (this.betweenRooms) {
      return;
    }
    if (this.overlay === "hub") {
      this.overlay = null;
    }
  }

  openPause() {
    if (!this.run || this.overlay === "menu" || this.overlay === "gameOver") {
      return;
    }
    this.pauseOrigin = this.overlay === "hub" ? "hub" : "playing";
    this.overlay = "pause";
  }

  resume() {
    if (this.overlay !== "pause") {
      return;
    }
    this.overlay = this.pauseOrigin === "hub" ? "hub" : null;
  }

  continueToNextRoom() {
    if (!this.betweenRooms || !this.run) {
      return;
    }
    this.betweenRooms = false;
    this.enterRoom(this.run.roomIndex, false, { hp: this.player.hp, maxHp: this.player.maxHp }, this.run.shopState);
    this.overlay = null;
  }

  resetMetaProgress() {
    clearMetaSave(this.storage);
    this.metaSave = createDefaultMetaSave();
    saveMetaSave(this.storage, this.metaSave);
    if (this.run) {
      this.refreshPlayerStats(true);
      this.spawnCompanion();
      if (this.betweenRooms) {
        this.persistRunBoundary();
      }
    }
    this.notification = "Meta progress reset.";
    this.notificationUntil = performance.now() / 1000 + 2;
  }

  toggleAudio() {
    this.metaSave = {
      ...this.metaSave,
      settings: {
        ...this.metaSave.settings,
        muted: !this.metaSave.settings.muted,
      },
    };
    this.audio.setMuted(this.metaSave.settings.muted);
    saveMetaSave(this.storage, this.metaSave);
  }

  buyOffer(index) {
    if (!this.run?.shopState) {
      return;
    }
    const offer = this.run.shopState.offers[index];
    if (!offer || offer.purchased) {
      return;
    }
    const result = applyShopPurchase(this.run, offer);
    if (!result.ok) {
      this.notification = result.reason;
      this.notificationUntil = performance.now() / 1000 + 1.5;
      return;
    }
    this.run = {
      ...this.run,
      ...result.runState,
      shopState: {
        ...this.run.shopState,
        offers: this.run.shopState.offers.map((entry, offerIndex) =>
          offerIndex === index ? { ...entry, purchased: true } : entry,
        ),
      },
    };
    this.refreshPlayerStats(true);
    if (this.betweenRooms) {
      this.persistRunBoundary();
    }
    this.notification = `${offer.name} acquired.`;
    this.notificationUntil = performance.now() / 1000 + 1.4;
    this.audio.beep({ frequency: 660, duration: 0.1, gain: 0.035 });
  }

  rerollShop() {
    if (!this.run?.shopState) {
      return;
    }
    const cost = getRerollCost(this.run.shopState.rerolls);
    if (this.run.gold < cost) {
      this.notification = "Not enough Gold to reroll.";
      this.notificationUntil = performance.now() / 1000 + 1.2;
      return;
    }
    const rerolls = this.run.shopState.rerolls + 1;
    this.run.gold -= cost;
    this.run.shopState = createShopState({
      seed: this.run.seed,
      roomIndex: this.run.roomIndex,
      rerolls,
      currentWeaponId: this.run.currentWeaponId,
      ownedPerks: this.run.ownedPerks,
    });
    if (this.betweenRooms) {
      this.persistRunBoundary();
    }
    this.notification = "Shop rerolled.";
    this.notificationUntil = performance.now() / 1000 + 1.2;
    this.audio.beep({ frequency: 520, duration: 0.08, gain: 0.03 });
  }

  buySkill(skillId) {
    const result = buySkill(this.metaSave, skillId);
    if (!result.ok) {
      this.notification = result.reason;
      this.notificationUntil = performance.now() / 1000 + 1.2;
      return;
    }
    this.metaSave = result.metaSave;
    saveMetaSave(this.storage, this.metaSave);
    this.refreshPlayerStats(true);
    if (this.betweenRooms) {
      this.persistRunBoundary();
    }
    this.notification = "Skill unlocked.";
    this.notificationUntil = performance.now() / 1000 + 1.2;
    this.audio.beep({ frequency: 720, duration: 0.11, gain: 0.035 });
  }

  enterRoom(roomIndex, fromContinue, playerSnapshot = null, shopState = null) {
    this.room = generateRoom({
      seed: this.run.seed,
      roomIndex,
      isBoss: roomIndex % 5 === 0,
    });
    const spawn = withCenter(this.room.spawn);
    this.player.x = spawn.x;
    this.player.y = spawn.y;
    this.projectiles = [];
    this.enemyProjectiles = [];
    this.refreshPlayerStats(true);
    if (playerSnapshot) {
      const ratio = playerSnapshot.maxHp ? playerSnapshot.hp / playerSnapshot.maxHp : 1;
      this.player.hp = clamp(this.player.maxHp * ratio + (fromContinue ? GAME_CONSTANTS.continueRoomGraceHeal : 0), 1, this.player.maxHp);
    } else {
      this.player.hp = this.player.maxHp;
    }
    this.player.invuln = 0.6;
    this.spawnEnemies();
    this.spawnCompanion();
    this.run.shopState =
      shopState ??
      createShopState({
        seed: this.run.seed,
        roomIndex: this.run.roomIndex,
        rerolls: 0,
        currentWeaponId: this.run.currentWeaponId,
        ownedPerks: this.run.ownedPerks,
      });
  }

  spawnCompanion() {
    const skillEffects = getAggregatedSkillEffects(this.metaSave.unlockedSkills);
    if (!skillEffects.unlockCompanion) {
      this.companion = null;
      return;
    }
    const scalar = getCompanionScalar(this.run.roomIndex) * (1 + skillEffects.companionPower);
    this.companion = {
      x: this.player.x + GAME_CONSTANTS.companionOrbitRadius,
      y: this.player.y,
      radius: 0.2,
      orbitAngle: 0,
      hp: GAME_CONSTANTS.companionMaxHp * scalar,
      maxHp: GAME_CONSTANTS.companionMaxHp * scalar,
      fireCooldown: 0.25,
      damage: GAME_CONSTANTS.companionBaseDamage * scalar,
      fireInterval: GAME_CONSTANTS.companionBaseFireInterval / (1 + skillEffects.companionUplink),
      active: true,
    };
  }

  spawnEnemies() {
    const scalars = getEnemyScalars(this.run.roomIndex);
    const rng = createRng(deriveSeed(this.run.seed, "enemies", this.run.roomIndex));
    if (this.room.isBoss) {
      this.enemies = [this.createEnemy("boss", this.room.enemySpawns[0] ?? { x: this.room.width - 3, y: this.room.height / 2 }, false, scalars)];
      return;
    }

    const count = clamp(3 + Math.floor(this.run.roomIndex * 0.9), 3, Math.min(this.room.enemySpawns.length, 10));
    const types = ["chaser", "spitter", "charger"];
    this.enemies = [];
    for (let index = 0; index < count; index += 1) {
      const cell = this.room.enemySpawns[index % this.room.enemySpawns.length];
      const type = types[index % types.length];
      const elite = this.run.roomIndex >= GAME_CONSTANTS.eliteChanceFloor && rng.next() < 0.16 + this.run.roomIndex * 0.01;
      this.enemies.push(this.createEnemy(type, cell, elite, scalars));
    }
  }

  createEnemy(type, cell, elite, scalars) {
    const template = ENEMIES[type];
    const position = withCenter(cell);
    const eliteFactor = elite ? 1.55 : 1;
    const milestonePatterns = Math.max(0, Math.floor(this.run.roomIndex / 5) - 1);
    return {
      ...template,
      x: position.x,
      y: position.y,
      hp: template.maxHp * scalars.hp * eliteFactor,
      maxHp: template.maxHp * scalars.hp * eliteFactor,
      damageValue: template.damage * scalars.damage * eliteFactor,
      moveVelocity: template.moveSpeed * scalars.speed * (elite ? 1.08 : 1),
      cooldown: createRng(deriveSeed(this.run.seed, type, position.x, position.y)).float(0.2, 0.9),
      touchCooldown: 0,
      elite,
      windupRemaining: 0,
      dashRemaining: 0,
      dashVector: { x: 0, y: 0 },
      patternLevel: type === "boss" ? milestonePatterns : 0,
    };
  }

  refreshPlayerStats(preserveRatio) {
    if (!this.player || !this.run) {
      return;
    }
    const currentRatio = this.player.maxHp ? this.player.hp / this.player.maxHp : 1;
    const roomScalars = getPlayerRoomScalars(this.run.roomIndex);
    const skillEffects = getAggregatedSkillEffects(this.metaSave.unlockedSkills);
    const buffEffects = getBuffTotals(this.run.ownedBuffs);
    const fireRateBonus = skillEffects.fireRateMultiplier + buffEffects.fireRateMultiplier + (hasPerk(this.run.ownedPerks, "glassDynamo") ? 0.14 : 0);
    const damageBonus = skillEffects.damageMultiplier + buffEffects.damageMultiplier;
    const flatHpBonus = buffEffects.flatHp + (hasPerk(this.run.ownedPerks, "glassDynamo") ? -10 : 0);
    const flatSpeedBonus = skillEffects.flatSpeed + buffEffects.flatSpeed;
    const goldBonus = skillEffects.goldMultiplier + buffEffects.goldMultiplier;

    this.player.maxHp = GAME_CONSTANTS.basePlayerHp * roomScalars.hp + flatHpBonus;
    this.player.moveSpeed = GAME_CONSTANTS.basePlayerSpeed + flatSpeedBonus;
    this.player.damageMultiplier = roomScalars.damage * (1 + damageBonus);
    this.player.fireRateMultiplier = roomScalars.fireRate * (1 + fireRateBonus);
    this.player.goldMultiplier = 1 + goldBonus;
    this.player.hp = preserveRatio ? clamp(this.player.maxHp * currentRatio, 1, this.player.maxHp) : clamp(this.player.hp, 1, this.player.maxHp);
  }

  update(now, delta) {
    if (this.notification && now > this.notificationUntil) {
      this.notification = "";
    }
    if (!this.run || this.overlay !== null || this.betweenRooms) {
      return;
    }

    this.player.fireCooldown = Math.max(0, this.player.fireCooldown - delta);
    this.player.invuln = Math.max(0, this.player.invuln - delta);
    this.movePlayer(delta);
    this.updateCompanion(delta);
    this.player.angle = this.getAimAngle();

    if (this.input.firing) {
      this.fireWeapon();
    }

    this.updateProjectiles(delta);
    this.updateEnemies(delta);
    this.updateEnemyProjectiles(delta);

    if (this.enemies.length === 0) {
      this.handleRoomClear();
    }
  }

  movePlayer(delta) {
    const horizontal = Number(this.input.right) - Number(this.input.left);
    const vertical = Number(this.input.down) - Number(this.input.up);
    const direction = normalize(horizontal, vertical);
    const nextX = this.player.x + direction.x * this.player.moveSpeed * delta;
    const nextY = this.player.y + direction.y * this.player.moveSpeed * delta;
    if (horizontal !== 0 || vertical !== 0) {
      this.tryMoveEntity(this.player, nextX, nextY);
    }
  }

  updateCompanion(delta) {
    if (!this.companion?.active) {
      return;
    }
    this.companion.orbitAngle += delta * 2.2;
    const desired = {
      x: this.player.x + Math.cos(this.companion.orbitAngle) * GAME_CONSTANTS.companionOrbitRadius,
      y: this.player.y + Math.sin(this.companion.orbitAngle) * GAME_CONSTANTS.companionOrbitRadius,
    };
    this.companion.x += (desired.x - this.companion.x) * Math.min(1, delta * 8);
    this.companion.y += (desired.y - this.companion.y) * Math.min(1, delta * 8);
    this.companion.fireCooldown = Math.max(0, this.companion.fireCooldown - delta);

    const target = this.findNearestEnemy(this.companion, 8);
    if (target && this.companion.fireCooldown <= 0) {
      const direction = normalize(target.x - this.companion.x, target.y - this.companion.y);
      this.projectiles.push({
        x: this.companion.x,
        y: this.companion.y,
        vx: direction.x * 9.4,
        vy: direction.y * 9.4,
        radius: 0.1,
        damage: this.companion.damage,
        color: "#a8ffe7",
        lifetime: GAME_CONSTANTS.projectileLifetime,
        owner: "player",
      });
      this.companion.fireCooldown = this.companion.fireInterval;
    }
  }

  fireWeapon() {
    const weapon = WEAPONS[this.run.currentWeaponId];
    if (this.player.fireCooldown > 0) {
      return;
    }
    for (let pellet = 0; pellet < weapon.pellets; pellet += 1) {
      const spread = weapon.pellets === 1 ? 0 : (pellet - (weapon.pellets - 1) / 2) * (weapon.spread / Math.max(1, weapon.pellets - 1));
      const angle = this.player.angle + spread;
      this.projectiles.push({
        x: this.player.x + Math.cos(angle) * 0.45,
        y: this.player.y + Math.sin(angle) * 0.45,
        vx: Math.cos(angle) * weapon.projectileSpeed,
        vy: Math.sin(angle) * weapon.projectileSpeed,
        radius: weapon.projectileRadius,
        damage: weapon.damage,
        color: weapon.color,
        lifetime: GAME_CONSTANTS.projectileLifetime,
        owner: "player",
      });
    }

    this.player.fireCooldown = weapon.fireInterval / this.player.fireRateMultiplier;
    this.audio.beep({ frequency: weapon.id === "shotgun" ? 180 : weapon.id === "smg" ? 320 : 260, duration: 0.05, gain: 0.022, type: "square" });
  }

  updateProjectiles(delta) {
    this.projectiles = this.projectiles.filter((projectile) => {
      projectile.x += projectile.vx * delta;
      projectile.y += projectile.vy * delta;
      projectile.lifetime -= delta;
      if (projectile.lifetime <= 0 || !this.isWalkable(projectile.x, projectile.y, projectile.radius)) {
        return false;
      }

      const target = this.enemies.find((enemy) => distance(enemy, projectile) <= enemy.radius + projectile.radius);
      if (!target) {
        return true;
      }
      target.hp -= projectile.damage * this.getDamageMultiplierAgainst(target);
      if (target.hp <= 0) {
        this.killEnemy(target);
      }
      this.audio.beep({ frequency: 540, duration: 0.03, gain: 0.016 });
      return false;
    });
  }

  updateEnemyProjectiles(delta) {
    this.enemyProjectiles = this.enemyProjectiles.filter((projectile) => {
      projectile.x += projectile.vx * delta;
      projectile.y += projectile.vy * delta;
      projectile.lifetime -= delta;
      if (projectile.lifetime <= 0 || !this.isWalkable(projectile.x, projectile.y, projectile.radius)) {
        return false;
      }

      if (this.companion?.active && distance(this.companion, projectile) <= this.companion.radius + projectile.radius) {
        this.companion.hp -= projectile.damage;
        if (this.companion.hp <= 0) {
          this.companion.active = false;
        }
        return false;
      }

      if (distance(this.player, projectile) <= this.player.radius + projectile.radius) {
        this.damagePlayer(projectile.damage);
        return false;
      }
      return true;
    });
  }

  updateEnemies(delta) {
    for (const enemy of this.enemies) {
      enemy.cooldown = Math.max(0, enemy.cooldown - delta);
      enemy.touchCooldown = Math.max(0, enemy.touchCooldown - delta);
      if (enemy.ai === "chaser") {
        this.updateChaser(enemy, delta);
      }
      if (enemy.ai === "spitter") {
        this.updateSpitter(enemy, delta);
      }
      if (enemy.ai === "charger") {
        this.updateCharger(enemy, delta);
      }
      if (enemy.ai === "boss") {
        this.updateBoss(enemy, delta);
      }
      if (distance(enemy, this.player) <= enemy.radius + this.player.radius && enemy.touchCooldown <= 0) {
        this.damagePlayer(enemy.damageValue);
        enemy.touchCooldown = GAME_CONSTANTS.enemyContactCooldown;
      }
    }
    this.enemies = this.enemies.filter((enemy) => enemy.hp > 0);
  }

  updateChaser(enemy, delta) {
    const direction = normalize(this.player.x - enemy.x, this.player.y - enemy.y);
    this.tryMoveEntity(enemy, enemy.x + direction.x * enemy.moveVelocity * delta, enemy.y + direction.y * enemy.moveVelocity * delta);
  }

  updateSpitter(enemy, delta) {
    const dist = distance(enemy, this.player);
    const direction = normalize(this.player.x - enemy.x, this.player.y - enemy.y);
    if (dist > 6.5) {
      this.tryMoveEntity(enemy, enemy.x + direction.x * enemy.moveVelocity * delta, enemy.y + direction.y * enemy.moveVelocity * delta);
    } else if (dist < 4.5) {
      this.tryMoveEntity(enemy, enemy.x - direction.x * enemy.moveVelocity * delta, enemy.y - direction.y * enemy.moveVelocity * delta);
    }
    if (enemy.cooldown <= 0) {
      this.enemyProjectiles.push({
        x: enemy.x,
        y: enemy.y,
        vx: direction.x * enemy.projectileSpeed,
        vy: direction.y * enemy.projectileSpeed,
        radius: 0.12,
        damage: enemy.damageValue,
        lifetime: GAME_CONSTANTS.projectileLifetime,
      });
      enemy.cooldown = enemy.fireInterval;
    }
  }

  updateCharger(enemy, delta) {
    const direction = normalize(this.player.x - enemy.x, this.player.y - enemy.y);
    const dist = distance(enemy, this.player);
    if (enemy.dashRemaining > 0) {
      this.tryMoveEntity(
        enemy,
        enemy.x + enemy.dashVector.x * enemy.dashRemaining * delta,
        enemy.y + enemy.dashVector.y * enemy.dashRemaining * delta,
      );
      enemy.dashRemaining = Math.max(0, enemy.dashRemaining - delta * 6);
      return;
    }
    if (enemy.windupRemaining > 0) {
      enemy.windupRemaining = Math.max(0, enemy.windupRemaining - delta);
      if (enemy.windupRemaining === 0) {
        enemy.dashRemaining = enemy.dashSpeed;
        enemy.dashVector = direction;
      }
      return;
    }
    if (dist < 5.5 && enemy.cooldown <= 0) {
      enemy.windupRemaining = enemy.windup;
      enemy.cooldown = 2.8;
      return;
    }
    this.tryMoveEntity(enemy, enemy.x + direction.x * enemy.moveVelocity * delta, enemy.y + direction.y * enemy.moveVelocity * delta);
  }

  updateBoss(enemy, delta) {
    const direction = normalize(this.player.x - enemy.x, this.player.y - enemy.y);
    const strafe = { x: -direction.y, y: direction.x };
    this.tryMoveEntity(
      enemy,
      enemy.x + (direction.x * 0.45 + strafe.x * Math.sin(performance.now() / 900)) * enemy.moveVelocity * delta,
      enemy.y + (direction.y * 0.45 + strafe.y * Math.sin(performance.now() / 900)) * enemy.moveVelocity * delta,
    );

    if (enemy.cooldown <= 0) {
      const bulletCount = 5 + enemy.patternLevel * 2;
      for (let index = 0; index < bulletCount; index += 1) {
        const offset = ((index / bulletCount) - 0.5) * 0.9;
        const angle = angleFromTo(enemy, this.player) + offset;
        this.enemyProjectiles.push({
          x: enemy.x,
          y: enemy.y,
          vx: Math.cos(angle) * enemy.projectileSpeed,
          vy: Math.sin(angle) * enemy.projectileSpeed,
          radius: 0.16,
          damage: enemy.damageValue,
          lifetime: GAME_CONSTANTS.projectileLifetime + 0.4,
        });
      }
      if (enemy.patternLevel >= 1) {
        for (let index = 0; index < 8; index += 1) {
          const angle = (Math.PI * 2 * index) / 8;
          this.enemyProjectiles.push({
            x: enemy.x,
            y: enemy.y,
            vx: Math.cos(angle) * (enemy.projectileSpeed - 1),
            vy: Math.sin(angle) * (enemy.projectileSpeed - 1),
            radius: 0.12,
            damage: enemy.damageValue * 0.85,
            lifetime: GAME_CONSTANTS.projectileLifetime + 0.2,
          });
        }
      }
      enemy.cooldown = Math.max(0.75, enemy.fireInterval - enemy.patternLevel * 0.08);
    }
  }

  tryMoveEntity(entity, nextX, nextY) {
    if (this.isWalkable(nextX, entity.y, entity.radius)) {
      entity.x = nextX;
    }
    if (this.isWalkable(entity.x, nextY, entity.radius)) {
      entity.y = nextY;
    }
  }

  isWalkable(x, y, radius) {
    const samples = [
      [0, 0],
      [radius, 0],
      [-radius, 0],
      [0, radius],
      [0, -radius],
      [radius * 0.7, radius * 0.7],
      [-radius * 0.7, radius * 0.7],
      [radius * 0.7, -radius * 0.7],
      [-radius * 0.7, -radius * 0.7],
    ];
    return samples.every(([dx, dy]) => {
      const tileX = Math.floor(x + dx);
      const tileY = Math.floor(y + dy);
      return (
        tileY >= 0 &&
        tileY < this.room.height &&
        tileX >= 0 &&
        tileX < this.room.width &&
        this.room.mask[tileY][tileX] === 1 &&
        this.room.blocked[tileY][tileX] === 0
      );
    });
  }

  damagePlayer(amount) {
    if (this.player.invuln > 0) {
      return;
    }
    this.player.hp -= amount;
    this.player.invuln = GAME_CONSTANTS.basePlayerInvuln;
    this.audio.beep({ frequency: 110, duration: 0.08, gain: 0.04, type: "sawtooth" });
    if (this.player.hp <= 0) {
      this.handleGameOver();
    }
  }

  handleGameOver() {
    if (!this.run) {
      return;
    }
    this.metaSave.highScore = Math.max(this.metaSave.highScore, this.run.roomIndex - 1);
    saveMetaSave(this.storage, this.metaSave);
    clearRunSave(this.storage);
    this.gameOverSummary = `Reached room ${this.run.roomIndex} with ${this.run.gold} Gold banked in the run. High score: room ${this.metaSave.highScore}.`;
    this.overlay = "gameOver";
    this.run = null;
    this.room = null;
    this.enemies = [];
    this.projectiles = [];
    this.enemyProjectiles = [];
    this.companion = null;
  }

  killEnemy(enemy) {
    const index = this.enemies.indexOf(enemy);
    if (index === -1) {
      return;
    }
    const goldBonus = enemy.id === "boss" && hasPerk(this.run.ownedPerks, "bossBounty") ? 1.25 : 1;
    this.run.gold += Math.round(enemy.rewardGold * this.player.goldMultiplier * goldBonus * (enemy.elite ? 1.2 : 1));
    this.enemies.splice(index, 1);
    this.audio.beep({ frequency: enemy.ai === "boss" ? 220 : 480, duration: enemy.ai === "boss" ? 0.12 : 0.05, gain: 0.03 });
  }

  handleRoomClear() {
    if (this.betweenRooms || !this.run) {
      return;
    }
    const clearedRoom = this.run.roomIndex;
    const shardReward = GAME_CONSTANTS.roomClearShardReward + (this.room.isBoss ? GAME_CONSTANTS.bossShardBonus : 0);
    const roomGold = Math.round(GAME_CONSTANTS.roomClearGoldBonus * this.player.goldMultiplier);
    this.run.gold += roomGold;
    this.metaSave.skillShards += shardReward;
    this.metaSave.highScore = Math.max(this.metaSave.highScore, clearedRoom);
    if (hasPerk(this.run.ownedPerks, "killSwitch")) {
      this.player.hp = Math.min(this.player.maxHp, this.player.hp + 12);
    } else {
      this.player.hp = Math.min(this.player.maxHp, this.player.hp + this.player.maxHp * GAME_CONSTANTS.boundaryHealRatio);
    }
    if (this.room.isBoss) {
      this.run.bossProgress += 1;
    }
    saveMetaSave(this.storage, this.metaSave);
    this.run.roomIndex += 1;
    this.run.shopState = createShopState({
      seed: this.run.seed,
      roomIndex: this.run.roomIndex,
      rerolls: 0,
      currentWeaponId: this.run.currentWeaponId,
      ownedPerks: this.run.ownedPerks,
    });
    this.betweenRooms = true;
    this.persistRunBoundary();
    this.hubTab = "shop";
    this.overlay = "hub";
    this.notification = `Room ${clearedRoom} cleared. +${roomGold} Gold, +${shardReward} Shards.`;
    this.notificationUntil = performance.now() / 1000 + 2.4;
    this.audio.beep({ frequency: this.room.isBoss ? 880 : 760, duration: 0.12, gain: 0.04, type: "triangle" });
  }

  persistRunBoundary() {
    if (!this.run) {
      return;
    }
    saveRunSave(this.storage, {
      seed: this.run.seed,
      roomIndex: this.run.roomIndex,
      gold: this.run.gold,
      playerSnapshot: {
        hp: this.player.hp,
        maxHp: this.player.maxHp,
      },
      currentWeaponId: this.run.currentWeaponId,
      ownedPerks: this.run.ownedPerks,
      ownedBuffs: this.run.ownedBuffs,
      shopState: this.run.shopState,
      bossProgress: this.run.bossProgress,
    });
  }

  getDamageMultiplierAgainst(target) {
    let multiplier = this.player.damageMultiplier;
    if (hasPerk(this.run.ownedPerks, "pressureChamber") && this.player.hp / this.player.maxHp > 0.7) {
      multiplier *= 1.18;
    }
    if (target && hasPerk(this.run.ownedPerks, "bossBounty") && (target.id === "boss" || target.elite)) {
      multiplier *= 1.25;
    }
    return multiplier;
  }

  getAimAngle() {
    const world = this.screenToWorld(this.input.mouseX, this.input.mouseY);
    return Math.atan2(world.y - this.player.y, world.x - this.player.x);
  }

  screenToWorld(x, y) {
    const { scale, offsetX, offsetY } = this.renderInfo;
    return {
      x: (x - offsetX) / scale,
      y: (y - offsetY) / scale,
    };
  }

  worldToScreen(x, y) {
    const { scale, offsetX, offsetY } = this.renderInfo;
    return {
      x: offsetX + x * scale,
      y: offsetY + y * scale,
    };
  }

  findNearestEnemy(origin, range) {
    let best = null;
    for (const enemy of this.enemies) {
      const dist = distance(origin, enemy);
      if (dist > range) {
        continue;
      }
      if (!best || dist < best.distance) {
        best = { ...enemy, distance: dist };
      }
    }
    return best;
  }

  render(now) {
    const width = window.innerWidth;
    const height = window.innerHeight;
    this.ctx.clearRect(0, 0, width, height);
    this.ctx.fillStyle = "#090d14";
    this.ctx.fillRect(0, 0, width, height);
    this.drawBackdrop(now, width, height);
    if (!this.room) {
      return;
    }
    const scale = Math.min((width - 120) / this.room.width, (height - 140) / this.room.height);
    const offsetX = (width - this.room.width * scale) / 2;
    const offsetY = (height - this.room.height * scale) / 2 + 18;
    this.renderInfo = { scale, offsetX, offsetY };

    this.drawRoom(scale, offsetX, offsetY);
    this.drawProjectiles(scale, offsetX, offsetY);
    this.drawEntities(scale, offsetX, offsetY);
    this.drawNotification(width);
  }

  drawBackdrop(now, width, height) {
    this.ctx.save();
    this.ctx.globalAlpha = 0.25;
    for (let index = 0; index < 24; index += 1) {
      const x = (index * 97 + now * 14) % width;
      const y = ((index * 131) % height) + Math.sin(now + index) * 14;
      this.ctx.fillStyle = index % 2 === 0 ? "#20314d" : "#132338";
      this.ctx.fillRect(x, y, 2, 2);
    }
    this.ctx.restore();
  }

  drawRoom(scale, offsetX, offsetY) {
    for (let y = 0; y < this.room.height; y += 1) {
      for (let x = 0; x < this.room.width; x += 1) {
        const screenX = offsetX + x * scale;
        const screenY = offsetY + y * scale;
        if (this.room.mask[y][x] === 0) {
          this.ctx.fillStyle = "#05070d";
          this.ctx.fillRect(screenX, screenY, scale, scale);
          continue;
        }
        this.ctx.fillStyle = (x + y) % 2 === 0 ? "#131f34" : "#16253e";
        this.ctx.fillRect(screenX, screenY, scale, scale);
        if (this.room.blocked[y][x] === 1) {
          this.ctx.fillStyle = "#314867";
          this.ctx.fillRect(screenX + scale * 0.15, screenY + scale * 0.15, scale * 0.7, scale * 0.7);
        }
      }
    }
    this.ctx.strokeStyle = "rgba(138,170,255,0.25)";
    this.ctx.lineWidth = 2;
    this.ctx.strokeRect(offsetX, offsetY, this.room.width * scale, this.room.height * scale);
  }

  drawProjectiles(scale, offsetX, offsetY) {
    for (const projectile of [...this.projectiles, ...this.enemyProjectiles]) {
      this.ctx.fillStyle = projectile.color ?? "#ff8c8c";
      this.ctx.beginPath();
      this.ctx.arc(offsetX + projectile.x * scale, offsetY + projectile.y * scale, projectile.radius * scale, 0, Math.PI * 2);
      this.ctx.fill();
    }
  }

  drawEntities(scale, offsetX, offsetY) {
    if (this.companion?.active) {
      this.drawCircle(this.companion, "#8cffd7", scale, offsetX, offsetY);
    }

    for (const enemy of this.enemies) {
      const color = enemy.id === "boss" ? "#65b7ff" : enemy.elite ? "#ffe082" : enemy.color;
      this.drawCircle(enemy, color, scale, offsetX, offsetY);
      this.drawHealthBar(enemy, scale, offsetX, offsetY);
    }

    if (this.player) {
      this.drawCircle(this.player, this.player.invuln > 0 ? "#ffffff" : "#78f0b4", scale, offsetX, offsetY);
      const muzzle = {
        x: this.player.x + Math.cos(this.player.angle) * 0.55,
        y: this.player.y + Math.sin(this.player.angle) * 0.55,
      };
      const start = this.worldToScreen(this.player.x, this.player.y);
      const end = this.worldToScreen(muzzle.x, muzzle.y);
      this.ctx.strokeStyle = "#dff7ff";
      this.ctx.lineWidth = 3;
      this.ctx.beginPath();
      this.ctx.moveTo(start.x, start.y);
      this.ctx.lineTo(end.x, end.y);
      this.ctx.stroke();
      this.drawHealthBar(this.player, scale, offsetX, offsetY, true);
    }
  }

  drawCircle(entity, color, scale, offsetX, offsetY) {
    this.ctx.fillStyle = color;
    this.ctx.beginPath();
    this.ctx.arc(offsetX + entity.x * scale, offsetY + entity.y * scale, entity.radius * scale, 0, Math.PI * 2);
    this.ctx.fill();
  }

  drawHealthBar(entity, scale, offsetX, offsetY, isPlayer = false) {
    const ratio = clamp(entity.hp / entity.maxHp, 0, 1);
    const width = scale * (isPlayer ? 1.2 : 1);
    const x = offsetX + entity.x * scale - width / 2;
    const y = offsetY + entity.y * scale - entity.radius * scale - 12;
    this.ctx.fillStyle = "rgba(0,0,0,0.5)";
    this.ctx.fillRect(x, y, width, 5);
    this.ctx.fillStyle = isPlayer ? "#78f0b4" : "#ff7b7b";
    this.ctx.fillRect(x, y, width * ratio, 5);
  }

  drawNotification(width) {
    if (!this.notification) {
      return;
    }
    this.ctx.fillStyle = "rgba(8, 12, 22, 0.85)";
    this.ctx.fillRect(width / 2 - 190, 84, 380, 34);
    this.ctx.strokeStyle = "rgba(244,201,93,0.35)";
    this.ctx.strokeRect(width / 2 - 190, 84, 380, 34);
    this.ctx.fillStyle = "#f4c95d";
    this.ctx.font = "16px Segoe UI";
    this.ctx.textAlign = "center";
    this.ctx.fillText(this.notification, width / 2, 106);
    this.ctx.textAlign = "start";
  }

  getViewModel() {
    const currentWeapon = this.run ? WEAPONS[this.run.currentWeaponId] : WEAPONS.pistol;
    const skillCards = SKILL_TREE.map((skill) => {
      const level = getSkillLevel(this.metaSave.unlockedSkills, skill.id);
      const nextCost = level < skill.maxLevel ? skill.costs[level] : null;
      return {
        id: skill.id,
        level,
        nextCost,
        canBuy: canBuySkill(this.metaSave.unlockedSkills, skill, this.metaSave.skillShards),
      };
    });

    const stats = this.run
      ? [
          `Room ${this.run.roomIndex}${this.room?.isBoss ? " boss arena" : ""}`,
          `Damage scalar: x${this.player.damageMultiplier.toFixed(2)}`,
          `Fire rate scalar: x${this.player.fireRateMultiplier.toFixed(2)}`,
          `Move speed: ${this.player.moveSpeed.toFixed(2)}`,
          `Gold gain multiplier: x${this.player.goldMultiplier.toFixed(2)}`,
          `Perks: ${this.run.ownedPerks.length ? this.run.ownedPerks.map((id) => PERKS[id].name).join(", ") : "None"}`,
          `Buffs: ${this.run.ownedBuffs.length ? this.run.ownedBuffs.map((id) => BUFFS[id].name).join(", ") : "None"}`,
          `High score: room ${this.metaSave.highScore}`,
        ]
      : [
          `High score: room ${this.metaSave.highScore}`,
          "Start a run to inspect live combat stats.",
        ];

    return {
      overlay: this.overlay,
      activeTab: this.hubTab,
      betweenRooms: this.betweenRooms,
      roomLabel: this.run ? this.run.roomIndex : 1,
      hp: this.player?.hp ?? GAME_CONSTANTS.basePlayerHp,
      maxHp: this.player?.maxHp ?? GAME_CONSTANTS.basePlayerHp,
      gold: this.run?.gold ?? 0,
      skillShards: this.metaSave.skillShards,
      weaponName: currentWeapon.name,
      canContinueRun: Boolean(this.runSave.seed || loadRunSave(this.storage).seed),
      statusMessage: this.betweenRooms
        ? `Boundary save ready. Spend Gold or Skill Shards, then enter room ${this.run?.roomIndex ?? 1}.`
        : this.notification,
      rerollCost: this.run?.shopState ? getRerollCost(this.run.shopState.rerolls) : getRerollCost(0),
      canReroll: Boolean(this.run?.shopState && this.run.gold >= getRerollCost(this.run.shopState.rerolls)),
      shopOffers: this.run?.shopState?.offers ?? [],
      skills: skillCards,
      stats,
      mathLines: describeScalingMath(),
      muted: this.metaSave.settings.muted,
      gameOverSummary: this.gameOverSummary,
    };
  }
}
