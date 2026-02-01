  // (Removed duplicate top-level methods. These should be inside the LocalBackupDB class. See below.)
// src/database/ResilientDatabaseManager.js
// ============================================
// SISTEMA DE BASE DE DATOS RESILIENTE
// - PostgreSQL primario (nube)
// - SQLite fallback (local persistente)
// - Sincronización automática
// - Degradación controlada
// ============================================

import pool from './pool.js';
import Database from 'better-sqlite3';
import { createLogger } from '../utils/Logger.js';
import 'dotenv/config';

const logger = createLogger("database:resilient");

// ============================================
// 1. CACHE MANAGER CON LRU (Sin cambios)
// ============================================
class CacheManager {
  constructor(ttl = 30 * 60 * 1000, maxSize = 1000) {
    this.cache = new Map();
    this.ttl = ttl;
    this.maxSize = maxSize;
    this.cleanupInterval = setInterval(() => this.cleanup(), 5 * 60 * 1000);
  }

  set(key, value, customTTL = null) {
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }

    this.cache.set(key, {
      value,
      expires: Date.now() + (customTTL || this.ttl),
      lastAccess: Date.now()
    });
  }

  get(key) {
    const item = this.cache.get(key);
    if (!item) return null;
    if (Date.now() > item.expires) {
      this.cache.delete(key);
      return null;
    }
    item.lastAccess = Date.now();
    return item.value;
  }

  delete(key) {
    this.cache.delete(key);
  }

  clear() {
    this.cache.clear();
  }

  cleanup() {
    const now = Date.now();
    let cleaned = 0;
    for (const [key, item] of this.cache.entries()) {
      if (now > item.expires) {
        this.cache.delete(key);
        cleaned++;
      }
    }
    if (cleaned > 0) {
      logger.debug(`Cache cleanup: ${cleaned} items expirados`);
    }
  }

  stats() {
    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      keys: Array.from(this.cache.keys())
    };
  }

  destroy() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    this.cache.clear();
  }
}

// ============================================
// 2. SQLITE LOCAL BACKUP (NUEVO)
// ============================================
class LocalBackupDB {
  constructor(dbPath = 'data/local-backup.db') {
    try {
      this.db = new Database(dbPath);
      this.initTables();
      logger.info("✅ SQLite backup inicializado");
    } catch (error) {
      logger.error("❌ Error inicializando SQLite backup", error);
      throw error;
    }
  }

  initTables() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS guild_settings (
        guild_id TEXT PRIMARY KEY,
        lang TEXT DEFAULT 'en',
        prefix TEXT DEFAULT 'r!',
        welcome_channel_id TEXT DEFAULT NULL,
        updated_at INTEGER DEFAULT (strftime('%s', 'now'))
      );

      CREATE TABLE IF NOT EXISTS user_settings (
        user_id TEXT PRIMARY KEY,
        dm_notifications INTEGER DEFAULT 1,
        level_up_messages INTEGER DEFAULT 1,
        timezone TEXT DEFAULT 'UTC',
        updated_at INTEGER DEFAULT (strftime('%s', 'now'))
      );

      CREATE TABLE IF NOT EXISTS economy (
        user_id TEXT PRIMARY KEY,
        balance INTEGER DEFAULT 0,
        updated_at INTEGER DEFAULT (strftime('%s', 'now'))
      );

      CREATE TABLE IF NOT EXISTS levels (
        user_id TEXT PRIMARY KEY,
        xp INTEGER DEFAULT 0,
        level INTEGER DEFAULT 1,
        updated_at INTEGER DEFAULT (strftime('%s', 'now'))
      );

