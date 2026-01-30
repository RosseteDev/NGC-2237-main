
// src/bot/localization/TranslatorClean.js
// Versión limpia: solo lee y fusiona archivos existentes, nunca crea ni borra archivos

import { readFileSync, readdirSync, existsSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const I18N_PATH = join(__dirname, '../../i18n');
const DEFAULT_LANG = 'en';

// Cache en memoria
const cache = new Map();

// Recursivo: fusiona objetos profundamente
function deepMerge(target, source) {
  for (const key of Object.keys(source)) {
    if (
      source[key] &&
      typeof source[key] === 'object' &&
      !Array.isArray(source[key]) &&
      target[key] &&
      typeof target[key] === 'object'
    ) {
      deepMerge(target[key], source[key]);
    } else {
      target[key] = source[key];
    }
  }
  return target;
}

// Carga todos los archivos JSON de un idioma y los fusiona en un solo objeto
function loadLang(lang = DEFAULT_LANG) {
  if (cache.has(lang)) return cache.get(lang);
  const langDir = join(I18N_PATH, lang);
  if (!existsSync(langDir)) return {};
  const data = {};
  loadDirectoryRecursive(langDir, data);
  cache.set(lang, data);
  return data;
}

function loadDirectoryRecursive(dir, result, pathParts = []) {
  if (!existsSync(dir)) return;
  for (const item of readdirSync(dir)) {
    const fullPath = join(dir, item);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      loadDirectoryRecursive(fullPath, result, [...pathParts, item]);
    } else if (item.endsWith('.json')) {
      try {
        const content = JSON.parse(readFileSync(fullPath, 'utf-8'));
        // Inserta en el objeto destino según la ruta
        let ref = result;
        for (const part of pathParts) {
          if (!ref[part]) ref[part] = {};
          ref = ref[part];
        }
        const name = item.replace('.json', '');
        if (!ref[name]) ref[name] = {};
        deepMerge(ref[name], content);
      } catch (e) {
        console.warn('Error leyendo', fullPath, e.message);
      }
    }
  }
}

// Busca una clave anidada tipo "utility.music.embed.now_playing_title"
function getTranslation(lang, key) {
  const data = loadLang(lang);
  const parts = key.split('.');
  let ref = data;
  for (const part of parts) {
    if (ref && Object.prototype.hasOwnProperty.call(ref, part)) {
      ref = ref[part];
    } else {
      return null;
    }
  }
  return typeof ref === 'string' ? ref : null;
}

// API principal
export function t(lang, key, vars = {}) {
  let text = getTranslation(lang, key) || getTranslation(DEFAULT_LANG, key);
  if (!text) return `[Missing: ${key}]`;
  for (const [k, v] of Object.entries(vars)) {
    text = text.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
  }
  return text;
}

export function clearCache() {
  cache.clear();
}

export default {
  t,
  clearCache,
  loadLang,
};
