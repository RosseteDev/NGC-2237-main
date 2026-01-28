// src/utils/TranslatorHelper.js

import { readFile } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ========================================
// CONFIGURACIÓN
// ========================================

const DEFAULT_LOCALE = 'en';
const FALLBACK_LOCALE = 'en';

// Cache de traducciones para evitar lecturas repetidas
const translationCache = new Map();

// ========================================
// UTILIDADES DE CACHE
// ========================================

/**
 * Genera una clave única para el cache
 * @param {string} locale - Código de idioma (ej: 'en', 'es')
 * @param {string} path - Ruta del archivo de traducción
 * @returns {string} Clave única
 */
function getCacheKey(locale, path) {
  return `${locale}:${path}`;
}

/**
 * Limpia el cache de traducciones (útil para hot-reload en desarrollo)
 */
export function clearTranslationCache() {
  translationCache.clear();
  console.log('✅ Translation cache cleared');
}

// ========================================
// CARGA DE ARCHIVOS JSON
// ========================================

/**
 * Carga un archivo JSON de traducciones
 * @param {string} relativePath - Ruta relativa desde src/i18n/
 * @param {string} locale - Código de idioma
 * @returns {Promise<Object>} Objeto con traducciones o objeto vacío si no existe
 */
async function loadJSON(relativePath, locale) {
  const cacheKey = getCacheKey(locale, relativePath);
  
  // Verificar cache
  if (translationCache.has(cacheKey)) {
    return translationCache.get(cacheKey);
  }
  
  try {
    // Construir ruta completa: src/i18n/{locale}/{relativePath}
    const fullPath = join(__dirname, '..', 'i18n', locale, relativePath);
    
    const content = await readFile(fullPath, 'utf-8');
    const translations = JSON.parse(content);
    
    // Guardar en cache
    translationCache.set(cacheKey, translations);
    
    return translations;
    
  } catch (error) {
    // Si el archivo no existe, retornar objeto vacío (no es error crítico)
    if (error.code === 'ENOENT') {
      console.warn(`⚠️  Translation file not found: ${locale}/${relativePath}`);
      return {};
    }
    
    // Si hay error de parseo JSON, sí es crítico
    console.error(`❌ Error loading translation file ${locale}/${relativePath}:`, error.message);
    return {};
  }
}

// ========================================
// DETECCIÓN DE LOCALE
// ========================================

/**
 * Obtiene el locale del servidor desde la base de datos o configuración
 * @param {string} guildId - ID del servidor de Discord
 * @returns {Promise<string>} Código de idioma
 */
export async function getGuildLocale(guildId) {
  // TODO: Implementar según tu sistema de base de datos
  // Ejemplo:
  // const guild = await db.guilds.findOne({ id: guildId });
  // return guild?.locale || DEFAULT_LOCALE;
  
  // Por ahora, retornar default
  return DEFAULT_LOCALE;
}

/**
 * Obtiene el locale del usuario (para comandos en DM)
 * @param {string} userId - ID del usuario de Discord
 * @returns {Promise<string>} Código de idioma
 */
export async function getUserLocale(userId) {
  // TODO: Implementar según tu sistema
  return DEFAULT_LOCALE;
}

// ========================================
// CREACIÓN DEL TRADUCTOR
// ========================================

/**
 * Crea una función traductora con contexto
 * @param {Object} commandData - Datos del comando (de buildCommand)
 * @param {Object} context - Contexto de Discord (interaction o message)
 * @returns {Promise<Function>} Función traductora t(key, params)
 */
