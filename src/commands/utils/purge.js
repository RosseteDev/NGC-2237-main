// src/commands/utils/purge.js
import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType
} from "discord.js";
import { getGuildLang, t } from "../../localization/Translator.js";
import { createLogger } from "../../utils/Logger.js";

const logger = createLogger("purge");

// ============================================
// LÍMITES DE DISCORD (NUNCA SUPERAR)
// ============================================

const LIMITS = {
  MAX_BULK_DELETE: 100,        // Discord API limit
  BULK_DELETE_AGE_DAYS: 14,    // Mensajes más viejos deben borrarse 1 a 1
  FETCH_LIMIT: 100,            // Max mensajes por fetch
  RATE_LIMIT_DELAY: 1000,      // Delay entre batches
  INDIVIDUAL_DELETE_DELAY: 500 // Delay entre borrados individuales
};

const ALLOWED_CHANNELS = [
  ChannelType.GuildText,
  ChannelType.GuildVoice,
  ChannelType.PublicThread,
  ChannelType.PrivateThread,
  ChannelType.GuildForum
];

// ============================================
// COMMAND DEFINITION
// ============================================

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
      .setNameLocalizations({ "es-ES": "usuario", "es-419": "usuario" })
      .setDescription("Target user")
      .setDescriptionLocalizations({ "es-ES": "Usuario objetivo", "es-419": "Usuario objetivo" })
      .setRequired(true)
  )
  .addIntegerOption(opt =>
    opt.setName("limit")
      .setNameLocalizations({ "es-ES": "limite", "es-419": "limite" })
      .setDescription("Messages to scan (1-1000)")
      .setDescriptionLocalizations({ "es-ES": "Mensajes a escanear (1-1000)", "es-419": "Mensajes a escanear (1-1000)" })
      .setMinValue(1)
      .setMaxValue(1000)
  );

