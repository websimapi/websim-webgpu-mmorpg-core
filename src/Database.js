import { CONFIG, LOG_STYLES } from './Constants.js';

export class DatabaseManager {
  constructor(room) {
    this.room = room;
    this.recordId = null;
    this.data = {};
    this.currentUser = null;
  }

  async init() {
    this.currentUser = await window.websim.getCurrentUser();
    console.log(`%c[DB] Initializing for user: ${this.currentUser.username}`, LOG_STYLES.db);

    // Fetch existing records for this user
    const records = await this.room.collection(CONFIG.DB_COLLECTION)
      .filter({ username: this.currentUser.username })
      .getList();

    if (records.length > 0) {
      // Load existing
      const record = records[0];
      this.recordId = record.id;
      this.data = this._parseRecordData(record);
      console.log(`%c[DB] Loaded existing profile: ${this.recordId}`, LOG_STYLES.db, this.data);
    } else {
      // Create new
      console.log(`%c[DB] No profile found. Creating new 10-slot record...`, LOG_STYLES.db);
      const initialData = {};
      CONFIG.SLOT_KEYS.forEach(key => initialData[key] = {});
      
      const newRecord = await this.room.collection(CONFIG.DB_COLLECTION).create(initialData);
      this.recordId = newRecord.id;
      this.data = this._parseRecordData(newRecord);
      console.log(`%c[DB] Created new profile: ${this.recordId}`, LOG_STYLES.db);
    }

    return this.data;
  }

  _parseRecordData(record) {
    const parsed = {};
    CONFIG.SLOT_KEYS.forEach(key => {
      parsed[key] = record[key] || {};
    });
    return parsed;
  }

  // Save specific slot to persistent DB
  async saveSlot(slotIndex, jsonData) {
    if (!this.recordId) return;
    const key = `slot_${slotIndex}`;
    
    if (!CONFIG.SLOT_KEYS.includes(key)) {
      console.error(`Invalid slot index: ${slotIndex}`);
      return;
    }

    try {
      await this.room.collection(CONFIG.DB_COLLECTION).update(this.recordId, {
        [key]: jsonData
      });
      // console.log(`%c[DB] Saved ${key}`, LOG_STYLES.db);
    } catch (e) {
      console.error(`[DB] Failed to save ${key}`, e);
    }
  }
}

