export const CONFIG = {
  CHUNK_ID: 'spawn_chunk_v1',
  MAX_PLAYERS: 32,
  DB_COLLECTION: 'player_data_v1',
  SAVE_INTERVAL_MS: 5000, // Auto-save to DB every 5 seconds
  SLOT_KEYS: [
    'slot_0', // Reserved for Metadata
    'slot_1', // Reserved for Position/Chunk Info
    'slot_2', 'slot_3', 'slot_4', 'slot_5', 
    'slot_6', 'slot_7', 'slot_8', 'slot_9'
  ]
};

export const LOG_STYLES = {
  sys: 'color: #00ff00; font-weight: bold;',
  warn: 'color: #ffff00;',
  err: 'color: #ff0000; font-weight: bold;',
  net: 'color: #00ccff;',
  db: 'color: #ff00ff;'
};

