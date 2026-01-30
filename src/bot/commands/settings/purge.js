// src/commands/utils/purge.js

import { ChannelType, PermissionFlagsBits } from "discord.js";
import { buildCommand } from "../../utils/commandbuilder.js";
import { createTranslator } from "../../utils/TranslatorHelper.js";
import { createLogger } from "../../utils/Logger.js";

const logger = createLogger("purge");

// ============================================
// LÍMITES DE DISCORD
// ============================================

const LIMITS = {
  MAX_BULK_DELETE: 100,
  BULK_DELETE_AGE_DAYS: 14,
  FETCH_LIMIT: 100,
  RATE_LIMIT_DELAY: 1000,
  INDIVIDUAL_DELETE_DELAY: 500
};

const ALLOWED_CHANNELS = [
  ChannelType.GuildText,
  ChannelType.GuildVoice,
  ChannelType.PublicThread,
  ChannelType.PrivateThread,
  ChannelType.GuildForum
];

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
// FETCH DE MENSAJES
// ============================================

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
      
      logger.debug(`Batch ${i + 1}: ${batch.size} msgs (total: ${messages.length})`);
      
      if (i < iterations - 1 && batch.size === LIMITS.FETCH_LIMIT) {
        await sleep(300);
      }
      
    } catch (error) {
      logger.error(`Error en batch ${i + 1}:`, error);
      break;
    }
  }
  
  return messages;
}

// ============================================
// DELETE DE MENSAJES
// ============================================

async function deleteIndividually(messages) {
  let deleted = 0;
  
  for (const msg of messages) {
    try {
      await msg.delete();
      deleted++;
      await sleep(LIMITS.INDIVIDUAL_DELETE_DELAY);
      
    } catch (error) {
      if (!error.message.includes("Unknown Message")) {
        logger.debug(`No se pudo borrar ${msg.id}: ${error.message}`);
      }
    }
  }
  
  return deleted;
}

async function bulkDeleteMessages(channel, messages) {
  if (messages.length === 0) return 0;
  
  const now = Date.now();
  const cutoff = now - (LIMITS.BULK_DELETE_AGE_DAYS * 24 * 60 * 60 * 1000);
  
  const recent = messages.filter(m => m.createdTimestamp > cutoff);
  const old = messages.filter(m => m.createdTimestamp <= cutoff);
  
  logger.debug(`Split: ${recent.length} recientes, ${old.length} antiguos`);
  
  let deleted = 0;
  
  // Bulk delete
  if (recent.length > 0) {
    const chunks = chunk(recent, LIMITS.MAX_BULK_DELETE);
    
    for (let i = 0; i < chunks.length; i++) {
      try {
        logger.debug(`BulkDelete ${i + 1}/${chunks.length}: ${chunks[i].length} msgs`);
        const result = await channel.bulkDelete(chunks[i], true);
        deleted += result.size;
        
        if (i < chunks.length - 1) {
          await sleep(LIMITS.RATE_LIMIT_DELAY);
        }
        
      } catch (error) {
        logger.warn(`BulkDelete falló, usando individual`, error);
        deleted += await deleteIndividually(chunks[i]);
      }
    }
  }
  
  // Individual delete
  if (old.length > 0) {
    logger.debug(`Borrado individual: ${old.length} antiguos`);
    deleted += await deleteIndividually(old);
  }
  
  return deleted;
}

// ============================================
// VALIDACIONES
// ============================================

function validateChannelType(channel) {
  return ALLOWED_CHANNELS.includes(channel.type);
}

function validateUserPermissions(member) {
  return member.permissions.has(PermissionFlagsBits.ManageMessages);
}

function validateBotPermissions(guild, channel) {
  const bot = guild.members.me;
  
  if (!bot.permissions.has(PermissionFlagsBits.ManageMessages)) {
    return false;
  }
  
  const channelPerms = channel.permissionsFor(bot);
  if (!channelPerms?.has(PermissionFlagsBits.ManageMessages)) {
    return false;
  }
  
  return true;
}

// ============================================
// COMMAND DEFINITION
// ============================================

export const data = buildCommand("utils", "purge");

export async function execute(context) {
  const t = await createTranslator(data, context);
  
  // Validaciones
  if (!validateChannelType(context.channel)) {
    return context.reply({ 
      content: t("invalid_channel"), 
      ephemeral: true 
    });
  }
  
  if (!validateUserPermissions(context.member)) {
    return context.reply({ 
      content: t("no_user_permission"), 
      ephemeral: true 
    });
  }
  
  if (!validateBotPermissions(context.guild, context.channel)) {
    return context.reply({ 
      content: t("no_bot_permission"), 
      ephemeral: true 
    });
  }
  
  // Parámetros
  const user = context.options.getUser("user");
  const limit = context.options.getInteger("limit") ?? 500;
  
  logger.info(`Purge: ${user.tag} en ${context.channel.name} (limit: ${limit})`);
  
  // Respuesta inicial
  await context.reply({
    content: t("starting"),
    ephemeral: true
  });
  
  try {
    // Fetch
    const messages = await fetchMessages(context.channel, limit);
    const userMessages = messages.filter(m => m.author.id === user.id);
    
    logger.info(`Encontrados: ${userMessages.length}/${messages.length} de ${user.tag}`);
    
    // Sin mensajes
    if (userMessages.length === 0) {
      return context.editReply(
        t("no_messages", { 
          user: user.tag, 
          limit 
        })
      );
    }
    
    // Warning para muchos mensajes
    if (userMessages.length > 50) {
      await context.editReply(
        t("processing", {
          count: userMessages.length,
          user: user.tag
        })
      );
      await sleep(2000);
    }
    
    // Delete
    const startTime = Date.now();
    const deleted = await bulkDeleteMessages(context.channel, userMessages);
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    
    logger.info(`✅ Purge: ${deleted}/${userMessages.length} borrados en ${elapsed}s`);
    
    // Resultado
    await context.editReply(
      t("done") + "\n\n" +
      t("stats", {
        user: user.tag,
        checked: messages.length,
        deleted
      }) +
      `\n⏱️ ${t("time")}: ${elapsed}s`
    );
    
  } catch (error) {
    logger.error("Error en purge:", error);
    
    // Mapeo de errores
    let errorMsg = t("error_general");
    
    if (error.code === 50013) {
      errorMsg = t("error_permissions");
    } else if (error.code === 50001) {
      errorMsg = t("error_access");
    } else if (error.message.includes("429") || error.message.includes("rate limit")) {
      errorMsg = t("error_rate_limit");
    }
    
    await context.editReply({ content: errorMsg });
  }
}