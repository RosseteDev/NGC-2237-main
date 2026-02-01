// src/utils/TranslatorHelper.js
// ============================================
// SISTEMA DE TRADUCCIÓN MODULAR V2 - DEBUG EDITION
// Con logging detallado para diagnosticar problemas
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

const I18N_PATH = join(__dirname, '..', '..', 'i18n'); // src/bot/utils -> src/i18n
const DEFAULT_LOCALE = 'en';
const CACHE_TTL = 30 * 60 * 1000; // 30 minutos

// Cache de archivos cargados
const fileCache = new Map();

// ✅ NUEVO: Estadísticas de carga
const loadStats = {
  filesLoaded: 0,
  filesFailed: 0,
  translationsLoaded: 0,
  cacheHits: 0,
  cacheMisses: 0
};

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
  
  logger.debug(`┌─ loadJSON: ${cacheKey}`);
  
  // Verificar cache
  const cached = fileCache.get(cacheKey);
  if (cached && Date.now() < cached.expires) {
    loadStats.cacheHits++;
    const translationCount = countTranslations(cached.data);
    logger.debug(`├─ ✅ CACHE HIT (${translationCount} traducciones)`);
    logger.debug(`└─ Expira en: ${Math.floor((cached.expires - Date.now()) / 1000)}s`);
    return cached.data;
  }
  
  loadStats.cacheMisses++;
  
  try {
    const fullPath = join(I18N_PATH, locale, relativePath);
    logger.debug(`├─ 📂 Buscando en: ${fullPath}`);
    logger.debug(`├─ 📂 I18N_PATH base: ${I18N_PATH}`);
    logger.debug(`├─ 📂 __dirname es: ${__dirname}`);
    
    const content = await readFile(fullPath, 'utf-8');
    logger.debug(`├─ 📝 Archivo leído: ${content.length} bytes`);
    
    // Mostrar primeros 200 caracteres del contenido
    logger.debug(`├─ 📄 Preview: ${content.substring(0, 200)}...`);
    
    const data = JSON.parse(content);
    const translationCount = countTranslations(data);
    
    logger.debug(`├─ ✅ JSON parseado exitosamente`);
    logger.debug(`├─ 📊 Estructura raíz: ${JSON.stringify(Object.keys(data))}`);
    logger.debug(`├─ 🔢 Total de traducciones: ${translationCount}`);
    
    // Mostrar estructura detallada
    logStructure(data, '│  ');
    
    // Cachear resultado
    fileCache.set(cacheKey, {
      data,
      expires: Date.now() + CACHE_TTL
    });
    
    loadStats.filesLoaded++;
    loadStats.translationsLoaded += translationCount;
    
    logger.info(`└─ 💾 ${locale}/${relativePath} → ${translationCount} traducciones cacheadas`);
    return data;
    
  } catch (error) {
    if (error.code === 'ENOENT') {
      logger.warn(`├─ ❌ Archivo no existe`);
      logger.debug(`└─ Buscado en: ${join(I18N_PATH, locale, relativePath)}`);
      loadStats.filesFailed++;
      return {};
    }
    
    loadStats.filesFailed++;
    logger.error(`├─ 💥 Error: ${error.message}`);
    logger.error(`├─ Stack: ${error.stack?.split('\n')[0]}`);
    logger.error(`└─ Code: ${error.code}`);
    return {};
  }
}

/**
 * ✅ NUEVO: Mostrar estructura jerárquica del objeto
 */
function logStructure(obj, indent = '', maxDepth = 3, currentDepth = 0) {
  if (currentDepth >= maxDepth || !obj || typeof obj !== 'object') return;
  
  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === 'string') {
      logger.debug(`${indent}├─ "${key}": "${value.substring(0, 50)}${value.length > 50 ? '...' : ''}"`);
    } else if (typeof value === 'object' && value !== null) {
      const childCount = Object.keys(value).length;
      logger.debug(`${indent}├─ "${key}": {${childCount} keys}`);
      logStructure(value, indent + '│  ', maxDepth, currentDepth + 1);
    } else {
      logger.debug(`${indent}├─ "${key}": ${typeof value}`);
    }
  }
}

