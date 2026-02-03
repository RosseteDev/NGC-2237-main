// src/bot/commands/admin/managepremium.js
// ⚠️ Solo para el dueño del bot

import { SlashCommandBuilder } from "discord.js";
import { getCustomLevelsConfig } from "../../config/CustomLevelsConfig.js";
import { createLogger } from "../../utils/Logger.js";

const logger = createLogger("command:manage-premium");

// ✅ IDs de los dueños del bot (añade tus IDs aquí)
const BOT_OWNERS = [
  "TU_USER_ID_AQUI" // Reemplaza con tu Discord User ID
];

export const data = new SlashCommandBuilder()
  .setName("managepremium")
  .setDescription("🔐 Gestionar servidores premium (Bot Owner Only)")
  .addSubcommand(sub =>
    sub
      .setName("add")
      .setDescription("Otorgar premium a un servidor")
      .addStringOption(opt =>
        opt
          .setName("guild_id")
          .setDescription("ID del servidor")
          .setRequired(true)
      )
  )
  .addSubcommand(sub =>
    sub
      .setName("remove")
      .setDescription("Quitar premium de un servidor")
      .addStringOption(opt =>
        opt
          .setName("guild_id")
          .setDescription("ID del servidor")
          .setRequired(true)
      )
  )
  .addSubcommand(sub =>
    sub
      .setName("list")
      .setDescription("Ver todos los servidores premium")
  )
  .addSubcommand(sub =>
    sub
      .setName("check")
      .setDescription("Verificar si un servidor tiene premium")
      .addStringOption(opt =>
        opt
          .setName("guild_id")
          .setDescription("ID del servidor (o deja vacío para el actual)")
          .setRequired(false)
      )
  )
  .addSubcommand(sub =>
    sub
      .setName("stats")
      .setDescription("Ver estadísticas globales del sistema")
  );

export async function execute(context) {
  // ✅ VALIDACIÓN: Solo bot owners
  if (!BOT_OWNERS.includes(context.user.id)) {
    return context.reply({
      content: "🔐 Este comando es solo para los dueños del bot.",
      ephemeral: true
    });
  }

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
      
      case "check":
        await handleCheck(context, levelsConfig);
        break;
      
      case "stats":
        await handleStats(context, levelsConfig);
        break;
    }
  } catch (error) {
    logger.error("Error en managepremium", error);
    await context.reply({
      content: `❌ Error: ${error.message}`,
      ephemeral: true
    });
  }
}

/**
 * Otorgar premium
 */
async function handleAdd(context, levelsConfig) {
  const guildId = context.source.options.getString("guild_id");

  // Validar que el servidor exista
  const guild = context.client.guilds.cache.get(guildId);
  if (!guild) {
    return context.reply({
      content: `❌ El bot no está en el servidor con ID: \`${guildId}\``,
      ephemeral: true
    });
  }

  // Verificar si ya es premium
  if (levelsConfig.isPremium(guildId)) {
    return context.reply({
      content: `ℹ️ **${guild.name}** ya tiene premium activo`,
      ephemeral: true
    });
  }

  // Activar premium
  levelsConfig.setPremium(guildId, true);

  logger.info(`Premium activado para ${guild.name} (${guildId})`);

  await context.reply({
    content: 
      `✅ **Premium Activado**\n\n` +
      `**Servidor:** ${guild.name}\n` +
      `**ID:** \`${guildId}\`\n` +
      `**Owner:** ${guild.members.cache.get(guild.ownerId)?.user.tag || "Unknown"}\n\n` +
      `Ahora tienen acceso a:\n` +
      `• Hasta **30 roles** de nivel (vs 10)\n` +
      `• Soporte prioritario\n` +
      `• Personalización avanzada`,
    ephemeral: true
  });
}

/**
 * Quitar premium
 */
