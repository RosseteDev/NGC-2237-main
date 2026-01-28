// src/localization/Translator.js
// ============================================
// SISTEMA UNIFICADO DE TRADUCCIONES - v2.0
// ============================================
// Diseñado para:
// - Carga lazy + cache agresivo
// - Fallbacks múltiples (no crashea jamás)
// - Compatible con estructura actual
// - Zero breaking changes en comandos existentes

import { readFileSync, readdirSync, existsSync, statSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { db } from "../database/ResilientDatabaseManager.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ============================================
// CONFIG
// ============================================

const CONFIG = {
  defaultLang: "en",
  i18nPath: join(__dirname, "..", "i18n"),
  cacheTTL: 30 * 60 * 1000, // 30min
  guildCacheTTL: 30 * 60 * 1000,
  searchCacheTTL: 60 * 60 * 1000, // 1h (raramente cambian las keys)
  dbTimeout: 800 // ms
};

// ============================================
// CACHES
// ============================================

// Cache de archivos JSON cargados por idioma
// Estructura: Map<lang, Map<filepath, data>>
const fileCache = new Map();

// Cache de idiomas por guild
// Estructura: Map<guildId, {value: lang, expires: timestamp}>
const guildLangCache = new Map();

// Cache de búsqueda de traducciones
// Estructura: Map<"lang:key", {path: string[], value: string}>
const searchCache = new Map();

// ============================================
// CARGA DE ARCHIVOS
// ============================================

/**
 * Cargar archivo JSON individual con cache
 */
function loadFile(lang, relativePath) {
  if (!fileCache.has(lang)) {
    fileCache.set(lang, new Map());
  }
  
  const langCache = fileCache.get(lang);
  
  if (langCache.has(relativePath)) {
    return langCache.get(relativePath);
  }
  
  const fullPath = join(CONFIG.i18nPath, lang, relativePath);
  
  if (!existsSync(fullPath)) {
    return null;
  }
  
  try {
    const data = JSON.parse(readFileSync(fullPath, "utf-8"));
    langCache.set(relativePath, data);
    return data;
  } catch (error) {
    console.warn(`⚠️ Error cargando ${fullPath}:`, error.message);
    return null;
  }
}

/**
 * Escanear recursivamente archivos disponibles
 */
function scanDirectory(dir, collected = [], prefix = "") {
  if (!existsSync(dir)) {
    return collected;
  }
  
  const items = readdirSync(dir);
  
  for (const item of items) {
    const fullPath = join(dir, item);
    const stat = statSync(fullPath);
    
    if (stat.isDirectory()) {
      const newPrefix = prefix ? `${prefix}/${item}` : item;
      scanDirectory(fullPath, collected, newPrefix);
    } else if (item.endsWith('.json')) {
      const relativePath = prefix ? `${prefix}/${item}` : item;
      collected.push(relativePath);
    }
  }
  
  return collected;
}

/**
 * Obtener lista de archivos de traducción disponibles
 */
function getAvailableFiles(lang) {
  const langDir = join(CONFIG.i18nPath, lang);
  return scanDirectory(langDir);
}

// ============================================
// BÚSQUEDA DE TRADUCCIONES
// ============================================

/**
 * Buscar traducción con múltiples estrategias
 * 
 * Estrategias de búsqueda (en orden):
 * 1. Cache de búsqueda (hit inmediato)
 * 2. Búsqueda directa en estructura anidada
 * 3. Búsqueda ignorando primer nivel (commands/utility)
 * 4. Búsqueda en archivo por nombre
 */
function findTranslation(lang, key) {
  const cacheKey = `${lang}:${key}`;
  
  // 1. Cache hit
  const cached = searchCache.get(cacheKey);
  if (cached) {
    return cached.value;
  }
  
  // 2. Determinar archivos candidatos
  const parts = key.split(".");
  const candidates = [];
  
  // Candidato 1: archivo por categoría
  // "utility.purge.start" → buscar en commands/utility.json
  if (parts.length >= 2) {
    candidates.push({
      file: `commands/${parts[0]}.json`,
      path: parts.slice(1)
    });
  }
  
  // Candidato 2: archivo directo
  // "purge.start" → buscar en purge.json
  if (parts.length >= 2) {
    candidates.push({
      file: `${parts[0]}.json`,
      path: parts.slice(1)
    });
  }
  
  // Candidato 3: común
  // "errors.unexpected" → buscar en common.json
  candidates.push({
    file: "common.json",
    path: parts
  });
  
  // 3. Buscar en cada candidato
  for (const candidate of candidates) {
    const data = loadFile(lang, candidate.file);
    if (!data) continue;
    
    // Navegar por el path
    let value = data;
    for (const part of candidate.path) {
      value = value?.[part];
      if (value === undefined) break;
    }
    
    if (typeof value === 'string') {
      // ✅ Encontrado - cachear
      searchCache.set(cacheKey, { value });
      return value;
    }
  }
  
  // 4. Búsqueda exhaustiva (último recurso, costoso)
  const allFiles = getAvailableFiles(lang);
  
  for (const file of allFiles) {
    const data = loadFile(lang, file);
    if (!data) continue;
    
    const value = deepSearch(data, parts);
    if (typeof value === 'string') {
      searchCache.set(cacheKey, { value });
      return value;
    }
  }
  
  // 5. No encontrado
  console.warn(`⚠️ Translation missing: ${key} (${lang})`);
  return null;
}

/**
 * Búsqueda profunda en objeto
 */
function deepSearch(obj, parts) {
  let value = obj;
  for (const part of parts) {
    value = value?.[part];
    if (value === undefined) return null;
  }
  return value;
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
 * Obtener idioma de servidor con fallback robusto
 */
async function getGuildLang(guildId) {
  if (!guildId) {
    return CONFIG.defaultLang;
  }
  
  // 1. Cache hit
  const cached = guildLangCache.get(guildId);
  if (cached && Date.now() < cached.expires) {
    return cached.value;
  }
  
  // 2. DB lookup con timeout
  try {
    const lang = await Promise.race([
      db.getGuildLang(guildId),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error("Timeout")), CONFIG.dbTimeout)
      )
    ]);
    
    guildLangCache.set(guildId, {
      value: lang,
      expires: Date.now() + CONFIG.guildCacheTTL
    });
    
    return lang;
    
  } catch (error) {
    // 3. Fallback silencioso
    const fallback = CONFIG.defaultLang;
    
    // Cache por menos tiempo (reintenta pronto)
    guildLangCache.set(guildId, {
      value: fallback,
      expires: Date.now() + 30_000
    });
    
    return fallback;
  }
}

