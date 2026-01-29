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
      // Solo mostrar warning en desarrollo
      if (process.env.NODE_ENV === 'development') {
        console.warn(`⚠️  Translation file not found: ${locale}/${relativePath}`);
      }
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

// ✅ Importar sistema de base de datos
import { db } from '../database/ResilientDatabaseManager.js';

/**
 * Obtiene el locale del servidor desde la base de datos
 * @param {string} guildId - ID del servidor de Discord
 * @returns {Promise<string>} Código de idioma
 */
export async function getGuildLocale(guildId) {
  console.log(`\n🔍 [getGuildLocale] Iniciando para guild: ${guildId}`);
  
  if (!guildId) {
    console.log(`⚠️  [getGuildLocale] No guild ID, retornando default`);
    return DEFAULT_LOCALE;
  }
  
  try {
    console.log(`📡 [getGuildLocale] Consultando DB...`);
    
    // Verificar que db esté disponible
    if (!db || !db.getGuildLang) {
      console.warn(`⚠️  [getGuildLocale] DB no inicializada, usando fallback`);
      return DEFAULT_LOCALE;
    }
    
    // Timeout agresivo para evitar delays
    const lang = await Promise.race([
      db.getGuildLang(guildId),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Timeout')), 800)
      )
    ]);
    
    console.log(`✅ [getGuildLocale] DB retornó: "${lang}" (tipo: ${typeof lang})`);
    
    // Validar que sea un idioma soportado
    const supportedLangs = ['en', 'es'];
    if (!supportedLangs.includes(lang)) {
      console.warn(`⚠️ [getGuildLocale] Idioma no soportado "${lang}", usando default`);
      return DEFAULT_LOCALE;
    }
    
    console.log(`✅ [getGuildLocale] Idioma válido, retornando: "${lang}"`);
    return lang;
    
  } catch (error) {
    console.error(`❌ [getGuildLocale] Error:`, error.message);
    console.log(`   Stack:`, error.stack?.split('\n')[0]);
    console.log(`⚠️  [getGuildLocale] Usando fallback: ${DEFAULT_LOCALE}`);
    return DEFAULT_LOCALE;
  }
}

/**
 * Obtiene el locale del usuario (para comandos en DM)
 * @param {string} userId - ID del usuario de Discord
 * @returns {Promise<string>} Código de idioma
 */