async function handleRemove(context, levelsConfig) {
  const guildId = context.source.options.getString("guild_id");

  if (!levelsConfig.isPremium(guildId)) {
    return context.reply({
      content: `ℹ️ El servidor \`${guildId}\` no tiene premium`,
      ephemeral: true
    });
  }

  // Desactivar premium
  levelsConfig.setPremium(guildId, false);

  const guild = context.client.guilds.cache.get(guildId);
  const guildName = guild ? guild.name : "Unknown Server";

  logger.info(`Premium removido de ${guildName} (${guildId})`);

  await context.reply({
    content: 
      `⚠️ **Premium Removido**\n\n` +
      `**Servidor:** ${guildName}\n` +
      `**ID:** \`${guildId}\`\n\n` +
      `⚠️ Si tienen más de 10 roles de nivel configurados, deberán eliminar los excedentes.`,
    ephemeral: true
  });
}

/**
 * Listar servidores premium
 */
async function handleList(context, levelsConfig) {
  const premiumGuilds = Array.from(levelsConfig.premiumGuilds);

  if (premiumGuilds.length === 0) {
    return context.reply({
      content: `📋 **Servidores Premium**\n\nNo hay servidores premium todavía.`,
      ephemeral: true
    });
  }

  let message = `📋 **Servidores Premium** (${premiumGuilds.length})\n\n`;

  for (const guildId of premiumGuilds) {
    const guild = context.client.guilds.cache.get(guildId);
    
    if (guild) {
      const config = levelsConfig.getGuildConfig(guildId);
      message += `💎 **${guild.name}**\n`;
      message += `   ID: \`${guildId}\`\n`;
      message += `   Miembros: ${guild.memberCount}\n`;
      message += `   Roles de nivel: ${config.roles.length}/30\n\n`;
    } else {
      message += `⚠️ **Unknown Server**\n`;
      message += `   ID: \`${guildId}\` (bot no está en el servidor)\n\n`;
    }
  }

  await context.reply({
    content: message,
    ephemeral: true
  });
}

/**
 * Verificar premium
 */
async function handleCheck(context, levelsConfig) {
  let guildId = context.source.options.getString("guild_id");
  
  if (!guildId) {
    if (!context.guild) {
      return context.reply({
        content: "❌ Debes ejecutar esto en un servidor o proporcionar un ID",
        ephemeral: true
      });
    }
    guildId = context.guild.id;
  }

  const guild = context.client.guilds.cache.get(guildId);
  const isPremium = levelsConfig.isPremium(guildId);
  const config = levelsConfig.getGuildConfig(guildId);

  let message = `🔍 **Estado Premium**\n\n`;
  
  if (guild) {
    message += `**Servidor:** ${guild.name}\n`;
  }
  
  message += `**ID:** \`${guildId}\`\n`;
  message += `**Premium:** ${isPremium ? "✅ Activo" : "❌ No activo"}\n`;
  message += `**Límite de roles:** ${isPremium ? "30" : "10"}\n`;
  message += `**Roles configurados:** ${config.roles.length}\n`;
  message += `**Sistema activo:** ${config.enabled ? "✅ Sí" : "❌ No"}\n`;

  await context.reply({
    content: message,
    ephemeral: true
  });
}

/**
 * Estadísticas globales
 */
async function handleStats(context, levelsConfig) {
  const stats = levelsConfig.getStats();
  const totalGuilds = context.client.guilds.cache.size;

  let message = `📊 **Estadísticas Globales**\n\n`;
  
  message += `**Bot Stats:**\n`;
  message += `• Total de servidores: ${totalGuilds}\n`;
  message += `• Servidores con niveles: ${stats.totalGuilds}\n`;
  message += `• Sistemas activos: ${stats.enabledGuilds}\n\n`;
  
  message += `**Premium:**\n`;
  message += `• Servidores premium: ${stats.premiumGuilds}\n`;
  message += `• Tasa de conversión: ${
    ((stats.premiumGuilds / totalGuilds) * 100).toFixed(1)
  }%\n\n`;
  
  message += `**Roles:**\n`;
  message += `• Total de roles de nivel: ${stats.totalRoles}\n`;
  message += `• Promedio por servidor: ${stats.avgRolesPerGuild}\n`;

  await context.reply({
    content: message,
    ephemeral: true
  });
}