/**
 * Actualizar idioma de servidor
 */
async function setGuildLang(guildId, lang) {
  try {
    await Promise.race([
      db.setGuildLang(guildId, lang),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error("Timeout")), 1000)
      )
    ]);
    
    // Actualizar cache
    guildLangCache.set(guildId, {
      value: lang,
      expires: Date.now() + CONFIG.guildCacheTTL
    });
    
    return true;
    
  } catch (error) {
    console.error(`❌ Error guardando idioma: ${error.message}`);
    
    // Actualizar cache anyway (modo degradado)
    guildLangCache.set(guildId, {
      value: lang,
      expires: Date.now() + CONFIG.guildCacheTTL
    });
    
    return false;
  }
}

/**
 * Detectar idioma desde interaction/message
 */
function detectLang(source) {
  if (source.locale) {
    if (source.locale.startsWith("es")) return "es";
    if (source.locale.startsWith("pt")) return "pt";
    if (source.locale.startsWith("fr")) return "fr";
  }
  
  if (source.guild?.preferredLocale) {
    const locale = source.guild.preferredLocale;
    if (locale.startsWith("es")) return "es";
    if (locale.startsWith("pt")) return "pt";
    if (locale.startsWith("fr")) return "fr";
  }
  
  return CONFIG.defaultLang;
}

// ============================================
// API PÚBLICA
// ============================================

/**
 * Función de traducción directa
 * USO: t("en", "purge.responses.start")
 * 
 * Esta es la función PRINCIPAL que debes usar en comandos
 */
export function t(lang, key, vars = {}) {
  const text = findTranslation(lang, key);
  
  if (!text) {
    return key; // Retorna la key si no encuentra
  }
  
  return interpolate(text, vars);
}

/**
 * Crear función de traducción para interaction
 * USO: const t = await useLang(interaction);
 * 
 * Compatibilidad con código existente
 */
export async function useLang(interaction) {
  let lang;
  
  if (interaction.guildId) {
    lang = await getGuildLang(interaction.guildId);
  } else {
    lang = detectLang(interaction);
  }
  
  // Retorna función cerrada sobre el lang
  return (key, vars = {}) => t(lang, key, vars);
}

/**
 * Alias para createTranslator (compatibilidad)
 */
export const createTranslator = useLang;

/**
 * Limpiar todos los caches
 */
export function clearCache() {
  fileCache.clear();
  guildLangCache.clear();
  searchCache.clear();
  console.log("🧹 Caches de traducción limpiados");
}

/**
 * Stats de cache (debugging)
 */
export function getCacheStats() {
  const stats = {
    files: 0,
    guilds: guildLangCache.size,
    searches: searchCache.size
  };
  
  for (const [lang, files] of fileCache.entries()) {
    stats.files += files.size;
  }
  
  return stats;
}

// ============================================
// EXPORTS
// ============================================

export { 
  getGuildLang, 
  setGuildLang 
};

export default {
  t,
  useLang,
  createTranslator,
  getGuildLang,
  setGuildLang,
  clearCache,
  getCacheStats
};

// ============================================
// LIMPIEZA AUTOMÁTICA
// ============================================

setInterval(() => {
  const now = Date.now();
  let cleaned = 0;
  
  for (const [guildId, data] of guildLangCache.entries()) {
    if (now > data.expires) {
      guildLangCache.delete(guildId);
      cleaned++;
    }
  }
  
  if (cleaned > 0) {
    console.log(`🧹 Guild lang cache: ${cleaned} items expirados`);
  }
}, 5 * 60 * 1000);