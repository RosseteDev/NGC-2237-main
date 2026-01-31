// src/utils/TranslatorHelper.js
// ============================================
// SISTEMA DE TRADUCCIÓN MODULAR V2
// Soporta estructura de archivos separados
// ============================================

import { readFile } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createLogger } from './Logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const logger = createLogger('translator');

// ========================================
// CONFIGURACIÓN
// ========================================

const I18N_PATH = join(__dirname, '..', 'i18n');
const DEFAULT_LOCALE = 'en';
const CACHE_TTL = 30 * 60 * 1000; // 30 minutos

// Cache de archivos cargados
const fileCache = new Map();

// ========================================
// CARGA DE ARCHIVOS JSON
// ========================================

/**
 * Cargar un archivo JSON con cache
 * @param {string} relativePath - Ruta relativa desde i18n/{locale}/
 * @param {string} locale - Código de idioma
 * @returns {Promise<Object>} Contenido del archivo o {}
 */
async function loadJSON(relativePath, locale) {
  const cacheKey = `${locale}:${relativePath}`;
  
  // Verificar cache
  const cached = fileCache.get(cacheKey);
  if (cached && Date.now() < cached.expires) {
    return cached.data;
  }
  
  try {
    const fullPath = join(I18N_PATH, locale, relativePath);
    const content = await readFile(fullPath, 'utf-8');
    const data = JSON.parse(content);
    
    // Cachear resultado
    fileCache.set(cacheKey, {
      data,
      expires: Date.now() + CACHE_TTL
    });
    
    logger.debug(`Cargado: ${locale}/${relativePath}`);
    return data;
    
  } catch (error) {
    if (error.code === 'ENOENT') {
      logger.debug(`No existe: ${locale}/${relativePath}`);
      return {};
    }
    
    logger.error(`Error cargando ${locale}/${relativePath}:`, error.message);
    return {};
  }
}

/**
 * Fusionar objetos profundamente
 * @param {Object} target - Objeto destino
 * @param {Object} source - Objeto fuente
 * @returns {Object} Objeto fusionado
 */
function deepMerge(target, source) {
  for (const [key, value] of Object.entries(source)) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      if (!target[key] || typeof target[key] !== 'object') {
        target[key] = {};
      }
      deepMerge(target[key], value);
    } else {
      target[key] = value;
    }
  }
  return target;
}

/**
 * Contar claves de traducción recursivamente
 * @param {Object} obj - Objeto a contar
 * @returns {number} Número de traducciones (strings)
 */
function countTranslations(obj, depth = 0) {
  if (!obj || typeof obj !== 'object') return 0;
  
  let count = 0;
  for (const value of Object.values(obj)) {
    if (typeof value === 'string') {
      count++;
    } else if (typeof value === 'object' && value !== null) {
      count += countTranslations(value, depth + 1);
    }
  }
  return count;
}

// ========================================
// DETECCIÓN DE IDIOMA
// ========================================

/**
 * Detectar idioma del usuario/servidor
 * @param {Object} context - Contexto del comando
 * @returns {Promise<string>} Código de idioma
 */
export async function detectLanguage(context) {
  try {
    // Intentar obtener desde DB
    const { db } = await import('../database/ResilientDatabaseManager.js');
    
    if (db.available && context.guild?.id) {
      try {
        const lang = await Promise.race([
          db.getGuildLang(context.guild.id),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Timeout')), 800)
          )
        ]);
        
        logger.debug(`Idioma desde DB: ${lang}`);
        return lang;
      } catch (error) {
        logger.debug(`DB timeout, usando locale: ${error.message}`);
      }
    }
  } catch (error) {
    logger.debug('DB no disponible, usando locale');
  }
  
  // Fallback: locale de Discord
  return detectLanguageFromLocale(context);
}

/**
 * Detectar idioma desde locale de Discord
 * @param {Object} context - Contexto del comando
 * @returns {string} Código de idioma
 */
function detectLanguageFromLocale(context) {
  const locale = context.locale || context.guild?.preferredLocale;
  
  if (!locale) {
    return DEFAULT_LOCALE;
  }
  
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
  
  return DEFAULT_LOCALE;
}

// ========================================
// CREACIÓN DEL TRADUCTOR
// ========================================

/**
 * Crear función de traducción para un comando
 * @param {Object} commandData - Datos del comando (buildCommand)
 * @param {Object} context - Contexto del comando
 * @returns {Promise<Function>} Función de traducción t(key, vars)
 */
