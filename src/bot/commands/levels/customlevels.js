// src/bot/commands/levels/customlevels.js

import { SlashCommandBuilder, PermissionFlagsBits } from "discord.js";
import { getCustomLevelsConfig } from "../../config/CustomLevelsConfig.js";
import { createLogger } from "../../utils/Logger.js";

const logger = createLogger("command:custom-levels");

export const data = new SlashCommandBuilder()
  .setName("customlevels")
  .setDescription("Gestionar sistema de niveles personalizados")
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addSubcommand(sub =>
    sub
      .setName("add")
      .setDescription("Añadir un rol de nivel")
      .addIntegerOption(opt =>
        opt
          .setName("level")
          .setDescription("Nivel requerido para obtener el rol")
          .setRequired(true)
          .setMinValue(1)
          .setMaxValue(999)
      )
      .addRoleOption(opt =>
        opt
          .setName("role")
          .setDescription("Rol a otorgar")
          .setRequired(true)
      )
  )
  .addSubcommand(sub =>
    sub
      .setName("remove")
      .setDescription("Eliminar un rol de nivel")
      .addIntegerOption(opt =>
        opt
          .setName("level")
          .setDescription("Nivel del rol a eliminar")
          .setRequired(true)
      )
  )
  .addSubcommand(sub =>
    sub
      .setName("list")
      .setDescription("Ver todos los roles de nivel configurados")
  )
  .addSubcommand(sub =>
    sub
      .setName("enable")
      .setDescription("Activar el sistema de niveles personalizados")
  )
  .addSubcommand(sub =>
    sub
      .setName("disable")
      .setDescription("Desactivar el sistema de niveles personalizados")
  )
  .addSubcommand(sub =>
    sub
      .setName("config")
      .setDescription("Configurar opciones del sistema")
      .addIntegerOption(opt =>
        opt
          .setName("xp_per_level")
          .setDescription("XP necesaria por nivel (default: 1000)")
          .setRequired(false)
          .setMinValue(100)
          .setMaxValue(10000)
      )
      .addChannelOption(opt =>
        opt
          .setName("levelup_channel")
          .setDescription("Canal para anuncios de level up")
          .setRequired(false)
      )
  )
  .addSubcommand(sub =>
    sub
      .setName("info")
      .setDescription("Ver información y límites del sistema")
  );

export async function execute(context) {
  const levelsConfig = getCustomLevelsConfig();
  
  // ✅ CORRECCIÓN: Acceder al subcomando desde la source directamente
  const subcommand = context.source.options.getSubcommand();

  try {
    switch (subcommand) {
      case "add":
        await handleAdd(context, levelsConfig);
        break;
      
      case "remove":
        await handleRemove(context, levelsConfig);
        break;
      
      case "list":
        await handleList(context, levelsConfig);
        break;
      
      case "enable":
        await handleEnable(context, levelsConfig);
        break;
      
      case "disable":
        await handleDisable(context, levelsConfig);
        break;
      
      case "config":
        await handleConfig(context, levelsConfig);
        break;
      
      case "info":
        await handleInfo(context, levelsConfig);
        break;
        
      default:
        await handleInfo(context, levelsConfig);
    }
  } catch (error) {
    logger.error("Error en customlevels", error);
    await context.reply({
      content: `❌ Error: ${error.message}`,
      ephemeral: true
    });
  }
}

/**
 * Añadir rol de nivel
 */
async function handleAdd(context, levelsConfig) {
  const level = context.source.options.getInteger("level");
  const role = context.source.options.getRole("role");
  const guildId = context.guild.id;

  // Validar rol
  if (role.managed) {
    return context.reply({
      content: "❌ No puedes usar roles gestionados por integraciones (bots, boosts, etc.)",
      ephemeral: true
    });
  }

  if (role.id === guildId) {
    return context.reply({
      content: "❌ No puedes usar el rol @everyone",
      ephemeral: true
    });
  }

  // Intentar añadir
  const result = levelsConfig.addLevelRole(guildId, {
    level,
    roleId: role.id,
    name: role.name,
    color: role.hexColor
  });

  if (!result.success) {
    const isPremium = levelsConfig.isPremium(guildId);
    let message = `❌ ${result.error}\n\n`;
    
    if (!isPremium) {
      message += `💎 **Mejora a Premium**\n`;
      message += `• Límite FREE: 10 roles\n`;
      message += `• Límite PREMIUM: 30 roles\n\n`;
      message += `Contacta al owner del bot para más info.`;
    }

    return context.reply({
      content: message,
      ephemeral: true
    });
  }

  const config = levelsConfig.getGuildConfig(guildId);
  const limit = levelsConfig.getLimit(guildId);
  const remaining = limit - config.roles.length;

  await context.reply({
    content: 
      `✅ **Rol de nivel añadido**\n\n` +
      `• Nivel: **${level}**\n` +
      `• Rol: ${role}\n\n` +
      `📊 Roles configurados: **${config.roles.length}/${limit}**\n` +
      `${remaining <= 3 ? `⚠️ Quedan ${remaining} espacios disponibles` : ""}`,
    ephemeral: true
  });
}

/**
 * Eliminar rol de nivel
 */
async function handleRemove(context, levelsConfig) {
  const level = context.source.options.getInteger("level");
  const guildId = context.guild.id;

  const success = levelsConfig.removeLevelRole(guildId, level);

  if (!success) {
    return context.reply({
      content: `❌ No se encontró un rol configurado para el nivel ${level}`,
      ephemeral: true
    });
  }

  await context.reply({
    content: `✅ Rol de nivel ${level} eliminado`,
    ephemeral: true
  });
}

/**
 * Listar roles de nivel
 */
