export class Player {
  constructor() {
    this.position = { x: 0, y: 0, z: 0 };
    this.targetPosition = null; // {x, y, z}
    this.rotation = { x: 0, y: 0, z: 0, w: 1 };
    this.stats = { hp: 100, mp: 100, level: 1 };
    this.isSpectator = false;
    this.speed = 10.0; // Units per second
    this.isMoving = false;
  }

  update(dt) {
    if (this.isSpectator || !this.targetPosition) {
      this.isMoving = false;
      return;
    }

    const dx = this.targetPosition.x - this.position.x;
    const dz = this.targetPosition.z - this.position.z;
    const distSq = dx * dx + dz * dz;

    if (distSq < 0.1) {
      this.position.x = this.targetPosition.x;
      this.position.z = this.targetPosition.z;
      this.targetPosition = null;
      this.isMoving = false;
      return;
    }

    this.isMoving = true;
    const dist = Math.sqrt(distSq);
    const moveDist = this.speed * dt;

    if (moveDist >= dist) {
      this.position.x = this.targetPosition.x;
      this.position.z = this.targetPosition.z;
      this.targetPosition = null;
      this.isMoving = false;
    } else {
      const ratio = moveDist / dist;
      this.position.x += dx * ratio;
      this.position.z += dz * ratio;
    }
    
    // Update Rotation to face target
    const angle = Math.atan2(dx, dz);
    // Convert to quaternion (Y-axis rotation)
    // Simple Euler to Quaternion approx for y-axis
    // q = [0, sin(a/2), 0, cos(a/2)]
    const halfAngle = angle / 2;
    this.rotation.y = Math.sin(halfAngle);
    this.rotation.w = Math.cos(halfAngle);
  }

  walkTo(x, z) {
    if (this.isSpectator) return;
    this.targetPosition = { x, y: 0, z }; // Y is handled by terrain clamp
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

