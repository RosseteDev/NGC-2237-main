// src/handlers/prefixHandler.js

import { db } from "../database/manager.js";
import { prefixChecker } from "../utils/PrefixChecker.js";

/**
 * Parser de argumentos mejorado
 */
function parseArguments(args, commandOptions) {
  if (!commandOptions || commandOptions.length === 0) {
    return {};
  }

  const parsed = {};
  let currentIndex = 0;

  for (let i = 0; i < commandOptions.length; i++) {
    const option = commandOptions[i];
    const isLastOption = i === commandOptions.length - 1;

    if (currentIndex >= args.length) {
      parsed[option.name] = null;
      continue;
    }

    switch (option.type) {
      case 3: // STRING
      case "string":
        if (isLastOption) {
          parsed[option.name] = args.slice(currentIndex).join(' ');
          currentIndex = args.length;
        } else {
          parsed[option.name] = args[currentIndex];
          currentIndex++;
        }
        break;

      case 4: // INTEGER
      case "integer":
        const intVal = parseInt(args[currentIndex], 10);
        parsed[option.name] = isNaN(intVal) ? null : intVal;
        currentIndex++;
        break;

      case 10: // NUMBER
      case "number":
        const numVal = parseFloat(args[currentIndex]);
        parsed[option.name] = isNaN(numVal) ? null : numVal;
        currentIndex++;
        break;

      case 5: // BOOLEAN
      case "boolean":
        const boolVal = args[currentIndex]?.toLowerCase();
        parsed[option.name] = ["true", "yes", "si", "sí", "1", "on"].includes(boolVal);
        currentIndex++;
        break;

      default:
        parsed[option.name] = args[currentIndex];
        currentIndex++;
    }
  }

  return parsed;
}

/**
 * Buscar comando por nombre o alias
 */
function findCommand(client, commandName) {
  let command = client.commands.get(commandName);
  if (command) return { command, name: commandName };

  for (const [cmdName, cmd] of client.commands.entries()) {
    const aliases = [
      ...(cmd.aliases || []),
      ...(cmd.data?.aliases || [])
    ].map(a => a.toLowerCase());

    if (aliases.includes(commandName)) {
      return { command: cmd, name: cmdName };
    }

    const dataName = cmd.data?.name?.toLowerCase();
    if (dataName && dataName === commandName) {
      return { command: cmd, name: cmdName };
    }
  }

  return null;
}

/**
 * Cache de prefixes en memoria
 */
const prefixCache = new Map();
const PREFIX_CACHE_TTL = 5 * 60 * 1000; // 5 minutos

/**
 * Obtener prefix del servidor
 */
async function getPrefix(guildId) {
  const defaultPrefix = process.env.DEFAULT_PREFIX || "r!";
  
  if (!guildId) {
    return defaultPrefix;
  }
  
  // 1. Cache hit
  const cached = prefixCache.get(guildId);
  if (cached && Date.now() < cached.expires) {
    return cached.value;
  }
  
  // 2. Leer de DB (ResilientDatabaseManager maneja fallbacks)
  try {
    const prefix = await Promise.race([
      db.getGuildPrefix(guildId),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error("Timeout")), 1000)
      )
    ]);
    
    // Cachear por 5 minutos
    prefixCache.set(guildId, {
      value: prefix,
      expires: Date.now() + PREFIX_CACHE_TTL
    });
    
    return prefix;
    
  } catch (error) {
    // Fallback
    prefixCache.set(guildId, {
      value: defaultPrefix,
      expires: Date.now() + 30_000
    });
    
    return defaultPrefix;
  }
}

/**
 * Invalidar cache de prefix
 */
export function invalidatePrefixCache(guildId) {
  prefixCache.delete(guildId);
  console.log(`🔄 Prefix cache invalidado para guild ${guildId}`);
}

/**
 * Stats de cache
 */
export function getPrefixCacheStats() {
  return {
    size: prefixCache.size,
    guilds: Array.from(prefixCache.keys())
  };
}

/**
 * Handler principal de prefix commands
 */
export async function handlePrefixCommand(message, client) {
  if (message.author.bot || !message.content || !message.guild) return;

  // Verificación ultrarrápida
  if (!prefixChecker.couldBeCommand(message.content)) {
    return;
  }

  try {
    // Obtener prefix
    const prefix = await getPrefix(message.guild.id);

    let usedPrefix = null;
    let content = message.content;

    if (message.content.startsWith(prefix)) {
      usedPrefix = prefix;
      content = message.content.slice(prefix.length).trim();
    } else if (message.mentions.has(client.user.id)) {
      usedPrefix = `<@${client.user.id}>`;
      content = message.content
        .replace(new RegExp(`<@!?${client.user.id}>`), "")
        .trim();
    }

    if (!usedPrefix || !content) return;

    const rawArgs = content.split(/\s+/);
    const commandInput = rawArgs.shift()?.toLowerCase();

    if (!commandInput) return;

    const result = findCommand(client, commandInput);
    if (!result) return;

    const { command, name } = result;

    const commandOptions = command.data?.options || [];
    const parsedArgs = parseArguments(rawArgs, commandOptions);
    
    parsedArgs._commandName = name;
    parsedArgs._raw = rawArgs;

    console.log(`[PREFIX] ✅ ${message.author.tag} ejecutó ${prefix}${commandInput}`);

    await client.commandHandler.execute(message, parsedArgs, name);

  } catch (error) {
    if (error.message?.includes("ETIMEDOUT") || 
        error.message?.includes("ECONNREFUSED")) {
      console.warn("⚠️ DB timeout en prefix handler");
      return;
    }
    
    console.error("❌ Error en prefix command:", error);
    
    try {
      await message.reply({
        content: `❌ Error: ${error.message}`,
        allowedMentions: { repliedUser: false }
      });
    } catch {}
  }
}

/**
 * Limpiar cache expirado
 */
setInterval(() => {
  const now = Date.now();
  let cleaned = 0;
  
  for (const [key, data] of prefixCache.entries()) {
    if (now > data.expires) {
      prefixCache.delete(key);
      cleaned++;
    }
  }
  
  if (cleaned > 0) {
    console.log(`🧹 Prefix cache cleanup: ${cleaned} items expirados`);
  }
}, 5 * 60 * 1000);