// src/handlers/prefixHandler.js
// ============================================
// PREFIX HANDLER CON CACHE INVALIDABLE
// ============================================

import { EmbedBuilder } from "discord.js";
import { db } from "../database/ResilientDatabaseManager.js";
import { createLogger } from "../utils/Logger.js";

const logger = createLogger("prefix");

// ============================================
// CACHE DE PREFIXES
// ============================================

const prefixCache = new Map();
const CACHE_TTL = 30 * 60 * 1000; // 30 minutos
const DEFAULT_PREFIX = "r!";

/**
 * Obtener prefix con cache
 */
async function getGuildPrefix(guildId) {
  if (!guildId) return DEFAULT_PREFIX;
  
  // Cache hit
  const cached = prefixCache.get(guildId);
  if (cached && Date.now() < cached.expires) {
    return cached.value;
  }
  
  // Cache miss - consultar DB
  try {
    const prefix = await Promise.race([
      db.getGuildPrefix(guildId),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error("Timeout")), 800)
      )
    ]);
    
    // Cachear resultado
    prefixCache.set(guildId, {
      value: prefix,
      expires: Date.now() + CACHE_TTL
    });
    
    return prefix;
    
  } catch (error) {
    logger.debug(`Prefix fetch failed for ${guildId}, usando default`);
    
    // Cachear default por poco tiempo
    prefixCache.set(guildId, {
      value: DEFAULT_PREFIX,
      expires: Date.now() + 30_000
    });
    
    return DEFAULT_PREFIX;
  }
}

/**
 * ✅ CRÍTICO: Invalidar cache cuando se actualiza prefix
 */
export function invalidatePrefixCache(guildId) {
  const deleted = prefixCache.delete(guildId);
  logger.debug(`Cache invalidado para ${guildId}: ${deleted}`);
  return deleted;
}

/**
 * Limpiar cache expirado
 */
setInterval(() => {
  const now = Date.now();
  let cleaned = 0;
  
  for (const [guildId, data] of prefixCache.entries()) {
    if (now > data.expires) {
      prefixCache.delete(guildId);
      cleaned++;
    }
  }
  
  if (cleaned > 0) {
    logger.debug(`Prefix cache cleanup: ${cleaned} items expirados`);
  }
}, 5 * 60 * 1000);

/**
 * Stats del cache
 */
export function getPrefixCacheStats() {
  return {
    size: prefixCache.size,
    guilds: Array.from(prefixCache.keys())
  };
}

// ============================================
// UTILIDADES
// ============================================

/**
 * Formatear duración en ms a MM:SS o HH:MM:SS
 */
function formatDuration(ms) {
  const seconds = Math.floor(ms / 1000);
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  
  if (mins >= 60) {
    const hours = Math.floor(mins / 60);
    const remainMins = mins % 60;
    return `${hours}:${remainMins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  }
  
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

// ============================================
// HANDLER DE COMANDOS CON PREFIX
// ============================================

export async function handlePrefixCommand(message, client) {
  // Ignorar bots
  if (message.author.bot) return;
  
  // Solo en servidores (DMs usan solo /)
  if (!message.guild) return;
  
  // Obtener prefix del servidor
  const prefix = await getGuildPrefix(message.guild.id);
  
  // Verificar si el mensaje empieza con el prefix
  if (!message.content.startsWith(prefix)) return;
  
  // Parsear comando y args
  const args = message.content.slice(prefix.length).trim().split(/\s+/);
  const commandName = args.shift()?.toLowerCase();
  
  if (!commandName) return;
  
  // Buscar comando (por nombre o alias)
  const command = client.commands.get(commandName) || 
    client.commands.find(cmd => cmd.data?.aliases?.includes(commandName));
  
  if (!command) return;
  
  logger.debug(`Prefix command: ${commandName} (prefix: ${prefix})`);
  
  // Ejecutar comando
  try {
    // Crear contexto compatible
    const context = {
      type: "prefix",
      client,  // ✅ CRÍTICO: Necesario para comandos de música
      message,
      guild: message.guild,
      channel: message.channel,
      member: message.member,
      user: message.author,
      commandName,
      args,
      
      // Métodos helper
      reply: async (options) => {
        context.replied = true;
        if (typeof options === "string") {
          return message.reply(options);
        }
        return message.reply(options);
      },
      
      deferReply: async () => {
        context.deferred = true;
        await message.channel.sendTyping();
      },
      
      editReply: async (options) => {
        context.replied = true;
        // Para prefix commands, enviamos nuevo mensaje
        if (typeof options === "string") {
          return message.channel.send(options);
        }
        return message.channel.send(options);
      },
      
      followUp: async (options) => {
        if (typeof options === "string") {
          return message.channel.send(options);
        }
        return message.channel.send(options);
      },
      
      // Translator
      getTranslator: async () => {
        const { useLang } = await import("../localization/Translator.js");
        return useLang({ guildId: message.guild?.id, locale: "en" });
      },
      
      // Options getter (simulado)
      options: {
        getString: (name, required = false) => {
          // Para comandos de música, retornar todos los args como query
          if (name === "query" && args.length > 0) {
            return args.join(" ");
          }
          
          const value = args[0] || null;
          
          if (required && !value) {
            throw new Error(`Missing required argument: ${name}`);
          }
          
          return value;
        },
        getInteger: (name) => {
          const val = parseInt(args[0]);
          return isNaN(val) ? null : val;
        },
        getUser: (name) => message.mentions.users.first() || null,
        getChannel: (name) => message.mentions.channels.first() || null,
        getRole: (name) => message.mentions.roles.first() || null
      },
      
      // ✅ CRÍTICO: Embeds helper para comandos de música
      embeds: {
        music: (track) => {
          return new EmbedBuilder()
            .setColor(0x1DB954)
            .setTitle("🎵 Now Playing")
            .setDescription(`**${track.info.title}**`)
            .addFields(
              { name: "Artist", value: track.info.author, inline: true },
              { name: "Duration", value: formatDuration(track.info.length), inline: true }
            )
            .setTimestamp();
        }
      },
      
      // ✅ Flags de estado para manejo de respuestas
      deferred: false,
      replied: false
    };
    
    await command.execute(context);
    
  } catch (error) {
    logger.error(`Error ejecutando ${commandName}:`, error);
    
    try {
      await message.reply({
        content: "❌ Hubo un error ejecutando este comando.",
        allowedMentions: { repliedUser: false }
      });
    } catch (replyError) {
      logger.error("No se pudo enviar mensaje de error", replyError);
    }
  }
}

// ============================================
// EXPORTS
// ============================================

export default handlePrefixCommand;