export async function createTranslator(commandData, context) {
  // Determinar locale
  let locale;
  
  if (context.guild) {
    locale = await getGuildLocale(context.guild.id);
  } else {
    locale = await getUserLocale(context.user.id);
  }
  
  // Si no se pudo determinar, usar default
  if (!locale) {
    locale = DEFAULT_LOCALE;
  }
  
  // ========================================
  // CARGAR TRADUCCIONES EN ORDEN DE PRIORIDAD
  // ========================================
  
  const translations = {};
  
  // 1. Comunes globales (menor prioridad)
  const commonFiles = ['errors.json', 'permissions.json', 'validation.json'];
  for (const file of commonFiles) {
    Object.assign(translations, await loadJSON(`common/${file}`, locale));
  }
  
  // 2. Compartidas de la categoría (prioridad media)
  if (commandData.category) {
    const sharedPath = `commands/${commandData.category}/shared.json`;
    Object.assign(translations, await loadJSON(sharedPath, locale));
  }
  
  // 3. Comando específico (mayor prioridad)
  if (commandData.category && commandData.name) {
    const commandPath = `commands/${commandData.category}/${commandData.name}.json`;
    Object.assign(translations, await loadJSON(commandPath, locale));
  }
  
  // 4. Fallback a inglés si falta alguna key (solo si el locale no es inglés)
  let fallbackTranslations = {};
  if (locale !== FALLBACK_LOCALE) {
    // Cargar las mismas rutas pero en inglés
    for (const file of commonFiles) {
      Object.assign(fallbackTranslations, await loadJSON(`common/${file}`, FALLBACK_LOCALE));
    }
    
    if (commandData.category) {
      const sharedPath = `commands/${commandData.category}/shared.json`;
      Object.assign(fallbackTranslations, await loadJSON(sharedPath, FALLBACK_LOCALE));
    }
    
    if (commandData.category && commandData.name) {
      const commandPath = `commands/${commandData.category}/${commandData.name}.json`;
      Object.assign(fallbackTranslations, await loadJSON(commandPath, FALLBACK_LOCALE));
    }
  }
  
  // ========================================
  // FUNCIÓN TRADUCTORA
  // ========================================
  
  /**
   * Traduce una clave con parámetros opcionales
   * @param {string} key - Clave de traducción
   * @param {Object} params - Parámetros para reemplazar en el texto
   * @returns {string} Texto traducido
   */
  function t(key, params = {}) {
    // Buscar traducción
    let text = translations[key];
    
    // Si no existe, usar fallback
    if (!text && fallbackTranslations[key]) {
      text = fallbackTranslations[key];
      console.warn(`⚠️  Using fallback translation for key: ${key} (locale: ${locale})`);
    }
    
    // Si aún no existe, retornar clave con marcador
    if (!text) {
      console.error(`❌ Missing translation key: ${key} (locale: ${locale})`);
      return `[Missing: ${key}]`;
    }
    
    // Reemplazar placeholders {variable}
    Object.entries(params).forEach(([paramKey, paramValue]) => {
      const placeholder = new RegExp(`\\{${paramKey}\\}`, 'g');
      text = text.replace(placeholder, String(paramValue));
    });
    
    return text;
  }
  
  // Adjuntar metadata útil para debugging
  t.locale = locale;
  t.commandData = commandData;
  t.keysLoaded = Object.keys(translations).length;
  
  return t;
}

// ========================================
// FUNCIÓN LEGACY (compatibilidad)
// ========================================

/**
 * Crea un traductor simple sin contexto de comando
 * Útil para mensajes que no están en un comando específico
 * @param {string} locale - Código de idioma
 * @returns {Promise<Function>} Función traductora
 */
export async function createSimpleTranslator(locale = DEFAULT_LOCALE) {
  const translations = {};
  
  // Solo cargar traducciones comunes
  const commonFiles = ['errors.json', 'permissions.json', 'validation.json'];
  for (const file of commonFiles) {
    Object.assign(translations, await loadJSON(`common/${file}`, locale));
  }
  
  function t(key, params = {}) {
    let text = translations[key] || `[Missing: ${key}]`;
    
    Object.entries(params).forEach(([paramKey, paramValue]) => {
      const placeholder = new RegExp(`\\{${paramKey}\\}`, 'g');
      text = text.replace(placeholder, String(paramValue));
    });
    
    return text;
  }
  
  t.locale = locale;
  
  return t;
}

// ========================================
// UTILIDADES ADICIONALES
// ========================================

/**
 * Obtiene todas las claves disponibles para un comando
 * Útil para debugging y documentación
 * @param {Object} commandData - Datos del comando
 * @param {string} locale - Código de idioma
 * @returns {Promise<string[]>} Array de claves disponibles
 */
export async function getAvailableKeys(commandData, locale = DEFAULT_LOCALE) {
  const translations = {};
  
  // Cargar todas las traducciones
  const commonFiles = ['errors.json', 'permissions.json', 'validation.json'];
  for (const file of commonFiles) {
    Object.assign(translations, await loadJSON(`common/${file}`, locale));
  }
  
  if (commandData.category) {
    const sharedPath = `commands/${commandData.category}/shared.json`;
    Object.assign(translations, await loadJSON(sharedPath, locale));
  }
  
  if (commandData.category && commandData.name) {
    const commandPath = `commands/${commandData.category}/${commandData.name}.json`;
    Object.assign(translations, await loadJSON(commandPath, locale));
  }
  
  return Object.keys(translations).sort();
}

/**
 * Valida que todas las claves requeridas existen para un locale
 * @param {string[]} requiredKeys - Claves que deben existir
 * @param {Object} commandData - Datos del comando
 * @param {string} locale - Código de idioma
 * @returns {Promise<Object>} { valid: boolean, missing: string[] }
 */
export async function validateTranslations(requiredKeys, commandData, locale = DEFAULT_LOCALE) {
  const availableKeys = await getAvailableKeys(commandData, locale);
  const missing = requiredKeys.filter(key => !availableKeys.includes(key));
  
  return {
    valid: missing.length === 0,
    missing,
    locale,
    command: `${commandData.category}/${commandData.name}`
  };
}

// ========================================
// EXPORTACIONES
// ========================================

export default {
  createTranslator,
  createSimpleTranslator,
  getGuildLocale,
  getUserLocale,
  getAvailableKeys,
  validateTranslations,
  clearTranslationCache
};