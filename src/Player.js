export class Player {
  constructor() {
    this.position = { x: 0, y: 0, z: 0 };
    this.rotation = { x: 0, y: 0, z: 0, w: 1 };
    this.stats = { hp: 100, mp: 100, level: 1 };
    this.isSpectator = false;
  }

  // Called by console/input
  move(x, y, z) {
    if (this.isSpectator) {
      console.warn("Spectators cannot interact with the world.");
      return;
    }
    this.position.x += x;
    this.position.y += y;
    this.position.z += z;
    console.log(`Player moved to: [${this.position.x}, ${this.position.y}, ${this.position.z}]`);
  }

  teleport(x, y, z) {
    this.position = { x, y, z };
    console.log(`Player teleported to: [${x}, ${y}, ${z}]`);
  }

  setSpectatorMode(isSpectator) {
    this.isSpectator = isSpectator;
  }

  // Returns data formatted for DB Slot 1
  toPersistenceFormat() {
    return {
      x: this.position.x,
      y: this.position.y,
      z: this.position.z,
      chunk: 'spawn_chunk',
      timestamp: Date.now()
    };
  }

  // Returns data formatted for Realtime Presence
  toPresenceFormat() {
    return {
      pos: this.position,
      rot: this.rotation,
      stats: this.stats,
      isSpectator: this.isSpectator
    };
  }

  loadFromData(data) {
    if (data && data.x !== undefined) {
      this.position.x = data.x;
      this.position.y = data.y;
      this.position.z = data.z;
    }
  }
}

