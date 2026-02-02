// src/bot/utils/Translator.js
// ============================================
// SISTEMA DE TRADUCCIÓN UNIFICADO
// Combina lo mejor de TranslatorHelper + useLang
// Sin redundancias, optimizado, production-ready
// ============================================

import { readFile } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createLogger } from '../utils/Logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const logger = createLogger('translator');

// ========================================
// CONFIGURACIÓN
// ========================================

const CONFIG = {
  i18nPath: join(__dirname, '..', '..', 'i18n'),
  defaultLocale: 'en',
  cacheTTL: 30 * 60 * 1000, // 30 minutos
  enableDebugLogs: process.env.DEBUG_TRANSLATOR === 'true'
};

// Cache de archivos cargados
const fileCache = new Map();

// Estadísticas
const stats = {
  filesLoaded: 0,
  filesFailed: 0,
  cacheHits: 0,
  cacheMisses: 0
};

// ========================================
// DETECCIÓN DE IDIOMA
// ========================================

/**
 * Detecta el idioma del contexto (servidor o usuario)
 * @param {Object} context - Contexto del comando o evento
 * @returns {Promise<string>} Código de idioma
 */
export async function detectLanguage(context) {
  // Prioridad 1: Idioma del servidor (desde DB)
  if (context.guild?.id) {
    try {
      const { db } = await import('../database/ResilientDatabaseManager.js');
      if (db.available) {
        const lang = await Promise.race([
          db.getGuildLang(context.guild.id),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Timeout')), 800)
          )
        ]);
        if (lang) return lang;
      }
    } catch (error) {
      // Continuar con fallback
    }
  }
  
  // Prioridad 2: Locale de Discord
  const locale = context.locale || context.guild?.preferredLocale || 'en-US';
  
  // Mapeo simple
  if (locale.startsWith('es')) return 'es';
  if (locale.startsWith('pt')) return 'pt';
  if (locale.startsWith('fr')) return 'fr';
  if (locale.startsWith('de')) return 'de';
  if (locale.startsWith('it')) return 'it';
  if (locale.startsWith('ja')) return 'ja';
  if (locale.startsWith('ko')) return 'ko';
  if (locale.startsWith('zh')) return 'zh';
  if (locale.startsWith('ru')) return 'ru';
  
  return CONFIG.defaultLocale;
}

// ========================================
// CARGA DE ARCHIVOS
// ========================================

/**
 * Carga un archivo JSON de traducción con cache
 * @param {string} relativePath - Ruta relativa desde i18n/{locale}/
 * @param {string} locale - Código de idioma
 * @returns {Promise<Object>}
 */
async function loadJSON(relativePath, locale) {
  const cacheKey = `${locale}:${relativePath}`;
  
  // Verificar cache
  const cached = fileCache.get(cacheKey);
  if (cached && Date.now() < cached.expires) {
    stats.cacheHits++;
    return cached.data;
  }
  
  stats.cacheMisses++;
  
  try {
    const fullPath = join(CONFIG.i18nPath, locale, relativePath);
    const content = await readFile(fullPath, 'utf-8');
    const data = JSON.parse(content);
    
    // Cachear
    fileCache.set(cacheKey, {
      data,
      expires: Date.now() + CONFIG.cacheTTL
    });
    
    stats.filesLoaded++;
    return data;
    
  } catch (error) {
    if (error.code !== 'ENOENT') {
      stats.filesFailed++;
      if (CONFIG.enableDebugLogs) {
        logger.error(`Error loading ${locale}/${relativePath}:`, error.message);
      }
    }
    return {};
  }
}

/**
 * Fusiona objetos profundamente
 */
function deepMerge(target, source) {
  for (const [key, value] of Object.entries(source)) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      if (!target[key]) target[key] = {};
      deepMerge(target[key], value);
    } else {
      target[key] = value;
    }
  }
  return target;
}

// ========================================
// BÚSQUEDA DE TRADUCCIONES
// ========================================

/**
 * Busca una traducción por clave con soporte dot notation
 * @param {Object} obj - Objeto de traducciones
 * @param {string} key - Clave (puede tener puntos)
 * @returns {string|null}
 */
function findTranslation(obj, key) {
  if (!key || !obj) return null;
  
  // Búsqueda directa
  if (obj[key] && typeof obj[key] === 'string') {
    return obj[key];
  }
  
  // Búsqueda con dot notation
  if (key.includes('.')) {
    const parts = key.split('.');
    let current = obj;
    
    for (const part of parts) {
      current = current?.[part];
      if (current === undefined) return null;
    }
    
    return typeof current === 'string' ? current : null;
  }
  
  // Búsqueda en primer nivel de anidación (compatibilidad)
  for (const topKey of Object.keys(obj)) {
    if (typeof obj[topKey] === 'object' && obj[topKey]?.[key]) {
      return obj[topKey][key];
    }
  }
  
  return null;
}

