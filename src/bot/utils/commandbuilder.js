// src/utils/commandbuilder.js

import { SlashCommandBuilder, ChannelType, PermissionFlagsBits } from "discord.js";
import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { CommandMetadata } from "./CommandMetadata.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Cache de configuraciones cargadas
const configCache = new Map();

/**
 * Cargar configuración de comando desde JSON
 * Soporta AMBAS estructuras:
 * - NUEVA: /commands/music/play.json (archivo separado por comando)
 * - VIEJA: /commands/music.json con { "play": {...} } (todo junto)
 */
function loadCommandConfig(category, commandName, lang = "en") {
  const cacheKey = `${lang}:${category}:${commandName}`;
  
  if (configCache.has(cacheKey)) {
    return configCache.get(cacheKey);
  }
  
  // ========================================
  // ESTRATEGIA 1: Archivo separado (NUEVA)
  // /i18n/en/commands/music/play.json
  // ========================================
  
  const separatePath = join(
    __dirname,
    "..",
    "..",
    "i18n",
    lang,
    "commands",
    category,
    `${commandName}.json`
  );
  
  if (existsSync(separatePath)) {
    try {
      const config = JSON.parse(readFileSync(separatePath, "utf-8"));
      configCache.set(cacheKey, config);
      return config;
    } catch (error) {
      console.error(`❌ Error parseando ${separatePath}:`, error.message);
    }
  }
  
  // ========================================
  // ESTRATEGIA 2: Archivo combinado (VIEJA)
  // /i18n/en/commands/music.json
  // ========================================
  
  const combinedPath = join(
    __dirname,
    "..",
    "..",
    "i18n",
    lang,
    "commands",
    `${category}.json`
  );
  
  if (existsSync(combinedPath)) {
    try {
      const data = JSON.parse(readFileSync(combinedPath, "utf-8"));
      const config = data[commandName];
      
      if (!config) {
        console.warn(`⚠️  Comando "${commandName}" no encontrado en ${combinedPath}`);
        return null;
      }
      
      configCache.set(cacheKey, config);
      return config;
    } catch (error) {
      console.error(`❌ Error parseando ${combinedPath}:`, error.message);
    }
  }
  
  // ========================================
  // ESTRATEGIA 3: Archivo shared.json (FALLBACK)
  // /i18n/en/commands/music/shared.json
  // ========================================
  
  const sharedPath = join(
    __dirname,
    "..",
    "i18n",
    lang,
    "commands",
    category,
    "shared.json"
  );
  
  if (existsSync(sharedPath)) {
    try {
      const config = JSON.parse(readFileSync(sharedPath, "utf-8"));
      console.warn(
        `⚠️  Usando shared.json para ${category}/${commandName} - ` +
        `considera crear ${commandName}.json para mejor organización`
      );
      configCache.set(cacheKey, config);
      return config;
    } catch (error) {
      console.error(`❌ Error parseando ${sharedPath}:`, error.message);
    }
  }
  
  // ========================================
  // ERROR: No se encontró ninguna configuración
  // ========================================
  
  console.error(
    `❌ No se encontró configuración para ${category}/${commandName} en idioma ${lang}\n` +
    `Rutas intentadas:\n` +
    `  1. ${separatePath} (archivo separado - RECOMENDADO)\n` +
    `  2. ${combinedPath} (archivo combinado - LEGACY)\n` +
    `  3. ${sharedPath} (shared - FALLBACK)\n\n` +
    `💡 Crea uno de estos archivos con la estructura del comando.`
  );
  
  return null;
}

/**
 * Mapeo de strings a valores de Discord.js
 */
const TypeMap = {
  "string": 3,
  "integer": 4,
  "boolean": 5,
  "user": 6,
  "channel": 7,
  "role": 8,
  "number": 10,
  "attachment": 11
};

const ChannelTypeMap = {
  "text": ChannelType.GuildText,
  "voice": ChannelType.GuildVoice,
  "category": ChannelType.GuildCategory,
  "announcement": ChannelType.GuildAnnouncement,
  "stage": ChannelType.GuildStageVoice,
  "forum": ChannelType.GuildForum,
  "thread": ChannelType.PublicThread,
  "private_thread": ChannelType.PrivateThread
};

const PermissionMap = {
  "Administrator": PermissionFlagsBits.Administrator,
  "ManageGuild": PermissionFlagsBits.ManageGuild,
  "ManageRoles": PermissionFlagsBits.ManageRoles,
  "ManageChannels": PermissionFlagsBits.ManageChannels,
  "KickMembers": PermissionFlagsBits.KickMembers,
  "BanMembers": PermissionFlagsBits.BanMembers,
  "ManageMessages": PermissionFlagsBits.ManageMessages,
  "Connect": PermissionFlagsBits.Connect,
  "Speak": PermissionFlagsBits.Speak,
  "MuteMembers": PermissionFlagsBits.MuteMembers,
  "DeafenMembers": PermissionFlagsBits.DeafenMembers,
  "MoveMembers": PermissionFlagsBits.MoveMembers
};

/**
 * Construir comando desde configuración JSON
 */
