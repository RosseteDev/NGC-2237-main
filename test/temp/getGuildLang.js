// src/localization/getGuildLang.js
// ✅ ACTUALIZADO para usar ResilientDatabaseManager

import { db } from "../database/ResilientDatabaseManager.js";

// Cache en memoria (30 minutos TTL)
const langCache = new Map();
const CACHE_TTL = 30 * 60 * 1000;

// Fallback automático cuando DB falla
const DEFAULT_LANG = "en";

/**
 * Obtener idioma del servidor con fallback robusto
 * NUNCA debe crashear, siempre retorna un idioma válido
 */
export async function getGuildLang(guildId) {
  // 1. Verificar cache primero (evita queries innecesarias)
  const cached = langCache.get(guildId);
  if (cached && Date.now() < cached.expires) {
    return cached.value;
  }

  // 2. Intentar obtener de DB con timeout agresivo
  try {
    const lang = await Promise.race([
      db.getGuildLang(guildId), // ✅ Ahora usa ResilientDatabaseManager
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error("DB timeout")), 800)
      )
    ]);
    
    // Cachear resultado exitoso
    langCache.set(guildId, {
      value: lang,
      expires: Date.now() + CACHE_TTL
    });
    
    return lang;
    
  } catch (error) {
    // 3. Fallback: retornar idioma por defecto
    // NO mostrar warning porque el ResilientDatabaseManager ya lo hace
    
    // Cachear default por 30 segundos (evita spam de intentos)
    langCache.set(guildId, {
      value: DEFAULT_LANG,
      expires: Date.now() + 30_000
    });
    
    return DEFAULT_LANG;
  }
}

/**
 * Actualizar idioma del servidor
 */
export async function setGuildLang(guildId, lang) {
  try {
    await Promise.race([
      db.setGuildLang(guildId, lang), // ✅ Ahora usa ResilientDatabaseManager
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error("DB timeout")), 1000)
      )
    ]);
    
    // Actualizar cache inmediatamente
    langCache.set(guildId, {
      value: lang,
      expires: Date.now() + CACHE_TTL
    });
    
    return true;
    
  } catch (error) {
    console.error(`❌ Error guardando idioma: ${error.message}`);
    
    // Actualizar cache anyway (modo degradado)
    langCache.set(guildId, {
      value: lang,
      expires: Date.now() + CACHE_TTL
    });
    
    return false;
  }
}

/**
 * Limpiar cache expirado cada 5 minutos
 */
setInterval(() => {
  const now = Date.now();
  let cleaned = 0;

  for (const [key, data] of langCache.entries()) {
    if (now > data.expires) {
      langCache.delete(key);
      cleaned++;
    }
  }

  if (cleaned > 0) {
    console.log(`🧹 Lang cache cleanup: ${cleaned} items expirados`);
  }
}, 5 * 60 * 1000);

/**
 * Obtener stats del cache (útil para debugging)
 */
export function getCacheStats() {
  return {
    size: langCache.size,
    keys: Array.from(langCache.keys())
  };
}