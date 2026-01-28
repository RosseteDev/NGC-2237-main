// src/localization/Translator.js
// ============================================
// SISTEMA UNIFICADO DE TRADUCCIONES
// Reemplaza: useLang.js, i18n.js, getGuildLang.js
// ============================================

import { readFileSync, readdirSync, existsSync, statSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { db } from "../database/ResilientDatabaseManager.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ============================================
// CONFIGURACIÓN
// ============================================

const CONFIG = {
  defaultLang: "en",
  cacheTTL: 30 * 60 * 1000, // 30 minutos
  i18nPath: join(__dirname, "..", "i18n")
};

// ============================================
// CACHES
// ============================================

// Cache de traducciones por idioma
const translationsCache = new Map();

// Cache de idiomas por guild
const guildLangCache = new Map();

// Cache de búsqueda de traducciones
const searchCache = new Map();

// ============================================
// CARGA DE TRADUCCIONES
// ============================================

/**
 * Cargar recursivamente archivos JSON de un directorio
 */
function loadDirectory(dir, pathParts = []) {
  const result = {};
  
  if (!existsSync(dir)) {
    return result;
  }

  const items = readdirSync(dir);

  for (const item of items) {
    const fullPath = join(dir, item);
    const stat = statSync(fullPath);

    if (stat.isDirectory()) {
      // Carpeta: cargar recursivamente
      const subData = loadDirectory(fullPath, [...pathParts, item]);
      if (Object.keys(subData).length > 0) {
        result[item] = subData;
      }
    } else if (item.endsWith('.json')) {
      // Archivo JSON: cargar
      try {
        const data = JSON.parse(readFileSync(fullPath, "utf-8"));
        const filename = item.replace('.json', '');
        result[filename] = data;
      } catch (error) {
        console.warn(`⚠️ Error cargando ${fullPath}:`, error.message);
      }
    }
  }

  return result;
}

/**
 * Cargar todas las traducciones de un idioma
 */
function loadTranslations(lang) {
  if (translationsCache.has(lang)) {
    return translationsCache.get(lang);
  }

  const langDir = join(CONFIG.i18nPath, lang);
  
  if (!existsSync(langDir)) {
    console.error(`❌ Directorio de idioma no existe: ${langDir}`);
    return {};
  }

  const translations = loadDirectory(langDir);
  translationsCache.set(lang, translations);
  
  console.log(`✅ Traducciones cargadas: ${lang}`);
  
  return translations;
}

// ============================================
// BÚSQUEDA DE TRADUCCIONES
// ============================================

/**
 * Buscar traducción con múltiples estrategias
 */
function findTranslation(translations, key, lang) {
  const cacheKey = `${lang}:${key}`;
  
  // 1. Verificar cache
  if (searchCache.has(cacheKey)) {
    return searchCache.get(cacheKey);
  }

  const parts = key.split(".");
  
  // 2. Búsqueda directa
  let value = translations;
  for (const part of parts) {
    value = value?.[part];
    if (value === undefined) break;
  }
  
  if (typeof value === 'string') {
    searchCache.set(cacheKey, value);
    return value;
  }

  // 3. Búsqueda flexible (ignorar prefijos de categoría)
  // Ejemplo: "utility.purge.start" → buscar también "purge.start"
  if (parts.length > 2) {
    const withoutCategory = parts.slice(1).join(".");
    const flexValue = findTranslation(translations, withoutCategory, lang);
    if (flexValue) {
      searchCache.set(cacheKey, flexValue);
      return flexValue;
    }
  }

  // 4. Búsqueda en commands (caso especial)
  if (parts[0] !== 'commands') {
    const inCommands = `commands.${key}`;
    const cmdValue = findTranslation(translations, inCommands, lang);
    if (cmdValue) {
      searchCache.set(cacheKey, cmdValue);
      return cmdValue;
    }
  }

  // 5. No encontrado
  console.warn(`⚠️ Translation missing: ${key} (${lang})`);
  return null;
}

/**
 * Interpolar variables en texto
 */
function interpolate(text, vars = {}) {
  let result = text;
  for (const [key, value] of Object.entries(vars)) {
    result = result.replace(new RegExp(`\\{${key}\\}`, 'g'), String(value));
  }
  return result;
}

// ============================================
// GESTIÓN DE IDIOMA POR GUILD
// ============================================

/**
 * Obtener idioma de un servidor
 */
async function getGuildLang(guildId) {
  if (!guildId) {
    return CONFIG.defaultLang;
  }

  // 1. Verificar cache
  const cached = guildLangCache.get(guildId);
  if (cached && Date.now() < cached.expires) {
    return cached.value;
  }

  // 2. Obtener de base de datos con fallback
  try {
    const lang = await Promise.race([
      db.getGuildLang(guildId),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error("Timeout")), 1000)
      )
    ]);
    
    // Cachear resultado
    guildLangCache.set(guildId, {
      value: lang,
      expires: Date.now() + CONFIG.cacheTTL
    });
    
    return lang;
    
  } catch (error) {
    // 3. Fallback a idioma por defecto
    const defaultLang = CONFIG.defaultLang;
    
    // Cachear por 30 segundos para evitar spam
    guildLangCache.set(guildId, {
      value: defaultLang,
      expires: Date.now() + 30_000
    });
    
    return defaultLang;
  }
}

