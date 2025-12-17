import { DatabaseManager } from './Database.js';
import { NetworkManager } from './Network.js';
import { Player } from './Player.js';
import { CONFIG, LOG_STYLES } from './Constants.js';

class GameEngine {
  constructor() {
    this.player = new Player();
    this.network = new NetworkManager(this.player);
    this.db = null; // Initialized after network
    this.lastSaveTime = 0;
    this.isRunning = false;
  }

  async start() {
    this.logToUI("Initializing Engine...");
    
    // 1. Initialize Network
    const room = await this.network.init();

    // 2. Initialize Database (needs room)
    this.db = new DatabaseManager(room);
    const savedData = await this.db.init();

    // 3. Load Player Data from Slot 1
    if (savedData.slot_1) {
      this.player.loadFromData(savedData.slot_1);
      console.log(`%c[GAME] Player position loaded from DB.`, LOG_STYLES.sys);
    }

    // 4. Start Loop
    this.isRunning = true;
    this.gameLoop();
    
    this.logToUI("Engine Running. Open Console (F12) to interact.");
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

    // 3. "Render" (Placeholder for WebGPU)
    // In a real implementation, this would call webgpuContext.draw()
  }

  async savePlayerState() {
    // Save position to Slot 1
    const posData = this.player.toPersistenceFormat();
    await this.db.saveSlot(1, posData);
  }

  // --- Exposed Console API ---

  move(x, y, z) { this.player.move(x, y, z); }
  tp(x, y, z) { this.player.teleport(x, y, z); }
  
  chat(message) {
    this.network.room.send({
      type: 'chat',
      username: this.db.currentUser.username,
      message: message
    });
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

// Attach to window for user interaction
window.game = new GameEngine();
window.game.start();