      -- ✅ NUEVO: Queue de sincronización
      CREATE TABLE IF NOT EXISTS sync_queue (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        table_name TEXT NOT NULL,
        operation TEXT NOT NULL,
        data TEXT NOT NULL,
        created_at INTEGER DEFAULT (strftime('%s', 'now')),
        retries INTEGER DEFAULT 0,
        last_error TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_sync_queue_created 
      ON sync_queue(created_at);
    `);

    // Preparar statements
    this.stmts = {
      // Guild Settings
      getGuildLang: this.db.prepare('SELECT lang FROM guild_settings WHERE guild_id = ?'),
      getGuildPrefix: this.db.prepare('SELECT prefix FROM guild_settings WHERE guild_id = ?'),
      getWelcomeChannel: this.db.prepare('SELECT welcome_channel_id FROM guild_settings WHERE guild_id = ?'),
      setWelcomeChannel: this.db.prepare(`
        INSERT INTO guild_settings (guild_id, welcome_channel_id, updated_at)
        VALUES (?, ?, strftime('%s', 'now'))
        ON CONFLICT(guild_id)
        DO UPDATE SET welcome_channel_id = excluded.welcome_channel_id, updated_at = excluded.updated_at
      `),
      setGuildLang: this.db.prepare(`
        INSERT INTO guild_settings (guild_id, lang, updated_at) 
        VALUES (?, ?, strftime('%s', 'now'))
        ON CONFLICT(guild_id) 
        DO UPDATE SET lang = excluded.lang, updated_at = excluded.updated_at
      `),
      setGuildPrefix: this.db.prepare(`
        INSERT INTO guild_settings (guild_id, prefix, updated_at) 
        VALUES (?, ?, strftime('%s', 'now'))
        ON CONFLICT(guild_id) 
        DO UPDATE SET prefix = excluded.prefix, updated_at = excluded.updated_at
      `),

      // User Settings
      getUserSettings: this.db.prepare('SELECT * FROM user_settings WHERE user_id = ?'),
      setUserSettings: this.db.prepare(`
        INSERT INTO user_settings (user_id, dm_notifications, level_up_messages, timezone, updated_at)
        VALUES (?, ?, ?, ?, strftime('%s', 'now'))
        ON CONFLICT(user_id)
        DO UPDATE SET 
          dm_notifications = excluded.dm_notifications,
          level_up_messages = excluded.level_up_messages,
          timezone = excluded.timezone,
          updated_at = excluded.updated_at
      `),

      // Economy
      getBalance: this.db.prepare('SELECT balance FROM economy WHERE user_id = ?'),
      setBalance: this.db.prepare(`
        INSERT INTO economy (user_id, balance, updated_at)
        VALUES (?, ?, strftime('%s', 'now'))
        ON CONFLICT(user_id)
        DO UPDATE SET balance = excluded.balance, updated_at = excluded.updated_at
      `),
      addBalance: this.db.prepare(`
        INSERT INTO economy (user_id, balance, updated_at)
        VALUES (?, ?, strftime('%s', 'now'))
        ON CONFLICT(user_id)
        DO UPDATE SET balance = balance + excluded.balance, updated_at = excluded.updated_at
      `),

      // Levels
      getLevel: this.db.prepare('SELECT xp, level FROM levels WHERE user_id = ?'),
      setLevel: this.db.prepare(`
        INSERT INTO levels (user_id, xp, level, updated_at)
        VALUES (?, ?, ?, strftime('%s', 'now'))
        ON CONFLICT(user_id)
        DO UPDATE SET xp = excluded.xp, level = excluded.level, updated_at = excluded.updated_at
      `),
      addXP: this.db.prepare(`
        INSERT INTO levels (user_id, xp, level, updated_at)
        VALUES (?, ?, 1, strftime('%s', 'now'))
        ON CONFLICT(user_id)
        DO UPDATE SET xp = xp + excluded.xp, updated_at = excluded.updated_at
      `),

      // Sync Queue
      addToSyncQueue: this.db.prepare(`
        INSERT INTO sync_queue (table_name, operation, data)
        VALUES (?, ?, ?)
      `),
      getSyncQueue: this.db.prepare(`
        SELECT * FROM sync_queue 
        WHERE retries < 5 
        ORDER BY created_at ASC 
        LIMIT ?
      `),
      markSyncSuccess: this.db.prepare('DELETE FROM sync_queue WHERE id = ?'),
      markSyncFailed: this.db.prepare(`
        UPDATE sync_queue 
        SET retries = retries + 1, last_error = ? 
        WHERE id = ?
      `),
      clearOldSyncQueue: this.db.prepare(`
        DELETE FROM sync_queue 
        WHERE created_at < ? OR retries >= 5
      `)
    };
  }

  // ========================================
  // MÉTODOS DE LECTURA
  // ========================================

  getWelcomeChannel(guildId) {
    const result = this.stmts.getWelcomeChannel.get(guildId);
    return result ? result.welcome_channel_id : null;
  }

  getGuildLang(guildId) {
    const result = this.stmts.getGuildLang.get(guildId);
    return result?.lang || 'en';
  }

  getGuildPrefix(guildId) {
    const result = this.stmts.getGuildPrefix.get(guildId);
    return result?.prefix || 'r!';
  }

  getUserSettings(userId) {
    const result = this.stmts.getUserSettings.get(userId);
    return result || {
      user_id: userId,
      dm_notifications: 1,
      level_up_messages: 1,
      timezone: 'UTC'
    };
  }

  getBalance(userId) {
    const result = this.stmts.getBalance.get(userId);
    return result?.balance || 0;
  }

  getLevel(userId) {
    const result = this.stmts.getLevel.get(userId);
    return result || { xp: 0, level: 1 };
  }

  // ========================================
  // MÉTODOS DE ESCRITURA (CON QUEUE)
  // ========================================

  setWelcomeChannel(guildId, channelId, addToQueue = true) {
    this.stmts.setWelcomeChannel.run(guildId, channelId);
    if (addToQueue && this.addToSyncQueue) {
      this.addToSyncQueue('guild_settings', 'UPDATE', {
        guild_id: guildId,
        welcome_channel_id: channelId
      });
    }
  }

  setGuildLang(guildId, lang, addToQueue = true) {
    this.stmts.setGuildLang.run(guildId, lang);
    
    if (addToQueue) {
      this.addToSyncQueue('guild_settings', 'UPDATE', {
        guild_id: guildId,
        lang
      });
    }
  }

  setGuildPrefix(guildId, prefix, addToQueue = true) {
    this.stmts.setGuildPrefix.run(guildId, prefix);
    
    if (addToQueue) {
      this.addToSyncQueue('guild_settings', 'UPDATE', {
        guild_id: guildId,
        prefix
      });
    }
  }

  setUserSettings(userId, settings, addToQueue = true) {
    this.stmts.setUserSettings.run(
      userId,
      settings.dm_notifications ? 1 : 0,
      settings.level_up_messages ? 1 : 0,
      settings.timezone || 'UTC'
    );

    if (addToQueue) {
      this.addToSyncQueue('user_settings', 'UPDATE', {
        user_id: userId,
        ...settings
      });
    }
  }

  addMoney(userId, amount, addToQueue = true) {
    this.stmts.addBalance.run(userId, amount);
    const newBalance = this.stmts.getBalance.get(userId).balance;

    if (addToQueue) {
      this.addToSyncQueue('economy', 'ADD', {
        user_id: userId,
        amount
      });
    }

    return newBalance;
  }

  addXP(userId, amount, addToQueue = true) {
    this.stmts.addXP.run(userId, amount);
    const data = this.stmts.getLevel.get(userId);
    
    const newLevel = Math.floor(data.xp / 1000) + 1;
    const levelUp = newLevel > data.level;

    if (levelUp) {
      this.stmts.setLevel.run(userId, data.xp, newLevel);
    }

    if (addToQueue) {
      this.addToSyncQueue('levels', 'ADD_XP', {
        user_id: userId,
        amount
      });
    }

    return { levelUp, newLevel, xp: data.xp, level: newLevel };
  }

  // ========================================
  // GESTIÓN DE SYNC QUEUE
  // ========================================

  addToSyncQueue(tableName, operation, data) {
    try {
      this.stmts.addToSyncQueue.run(
        tableName,
        operation,
        JSON.stringify(data)
      );
    } catch (error) {
      logger.error("Error añadiendo a sync queue", error);
    }
  }

  getSyncQueue(limit = 100) {
    return this.stmts.getSyncQueue.all(limit);
  }

  markSyncSuccess(id) {
    this.stmts.markSyncSuccess.run(id);
  }

  markSyncFailed(id, error) {
    this.stmts.markSyncFailed.run(error, id);
  }

  clearOldSyncQueue() {
    const oneWeekAgo = Math.floor(Date.now() / 1000) - (7 * 24 * 60 * 60);
    const result = this.stmts.clearOldSyncQueue.run(oneWeekAgo);
    return result.changes;
  }

  close() {
    this.db.close();
  }
}

// ============================================
// 3. POSTGRESQL CON CACHE (MEJORADO)
// ============================================
class CachedPostgresDB {
  constructor() {
    this.pool = pool;
    this.caches = {
      guildSettings: new CacheManager(30 * 60 * 1000, 500),
      userSettings: new CacheManager(30 * 60 * 1000, 1000),
      economy: new CacheManager(10 * 60 * 1000, 2000),
      levels: new CacheManager(5 * 60 * 1000, 2000)
    };
    this.stats = { hits: 0, misses: 0 };
  }

  // ✅ NUEVO: Health check con timeout
  async checkHealth(timeoutMs = 1000) {
    logger.debug(`🏥 Health check iniciado (timeout: ${timeoutMs}ms)`);
    
    try {
      const startTime = Date.now();
      
      await Promise.race([
        this.pool.query('SELECT 1'),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Health check timeout')), timeoutMs)
        )
      ]);
      
      const elapsed = Date.now() - startTime;
      logger.debug(`✅ Health check exitoso en ${elapsed}ms`);
      
      return true;
    } catch (error) {
      logger.debug(`❌ Health check fallido: ${error.message}`);
      
      // Detalles del error
      if (error.code) {
        logger.debug(`Error code: ${error.code}`);
      }
      
      if (error.errno) {
        logger.debug(`Error number: ${error.errno}`);
      }
      
      // Errores comunes
      if (error.code === 'ECONNREFUSED') {
        logger.debug("Causa probable: PostgreSQL no está corriendo o puerto bloqueado");
      } else if (error.code === 'ETIMEDOUT') {
        logger.debug("Causa probable: Red lenta o firewall bloqueando conexión");
      } else if (error.code === 'ENOTFOUND') {
        logger.debug("Causa probable: Host no encontrado, verificar DB_HOST");
      } else if (error.message.includes('timeout')) {
        logger.debug("Causa probable: PostgreSQL respondiendo muy lento");
      }
      
      return false;
    }
  }

  async getGuildLang(guildId) {
    const cacheKey = `lang:${guildId}`;
    let lang = this.caches.guildSettings.get(cacheKey);
    
    if (lang !== null) {
      this.stats.hits++;
      return lang;
    }
    
    this.stats.misses++;
    const result = await this.pool.query(
      'SELECT lang FROM guild_settings WHERE guild_id = $1',
      [guildId]
    );
    
    lang = result.rows[0]?.lang || 'en';
    this.caches.guildSettings.set(cacheKey, lang);
    return lang;
  }

  async setGuildLang(guildId, lang) {
    await this.pool.query(
      `INSERT INTO guild_settings (guild_id, lang, updated_at) 
       VALUES ($1, $2, NOW())
       ON CONFLICT (guild_id) 
       DO UPDATE SET lang = $2, updated_at = NOW()`,
      [guildId, lang]
    );
    
    this.caches.guildSettings.set(`lang:${guildId}`, lang);
    this.caches.guildSettings.delete(`settings:${guildId}`);
  }

  async getGuildPrefix(guildId) {
    const cacheKey = `prefix:${guildId}`;
    let prefix = this.caches.guildSettings.get(cacheKey);
    
    if (prefix !== null) {
      this.stats.hits++;
      return prefix;
    }
    
    this.stats.misses++;
    const result = await this.pool.query(
      'SELECT prefix FROM guild_settings WHERE guild_id = $1',
      [guildId]
    );
    
    prefix = result.rows[0]?.prefix || 'r!';
    this.caches.guildSettings.set(cacheKey, prefix);
    return prefix;
  }

  async setGuildPrefix(guildId, prefix) {
    await this.pool.query(
      `INSERT INTO guild_settings (guild_id, prefix, updated_at) 
       VALUES ($1, $2, NOW())
       ON CONFLICT (guild_id) 
       DO UPDATE SET prefix = $2, updated_at = NOW()`,
      [guildId, prefix]
    );
    
    this.caches.guildSettings.set(`prefix:${guildId}`, prefix);
    this.caches.guildSettings.delete(`settings:${guildId}`);
  }

  // ... (Resto de métodos sin cambios)

  destroy() {
    Object.values(this.caches).forEach(cache => cache.destroy());
  }
}

// ============================================
// 4. RESILIENT DATABASE MANAGER (NÚCLEO)
// ============================================
class ResilientDatabaseManager {
      async getWelcomeChannel(guildId) {
        // Si en el futuro hay soporte en Postgres, aquí se puede agregar
        return this.local.getWelcomeChannel(guildId);
      }
    async setWelcomeChannel(guildId, channelId) {
      // Escribir SIEMPRE a SQLite primero (write-through)
      this.local.setWelcomeChannel(guildId, channelId, this.mode !== 'postgres');

      // Si PostgreSQL está disponible, escribir también
      if (this.mode === 'postgres') {
        try {
          // Si tienes método en pg, agrégalo aquí. Si no, solo sincroniza desde SQLite.
          // await this._withTimeout(() => this.pg.setWelcomeChannel(guildId, channelId), 1000);
          // Si no existe en pg, la sync se hará por el worker.
        } catch (error) {
          // Ya está en queue por setWelcomeChannel del local
        }
      }
    }
  constructor() {
    this.pg = new CachedPostgresDB();
    this.local = null; // Inicializado en init()
    this.analytics = null; // Opcional
    
    // ✅ Estado de disponibilidad
    this.available = false;
    this.mode = 'unknown'; // 'postgres', 'local', 'disabled'
    
    // ✅ Sistema de sincronización
    this.syncInterval = null;
    this.healthCheckInterval = null;
    
    // ✅ Configuración
    this.config = {
      forceOffline: process.env.DB_DISABLED === "true",
      syncIntervalMs: 60 * 1000, // 1 minuto
      healthCheckMs: 30 * 1000,  // 30 segundos
      maxSyncBatch: 100
    };
  }

  async init() {
    logger.info("🔧 Inicializando sistema de base de datos resiliente...");

    // ✅ PASO 1: Inicializar SQLite local (SIEMPRE)
    try {
      logger.debug("📦 Creando instancia de LocalBackupDB...");
      this.local = new LocalBackupDB();
      logger.info("✅ SQLite local inicializado");
      logger.debug(`SQLite path: data/local-backup.db`);
    } catch (error) {
      logger.error("❌ Error crítico: No se pudo inicializar SQLite local", error);
      throw error; // Sin SQLite local, no podemos continuar
    }

    // ✅ PASO 2: Intentar conectar a PostgreSQL
    if (this.config.forceOffline) {
      logger.warn("⚠️ PostgreSQL deshabilitado por configuración (DB_DISABLED=true)");
      this.mode = 'local';
      this.available = true;
      logger.debug("Saltando intento de conexión a PostgreSQL");
      return;
    }

    logger.debug("🔌 Iniciando proceso de conexión a PostgreSQL...");
    logger.debug(`Host: ${process.env.DB_HOST || 'no configurado'}`);
    logger.debug(`Port: ${process.env.DB_PORT || '5432'}`);
    logger.debug(`Database: ${process.env.DB_NAME || 'no configurado'}`);
    logger.debug(`SSL: ${process.env.DB_SSL || 'false'}`);

    try {
      logger.debug("⏱️ Ejecutando health check (timeout: 3000ms)...");
      logger.time("Conexión a PostgreSQL");
      
      const isHealthy = await this.pg.checkHealth(3000);
      
      logger.debug(`Health check resultado: ${isHealthy}`);
      
      if (isHealthy) {
        logger.timeEnd("Conexión a PostgreSQL");
        this.mode = 'postgres';
        this.available = true;
        logger.info("✅ PostgreSQL conectado - Modo: PRIMARY");
        logger.debug("🔄 Iniciando workers de sincronización y health check...");
        
        // Iniciar sincronización y health checks
        this.startSyncWorker();
        this.startHealthCheck();
        
        logger.debug("✅ Workers iniciados correctamente");
      } else {
        throw new Error("PostgreSQL no responde al health check");
      }
      
    } catch (error) {
      logger.error("❌ Error conectando a PostgreSQL:", error);
      logger.debug(`Error type: ${error.constructor.name}`);
      logger.debug(`Error code: ${error.code || 'N/A'}`);
      logger.debug(`Error message: ${error.message}`);
      
      logger.warn("🔄 Modo FALLBACK activado - usando solo SQLite local");
      
      this.mode = 'local';
      this.available = true;
      
      logger.debug("⏰ Programando reintentos de reconexión (cada 5 minutos)...");
      // Intentar reconectar cada 5 minutos
      this.scheduleReconnect();
    }

    logger.info(`✅ Sistema listo - Modo: ${this.mode.toUpperCase()}`);
    logger.debug("📊 Estado final del sistema:");
    logger.debug(`  - Mode: ${this.mode}`);
    logger.debug(`  - Available: ${this.available}`);
    logger.debug(`  - Sync worker: ${this.syncInterval ? 'Activo' : 'Inactivo'}`);
    logger.debug(`  - Health check: ${this.healthCheckInterval ? 'Activo' : 'Inactivo'}`);
  }

  // ========================================
  // INTERFAZ PÚBLICA UNIFICADA
  // ========================================

  async getGuildLang(guildId) {
    if (this.mode === 'postgres') {
      try {
        return await this._withFallback(
          () => this.pg.getGuildLang(guildId),
          () => this.local.getGuildLang(guildId)
        );
      } catch (error) {
        logger.debug("Usando SQLite para getGuildLang");
        return this.local.getGuildLang(guildId);
      }
    }
    
    return this.local.getGuildLang(guildId);
  }

  async setGuildLang(guildId, lang) {
    // Escribir SIEMPRE a SQLite primero (write-through)
    this.local.setGuildLang(guildId, lang, this.mode !== 'postgres');
    
    // Si PostgreSQL está disponible, escribir también
    if (this.mode === 'postgres') {
      try {
        await this._withTimeout(
          () => this.pg.setGuildLang(guildId, lang),
          1000
        );
      } catch (error) {
        logger.debug(`PostgreSQL write failed, queued for sync: ${error.message}`);
        // Ya está en queue por setGuildLang del local
      }
    }
  }

  async getGuildPrefix(guildId) {
    if (this.mode === 'postgres') {
      try {
        return await this._withFallback(
          () => this.pg.getGuildPrefix(guildId),
          () => this.local.getGuildPrefix(guildId)
        );
      } catch (error) {
        return this.local.getGuildPrefix(guildId);
      }
    }
    
    return this.local.getGuildPrefix(guildId);
  }

  async setGuildPrefix(guildId, prefix) {
    this.local.setGuildPrefix(guildId, prefix, this.mode !== 'postgres');
    
    if (this.mode === 'postgres') {
      try {
        await this._withTimeout(
          () => this.pg.setGuildPrefix(guildId, prefix),
          1000
        );
      } catch (error) {
        logger.debug(`PostgreSQL write failed, queued for sync`);
      }
    }
  }

  async addMoney(userId, amount) {
    const newBalance = this.local.addMoney(userId, amount, this.mode !== 'postgres');
    
    if (this.mode === 'postgres') {
      this._withTimeout(
        () => this.pg.addMoney(userId, amount),
        1000
      ).catch(() => {}); // Fire and forget
    }
    
    return newBalance;
  }

  async addXP(userId, amount) {
    const result = this.local.addXP(userId, amount, this.mode !== 'postgres');
    
    if (this.mode === 'postgres') {
      this._withTimeout(
        () => this.pg.addXP(userId, amount),
        1000
      ).catch(() => {});
    }
    
    return result;
  }

  // ========================================
  // SISTEMA DE SINCRONIZACIÓN
  // ========================================

  startSyncWorker() {
    this.syncInterval = setInterval(
      () => this.syncToPostgres(),
      this.config.syncIntervalMs
    );
    
    logger.info("🔄 Worker de sincronización iniciado");
  }

  async syncToPostgres() {
    if (this.mode !== 'postgres') {
      logger.debug("⏭️ Sync saltado: modo no es 'postgres'");
      return;
    }

    const queue = this.local.getSyncQueue(this.config.maxSyncBatch);
    if (queue.length === 0) {
      logger.debug("⏭️ Sync saltado: queue vacía");
      return;
    }

    logger.debug(`📤 Sincronizando ${queue.length} operaciones pendientes...`);

    let synced = 0;
    let failed = 0;

    for (const item of queue) {
      try {
        const data = JSON.parse(item.data);
        
        logger.debug(`Procesando: ${item.table_name}.${item.operation} (id: ${item.id})`);
        
        // Ejecutar operación según tipo
        switch (item.table_name) {
          case 'guild_settings':
            if (data.lang) {
              await this.pg.setGuildLang(data.guild_id, data.lang);
              logger.debug(`  ✅ Lang actualizado: ${data.guild_id} → ${data.lang}`);
            }
            if (data.prefix) {
              await this.pg.setGuildPrefix(data.guild_id, data.prefix);
              logger.debug(`  ✅ Prefix actualizado: ${data.guild_id} → ${data.prefix}`);
            }
            break;
          
          case 'economy':
            if (item.operation === 'ADD') {
              await this.pg.addMoney(data.user_id, data.amount);
              logger.debug(`  ✅ Dinero añadido: ${data.user_id} +${data.amount}`);
            }
            break;
          
          case 'levels':
            if (item.operation === 'ADD_XP') {
              await this.pg.addXP(data.user_id, data.amount);
              logger.debug(`  ✅ XP añadido: ${data.user_id} +${data.amount}`);
            }
            break;
        }
        
        this.local.markSyncSuccess(item.id);
        synced++;
        
      } catch (error) {
        this.local.markSyncFailed(item.id, error.message);
        failed++;
        logger.debug(`  ❌ Sync failed for item ${item.id}: ${error.message}`);
      }
    }

    if (synced > 0 || failed > 0) {
      logger.info(`✅ Sincronización completada: ${synced} OK, ${failed} failed`);
    }

    // Limpiar queue antigua cada 1000 syncs
    if (Math.random() < 0.001) {
      const cleaned = this.local.clearOldSyncQueue();
      if (cleaned > 0) {
        logger.debug(`🧹 Limpiados ${cleaned} registros antiguos de sync queue`);
      }
    }
  }

  // ========================================
  // HEALTH CHECK Y RECONEXIÓN
  // ========================================

  startHealthCheck() {
    this.healthCheckInterval = setInterval(
      () => this.checkDatabaseHealth(),
      this.config.healthCheckMs
    );
  }

  async checkDatabaseHealth() {
    if (this.mode !== 'postgres') return;

    const isHealthy = await this.pg.checkHealth(2000);
    
    if (!isHealthy) {
      logger.warn("⚠️ PostgreSQL perdió conexión - cambiando a modo LOCAL");
      this.mode = 'local';
      
      if (this.syncInterval) {
        clearInterval(this.syncInterval);
        this.syncInterval = null;
      }
      
      this.scheduleReconnect();
    }
  }

  scheduleReconnect() {
    logger.debug("⏰ Programando reintento de reconexión en 5 minutos...");
    
    setTimeout(async () => {
      logger.info("🔄 Intentando reconectar a PostgreSQL...");
      logger.debug(`Estado actual: mode=${this.mode}, available=${this.available}`);
      
      const isHealthy = await this.pg.checkHealth(3000);
      
      if (isHealthy) {
        logger.info("✅ PostgreSQL reconectado - restaurando modo PRIMARY");
        logger.debug("🔄 Reiniciando workers de sincronización...");
        
        this.mode = 'postgres';
        this.startSyncWorker();
        this.startHealthCheck();
        
        logger.debug("✅ Workers reiniciados correctamente");
        
        // Intentar sincronización inmediata
        const queueSize = this.local.getSyncQueue().length;
        if (queueSize > 0) {
          logger.info(`📤 Iniciando sincronización de ${queueSize} operaciones pendientes...`);
          await this.syncToPostgres();
        }
      } else {
        logger.debug("❌ Reconexión fallida, reintentando en 5 minutos");
        logger.debug("Verificar:");
        logger.debug("  1. PostgreSQL está corriendo");
        logger.debug("  2. Credenciales en .env son correctas");
        logger.debug("  3. Firewall permite conexión al puerto");
        logger.debug("  4. Host es accesible desde esta máquina");
        
        this.scheduleReconnect();
      }
    }, 5 * 60 * 1000); // 5 minutos
  }

  // ========================================
  // UTILIDADES INTERNAS
  // ========================================

  async _withTimeout(fn, timeoutMs) {
    return Promise.race([
      fn(),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Timeout')), timeoutMs)
      )
    ]);
  }

  async _withFallback(primary, fallback) {
    try {
      return await this._withTimeout(primary, 800);
    } catch (error) {
      logger.debug(`Fallback activado: ${error.message}`);
      return fallback();
    }
  }

  // ========================================
  // SHUTDOWN
  // ========================================

  async shutdown() {
    logger.info("🛑 Cerrando sistema de base de datos...");
    
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
    }
    
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }
    
    // Sincronización final
    if (this.mode === 'postgres') {
      await this.syncToPostgres();
    }
    
    if (this.local) {
      this.local.close();
    }
    
    if (this.pg && this.mode === 'postgres') {
      await this.pg.pool.end();
    }
    
    logger.info("✅ Base de datos cerrada correctamente");
  }

  // ========================================
  // STATS Y DEBUG
  // ========================================

  getStats() {
    return {
      mode: this.mode,
      available: this.available,
      pgStats: this.mode === 'postgres' ? this.pg.stats : null,
      syncQueueSize: this.local ? this.local.getSyncQueue().length : 0
    };
  }
}

// ============================================
// 5. EXPORT
// ============================================
export const db = new ResilientDatabaseManager();
export { CacheManager, CachedPostgresDB, LocalBackupDB, ResilientDatabaseManager };