/**
 * Detectar idioma desde interaction/message
 */
function detectLang(source) {
  // Prioridad 1: Locale del usuario
  if (source.locale) {
    if (source.locale.startsWith("es")) return "es";
    if (source.locale.startsWith("pt")) return "pt";
    if (source.locale.startsWith("fr")) return "fr";
  }
  
  // Prioridad 2: Locale del servidor
  if (source.guild?.preferredLocale) {
    if (source.guild.preferredLocale.startsWith("es")) return "es";
    if (source.guild.preferredLocale.startsWith("pt")) return "pt";
    if (source.guild.preferredLocale.startsWith("fr")) return "fr";
  }
  
  // Default
  return CONFIG.defaultLang;
}

// ============================================
// API PÚBLICA
// ============================================

/**
 * Crear función de traducción para una interaction
 * USO: const t = await createTranslator(interaction);
 */
export async function createTranslator(source) {
  let lang;
  
  if (source.guildId) {
    // Obtener idioma del servidor
    lang = await getGuildLang(source.guildId);
  } else {
    // Detectar idioma automáticamente
    lang = detectLang(source);
  }
  
  const translations = loadTranslations(lang);
  
  // Retornar función de traducción
  return (key, vars = {}) => {
    const text = findTranslation(translations, key, lang);
    
    if (!text) {
      return key; // Retornar la clave si no se encuentra
    }
    
    return interpolate(text, vars);
  };
}

/**
 * Función de traducción directa (sin interaction)
 * USO: t("en", "common.errors.unexpected")
 */
export function t(lang, key, vars = {}) {
  const translations = loadTranslations(lang);
  const text = findTranslation(translations, key, lang);
  
  if (!text) {
    return key;
  }
  
  return interpolate(text, vars);
}

/**
 * Alias para compatibilidad con código existente
 */
export const useLang = createTranslator;

/**
 * Obtener idioma de servidor (export directo)
 */
export { getGuildLang };

/**
 * Limpiar caches (útil para desarrollo)
 */
export function clearCache() {
  translationsCache.clear();
  guildLangCache.clear();
  searchCache.clear();
  console.log("🧹 Caches de traducción limpiados");
}

// ============================================
// LIMPIEZA AUTOMÁTICA DE CACHE
// ============================================

setInterval(() => {
  const now = Date.now();
  let cleaned = 0;
  
  for (const [key, data] of guildLangCache.entries()) {
    if (now > data.expires) {
      guildLangCache.delete(key);
      cleaned++;
    }
  }
  
  if (cleaned > 0) {
    console.log(`🧹 Guild lang cache cleanup: ${cleaned} items`);
  }
}, 5 * 60 * 1000);

// ============================================
// EXPORT DEFAULT
// ============================================

export default {
  createTranslator,
  useLang,
  t,
  getGuildLang,
  clearCache
};