export async function createTranslator(commandData, context) {
  const locale = await detectLanguage(context);
  
  logger.info(`Creando traductor: ${commandData.category}/${commandData.name} (${locale})`);
  
  const translations = {};
  
  // ========================================
  // ESTRATEGIA DE CARGA (ORDEN DE PRIORIDAD)
  // ========================================
  
  // 1. Common (errores globales, permisos, validación)
  logger.debug('Cargando common...');
  const commonFiles = ['errors.json', 'permissions.json', 'validation.json'];
  for (const file of commonFiles) {
    const data = await loadJSON(`common/${file}`, locale);
    deepMerge(translations, data);
  }
  
  // 2. Utility (helpers compartidos como embeds)
  logger.debug('Cargando utility...');
  const utilityPaths = [
    'utility/music/embed.json',
    // Agregar más paths según necesites
  ];
  for (const path of utilityPaths) {
    const data = await loadJSON(path, locale);
    deepMerge(translations, data);
  }
  
  // 3. Comando específico (mayor prioridad)
  if (commandData.category && commandData.name) {
    logger.debug(`Cargando comando: ${commandData.category}/${commandData.name}`);
    
    const commandPath = `commands/${commandData.category}/${commandData.name}.json`;
    const commandData_i18n = await loadJSON(commandPath, locale);
    deepMerge(translations, commandData_i18n);
  }
  
  const totalKeys = countTranslations(translations);
  logger.info(`Total de traducciones cargadas: ${totalKeys}`);
  
  // ========================================
  // FALLBACK A INGLÉS
  // ========================================
  
  let fallbackTranslations = {};
  
  if (locale !== DEFAULT_LOCALE) {
    logger.debug('Cargando fallback (inglés)...');
    
    // Cargar las mismas rutas en inglés
    for (const file of commonFiles) {
      const data = await loadJSON(`common/${file}`, DEFAULT_LOCALE);
      deepMerge(fallbackTranslations, data);
    }
    
    for (const path of utilityPaths) {
      const data = await loadJSON(path, DEFAULT_LOCALE);
      deepMerge(fallbackTranslations, data);
    }
    
    if (commandData.category && commandData.name) {
      const commandPath = `commands/${commandData.category}/${commandData.name}.json`;
      const data = await loadJSON(commandPath, DEFAULT_LOCALE);
      deepMerge(fallbackTranslations, data);
    }
  }
  
  // ========================================
  // FUNCIÓN DE TRADUCCIÓN
  // ========================================
  
  /**
   * Función de traducción
   * @param {string} key - Clave de traducción (ej: "responses.no_voice", "embed.title")
   * @param {Object} vars - Variables para interpolación
   * @returns {string} Texto traducido
   */
  function t(key, vars = {}) {
    // Buscar traducción
    let text = findNestedKey(translations, key);
    
    // Fallback a inglés
    if (!text && Object.keys(fallbackTranslations).length > 0) {
      text = findNestedKey(fallbackTranslations, key);
      if (text) {
        logger.warn(`Usando fallback para: ${key} (locale: ${locale})`);
      }
    }
    
    // Si no existe, retornar clave con marcador
    if (!text) {
      logger.error(`Traducción faltante: ${key} (locale: ${locale})`);
      return `[Missing: ${key}]`;
    }
    
    // Interpolación de variables
    for (const [k, v] of Object.entries(vars)) {
      text = text.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
    }
    
    return text;
  }
  
  // Metadata
  t.locale = locale;
  t.commandData = commandData;
  
  return t;
}

/**
 * Buscar clave en objeto anidado
 * Soporta dot notation: "responses.error", "embed.title"
 * @param {Object} obj - Objeto donde buscar
 * @param {string} key - Clave (puede tener puntos)
 * @returns {string|null} Valor encontrado o null
 */
function findNestedKey(obj, key) {
  // 1. Búsqueda directa
  if (obj[key] && typeof obj[key] === 'string') {
    return obj[key];
  }
  
  // 2. Búsqueda con dot notation
  if (key.includes('.')) {
    const parts = key.split('.');
    let current = obj;
    
    for (const part of parts) {
      current = current?.[part];
      if (current === undefined) return null;
    }
    
    return typeof current === 'string' ? current : null;
  }
  
  // 3. Búsqueda en primer nivel de anidación (para compatibilidad)
  for (const topKey of Object.keys(obj)) {
    if (typeof obj[topKey] === 'object' && obj[topKey] !== null) {
      if (obj[topKey][key] && typeof obj[topKey][key] === 'string') {
        return obj[topKey][key];
      }
    }
  }
  
  return null;
}

// ========================================
// UTILIDADES
// ========================================

/**
 * Limpiar cache de traducciones
 */
export function clearTranslationCache() {
  fileCache.clear();
  logger.info('Cache de traducciones limpiado');
}

/**
 * Obtener estadísticas del cache
 * @returns {Object} Stats del cache
 */
export function getCacheStats() {
  return {
    size: fileCache.size,
    keys: Array.from(fileCache.keys())
  };
}

/**
 * Crear traductor simple sin contexto de comando
 * @param {string} locale - Código de idioma
 * @returns {Promise<Function>} Función de traducción
 */
export async function createSimpleTranslator(locale = DEFAULT_LOCALE) {
  const translations = {};
  
  // Cargar solo archivos comunes
  const commonFiles = ['errors.json', 'permissions.json', 'validation.json'];
  for (const file of commonFiles) {
    const data = await loadJSON(`common/${file}`, locale);
    deepMerge(translations, data);
  }
  
  function t(key, vars = {}) {
    let text = findNestedKey(translations, key) || `[Missing: ${key}]`;
    
    for (const [k, v] of Object.entries(vars)) {
      text = text.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
    }
    
    return text;
  }
  
  t.locale = locale;
  return t;
}

// ========================================
// EXPORTS
// ========================================

export default {
  createTranslator,
  createSimpleTranslator,
  detectLanguage,
  clearTranslationCache,
  getCacheStats
};