// ========================================
// CREACIÓN DEL TRADUCTOR
// ========================================

/**
 * Crea una función de traducción para un comando
 * @param {Object} commandData - { category, name } del comando
 * @param {Object} context - Contexto del comando
 * @returns {Promise<Function>}
 */
export async function createTranslator(commandData, context) {
  const locale = await detectLanguage(context);
  const translations = {};
  
  // Cargar archivos comunes
  const commonFiles = ['errors.json', 'permissions.json', 'validation.json'];
  for (const file of commonFiles) {
    const data = await loadJSON(`common/${file}`, locale);
    deepMerge(translations, data);
  }
  
  // Cargar utilities (embeds, etc)
  const utilityFiles = ['utility/music/embed.json'];
  for (const path of utilityFiles) {
    const data = await loadJSON(path, locale);
    deepMerge(translations, data);
  }
  
  // Cargar comando específico
  if (commandData?.category && commandData?.name) {
    const commandPath = `commands/${commandData.category}/${commandData.name}.json`;
    const commandData_i18n = await loadJSON(commandPath, locale);
    deepMerge(translations, commandData_i18n);
  }
  
  // Cargar fallback en inglés si no es inglés
  let fallbackTranslations = {};
  if (locale !== CONFIG.defaultLocale) {
    for (const file of commonFiles) {
      const data = await loadJSON(`common/${file}`, CONFIG.defaultLocale);
      deepMerge(fallbackTranslations, data);
    }
    
    if (commandData?.category && commandData?.name) {
      const commandPath = `commands/${commandData.category}/${commandData.name}.json`;
      const data = await loadJSON(commandPath, CONFIG.defaultLocale);
      deepMerge(fallbackTranslations, data);
    }
  }
  
  // Crear función de traducción
  function t(key, vars = {}) {
    let text = findTranslation(translations, key);
    
    // Fallback a inglés
    if (!text && Object.keys(fallbackTranslations).length > 0) {
      text = findTranslation(fallbackTranslations, key);
    }
    
    // Si no existe, retornar clave
    if (!text) {
      if (CONFIG.enableDebugLogs) {
        logger.warn(`Missing translation: ${key} (${locale})`);
      }
      return `[Missing: ${key}]`;
    }
    
    // Interpolación de variables
    let result = text;
    for (const [k, v] of Object.entries(vars)) {
      result = result.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
    }
    
    return result;
  }
  
  // Metadata
  t.locale = locale;
  t.commandData = commandData;
  t.rawTranslations = translations; // Para acceso directo si es necesario
  
  return t;
}

/**
 * Hook simple para obtener traductor (compatible con useLang)
 * @param {Object} interaction - Interaction de Discord
 * @returns {Promise<Function>}
 */
export async function useLang(interaction) {
  return createTranslator({ category: 'common', name: 'general' }, interaction);
}

// ========================================
// UTILIDADES
// ========================================

/**
 * Limpia el cache de traducciones
 */
export function clearTranslationCache() {
  const size = fileCache.size;
  fileCache.clear();
  
  // Resetear stats
  stats.filesLoaded = 0;
  stats.filesFailed = 0;
  stats.cacheHits = 0;
  stats.cacheMisses = 0;
  
  logger.info(`Cache cleared: ${size} files removed`);
}

/**
 * Obtiene estadísticas del cache
 * @returns {Object}
 */
export function getCacheStats() {
  return {
    size: fileCache.size,
    keys: Array.from(fileCache.keys()),
    stats: { ...stats }
  };
}

/**
 * Configura el sistema de traducción
 * @param {Object} options - Opciones de configuración
 */
export function configure(options = {}) {
  if (options.i18nPath) CONFIG.i18nPath = options.i18nPath;
  if (options.defaultLocale) CONFIG.defaultLocale = options.defaultLocale;
  if (options.cacheTTL) CONFIG.cacheTTL = options.cacheTTL;
  if (options.enableDebugLogs !== undefined) {
    CONFIG.enableDebugLogs = options.enableDebugLogs;
  }
  
  logger.info('Translator configured', CONFIG);
}

// ========================================
// EXPORTS
// ========================================

export default {
  createTranslator,
  useLang,
  detectLanguage,
  clearTranslationCache,
  getCacheStats,
  configure
};