/**
 * Fusionar objetos profundamente
 * @param {Object} target - Objeto destino
 * @param {Object} source - Objeto fuente
 * @returns {Object} Objeto fusionado
 */
function deepMerge(target, source) {
  logger.debug(`🔀 deepMerge: fusionando ${Object.keys(source).length} claves`);
  
  for (const [key, value] of Object.entries(source)) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      if (!target[key] || typeof target[key] !== 'object') {
        target[key] = {};
        logger.debug(`  ├─ Creando objeto: "${key}"`);
      } else {
        logger.debug(`  ├─ Fusionando objeto: "${key}"`);
      }
      deepMerge(target[key], value);
    } else {
      target[key] = value;
      logger.debug(`  ├─ Añadiendo: "${key}" = ${typeof value === 'string' ? `"${value.substring(0, 30)}..."` : typeof value}`);
    }
  }
  
  logger.debug(`  └─ Resultado: ${countTranslations(target)} traducciones totales`);
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
  logger.debug(`🌍 detectLanguage iniciado`);
  
  try {
    // Intentar obtener desde DB
    const { db } = await import('../database/ResilientDatabaseManager.js');
    
    if (db.available && context.guild?.id) {
      logger.debug(`├─ DB disponible, consultando guild ${context.guild.id}`);
      
      try {
        const lang = await Promise.race([
          db.getGuildLang(context.guild.id),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Timeout')), 800)
          )
        ]);
        
        logger.info(`└─ ✅ Idioma desde DB: "${lang}"`);
        return lang;
      } catch (error) {
        logger.debug(`├─ ⚠️ DB timeout: ${error.message}`);
        logger.debug(`└─ Fallback a locale de Discord`);
      }
    } else {
      logger.debug(`├─ DB no disponible o sin guild`);
      logger.debug(`└─ Usando locale de Discord`);
    }
  } catch (error) {
    logger.debug(`└─ Error importando DB: ${error.message}`);
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
  
  logger.debug(`🗣️ detectLanguageFromLocale`);
  logger.debug(`├─ context.locale: "${context.locale}"`);
  logger.debug(`├─ guild.preferredLocale: "${context.guild?.preferredLocale}"`);
  logger.debug(`├─ Locale detectado: "${locale}"`);
  
  if (!locale) {
    logger.info(`└─ ⚠️ Sin locale, usando default: "${DEFAULT_LOCALE}"`);
    return DEFAULT_LOCALE;
  }
  
  // Mapeo simple
  let detected = DEFAULT_LOCALE;
  
  if (locale.startsWith('es')) detected = 'es';
  else if (locale.startsWith('pt')) detected = 'pt';
  else if (locale.startsWith('fr')) detected = 'fr';
  else if (locale.startsWith('de')) detected = 'de';
  else if (locale.startsWith('it')) detected = 'it';
  else if (locale.startsWith('ja')) detected = 'ja';
  else if (locale.startsWith('ko')) detected = 'ko';
  else if (locale.startsWith('zh')) detected = 'zh';
  else if (locale.startsWith('ru')) detected = 'ru';
  
  logger.info(`└─ ✅ Idioma detectado: "${detected}"`);
  return detected;
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
  
  logger.info(`\n${'='.repeat(60)}`);
  logger.info(`🔧 CREANDO TRADUCTOR`);
  logger.info(`${'='.repeat(60)}`);
  logger.info(`├─ Comando: ${commandData.category}/${commandData.name}`);
  logger.info(`├─ Locale: ${locale}`);
  logger.info(`└─ Usuario: ${context.user?.tag || 'Unknown'}`);
  
  const translations = {};
  
  // ========================================
  // ESTRATEGIA DE CARGA (ORDEN DE PRIORIDAD)
  // ========================================
  
  logger.info(`\n📦 FASE 1: CARGANDO ARCHIVOS COMUNES`);
  logger.info(`${'─'.repeat(60)}`);
  
  // 1. Common (errores globales, permisos, validación)
  const commonFiles = ['errors.json', 'permissions.json', 'validation.json'];
  for (const file of commonFiles) {
    const data = await loadJSON(`common/${file}`, locale);
    if (Object.keys(data).length > 0) {
      deepMerge(translations, data);
    } else {
      logger.warn(`⚠️ common/${file} está vacío o no existe`);
    }
  }
  
  logger.info(`\n📦 FASE 2: CARGANDO UTILITY`);
  logger.info(`${'─'.repeat(60)}`);
  
  // 2. Utility (helpers compartidos como embeds)
  const utilityPaths = [
    'utility/music/embed.json',
  ];
  for (const path of utilityPaths) {
    const data = await loadJSON(path, locale);
    if (Object.keys(data).length > 0) {
      deepMerge(translations, data);
    } else {
      logger.debug(`⚠️ ${path} está vacío o no existe`);
    }
  }
  
  logger.info(`\n📦 FASE 3: CARGANDO COMANDO ESPECÍFICO`);
  logger.info(`${'─'.repeat(60)}`);
  
  // 3. Comando específico (mayor prioridad)
  if (commandData.category && commandData.name) {
    const commandPath = `commands/${commandData.category}/${commandData.name}.json`;
    logger.debug(`Buscando: ${commandPath}`);
    
    const commandData_i18n = await loadJSON(commandPath, locale);
    if (Object.keys(commandData_i18n).length > 0) {
      deepMerge(translations, commandData_i18n);
    } else {
      logger.warn(`⚠️ ${commandPath} está vacío o no existe`);
    }
  }
  
  const totalKeys = countTranslations(translations);
  
  logger.info(`\n📊 RESUMEN DE CARGA`);
  logger.info(`${'─'.repeat(60)}`);
  logger.info(`├─ Total de traducciones: ${totalKeys}`);
  logger.info(`├─ Archivos cargados: ${loadStats.filesLoaded}`);
  logger.info(`├─ Archivos fallidos: ${loadStats.filesFailed}`);
  logger.info(`├─ Cache hits: ${loadStats.cacheHits}`);
  logger.info(`├─ Cache misses: ${loadStats.cacheMisses}`);
  logger.info(`└─ Estructura final: ${JSON.stringify(Object.keys(translations))}`);
  
  // Mostrar primeras 10 claves
  logger.info(`\n🔑 PRIMERAS CLAVES DISPONIBLES:`);
  const allKeys = getAllKeys(translations);
  allKeys.slice(0, 10).forEach((key, i) => {
    logger.info(`  ${i + 1}. "${key}"`);
  });
  if (allKeys.length > 10) {
    logger.info(`  ... y ${allKeys.length - 10} más`);
  }
  
  // ========================================
  // FALLBACK A INGLÉS
  // ========================================
  
  let fallbackTranslations = {};
  
  if (locale !== DEFAULT_LOCALE) {
    logger.info(`\n📦 CARGANDO FALLBACK (${DEFAULT_LOCALE})`);
    logger.info(`${'─'.repeat(60)}`);
    
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
    
    const fallbackCount = countTranslations(fallbackTranslations);
    logger.info(`└─ Fallback cargado: ${fallbackCount} traducciones`);
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
    logger.debug(`🔍 t("${key}") llamado`);
    
    // Buscar traducción
    let text = findNestedKey(translations, key);
    
    if (text) {
      logger.debug(`  ├─ ✅ Encontrado en locale principal: "${text.substring(0, 50)}..."`);
    } else {
      logger.debug(`  ├─ ❌ No encontrado en locale principal`);
      
      // Fallback a inglés
      if (Object.keys(fallbackTranslations).length > 0) {
        text = findNestedKey(fallbackTranslations, key);
        if (text) {
          logger.warn(`  ├─ ⚠️ Usando fallback (${DEFAULT_LOCALE}): "${text.substring(0, 50)}..."`);
        }
      }
    }
    
    // Si no existe, retornar clave con marcador
    if (!text) {
      logger.error(`  └─ 💥 Traducción faltante: ${key} (locale: ${locale})`);
      logger.error(`     Claves disponibles similares:`);
      
      // Buscar claves similares
      const allKeys = getAllKeys(translations);
      const similar = allKeys.filter(k => 
        k.includes(key) || key.includes(k) || levenshteinDistance(k, key) < 3
      ).slice(0, 5);
      
      similar.forEach(k => {
        logger.error(`       - "${k}"`);
      });
      
      return `[Missing: ${key}]`;
    }
    
    // Interpolación de variables
    let result = text;
    for (const [k, v] of Object.entries(vars)) {
      result = result.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
      logger.debug(`  ├─ Interpolando: {${k}} → "${String(v)}"`);
    }
    
    logger.debug(`  └─ ✅ Retornando: "${result.substring(0, 50)}..."`);
    return result;
  }
  
  // Metadata
  t.locale = locale;
  t.commandData = commandData;
  
  logger.info(`\n✅ TRADUCTOR CREADO EXITOSAMENTE`);
  logger.info(`${'='.repeat(60)}\n`);
  
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
  logger.debug(`    🔎 findNestedKey("${key}")`);
  
  // 1. Búsqueda directa
  if (obj[key] && typeof obj[key] === 'string') {
    logger.debug(`      ✅ Encontrado en nivel raíz`);
    return obj[key];
  }
  
  // 2. Búsqueda con dot notation
  if (key.includes('.')) {
    const parts = key.split('.');
    logger.debug(`      Buscando path: ${parts.join(' → ')}`);
    
    let current = obj;
    
    for (const part of parts) {
      logger.debug(`        ├─ Navegando a: "${part}"`);
      current = current?.[part];
      if (current === undefined) {
        logger.debug(`        └─ ❌ No encontrado en "${part}"`);
        return null;
      }
    }
    
    if (typeof current === 'string') {
      logger.debug(`      ✅ Encontrado vía dot notation`);
      return current;
    }
    
    logger.debug(`      ❌ Resultado no es string: ${typeof current}`);
    return null;
  }
  
  // 3. Búsqueda en primer nivel de anidación (para compatibilidad)
  logger.debug(`      Buscando en primer nivel de anidación...`);
  for (const topKey of Object.keys(obj)) {
    if (typeof obj[topKey] === 'object' && obj[topKey] !== null) {
      if (obj[topKey][key] && typeof obj[topKey][key] === 'string') {
        logger.debug(`      ✅ Encontrado en: "${topKey}.${key}"`);
        return obj[topKey][key];
      }
    }
  }
  
  logger.debug(`      ❌ No encontrado en ningún nivel`);
  return null;
}

