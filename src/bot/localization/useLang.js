// src/localization/useLang.js
// ✅ VERSIÓN COMPATIBLE CON SISTEMA ACTUAL

import { readFileSync, readdirSync, existsSync, statSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Cache de traducciones por idioma
const translations = {};

// Cache de rutas de búsqueda
const searchCache = new Map();

/**
 * Carga recursivamente archivos JSON
 */
function loadDirectoryRecursive(dir, lang, pathParts = []) {
  if (!existsSync(dir)) return;

  const items = readdirSync(dir);

  for (const item of items) {
    const fullPath = join(dir, item);
    const stat = statSync(fullPath);

    if (stat.isDirectory()) {
      loadDirectoryRecursive(fullPath, lang, [...pathParts, item]);
    } else if (item.endsWith('.json')) {
      try {
        const data = JSON.parse(readFileSync(fullPath, "utf-8"));
        const filename = item.replace('.json', '');
        
        let current = translations[lang];
        for (const part of pathParts) {
          if (!current[part]) current[part] = {};
          current = current[part];
        }
        
        if (!current[filename]) current[filename] = {};
        Object.assign(current[filename], data);
        
      } catch (error) {
        console.warn(`⚠️ Error cargando ${fullPath}:`, error.message);
      }
    }
  }
}

/**
 * Busca traducción con fallback inteligente
 */
function findTranslation(obj, key, lang) {
  const cacheKey = `${lang}:${key}`;
  
  if (searchCache.has(cacheKey)) {
    const cachedPath = searchCache.get(cacheKey);
    let value = obj;
    for (const part of cachedPath) {
      value = value?.[part];
      if (!value) break;
    }
    if (value) return value;
    searchCache.delete(cacheKey);
  }

  const parts = key.split(".");
  
  // Búsqueda directa
  let value = obj;
  for (const part of parts) {
    value = value?.[part];
    if (!value) break;
  }
  
  if (value && typeof value === 'string') {
    searchCache.set(cacheKey, parts);
    return value;
  }

  return null;
}

/**
 * Cargar traducciones por idioma
 */
function loadTranslations(lang) {
  if (!translations[lang]) {
    translations[lang] = {};
    
    const langDir = join(__dirname, "..", "i18n", lang);
    
    if (!existsSync(langDir)) {
      console.error(`❌ Directorio no existe: ${langDir}`);
      return translations[lang];
    }

    console.log(`🌍 Cargando traducciones: ${lang}`);
    loadDirectoryRecursive(langDir, lang);
    console.log(`✅ ${lang} cargado (${Object.keys(translations[lang]).length} módulos)`);
  }
  
  return translations[lang];
}

/**
 * Hook principal
 */
export async function useLang(interaction) {
  const lang = interaction.locale?.startsWith("es") ? "es" : "en";
  const t = loadTranslations(lang);

  return (key, params = {}) => {
    const value = findTranslation(t, key, lang);

    if (!value || typeof value !== 'string') {
      console.warn(`⚠️ Translation missing: ${key} (${lang})`);
      return key;
    }

    // Interpolación
    return Object.entries(params).reduce(
      (str, [k, v]) => str.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v)),
      value
    );
  };
}

/**
 * Función de traducción directa
 */
export function getTranslation(lang, key) {
  const t = loadTranslations(lang);
  return findTranslation(t, key, lang) || key;
}

/**
 * Limpiar cache
 */
export function clearCache() {
  searchCache.clear();
  for (const lang in translations) {
    delete translations[lang];
  }
  console.log("🧹 Cache de traducciones limpiado");
}