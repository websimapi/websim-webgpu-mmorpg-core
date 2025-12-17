import { CONFIG, LOG_STYLES } from './Constants.js';

export class NetworkManager {
  constructor(player) {
    this.room = new WebsimSocket();
    this.player = player;
    this.peers = {};
    this.isConnected = false;
  }

  async init() {
    console.log(`%c[NET] Connecting to Websim Socket...`, LOG_STYLES.net);
    await this.room.initialize();
    this.isConnected = true;
    
    // Initial Peer Check
    this.handlePeerCount();

    // Subscribe to presence
    this.room.subscribePresence((presence) => {
      this.peers = presence;
      this.handlePeerCount();
      // Logic to visualize other players would go here
    });

    // Handle incoming custom events
    this.room.onmessage = (event) => {
      const data = event.data;
      if (data.type === 'chat') {
        console.log(`%c[CHAT] ${data.username}: ${data.message}`, 'color: #aaa');
      }
    };

    console.log(`%c[NET] Connected! Client ID: ${this.room.clientId}`, LOG_STYLES.net);
    return this.room; // Return room for DB manager
  }

  handlePeerCount() {
    const peerCount = Object.keys(this.room.peers).length;
    const wasSpectator = this.player.isSpectator;
    
    // Check if we are outside the limit
    // Simple logic: If we connected and count > MAX, we spectate.
    // A robust system would check join timestamps.
    
    if (peerCount > CONFIG.MAX_PLAYERS) {
      this.player.setSpectatorMode(true);
      if (!wasSpectator) {
        console.warn(`%c[NET] Room full (${peerCount}/${CONFIG.MAX_PLAYERS}). Entering Spectator Mode.`, LOG_STYLES.warn);
      }
    } else {
      this.player.setSpectatorMode(false);
      if (wasSpectator) {
        console.log(`%c[NET] Slot opened. Entering Game Mode.`, LOG_STYLES.net);
      }
    }
  }

  broadcastPresence() {
    if (!this.isConnected) return;
    this.room.updatePresence(this.player.toPresenceFormat());
  }
}

