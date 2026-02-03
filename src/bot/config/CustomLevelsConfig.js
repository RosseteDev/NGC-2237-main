// src/bot/config/CustomLevelsConfig.js

import { createLogger } from "../utils/Logger.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const logger = createLogger("custom-levels");

/**
 * Sistema de niveles personalizables por servidor
 * - Límite FREE: 10 roles de nivel
 * - Límite PREMIUM: 30 roles de nivel
 */
class CustomLevelsConfig {
  constructor() {
    this.configPath = path.join(__dirname, "../../../data/custom-levels-config.json");
    this.premiumPath = path.join(__dirname, "../../../data/premium-guilds.json");
    this.config = new Map();
    this.premiumGuilds = new Set();
    this.load();
  }

  /**
   * Cargar configuración
   */
  load() {
    try {
      const dataDir = path.dirname(this.configPath);
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }

      // Cargar config de niveles
      if (fs.existsSync(this.configPath)) {
        const data = fs.readFileSync(this.configPath, "utf8");
        const parsed = JSON.parse(data);
        
        Object.entries(parsed).forEach(([guildId, config]) => {
          this.config.set(guildId, config);
        });
        
        logger.info(`Loaded custom levels for ${this.config.size} guilds`);
      }

      // Cargar guilds premium
      if (fs.existsSync(this.premiumPath)) {
        const data = fs.readFileSync(this.premiumPath, "utf8");
        const parsed = JSON.parse(data);
        
        if (Array.isArray(parsed)) {
          parsed.forEach(guildId => this.premiumGuilds.add(guildId));
          logger.info(`Loaded ${this.premiumGuilds.size} premium guilds`);
        }
      }

    } catch (error) {
      logger.error("Failed to load custom levels config", error);
      this.config = new Map();
      this.premiumGuilds = new Set();
    }
  }

  /**
   * Guardar configuración
   */
  save() {
    try {
      // Guardar config de niveles
      const configObj = {};
      this.config.forEach((config, guildId) => {
        configObj[guildId] = config;
      });

      fs.writeFileSync(
        this.configPath,
        JSON.stringify(configObj, null, 2),
        "utf8"
      );

      // Guardar guilds premium
      const premiumArray = Array.from(this.premiumGuilds);
      fs.writeFileSync(
        this.premiumPath,
        JSON.stringify(premiumArray, null, 2),
        "utf8"
      );
      
      logger.debug(`Saved custom levels config`);
      return true;
    } catch (error) {
      logger.error("Failed to save custom levels config", error);
      return false;
    }
  }

  /**
   * Obtener límite de roles para un servidor
   * @param {string} guildId - ID del servidor
   * @returns {number} Límite de roles
   */
  getLimit(guildId) {
    return this.isPremium(guildId) ? 30 : 10;
  }

  /**
   * Verificar si un servidor es premium
   * @param {string} guildId - ID del servidor
   * @returns {boolean}
   */
  isPremium(guildId) {
    return this.premiumGuilds.has(guildId);
  }

  /**
   * Activar premium para un servidor
   * @param {string} guildId - ID del servidor
   * @returns {boolean}
   */
  setPremium(guildId, isPremium = true) {
    if (isPremium) {
      this.premiumGuilds.add(guildId);
    } else {
      this.premiumGuilds.delete(guildId);
    }
    
    return this.save();
  }

  /**
   * Obtener configuración de niveles de un servidor
   * @param {string} guildId - ID del servidor
   * @returns {Object}
   */
  getGuildConfig(guildId) {
    if (!this.config.has(guildId)) {
      return {
        enabled: false,
        roles: [],
        xpPerLevel: 1000,
        levelUpChannel: null
      };
    }
    return this.config.get(guildId);
  }

  /**
   * Establecer configuración de niveles
   * @param {string} guildId - ID del servidor
   * @param {Object} config - Configuración
   * @returns {boolean}
   */
  setGuildConfig(guildId, config) {
    this.config.set(guildId, config);
    return this.save();
  }

  /**
   * Añadir rol de nivel
   * @param {string} guildId - ID del servidor
   * @param {Object} roleData - Datos del rol { level, roleId, name, color }
   * @returns {Object} { success: boolean, error?: string }
   */
  addLevelRole(guildId, roleData) {
    const config = this.getGuildConfig(guildId);
    const limit = this.getLimit(guildId);

    // Validar límite
    if (config.roles.length >= limit) {
      return {
        success: false,
        error: `Has alcanzado el límite de ${limit} roles. ${
          this.isPremium(guildId) 
            ? "" 
            : "Mejora a Premium para hasta 30 roles."
        }`
      };
    }

    // Validar que no exista el nivel
    if (config.roles.some(r => r.level === roleData.level)) {
      return {
        success: false,
        error: `Ya existe un rol para el nivel ${roleData.level}`
      };
    }

    // Añadir y ordenar
    config.roles.push(roleData);
    config.roles.sort((a, b) => a.level - b.level);

    this.setGuildConfig(guildId, config);

    return { success: true };
  }

  /**
   * Eliminar rol de nivel
   * @param {string} guildId - ID del servidor
   * @param {number} level - Nivel a eliminar
   * @returns {boolean}
   */
  removeLevelRole(guildId, level) {
    const config = this.getGuildConfig(guildId);
    
    const index = config.roles.findIndex(r => r.level === level);
    if (index === -1) return false;

    config.roles.splice(index, 1);
    this.setGuildConfig(guildId, config);

    return true;
  }

  /**
   * Obtener rol para un nivel específico
   * @param {string} guildId - ID del servidor
   * @param {number} level - Nivel del usuario
   * @returns {string|null} ID del rol
   */
  getRoleForLevel(guildId, level) {
    const config = this.getGuildConfig(guildId);
    
    // Encontrar el rol más alto que el usuario haya alcanzado
    const eligibleRoles = config.roles.filter(r => r.level <= level);
    
    if (eligibleRoles.length === 0) return null;
    
    // Retornar el de mayor nivel
    const highestRole = eligibleRoles[eligibleRoles.length - 1];
    return highestRole.roleId;
  }

  /**
   * Obtener estadísticas
   * @returns {Object}
   */
  getStats() {
    let totalRoles = 0;
    let enabledGuilds = 0;

    this.config.forEach(config => {
      if (config.enabled) enabledGuilds++;
      totalRoles += config.roles.length;
    });

    return {
      totalGuilds: this.config.size,
      enabledGuilds,
      premiumGuilds: this.premiumGuilds.size,
      totalRoles,
      avgRolesPerGuild: this.config.size > 0 
        ? (totalRoles / this.config.size).toFixed(1)
        : 0
    };
  }
}

// Singleton
let instance = null;

export function getCustomLevelsConfig() {
  if (!instance) {
    instance = new CustomLevelsConfig();
  }
  return instance;
}

export { CustomLevelsConfig };
export default getCustomLevelsConfig;