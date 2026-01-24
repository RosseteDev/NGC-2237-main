// src/localization/getGuildLang.js
// ✅ VERSIÓN ROBUSTA con fallback automático

import pool from "../database/pool.js";

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
      queryDatabase(guildId),
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
    console.warn(`⚠️ getGuildLang fallback: ${error.message} - usando ${DEFAULT_LANG}`);
    
    // Cachear default por 30 segundos (evita spam de intentos)
    langCache.set(guildId, {
      value: DEFAULT_LANG,
      expires: Date.now() + 30_000
    });
    
    return DEFAULT_LANG;
  }
}

/**
 * Query a la base de datos
 * Aislada para mejor manejo de errores
 */
async function queryDatabase(guildId) {
  const result = await pool.query(
    "SELECT lang FROM guild_settings WHERE guild_id = $1",
    [guildId]
  );
  
  return result.rows[0]?.lang || DEFAULT_LANG;
}

/**
 * Actualizar idioma del servidor
 */
export async function setGuildLang(guildId, lang) {
  try {
    await Promise.race([
      pool.query(
        `INSERT INTO guild_settings (guild_id, lang, updated_at)
         VALUES ($1, $2, NOW())
         ON CONFLICT (guild_id)
         DO UPDATE SET lang = EXCLUDED.lang, updated_at = NOW()`,
        [guildId, lang]
      ),
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