/**
 * ✅ NUEVO: Obtener todas las claves disponibles (recursivamente)
 */
function getAllKeys(obj, prefix = '', keys = []) {
  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    
    if (typeof value === 'string') {
      keys.push(fullKey);
    } else if (typeof value === 'object' && value !== null) {
      getAllKeys(value, fullKey, keys);
    }
  }
  
  return keys;
}

/**
 * ✅ NUEVO: Distancia de Levenshtein (para sugerencias)
 */
function levenshteinDistance(a, b) {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  
  const matrix = [];
  
  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }
  
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }
  
  return matrix[b.length][a.length];
}

// ========================================
// UTILIDADES
// ========================================

/**
 * Limpiar cache de traducciones
 */
export function clearTranslationCache() {
  fileCache.clear();
  logger.info('🧹 Cache de traducciones limpiado');
  
  // Resetear stats
  loadStats.filesLoaded = 0;
  loadStats.filesFailed = 0;
  loadStats.translationsLoaded = 0;
  loadStats.cacheHits = 0;
  loadStats.cacheMisses = 0;
}

/**
 * Obtener estadísticas del cache
 * @returns {Object} Stats del cache
 */
export function getCacheStats() {
  return {
    size: fileCache.size,
    keys: Array.from(fileCache.keys()),
    stats: { ...loadStats }
  };
}

/**
 * Crear traductor simple sin contexto de comando
 * @param {string} locale - Código de idioma
 * @returns {Promise<Function>} Función de traducción
 */
export async function createSimpleTranslator(locale = DEFAULT_LOCALE) {
  logger.info(`🔧 Creando traductor simple (locale: ${locale})`);
  
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