export function buildCommand(category, commandName) {
  const enConfig = loadCommandConfig(category, commandName, "en");
  if (!enConfig) {
    throw new Error(`No se pudo cargar: ${category}/${commandName}`);
  }

  const esConfig = loadCommandConfig(category, commandName, "es");

  // ✅ CORRECCIÓN: Acceder correctamente a la estructura
  const enCommand = enConfig.command || enConfig;
  const esCommand = esConfig?.command || esConfig;

  const command = new SlashCommandBuilder()
    .setName(commandName)
    .setDescription(enCommand.description);

  // Localización descripción root
  if (esCommand?.description) {
    command.setDescriptionLocalizations({
      "es-ES": esCommand.description,
      "es-419": esCommand.description
    });
  }

  // 🚨 MUTUAMENTE EXCLUYENTES
  // ✅ FIX: Buscar options en el nivel correcto
  const rootOptions = enConfig.options;
  const rootSubcommands = enConfig.subcommands;

  if (rootOptions && rootSubcommands) {
    throw new Error(
      `❌ El comando "${commandName}" no puede tener ` +
      `"options" y "subcommands" al mismo tiempo`
    );
  }

  // 🟢 SUBCOMMANDS
  if (rootSubcommands) {
    addSubcommands(command, category, enConfig, esConfig);
  }

  // 🟢 OPCIONES SIMPLES
  else if (rootOptions) {
    for (const [optName, optConfig] of Object.entries(rootOptions)) {
      if (!optConfig.type) {
        throw new Error(
          `❌ La opción "${optName}" en ${commandName} no tiene "type"`
        );
      }

      addOption(command, optName, optConfig, esConfig?.options?.[optName]);
    }
  }

  // ✅ Agregar metadata necesaria para el traductor
  command.category = category;
  command.name = commandName;

  return command;
}

function addSubcommands(command, category, enConfig, esConfig) {
  for (const [subName, subConfig] of Object.entries(enConfig.subcommands)) {

    if (!subConfig.description) {
      throw new Error(
        `❌ Subcommand "${subName}" en ${category} no tiene description`
      );
    }

    const esSub = esConfig?.subcommands?.[subName];

    command.addSubcommand(sub => {
      sub
        .setName(subName)
        .setDescription(subConfig.description);


      // Localización descripción subcommand
      if (esSub?.description) {
        sub.setDescriptionLocalizations({
          "es-ES": esSub.description,
          "es-419": esSub.description
        });
      }

      // Opciones del subcommand
      if (subConfig.options) {
        for (const [optName, optConfig] of Object.entries(subConfig.options)) {
          addOption(sub, optName, optConfig, esSub?.options?.[optName]);
        }
      }

      return sub;
    });
  }
}

/**
 * Agregar opción al comando
 */
function addOption(command, name, enConfig, esConfig) {
  const type = enConfig.type || "string";
  const typeValue = TypeMap[type];
  
  const optionBuilder = (option) => {
    option
      .setName(name)
      .setDescription(enConfig.description)
      .setRequired(enConfig.required !== false);
    
    // Localizaciones
    if (esConfig) {
      option.setNameLocalizations({
        "es-ES": esConfig.name || name,
        "es-419": esConfig.name || name
      });
      
      option.setDescriptionLocalizations({
        "es-ES": esConfig.description,
        "es-419": esConfig.description
      });
    }
    
    // Configuraciones específicas por tipo
    if (enConfig.choices) {
      option.addChoices(...enConfig.choices);
    }
    
    if (enConfig.min !== undefined) {
      option.setMinValue?.(enConfig.min);
    }
    
    if (enConfig.max !== undefined) {
      option.setMaxValue?.(enConfig.max);
    }
    
    if (enConfig.channelTypes) {
      const types = enConfig.channelTypes.map(t => ChannelTypeMap[t]);
      option.addChannelTypes?.(...types);
    }
    
    if (enConfig.autocomplete) {
      option.setAutocomplete(true);
    }
    
    return option;
  };
  
  // Agregar según tipo
  switch (type) {
    case "string":
      command.addStringOption(optionBuilder);
      break;
    case "integer":
      command.addIntegerOption(optionBuilder);
      break;
    case "boolean":
      command.addBooleanOption(optionBuilder);
      break;
    case "user":
      command.addUserOption(optionBuilder);
      break;
    case "channel":
      command.addChannelOption(optionBuilder);
      break;
    case "role":
      command.addRoleOption(optionBuilder);
      break;
    case "number":
      command.addNumberOption(optionBuilder);
      break;
    case "attachment":
      command.addAttachmentOption(optionBuilder);
      break;
  }
}

/**
 * Construir metadata desde configuración
 */
function buildMetadata(metaConfig) {
  if (!metaConfig) {
    return new CommandMetadata();
  }
  
  return new CommandMetadata({
    contexts: metaConfig.contexts || ["any"],
    nsfw: metaConfig.nsfw || false,
    guildOnly: metaConfig.guildOnly !== false,
    requiresVoiceConnection: metaConfig.requiresVoiceConnection || false,
    requiresBotVoiceConnection: metaConfig.requiresBotVoiceConnection || false,
    allowedChannelTypes: (metaConfig.allowedChannelTypes || []).map(t => 
      typeof t === "number" ? t : ChannelTypeMap[t]
    ),
    blockedChannelTypes: (metaConfig.blockedChannelTypes || []).map(t => 
      typeof t === "number" ? t : ChannelTypeMap[t]
    ),
    allowedCategories: metaConfig.allowedCategories || [],
    allowInSlowmode: metaConfig.allowInSlowmode !== false,
    requiredChannelPermissions: (metaConfig.permissions?.user || []).map(p => 
      PermissionMap[p] || p
    )
  });
}

/**
 * Combinar aliases de múltiples idiomas
 */
function mergeAliases(...aliasSets) {
  const merged = new Set();
  
  for (const aliases of aliasSets) {
    if (Array.isArray(aliases)) {
      aliases.forEach(a => merged.add(a));
    }
  }
  
  return Array.from(merged);
}

/**
 * Limpiar cache (útil para hot-reload)
 */
export function clearCommandCache() {
  configCache.clear();
  console.log("🧹 Cache de comandos limpiado");
}