// src/bot/managers/PendingMembersManager.js

import { createLogger } from "../utils/Logger.js";

const logger = createLogger("manager:pending-members");

/**
 * Sistema de gestión de miembros pendientes con auto-limpieza
 * Optimizado para bajo uso de memoria y alta eficiencia
 */
class PendingMembersManager {
  constructor(config = {}) {
    // Map para O(1) lookups
    this._pendingMembers = new Map();
    
    // Configuración con valores por defecto
    this.config = {
      waitTimeout: config.waitTimeout || 300000, // 5 minutos por defecto
      cleanupInterval: config.cleanupInterval || 60000, // Limpieza cada 1 minuto
      maxPendingMembers: config.maxPendingMembers || 1000, // Prevenir memory leaks
      ...config
    };
    
    // Auto-limpieza periódica
    this._startCleanupTimer();
    
    logger.info(`PendingMembersManager initialized (timeout: ${this.config.waitTimeout}ms)`);
  }

  /**
   * Registra un nuevo miembro pendiente
   */
  add(userId, guildId, memberData = {}) {
    if (!userId || typeof userId !== 'string') {
      logger.error("Invalid userId provided to add()");
      return false;
    }
    
    if (!guildId || typeof guildId !== 'string') {
      logger.error("Invalid guildId provided to add()");
      return false;
    }

    // Prevenir memory exhaustion
    if (this._pendingMembers.size >= this.config.maxPendingMembers) {
      logger.warn(`Max pending members reached (${this.config.maxPendingMembers}), cleaning old entries`);
      this._forceCleanup();
    }

    const key = this._generateKey(userId, guildId);
    const timestamp = Date.now();
    const expiresAt = timestamp + this.config.waitTimeout;

    const entry = {
      userId,
      guildId,
      timestamp,
      expiresAt,
      ...memberData
    };

    this._pendingMembers.set(key, entry);
    
    logger.debug(`Member ${userId} added to pending (guild: ${guildId}, expires in ${this.config.waitTimeout}ms)`);
    
    return true;
  }

  /**
   * Obtiene datos de un miembro pendiente
   */
  get(userId, guildId) {
    const key = this._generateKey(userId, guildId);
    const entry = this._pendingMembers.get(key);

    if (!entry) {
      return null;
    }

    // Verificar si ha expirado
    if (Date.now() > entry.expiresAt) {
      this.delete(userId, guildId);
      logger.debug(`Entry for ${userId} expired and removed`);
      return null;
    }

    return entry;
  }

  /**
   * Elimina un miembro pendiente
   */
  delete(userId, guildId) {
    const key = this._generateKey(userId, guildId);
    const deleted = this._pendingMembers.delete(key);
    
    if (deleted) {
      logger.debug(`Member ${userId} removed from pending (guild: ${guildId})`);
    }
    
    return deleted;
  }

  /**
   * Genera clave única compuesta
   * @private
   */
  _generateKey(userId, guildId) {
    return `${guildId}:${userId}`;
  }

  /**
   * Inicia timer de auto-limpieza
   * @private
   */
  _startCleanupTimer() {
    this._cleanupTimer = setInterval(() => {
      this._cleanup();
    }, this.config.cleanupInterval);

    if (this._cleanupTimer.unref) {
      this._cleanupTimer.unref();
    }

    logger.debug(`Cleanup timer started (interval: ${this.config.cleanupInterval}ms)`);
  }

  /**
   * Limpia entradas expiradas automáticamente
   * @private
   */
  _cleanup() {
    const now = Date.now();
    const initialSize = this._pendingMembers.size;
    let removedCount = 0;

    for (const [key, entry] of this._pendingMembers.entries()) {
      if (now > entry.expiresAt) {
        this._pendingMembers.delete(key);
        removedCount++;
      }
    }

    if (removedCount > 0) {
      logger.info(`Cleanup completed: removed ${removedCount} expired entries (${initialSize} -> ${this._pendingMembers.size})`);
    }
  }

  /**
   * Fuerza limpieza agresiva cuando se alcanza límite
   * @private
   */
  _forceCleanup() {
    const entries = Array.from(this._pendingMembers.entries())
      .sort((a, b) => a[1].timestamp - b[1].timestamp);

    const toRemove = Math.ceil(entries.length * 0.2);
    
    for (let i = 0; i < toRemove; i++) {
      this._pendingMembers.delete(entries[i][0]);
    }

    logger.warn(`Force cleanup: removed ${toRemove} oldest entries`);
  }

  /**
   * Detiene el manager y limpia recursos
   */
  destroy() {
    if (this._cleanupTimer) {
      clearInterval(this._cleanupTimer);
      this._cleanupTimer = null;
    }

    const count = this._pendingMembers.size;
    this._pendingMembers.clear();
    
    logger.info(`PendingMembersManager destroyed (cleared ${count} entries)`);
  }
}

// Singleton instance
let instance = null;

/**
 * Obtiene o crea la instancia singleton
 */
export function getPendingMembersManager(config = {}) {
  if (!instance) {
    instance = new PendingMembersManager(config);
  }
  return instance;
}

/**
 * Destruye la instancia singleton
 */
export function destroyPendingMembersManager() {
  if (instance) {
    instance.destroy();
    instance = null;
  }
}

export default PendingMembersManager;