async function handleList(context, levelsConfig) {
  const guildId = context.guild.id;
  const config = levelsConfig.getGuildConfig(guildId);

  if (config.roles.length === 0) {
    return context.reply({
      content: 
        `📋 **Roles de Nivel**\n\n` +
        `No hay roles configurados todavía.\n\n` +
        `Usa \`/customlevels add\` para añadir roles.`,
      ephemeral: true
    });
  }

  const limit = levelsConfig.getLimit(guildId);
  const isPremium = levelsConfig.isPremium(guildId);

  let message = `📋 **Roles de Nivel** ${isPremium ? "💎" : ""}\n\n`;
  message += `**Estado:** ${config.enabled ? "✅ Activado" : "❌ Desactivado"}\n`;
  message += `**Roles:** ${config.roles.length}/${limit}\n`;
  message += `**XP por nivel:** ${config.xpPerLevel || 1000}\n\n`;

  // Listar roles
  for (const roleData of config.roles) {
    const role = context.guild.roles.cache.get(roleData.roleId);
    const roleDisplay = role ? role.toString() : `❌ Rol eliminado`;
    
    message += `**Nivel ${roleData.level}** → ${roleDisplay}\n`;
  }

  if (!isPremium && config.roles.length >= 8) {
    message += `\n💎 **Mejora a Premium** para hasta 30 roles`;
  }

  await context.reply({
    content: message,
    ephemeral: true
  });
}

/**
 * Activar sistema
 */
async function handleEnable(context, levelsConfig) {
  const guildId = context.guild.id;
  const config = levelsConfig.getGuildConfig(guildId);

  if (config.enabled) {
    return context.reply({
      content: "ℹ️ El sistema de niveles ya está activado",
      ephemeral: true
    });
  }

  if (config.roles.length === 0) {
    return context.reply({
      content: 
        `⚠️ **No hay roles configurados**\n\n` +
        `Antes de activar el sistema, añade al menos un rol con:\n` +
        `\`/customlevels add\``,
      ephemeral: true
    });
  }

  config.enabled = true;
  levelsConfig.setGuildConfig(guildId, config);

  await context.reply({
    content: 
      `✅ **Sistema de niveles activado**\n\n` +
      `Los usuarios comenzarán a ganar XP y recibirán roles al subir de nivel.`,
    ephemeral: true
  });
}

/**
 * Desactivar sistema
 */
async function handleDisable(context, levelsConfig) {
  const guildId = context.guild.id;
  const config = levelsConfig.getGuildConfig(guildId);

  if (!config.enabled) {
    return context.reply({
      content: "ℹ️ El sistema de niveles ya está desactivado",
      ephemeral: true
    });
  }

  config.enabled = false;
  levelsConfig.setGuildConfig(guildId, config);

  await context.reply({
    content: 
      `⚠️ **Sistema de niveles desactivado**\n\n` +
      `Los usuarios ya no ganarán XP ni recibirán roles.\n` +
      `La configuración se mantiene guardada.`,
    ephemeral: true
  });
}

/**
 * Configurar opciones
 */
async function handleConfig(context, levelsConfig) {
  const guildId = context.guild.id;
  const config = levelsConfig.getGuildConfig(guildId);

  const xpPerLevel = context.source.options.getInteger("xp_per_level");
  const levelUpChannel = context.source.options.getChannel("levelup_channel");

  let changes = [];

  if (xpPerLevel !== null) {
    config.xpPerLevel = xpPerLevel;
    changes.push(`XP por nivel: **${xpPerLevel}**`);
  }

  if (levelUpChannel !== null) {
    config.levelUpChannel = levelUpChannel.id;
    changes.push(`Canal de level up: ${levelUpChannel}`);
  }

  if (changes.length === 0) {
    return context.reply({
      content: 
        `⚙️ **Configuración Actual**\n\n` +
        `• XP por nivel: **${config.xpPerLevel || 1000}**\n` +
        `• Canal de level up: ${
          config.levelUpChannel 
            ? `<#${config.levelUpChannel}>` 
            : "No configurado"
        }`,
      ephemeral: true
    });
  }

  levelsConfig.setGuildConfig(guildId, config);

  await context.reply({
    content: 
      `✅ **Configuración actualizada**\n\n` +
      changes.join("\n"),
    ephemeral: true
  });
}

/**
 * Mostrar información del sistema
 */
async function handleInfo(context, levelsConfig) {
  const guildId = context.guild.id;
  const config = levelsConfig.getGuildConfig(guildId);
  const limit = levelsConfig.getLimit(guildId);
  const isPremium = levelsConfig.isPremium(guildId);

  let message = `📊 **Sistema de Niveles Personalizados**\n\n`;

  // Estado
  message += `**Estado:** ${config.enabled ? "✅ Activado" : "❌ Desactivado"}\n`;
  message += `**Plan:** ${isPremium ? "💎 Premium" : "🆓 Free"}\n`;
  message += `**Roles:** ${config.roles.length}/${limit}\n\n`;

  // Límites
  message += `📋 **Límites:**\n`;
  message += `• Plan Free: **10 roles** de nivel\n`;
  message += `• Plan Premium: **30 roles** de nivel\n\n`;

  // Características Premium
  if (!isPremium) {
    message += `💎 **Beneficios Premium:**\n`;
    message += `• Hasta 30 roles de nivel (vs 10)\n`;
    message += `• Soporte prioritario\n`;
    message += `• Personalización avanzada\n\n`;
    message += `Contacta al owner del bot para más información.`;
  } else {
    message += `✨ **Tienes acceso Premium**\n`;
    message += `Disfruta de hasta 30 roles de nivel personalizados!`;
  }

  await context.reply({
    content: message,
    ephemeral: true
  });
}