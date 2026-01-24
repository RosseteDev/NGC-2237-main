// src/commands/utils/purge.js
import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  MessageFlags,
  ChannelType
} from "discord.js";
import { useLang } from "../../localization/useLang.js";
import { getGuildLang } from "../../localization/getGuildLang.js";
import { t } from "../../localization/i18n.js";
import { createLogger } from "../../utils/Logger.js";

const logger = createLogger("purge");

// Configuración de límites reales de Discord
const DISCORD_LIMITS = {
  MAX_BULK_DELETE: 100,          // Discord permite máximo 100 por bulkDelete
  BULK_DELETE_AGE_DAYS: 14,      // Solo mensajes < 14 días
  FETCH_LIMIT: 100,              // Límite de fetch por request
  RATE_LIMIT_DELAY: 1000         // Delay entre operaciones para evitar rate limit
};

const ALLOWED_CHANNEL_TYPES = [
  ChannelType.GuildText,
  ChannelType.GuildVoice,         // Chat de voz
  ChannelType.PublicThread,
  ChannelType.PrivateThread,
  ChannelType.GuildForum          // Posts en foros
];

export const data = new SlashCommandBuilder()
  .setName("purge")
  .setNameLocalizations({
    "es-ES": "purga",
    "es-419": "purga"
  })
  .setDescription("Delete messages from a user")
  .setDescriptionLocalizations({
    "es-ES": "Borra mensajes de un usuario",
    "es-419": "Borra mensajes de un usuario"
  })
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
  .setDMPermission(false)
  .addUserOption(opt =>
    opt.setName("user")
      .setNameLocalizations({
        "es-ES": "usuario",
        "es-419": "usuario"
      })
      .setDescription("Target user")
      .setDescriptionLocalizations({
        "es-ES": "Usuario objetivo",
        "es-419": "Usuario objetivo"
      })
      .setRequired(true)
  )
  .addIntegerOption(opt =>
    opt.setName("limit")
      .setNameLocalizations({
        "es-ES": "limite",
        "es-419": "limite"
      })
      .setDescription("Messages to scan (1-1000)")
      .setDescriptionLocalizations({
        "es-ES": "Mensajes a escanear (1-1000)",
        "es-419": "Mensajes a escanear (1-1000)"
      })
      .setMinValue(1)
      .setMaxValue(1000)
  );

/**
 * Fetch messages with pagination
 * Limita automáticamente para evitar timeouts
 */
async function fetchMessages(channel, totalLimit) {
  const messages = [];
  let lastId;
  const maxIterations = Math.ceil(totalLimit / DISCORD_LIMITS.FETCH_LIMIT);
  
  logger.debug(`Fetching hasta ${totalLimit} mensajes en ${maxIterations} iteraciones`);
  
  for (let i = 0; i < maxIterations && messages.length < totalLimit; i++) {
    const remaining = totalLimit - messages.length;
    const fetchLimit = Math.min(remaining, DISCORD_LIMITS.FETCH_LIMIT);
    
    const options = { limit: fetchLimit };
    if (lastId) options.before = lastId;
    
    try {
      const batch = await channel.messages.fetch(options);
      
      if (batch.size === 0) {
        logger.debug(`No más mensajes disponibles después de ${messages.length}`);
        break;
      }
      
      messages.push(...batch.values());
      lastId = batch.last().id;
      
      logger.debug(`Batch ${i + 1}: ${batch.size} mensajes (total: ${messages.length})`);
      
      // Rate limiting entre fetches
      if (i < maxIterations - 1) {
        await sleep(300);
      }
      
    } catch (error) {
      logger.error(`Error en fetch batch ${i + 1}`, error);
      break;
    }
  }
  
  return messages;
}

/**
 * Bulk delete con manejo robusto de errores
 * Agrupa todos los mensajes válidos y hace UN solo bulkDelete
 */
async function bulkDeleteMessages(channel, messages) {
  if (messages.length === 0) return 0;
  
  const now = Date.now();
  const cutoff = now - (DISCORD_LIMITS.BULK_DELETE_AGE_DAYS * 24 * 60 * 60 * 1000);
  
  // Separar por edad
  const recent = messages.filter(m => m.createdTimestamp > cutoff);
  const old = messages.filter(m => m.createdTimestamp <= cutoff);
  
  logger.debug(`Bulk delete: ${recent.length} recientes, ${old.length} antiguos`);
  
  let deleted = 0;
  
  // Bulk delete de mensajes recientes (máximo 100 por operación)
  if (recent.length > 0) {
    const chunks = chunkArray(recent, DISCORD_LIMITS.MAX_BULK_DELETE);
    
    for (const chunk of chunks) {
      try {
        logger.debug(`BulkDelete: ${chunk.length} mensajes`);
        const result = await channel.bulkDelete(chunk, true);
        deleted += result.size;
        
        // Rate limit entre chunks
        if (chunks.length > 1) {
          await sleep(DISCORD_LIMITS.RATE_LIMIT_DELAY);
        }
        
      } catch (error) {
        // Si bulkDelete falla, intentar individual
        logger.warn(`BulkDelete falló, intentando individual`, error);
        deleted += await deleteIndividually(chunk);
      }
    }
  }
  
  // Mensajes antiguos: borrado individual (no hay otra opción)
  if (old.length > 0) {
    logger.debug(`Borrando ${old.length} mensajes antiguos individualmente`);
    deleted += await deleteIndividually(old);
  }
  
  return deleted;
}

