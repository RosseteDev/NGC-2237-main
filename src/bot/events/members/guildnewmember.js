// src/bot/events/members/guildnewmember.js

import { Events, AttachmentBuilder } from "discord.js";
import { detectLanguage, createTranslator } from "../../localization/TranslatorHelper.js";
import { generateWelcomeImage } from "../../utils/welcomeImage.js";
import { createLogger } from "../../utils/Logger.js";
import { getPendingMembersManager } from "../../managers/PendingMembersManager.js";
import { getGenderRolesConfig } from "../../config/GenderRolesConfig.js";

const logger = createLogger("event:welcome");

/**
 * Handler de bienvenida mejorado con detección dinámica de género
 * 
 * Flujo optimizado:
 * 1. Usuario entra al servidor
 * 2. Se registra como "pendiente" con timeout
 * 3. Si selecciona rol de género antes del timeout -> Imagen personalizada
 * 4. Si timeout expira -> Imagen genérica/neutral
 * 5. Si sale del servidor -> Auto-cleanup
 */
export default client => {
  const pendingManager = getPendingMembersManager({
    waitTimeout: 300000,      // 5 minutos
    cleanupInterval: 60000,   // Limpieza cada 1 minuto
    maxPendingMembers: 1000   // Prevenir memory leaks
  });
  
  const genderConfig = getGenderRolesConfig();

  /**
   * Evento: Usuario se une al servidor
   */
  client.on(Events.GuildMemberAdd, async member => {
    try {
      const db = client.db;
      const guildId = member.guild.id;

      // Verificar canal de bienvenida configurado
      let channelId = db.getWelcomeChannel(guildId);
      if (channelId instanceof Promise) channelId = await channelId;

      if (!channelId) {
        logger.debug(`No welcome channel configured for guild ${guildId}`);
        return;
      }

      const welcomeChannel = member.guild.channels.cache.get(channelId);
      if (!welcomeChannel || !welcomeChannel.isTextBased()) {
        logger.warn(`Welcome channel ${channelId} not found or not text-based in guild ${guildId}`);
        return;
      }

      // Verificar si el sistema de género está habilitado
      const isGenderSystemEnabled = genderConfig.isEnabled(guildId);

      if (!isGenderSystemEnabled) {
        // Sistema deshabilitado -> Enviar mensaje genérico inmediatamente
        logger.debug(`Gender system disabled for guild ${guildId}, sending immediate welcome`);
        await sendWelcomeMessage(member, welcomeChannel, null);
        return;
      }

      // Sistema habilitado -> Registrar como pendiente y esperar
      const timeout = genderConfig.getTimeout(guildId);
      
      const registered = pendingManager.add(member.id, guildId, {
        channelId: welcomeChannel.id,
        joinedAt: member.joinedTimestamp
      });

      if (!registered) {
        logger.error(`Failed to register pending member ${member.id}`);
        // Fallback: enviar mensaje genérico
        await sendWelcomeMessage(member, welcomeChannel, null);
        return;
      }

      logger.info(
        `Member ${member.user.tag} registered as pending (guild: ${guildId}, timeout: ${timeout}ms)`
      );

      // Configurar timeout para envío automático
      setTimeout(async () => {
        await handleTimeout(member, guildId);
      }, timeout);

    } catch (err) {
      logger.error("GuildMemberAdd handler failed", err);
    }
  });

  /**
   * Evento: Usuario actualiza sus roles (aquí detectamos el género)
   */
  client.on(Events.GuildMemberUpdate, async (oldMember, newMember) => {
    try {
      const guildId = newMember.guild.id;
      const userId = newMember.id;

      // Verificar si el miembro está pendiente
      const pendingData = pendingManager.get(userId, guildId);
      
      if (!pendingData) {
        // No está pendiente, ignorar
        return;
      }

      // Extraer IDs de roles actuales
      const oldRoleIds = oldMember.roles.cache.map(r => r.id);
      const newRoleIds = newMember.roles.cache.map(r => r.id);

      // Detectar si se añadió un nuevo rol (optimización: solo revisar roles nuevos)
      const addedRoles = newRoleIds.filter(id => !oldRoleIds.includes(id));
      
      if (addedRoles.length === 0) {
        // No hay nuevos roles, ignorar
        return;
      }

      // Detectar género desde los roles
      const detectedGender = genderConfig.detectGenderFromRoles(guildId, newRoleIds);

      if (!detectedGender) {
        // No se detectó rol de género, seguir esperando
        logger.debug(`No gender role detected for ${userId} (added roles: ${addedRoles.join(', ')})`);
        return;
      }

      // ¡Género detectado! Enviar mensaje personalizado
      logger.info(
        `Gender '${detectedGender}' detected for ${newMember.user.tag} in guild ${guildId}`
      );

      // Eliminar de pendientes ANTES de enviar (evitar duplicados)
      pendingManager.delete(userId, guildId);

      // Obtener canal de bienvenida
      const welcomeChannel = newMember.guild.channels.cache.get(pendingData.channelId);
      
      if (!welcomeChannel || !welcomeChannel.isTextBased()) {
        logger.warn(`Welcome channel ${pendingData.channelId} no longer available`);
        return;
      }

      // Enviar mensaje con género específico
      await sendWelcomeMessage(newMember, welcomeChannel, detectedGender);

    } catch (err) {
      logger.error("GuildMemberUpdate handler failed", err);
    }
  });

  /**
   * Evento: Usuario sale del servidor (cleanup)
   */
  client.on(Events.GuildMemberRemove, async member => {
    try {
      const guildId = member.guild.id;
      const userId = member.id;

      // Limpiar de pendientes si estaba registrado
      const wasRemoved = pendingManager.delete(userId, guildId);
      
      if (wasRemoved) {
        logger.info(`Member ${member.user.tag} left guild ${guildId} before welcome (cleaned up)`);
      }

    } catch (err) {
      logger.error("GuildMemberRemove handler failed", err);
    }
  });

  /**
   * Maneja el timeout de espera de rol
   * @private
   */
  async function handleTimeout(member, guildId) {
    try {
      // Verificar si todavía está pendiente (puede que ya se procesó)
      const pendingData = pendingManager.get(member.id, guildId);
      
      if (!pendingData) {
        // Ya se procesó, no hacer nada
        logger.debug(`Timeout triggered but member ${member.id} already processed`);
        return;
      }

      // Eliminar de pendientes
      pendingManager.delete(member.id, guildId);

      // Verificar si el miembro todavía está en el servidor
      try {
        await member.fetch(); // Esto lanza error si ya no está
      } catch (fetchError) {
        logger.info(`Member ${member.id} left before timeout expired`);
        return;
      }

      const config = genderConfig.getGuildConfig(guildId);

      logger.info(
        `Timeout expired for ${member.user.tag} (guild: ${guildId}), fallback: ${config.fallbackBehavior}`
      );

      // Obtener canal
      const welcomeChannel = member.guild.channels.cache.get(pendingData.channelId);
      
      if (!welcomeChannel || !welcomeChannel.isTextBased()) {
        logger.warn(`Welcome channel ${pendingData.channelId} no longer available`);
        return;
      }

      // Comportamiento según configuración
      switch (config.fallbackBehavior) {
        case 'neutral':
          // Enviar mensaje neutral
          await sendWelcomeMessage(member, welcomeChannel, null);
          break;
          
        case 'skip':
          // No enviar nada
          logger.info(`Skipping welcome for ${member.user.tag} (timeout expired)`);
          break;
          
        default:
          // Por defecto: neutral
          await sendWelcomeMessage(member, welcomeChannel, null);
      }

    } catch (err) {
      logger.error(`Timeout handler failed for member ${member.id}`, err);
    }
  }

  /**
   * Envía el mensaje de bienvenida con imagen usando traducciones
   * @private
   */
  async function sendWelcomeMessage(member, channel, gender) {
    try {
      const eventContext = {
        guild: member.guild,
        locale: member.guild.preferredLocale || "en-US",
        user: member.user
      };

      const locale = await detectLanguage(eventContext);

      // Cargar traducciones
      const t = await createTranslator(
        { category: "utils", name: "welcome" },
        eventContext
      );

      // ✅ CORRECCIÓN: Seleccionar título y mensaje según género usando traducciones
      let titleKey = "title";
      let messageKey = "message";

      if (gender === 'male') {
        titleKey = "title_male";
        messageKey = "message_male";
      } else if (gender === 'female') {
        titleKey = "title_female";
        messageKey = "message_female";
      } else if (gender === 'nonbinary') {
        titleKey = "title_neutral";
        messageKey = "message_neutral";
      }
      // Si gender es null, usa las claves por defecto (neutral)

      const title = t(titleKey);
      const welcomeMsg = t(messageKey, {
        user: member.user.username,
        server: member.guild.name
      });

      logger.debug(
        `Generating welcome (gender: ${gender || 'neutral'}, locale: ${locale}): "${title}"`
      );

      // Generar imagen con variante de género
      const imageVariant = gender 
        ? genderConfig.getImageVariant(member.guild.id, gender)
        : 'neutral';

      const imageBuffer = await generateWelcomeImage(
        member.user.username,
        member.user.displayAvatarURL({ extension: "png", size: 256 }),
        welcomeMsg,
        title,
        { imageVariant } // Pasar variante al generador de imagen
      );

      const attachment = new AttachmentBuilder(imageBuffer, { name: "welcome.png" });

      await channel.send({
        content: `<@${member.id}>`,
        files: [attachment]
      });

      logger.info(
        `Welcome sent to ${channel.name} for ${member.user.tag} ` +
        `(gender: ${gender || 'neutral'}, locale: ${locale})`
      );

    } catch (err) {
      logger.error("Failed to send welcome message", err);
    }
  }

  // Cleanup al apagar el bot
  client.once(Events.ClientDestroy, () => {
    logger.info("Destroying pending members manager...");
    pendingManager.destroy();
  });
};