export async function getUserLocale(userId) {
  // Por ahora usar default para DMs
  // TODO: Implementar preferencia de usuario si se agrega en el futuro
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
  // ========================================
  // 🔍 DEBUG: Inicio del proceso
  // ========================================
  console.log('\n🔍 ========== TRANSLATOR DEBUG START ==========');
  console.log('📋 Command:', commandData.category, '/', commandData.name);
  console.log('🏰 Guild ID:', context.guild?.id || 'DM');
  console.log('👤 User ID:', context.user?.id);
  
  // Determinar locale
  let locale;
  
  if (context.guild) {
    console.log('📡 Consultando idioma desde DB...');
    try {
      locale = await getGuildLocale(context.guild.id);
      console.log('✅ Idioma obtenido de DB:', locale);
    } catch (error) {
      console.error('❌ Error obteniendo idioma:', error.message);
      console.log('⚠️  DB no disponible, intentando detectar de la interaction...');
      
      // Fallback: intentar detectar del locale de Discord
      if (context.locale) {
        locale = context.locale.startsWith('es') ? 'es' : DEFAULT_LOCALE;
        console.log(`✅ Idioma detectado desde interaction.locale: ${locale}`);
      } else {
        locale = DEFAULT_LOCALE;
        console.log('⚠️  Usando idioma por defecto:', locale);
      }
    }
  } else {
    console.log('💬 Comando en DM, usando idioma por defecto');
    locale = await getUserLocale(context.user.id);
  }
  
  // Si no se pudo determinar, usar default
  if (!locale) {
    console.warn('⚠️  Locale es null/undefined, usando default');
    locale = DEFAULT_LOCALE;
  }
  
  console.log('🌍 Locale final seleccionado:', locale);
  
  // ========================================
  // CARGAR TRADUCCIONES EN ORDEN DE PRIORIDAD
  // ========================================
  
  console.log('\n📚 Cargando archivos de traducción...');
  
  // Función helper para merge profundo
  function deepMerge(target, source) {
    for (const [key, value] of Object.entries(source)) {
      if (typeof value === 'object' && value !== null && typeof target[key] === 'object' && target[key] !== null) {
        // Merge profundo para objetos anidados
        deepMerge(target[key], value);
      } else {
        // Sobrescribir valores primitivos
        target[key] = value;
      }
    }
    return target;
  }
  
  const translations = {};
  
  // 1. Comunes globales (menor prioridad)
  const commonFiles = ['errors.json', 'permissions.json', 'validation.json'];
  console.log('1️⃣  Cargando archivos comunes...');
  for (const file of commonFiles) {
    const loaded = await loadJSON(`common/${file}`, locale);
    const keysCount = Object.keys(loaded).length;
    console.log(`   - common/${file}: ${keysCount} claves`);
    deepMerge(translations, loaded);
  }
  
  // 2. Compartidas de la categoría (prioridad media)
  if (commandData.category) {
    const sharedPath = `commands/${commandData.category}/shared.json`;
    console.log(`2️⃣  Cargando compartidas de categoría...`);
    const loaded = await loadJSON(sharedPath, locale);
    const keysCount = Object.keys(loaded).length;
    console.log(`   - ${sharedPath}: ${keysCount} claves`);
    deepMerge(translations, loaded);
  }
  
  // 3. Comando específico (mayor prioridad)
  if (commandData.category && commandData.name) {
    const commandPath = `commands/${commandData.category}/${commandData.name}.json`;
    console.log(`3️⃣  Cargando comando específico...`);
    const loaded = await loadJSON(commandPath, locale);
    
    // Contar claves correctamente (incluyendo dentro de responses)
    let totalKeys = 0;
    let responseKeys = 0;
    
    if (loaded && typeof loaded === 'object') {
      for (const [key, value] of Object.entries(loaded)) {
        if (key === 'responses' && typeof value === 'object') {
          responseKeys = Object.keys(value).length;
          totalKeys += responseKeys;
        } else if (typeof value !== 'object' || value === null) {
          totalKeys++;
        }
      }
    }
    
    console.log(`   - ${commandPath}: ${totalKeys} claves${responseKeys > 0 ? ` (${responseKeys} en responses)` : ''}`);
    
    // 🔍 DEBUG: Mostrar estructura del archivo cargado
    if (totalKeys > 0) {
      console.log('   📄 Estructura del archivo:');
      console.log('      Top-level keys:', Object.keys(loaded).filter(k => k !== 'responses').join(', '));
      if (loaded.responses) {
        const responseKeysList = Object.keys(loaded.responses);
        console.log('      Keys en "responses":', responseKeysList.slice(0, 5).join(', '), responseKeysList.length > 5 ? `... (+${responseKeysList.length - 5} más)` : '');
      }
    }
    
    deepMerge(translations, loaded);
  }
  
  // Contar claves reales (incluyendo dentro de responses)
  let totalKeysCount = 0;
  for (const [key, value] of Object.entries(translations)) {
    if (key === 'responses' && typeof value === 'object') {
      totalKeysCount += Object.keys(value).length;
    } else if (typeof value !== 'object' || value === null) {
      totalKeysCount++;
    }
  }
  
  console.log(`\n📊 Total de claves cargadas: ${totalKeysCount}`);
  
  // 4. Fallback a inglés si falta alguna key (solo si el locale no es inglés)
  let fallbackTranslations = {};
  if (locale !== FALLBACK_LOCALE) {
    console.log('\n🔄 Cargando fallback en inglés...');
    
    // Cargar las mismas rutas pero en inglés
    for (const file of commonFiles) {
      deepMerge(fallbackTranslations, await loadJSON(`common/${file}`, FALLBACK_LOCALE));
    }
    
    if (commandData.category) {
      const sharedPath = `commands/${commandData.category}/shared.json`;
      deepMerge(fallbackTranslations, await loadJSON(sharedPath, FALLBACK_LOCALE));
    }
    
    if (commandData.category && commandData.name) {
      const commandPath = `commands/${commandData.category}/${commandData.name}.json`;
      deepMerge(fallbackTranslations, await loadJSON(commandPath, FALLBACK_LOCALE));
    }
    
    console.log(`   Fallback: ${Object.keys(fallbackTranslations).length} claves`);
  }
  
  console.log('🔍 ========== TRANSLATOR DEBUG END ==========\n');
  
  // ========================================
  // FUNCIÓN TRADUCTORA CON BÚSQUEDA MEJORADA
  // ========================================
  
  /**
   * Traduce una clave con parámetros opcionales
   * @param {string} key - Clave de traducción
   * @param {Object} params - Parámetros para reemplazar en el texto
   * @returns {string} Texto traducido
   */
  function t(key, params = {}) {
    // 🔍 DEBUG: Búsqueda de traducción
    const debugEnabled = process.env.DEBUG_TRANSLATIONS === 'true';
    
    if (debugEnabled) {
      console.log(`\n🔎 Buscando traducción para: "${key}"`);
    }
    
    // Buscar traducción con soporte para claves anidadas
    let text = findNestedKey(translations, key);
    
    if (debugEnabled) {
      if (text) {
        console.log(`   ✅ Encontrado en traducciones principales`);
        console.log(`   📝 Valor: "${text.substring(0, 50)}${text.length > 50 ? '...' : ''}"`);
      } else {
        console.log(`   ❌ NO encontrado en traducciones principales`);
      }
    }
    
    // Si no existe, usar fallback
    if (!text && Object.keys(fallbackTranslations).length > 0) {
      text = findNestedKey(fallbackTranslations, key);
      if (text) {
        if (debugEnabled) {
          console.log(`   ⚠️  Usando fallback (inglés)`);
        }
        console.warn(`⚠️  Using fallback translation for key: ${key} (locale: ${locale})`);
      }
    }
    
    // Si aún no existe, retornar clave con marcador
    if (!text) {
      console.error(`❌ Missing translation key: ${key} (locale: ${locale})`);
      console.error(`   ℹ️  Available top-level keys:`, Object.keys(translations).slice(0, 10).join(', '));
      if (translations.responses) {
        console.error(`   ℹ️  Keys in "responses":`, Object.keys(translations.responses).slice(0, 10).join(', '));
      }
      return `[Missing: ${key}]`;
    }
    
    // Reemplazar placeholders {variable}
    Object.entries(params).forEach(([paramKey, paramValue]) => {
      const placeholder = new RegExp(`\\{${paramKey}\\}`, 'g');
      text = text.replace(placeholder, String(paramValue));
    });
    
    return text;
  }
  
  /**
   * Buscar clave en objeto anidado
   * Soporta:
   * 1. Claves directas: { "error": "..." }
   * 2. Claves en "responses": { "responses": { "error": "..." } }
   * 3. Claves en "options": { "options": { "query": { "description": "..." } } }
   * 4. Dot notation: "responses.error"
   */
  function findNestedKey(obj, key) {
    const debugKey = process.env.DEBUG_KEY || null;
    const showDebug = debugKey && key.includes(debugKey);
    
    if (showDebug) {
      console.log(`\n🔍 findNestedKey DEBUG para: "${key}"`);
      console.log(`   Objeto top-level keys:`, Object.keys(obj).join(', '));
    }
    
    // 1. Búsqueda directa
    if (obj[key] && typeof obj[key] === 'string') {
      if (showDebug) console.log(`   ✅ Encontrado en búsqueda directa`);
      return obj[key];
    }
    
    // 2. Búsqueda en "responses" (estructura de comandos)
    if (obj.responses && typeof obj.responses === 'object') {
      if (obj.responses[key] && typeof obj.responses[key] === 'string') {
        if (showDebug) console.log(`   ✅ Encontrado en responses`);
        return obj.responses[key];
      }
    }
    
    // 3. Búsqueda con dot notation (ej: "responses.title", "options.query.description")
    if (key.includes('.')) {
      const parts = key.split('.');
      let current = obj;
      
      for (const part of parts) {
        current = current?.[part];
        if (!current) break;
      }
      
      if (typeof current === 'string') {
        if (showDebug) console.log(`   ✅ Encontrado con dot notation`);
        return current;
      }
    }
    
    // 4. Búsqueda recursiva en primer nivel (para compatibilidad)
    for (const topKey of Object.keys(obj)) {
      if (typeof obj[topKey] === 'object' && obj[topKey] !== null) {
        if (obj[topKey][key] && typeof obj[topKey][key] === 'string') {
          if (showDebug) console.log(`   ✅ Encontrado en ${topKey}`);
          return obj[topKey][key];
        }
      }
    }
    
    if (showDebug) console.log(`   ❌ NO encontrado`);
    return null;
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