// ============================================
// UTILIDADES
// ============================================

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function chunk(array, size) {
  const chunks = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

// ============================================
// LÓGICA DE FETCH
// ============================================

/**
 * Fetch de mensajes con paginación
 * Respeta rate limits y maneja errores
 */
async function fetchMessages(channel, totalLimit) {
  const messages = [];
  let lastId;
  const iterations = Math.ceil(totalLimit / LIMITS.FETCH_LIMIT);
  
  logger.debug(`Fetching ${totalLimit} mensajes (${iterations} batches)`);
  
  for (let i = 0; i < iterations && messages.length < totalLimit; i++) {
    const remaining = totalLimit - messages.length;
    const fetchLimit = Math.min(remaining, LIMITS.FETCH_LIMIT);
    
    const options = { limit: fetchLimit };
    if (lastId) options.before = lastId;
    
    try {
      const batch = await channel.messages.fetch(options);
      
      if (batch.size === 0) {
        logger.debug(`Canal vacío después de ${messages.length} mensajes`);
        break;
      }
      
      messages.push(...batch.values());
      lastId = batch.last().id;
      
      logger.debug(`Batch ${i + 1}/${iterations}: ${batch.size} msgs (total: ${messages.length})`);
      
      // Rate limit prevention (no en última iteración)
      if (i < iterations - 1 && batch.size === LIMITS.FETCH_LIMIT) {
        await sleep(300);
      }
      
    } catch (error) {
      logger.error(`Error en batch ${i + 1}:`, error);
      break; // Stop fetching, usar lo que tenemos
    }
  }
  
  return messages;
}

// ============================================
// LÓGICA DE DELETE
// ============================================

/**
 * Borrar mensajes masivamente (respeta límites de Discord)
 */
async function bulkDeleteMessages(channel, messages) {
  if (messages.length === 0) return 0;
  
  const now = Date.now();
  const cutoff = now - (LIMITS.BULK_DELETE_AGE_DAYS * 24 * 60 * 60 * 1000);
  
  // Separar mensajes recientes de antiguos
  const recent = messages.filter(m => m.createdTimestamp > cutoff);
  const old = messages.filter(m => m.createdTimestamp <= cutoff);
  
  logger.debug(`Split: ${recent.length} recientes, ${old.length} antiguos (>14d)`);
  
  let deleted = 0;
  
  // 1. Bulk delete (mensajes recientes)
  if (recent.length > 0) {
    const chunks = chunk(recent, LIMITS.MAX_BULK_DELETE);
    
    for (let i = 0; i < chunks.length; i++) {
      try {
        logger.debug(`BulkDelete ${i + 1}/${chunks.length}: ${chunks[i].length} msgs`);
        const result = await channel.bulkDelete(chunks[i], true);
        deleted += result.size;
        
        // Rate limit entre chunks
        if (i < chunks.length - 1) {
          await sleep(LIMITS.RATE_LIMIT_DELAY);
        }
        
      } catch (error) {
        logger.warn(`BulkDelete falló en chunk ${i + 1}, usando individual`, error);
        deleted += await deleteIndividually(chunks[i]);
      }
    }
  }
  
  // 2. Individual delete (mensajes antiguos)
  if (old.length > 0) {
    logger.debug(`Borrado individual: ${old.length} mensajes antiguos`);
    deleted += await deleteIndividually(old);
  }
  
  return deleted;
}

/**
 * Borrar mensajes uno por uno
 * Último recurso cuando bulkDelete no funciona
 */
async function deleteIndividually(messages) {
  let deleted = 0;
  
  for (const msg of messages) {
    try {
      await msg.delete();
      deleted++;
      await sleep(LIMITS.INDIVIDUAL_DELETE_DELAY);
      
    } catch (error) {
      // Ignorar "Unknown Message" (ya fue borrado)
      if (!error.message.includes("Unknown Message")) {
        logger.debug(`No se pudo borrar ${msg.id}: ${error.message}`);
      }
    }
  }
  
  return deleted;
}

// ============================================
// VALIDACIONES
// ============================================

function validateChannelType(channel, lang) {
  if (!ALLOWED_CHANNELS.includes(channel.type)) {
    return t(lang, "common.errors.no_messages_channel");
  }
  return null;
}

function validateUserPermissions(member, lang) {
  if (!member.permissions.has(PermissionFlagsBits.ManageMessages)) {
    return t(lang, "common.errors.permission_required");
  }
  return null;
}

function validateBotPermissions(guild, channel, lang) {
  const bot = guild.members.me;
  
  // Permiso global
  if (!bot.permissions.has(PermissionFlagsBits.ManageMessages)) {
    return t(lang, "common.errors.bot_permission_required");
  }
  
  // Permiso en canal específico
  const channelPerms = channel.permissionsFor(bot);
  if (!channelPerms.has(PermissionFlagsBits.ManageMessages)) {
    return t(lang, "purge.responses.no_channel_permission");
  }
  
  return null;
}

// ============================================
// EXECUTE
// ============================================

export async function execute(interaction) {
  const lang = await getGuildLang(interaction.guildId);
  
  // Validaciones
  const channelError = validateChannelType(interaction.channel, lang);
  if (channelError) {
    return interaction.reply({ content: channelError, ephemeral: true });
  }
  
  const userError = validateUserPermissions(interaction.member, lang);
  if (userError) {
    return interaction.reply({ content: userError, ephemeral: true });
  }
  
  const botError = validateBotPermissions(interaction.guild, interaction.channel, lang);
  if (botError) {
    return interaction.reply({ content: botError, ephemeral: true });
  }
  
  // Obtener parámetros
  const user = interaction.options.getUser("user");
  const limit = interaction.options.getInteger("limit") ?? 500;
  
  logger.info(`Purge iniciado: ${user.tag} en ${interaction.channel.name} (limit: ${limit})`);
  
  // Respuesta inicial
  await interaction.reply({
    content: t(lang, "purge.responses.start"),
    ephemeral: true
  });
  
  try {
    // 1. Fetch mensajes
    const messages = await fetchMessages(interaction.channel, limit);
    const userMessages = messages.filter(m => m.author.id === user.id);
    
    logger.info(`Encontrados ${userMessages.length}/${messages.length} mensajes de ${user.tag}`);
    
    // 2. Sin mensajes
    if (userMessages.length === 0) {
      return interaction.editReply(
        t(lang, "purge.responses.no_messages", { 
          user: user.tag, 
          limit: limit 
        })
      );
    }
    
    // 3. Warning si hay muchos mensajes
    if (userMessages.length > 50) {
      await interaction.editReply(
        t(lang, "purge.responses.processing", {
          count: userMessages.length,
          user: user.tag
        })
      );
      await sleep(2000); // Dar tiempo a leer el mensaje
    }
    
    // 4. Delete
    const startTime = Date.now();
    const deleted = await bulkDeleteMessages(interaction.channel, userMessages);
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    
    logger.info(`Purge completado: ${deleted}/${userMessages.length} borrados en ${elapsed}s`);
    
    // 5. Resultado
    await interaction.editReply(
      t(lang, "purge.responses.done") + "\n\n" +
      t(lang, "purge.responses.stats", {
        user: user.tag,
        checked: messages.length,
        deleted: deleted
      }) +
      `\n⏱️ ${t(lang, "purge.responses.time")}: ${elapsed}s`
    );
    
  } catch (error) {
    logger.error("Error en purge:", error);
    
    // Mapear errores de Discord a mensajes amigables
    let errorMsg = t(lang, "common.errors.unexpected");
    
    if (error.code === 50013) {
      errorMsg = t(lang, "purge.responses.error_permissions");
    } else if (error.code === 50001) {
      errorMsg = t(lang, "purge.responses.error_access");
    } else if (error.message.includes("429") || error.message.includes("rate limit")) {
      errorMsg = t(lang, "purge.responses.error_rate_limit");
    }
    
    await interaction.editReply({ content: errorMsg });
  }
}