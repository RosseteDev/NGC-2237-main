// src/bot/config/GenderRolesConfig.js

import { createLogger } from "../../utils/Logger.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const logger = createLogger("gender-config");

/**
 * Configuración de roles de género por servidor
 */
class GenderRolesConfig {
  constructor() {
    this.configPath = path.join(__dirname, "../../../data/gender-roles-config.json");
    this.config = new Map();
    this.load();
  }

  /**
   * Cargar configuración desde archivo
   */
  load() {
    try {
      // Crear directorio data si no existe
      const dataDir = path.dirname(this.configPath);
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }

      // Cargar configuración si existe
      if (fs.existsSync(this.configPath)) {
        const data = fs.readFileSync(this.configPath, "utf8");
        const parsed = JSON.parse(data);
        
        // Convertir objeto a Map
        Object.entries(parsed).forEach(([guildId, config]) => {
          this.config.set(guildId, config);
        });
        
        logger.info(`Loaded gender config for ${this.config.size} guilds`);
      } else {
        logger.info("No existing gender config file found, starting fresh");
      }
    } catch (error) {
      logger.error("Failed to load gender config", error);
      this.config = new Map();
    }
  }

  /**
   * Guardar configuración a archivo
   */
  save() {
    try {
      // Convertir Map a objeto
      const obj = {};
      this.config.forEach((config, guildId) => {
        obj[guildId] = config;
      });

      // Guardar
      fs.writeFileSync(
        this.configPath,
        JSON.stringify(obj, null, 2),
        "utf8"
      );
      
      logger.debug(`Saved gender config for ${this.config.size} guilds`);
      return true;
    } catch (error) {
      logger.error("Failed to save gender config", error);
      return false;
    }
  }

  /**
   * Obtener configuración de un servidor
   * @param {string} guildId - ID del servidor
   * @returns {Object} Configuración del servidor
   */
  getGuildConfig(guildId) {
    if (!this.config.has(guildId)) {
      return this.getDefaultConfig();
    }
    return this.config.get(guildId);
  }

  /**
   * Establecer configuración de un servidor
   * @param {string} guildId - ID del servidor
   * @param {Object} config - Nueva configuración
   * @returns {boolean} Si se guardó correctamente
   */
  setGuildConfig(guildId, config) {
    this.config.set(guildId, config);
    return this.save();
  }

  /**
   * Eliminar configuración de un servidor
   * @param {string} guildId - ID del servidor
   * @returns {boolean} Si se eliminó correctamente
   */
  deleteGuildConfig(guildId) {
    this.config.delete(guildId);
    return this.save();
  }

  /**
   * Obtener configuración por defecto
   * @returns {Object} Configuración por defecto
   */
  getDefaultConfig() {
    return {
      enabled: false,
      roles: {
        male: { id: null },
        female: { id: null },
        nonbinary: { id: null }
      },
      timeout: 300000, // 5 minutos en milisegundos
      fallbackBehavior: "neutral", // 'neutral' | 'skip' | 'default'
      notifyOnTimeout: false
    };
  }

  /**
   * Verificar si un servidor tiene el sistema activado
   * @param {string} guildId - ID del servidor
   * @returns {boolean}
   */
  isEnabled(guildId) {
    const config = this.getGuildConfig(guildId);
    return config.enabled === true;
  }

  /**
   * Obtener el rol de género para un miembro
   * @param {string} guildId - ID del servidor
   * @param {GuildMember} member - Miembro del servidor
   * @returns {string|null} 'male', 'female', 'nonbinary', o null
   */
  getGenderRole(guildId, member) {
    const config = this.getGuildConfig(guildId);
    
    if (!config.enabled) return null;

    // Verificar cada rol
    if (config.roles.male?.id && member.roles.cache.has(config.roles.male.id)) {
      return "male";
    }
    
    if (config.roles.female?.id && member.roles.cache.has(config.roles.female.id)) {
      return "female";
    }
    
    if (config.roles.nonbinary?.id && member.roles.cache.has(config.roles.nonbinary.id)) {
      return "nonbinary";
    }

    return null;
  }

  /**
   * Detectar género desde array de IDs de roles
   * @param {string} guildId - ID del servidor
   * @param {string[]} roleIds - Array de IDs de roles
   * @returns {string|null} 'male', 'female', 'nonbinary', o null
   */
  detectGenderFromRoles(guildId, roleIds) {
    const config = this.getGuildConfig(guildId);
    
    if (!config.enabled) return null;

    // Verificar cada rol de género
    if (config.roles.male?.id && roleIds.includes(config.roles.male.id)) {
      return "male";
    }
    
    if (config.roles.female?.id && roleIds.includes(config.roles.female.id)) {
      return "female";
    }
    
    if (config.roles.nonbinary?.id && roleIds.includes(config.roles.nonbinary.id)) {
      return "nonbinary";
    }

    return null;
  }

  /**
   * Obtener timeout configurado para un servidor
   * @param {string} guildId - ID del servidor
   * @returns {number} Timeout en milisegundos
   */
  getTimeout(guildId) {
    const config = this.getGuildConfig(guildId);
    return config.timeout || 300000; // 5 minutos por defecto
  }

  /**
   * Obtener variante de imagen según género
   * @param {string} guildId - ID del servidor
   * @param {string} gender - 'male', 'female', 'nonbinary'
   * @returns {string} Variante de imagen
   */
  getImageVariant(guildId, gender) {
    // Mapeo directo
    const variants = {
      male: 'male',
      female: 'female',
      nonbinary: 'nonbinary'
    };
    
    return variants[gender] || 'neutral';
  }

  /**
   * Obtener estadísticas globales
   * @returns {Object} Estadísticas
   */
  getStats() {
    let enabledGuilds = 0;
    
    this.config.forEach((config) => {
      if (config.enabled) enabledGuilds++;
    });

    return {
      totalGuilds: this.config.size,
      enabledGuilds,
      disabledGuilds: this.config.size - enabledGuilds
    };
  }

  /**
   * Limpiar configuraciones de servidores que ya no existen
   * @param {Client} client - Cliente de Discord
   * @returns {number} Número de configuraciones eliminadas
   */
  cleanup(client) {
    let cleaned = 0;
    const guildIds = client.guilds.cache.map(g => g.id);
    
    this.config.forEach((_, guildId) => {
      if (!guildIds.includes(guildId)) {
        this.config.delete(guildId);
        cleaned++;
      }
    });

    if (cleaned > 0) {
      this.save();
      logger.info(`Cleaned ${cleaned} orphaned guild configs`);
    }

    return cleaned;
  }
}

// Instancia singleton
let instance = null;

/**
 * Obtener la instancia singleton de GenderRolesConfig
 * @returns {GenderRolesConfig}
 */
export function getGenderRolesConfig() {
  if (!instance) {
    instance = new GenderRolesConfig();
  }
  return instance;
}

/**
 * Exportar la clase también por si se necesita
 */
export { GenderRolesConfig };

/**
 * Exportar por defecto la función getter
 */
export default getGenderRolesConfig;