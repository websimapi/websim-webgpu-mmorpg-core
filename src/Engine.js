import { DatabaseManager } from './Database.js';
import { NetworkManager } from './Network.js';
import { Player } from './Player.js';
import { Renderer } from './Renderer.js';
import { CONFIG, LOG_STYLES, DEFAULT_SETTINGS } from './Constants.js';

export class GameEngine {
  constructor() {
    this.player = new Player();
    this.network = new NetworkManager(this.player);
    this.renderer = new Renderer();
    this.db = null; // Initialized after network
    this.lastSaveTime = 0;
    this.isRunning = false;
    this.gameState = 'TITLE'; // TITLE, SETTINGS, GAME
    this.settings = { ...DEFAULT_SETTINGS };
    this.chunkData = null;
    this.hasSavedState = false;

    // Bind methods for safe console usage
    this.move = this.move.bind(this);
    this.tp = this.tp.bind(this);
    this.chat = this.chat.bind(this);
    this.status = this.status.bind(this);
    this.updateSetting = this.updateSetting.bind(this);
  }

  async start() {
    this.logToUI("Initializing Engine...");
    
    // 1. Initialize Renderer
    this.renderer.init('game-container');

    // 2. Initialize Network
    const room = await this.network.init();

    // 3. Initialize Database (needs room)
    this.db = new DatabaseManager(room);
    const savedData = await this.db.init();

    // 4. Load Player Data from Slot 1
    // NOTE: Persistence temporarily disabled for position to ensure "spawn in middle" for testing.
    /*
    if (savedData.slot_1 && savedData.slot_1.x !== undefined) {
      this.player.loadFromData(savedData.slot_1);
      this.hasSavedState = true;
      console.log(`%c[GAME] Player position loaded from DB.`, LOG_STYLES.sys);
    } else {
      console.log(`%c[GAME] No saved state found. Waiting for world entry to spawn.`, LOG_STYLES.sys);
    }
    */
    this.hasSavedState = false; 
    console.log(`%c[GAME] Persistence Override: Always spawning at chunk default.`, LOG_STYLES.sys);

    // 5. Start Loop
    this.isRunning = true;
    this.gameLoop();
    
    this.logToUI("Engine Running. Ready to Start.");
    console.log(`%c
    ========================================
    MMORPG ENGINE STARTED
    ========================================
    Use window.game to interact.
    
    Commands:
    > game.move(x, y, z)   - Move player relative
    > game.tp(x, y, z)     - Teleport absolute
    > game.status()        - Show debug info
    > game.chat("msg")     - Send message
    ========================================
    `, LOG_STYLES.sys);
  }

  gameLoop() {
    if (!this.isRunning) return;
    requestAnimationFrame(() => this.gameLoop());

    const now = Date.now();

    // 1. Network Sync (Presence) - High Frequency
    this.network.broadcastPresence();

    // 2. Database Sync (Persistence) - Low Frequency
    if (now - this.lastSaveTime > CONFIG.SAVE_INTERVAL_MS) {
      this.savePlayerState();
      this.lastSaveTime = now;
    }

    // 3. Render
    if (this.renderer) {
      this.renderer.update(this.player, this.network.peers, this.network.room.clientId);
    }
  }

  async savePlayerState() {
    // Save position to Slot 1
    const posData = this.player.toPersistenceFormat();
    await this.db.saveSlot(1, posData);
  }

  updateSetting(key, value) {
    if (key in this.settings) {
      this.settings[key] = value;
      console.log(`%c[SETTINGS] ${key} -> ${value}`, LOG_STYLES.sys);
      return true;
    }
    return false;
  }

  async enterGame() {
    this.logToUI("Loading Spawn Chunk...");
    try {
      const response = await fetch('./src/SpawnChunk.json');
      if (!response.ok) throw new Error("Failed to load chunk data");
      
      this.chunkData = await response.json();
      console.log(`%c[WORLD] Loaded Chunk: ${this.chunkData.name}`, LOG_STYLES.sys, this.chunkData);
      
      // Pass world data to renderer
      if (this.renderer) {
        this.renderer.setChunkData(this.chunkData);
      }

      this.gameState = 'GAME';

      if (!this.hasSavedState) {
        const sp = this.chunkData.spawnPoint;
        // Ensure teleport is respecting the terrain
        this.player.teleport(sp.x, sp.y, sp.z);
        this.logToUI(`Spawned at ${this.chunkData.name} [${sp.x}, ${sp.y}, ${sp.z}]`);
      } else {
        this.logToUI(`Resumed at [${this.player.position.x}, ${this.player.position.y}, ${this.player.position.z}]`);
      }

    } catch (e) {
      console.error(e);
      this.logToUI(`Error loading world: ${e.message}`);
    }
  }

  // --- Exposed Console API ---

  move(x, y, z) { 
    if (this.gameState !== 'GAME') return "Cannot move while in Title/Settings screen.";
    this.player.move(x, y, z); 
    return `Moved to [${this.player.position.x.toFixed(2)}, ${this.player.position.y.toFixed(2)}, ${this.player.position.z.toFixed(2)}]`;
  }

  tp(x, y, z) { 
    this.player.teleport(x, y, z); 
    return `Teleported to [${x}, ${y}, ${z}]`;
  }
  
  chat(message) {
    if (!this.db || !this.db.currentUser) return "Error: DB not ready";
    this.network.room.send({
      type: 'chat',
      username: this.db.currentUser.username,
      message: message
    });
    return `Chat sent: "${message}"`;
  }

  status() {
    console.table({
      'Position': `X:${this.player.position.x.toFixed(1)} Y:${this.player.position.y.toFixed(1)}`,
      'Mode': this.player.isSpectator ? 'SPECTATOR' : 'PLAYER',
      'Peers': Object.keys(this.network.peers).length,
      'DB Status': this.db.recordId ? 'Synced' : 'Offline'
    });
  }

  logToUI(msg) {
    const el = document.getElementById('console-out');
    if (el) el.innerHTML += `> ${msg}<br>`;
  }
}

// Engine is now exported. Instantiation happens in index.html to control scope and UI binding.