/**
 * Borrar mensajes uno por uno con rate limiting
 * Última opción, lento pero confiable
 */
async function deleteIndividually(messages) {
  let deleted = 0;
  
  for (const msg of messages) {
    try {
      await msg.delete();
      deleted++;
      
      // Rate limiting agresivo para evitar 429
      await sleep(500);
      
    } catch (error) {
      // Ignorar errores de mensajes ya borrados o sin permisos
      if (!error.message.includes("Unknown Message")) {
        logger.debug(`No se pudo borrar mensaje ${msg.id}: ${error.message}`);
      }
    }
  }
  
  return deleted;
}

/**
 * Actualizar mensaje de progreso cada N mensajes
 */
async function updateProgress(interaction, current, total, user) {
  const percentage = Math.floor((current / total) * 100);
  const bar = createProgressBar(current, total);
  
  try {
    await interaction.editReply(
      `🔄 Borrando mensajes de ${user.tag}...\n\n` +
      `${bar} ${percentage}%\n` +
      `${current}/${total} procesados`
    );
  } catch (error) {
    // Ignorar errores de edición
  }
}

/**
 * Crear barra de progreso visual
 */
function createProgressBar(current, total, length = 20) {
  const percentage = current / total;
  const filled = Math.floor(percentage * length);
  const empty = length - filled;
  
  return `[${"█".repeat(filled)}${"░".repeat(empty)}]`;
}

/**
 * Dividir array en chunks
 */
function chunkArray(array, size) {
  const chunks = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

/**
 * Sleep helper
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Comando principal
 */
export async function execute(interaction) {
  const lang = await getGuildLang(interaction.guildId);
  
  // Validación de tipo de canal
  if (!ALLOWED_CHANNEL_TYPES.includes(interaction.channel.type)) {
    return interaction.reply({
      content: t(lang, "common.errors.no_messages_channel"),
      ephemeral: true
    });
  }
  
  // Validación de permisos del usuario
  if (!interaction.member.permissions.has(PermissionFlagsBits.ManageMessages)) {
    return interaction.reply({
      content: t(lang, "common.errors.permission_required"),
      ephemeral: true
    });
  }
  
  // Validación de permisos del bot
  const botMember = interaction.guild.members.me;
  if (!botMember.permissions.has(PermissionFlagsBits.ManageMessages)) {
    return interaction.reply({
      content: t(lang, "common.errors.bot_permission_required"),
      ephemeral: true
    });
  }
  
  // Validación de permisos en el canal específico
  const channelPerms = interaction.channel.permissionsFor(botMember);
  if (!channelPerms.has(PermissionFlagsBits.ManageMessages)) {
    return interaction.reply({
      content: t(lang, "utility.purge.no_channel_permission"),
      ephemeral: true
    });
  }
  
  const user = interaction.options.getUser("user");
  const limit = interaction.options.getInteger("limit") ?? 500;
  
  logger.info(`Purge iniciado: ${user.tag} en ${interaction.channel.name} (limit: ${limit})`);
  
  // Defer con mensaje de inicio
  await interaction.reply({
    content: t(lang, "utility.purge.start"),
    ephemeral: true
  });
  
  try {
    // Fetch mensajes
    const messages = await fetchMessages(interaction.channel, limit);
    const userMessages = messages.filter(m => m.author.id === user.id);
    
    logger.info(`Encontrados ${userMessages.length} mensajes de ${user.tag} (de ${messages.length} totales)`);
    
    if (userMessages.length === 0) {
      return interaction.editReply(
        t(lang, "utility.purge.no_messages", { 
          user: user.tag, 
          limit: limit 
        })
      );
    }
    
    // Confirmar antes de borrar muchos mensajes
    if (userMessages.length > 50) {
      await interaction.editReply(
        t(lang, "utility.purge.processing", {
          count: userMessages.length,
          user: user.tag
        })
      );
      await sleep(2000);
    }
    
    // Borrar mensajes
    const startTime = Date.now();
    const deleted = await bulkDeleteMessages(interaction.channel, userMessages);
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    
    logger.info(`Purge completado: ${deleted}/${userMessages.length} borrados en ${elapsed}s`);
    
    // Resultado final
    await interaction.editReply(
      t(lang, "utility.purge.done") + "\n\n" +
      t(lang, "utility.purge.stats", {
        user: user.tag,
        checked: messages.length,
        deleted: deleted
      }) +
      `\n⏱️ ${t(lang, "utility.purge.time")}: ${elapsed}s`
    );
    
  } catch (error) {
    logger.error("Error en purge", error);
    
    // Mensajes de error específicos
    let errorMsg = t(lang, "common.errors.unexpected");
    
    if (error.code === 50013) {
      errorMsg = t(lang, "utility.purge.error_permissions");
    } else if (error.code === 50001) {
      errorMsg = t(lang, "utility.purge.error_access");
    } else if (error.message.includes("429")) {
      errorMsg = t(lang, "utility.purge.error_rate_limit");
    }
    
    await interaction.editReply({ content: errorMsg });
  }
}