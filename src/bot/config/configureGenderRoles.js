// src/bot/commands/settings/configureGenderRoles.js

import { 
  SlashCommandBuilder, 
  PermissionFlagsBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags
} from "discord.js";
import { createTranslator } from "../localization/TranslatorHelper.js";
import { getGenderRolesConfig } from "./GenderRolesConfig.js";
import { createLogger } from "../utils/Logger.js";

const logger = createLogger("command:gender-config");

export const data = new SlashCommandBuilder()
  .setName("configuregender")
  .setDescription("Configura el sistema de bienvenidas con roles de género")
  .setDMPermission(false)
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addSubcommand(subcommand =>
    subcommand
      .setName("enable")
      .setDescription("Activa el sistema de género")
      .addRoleOption(option =>
        option
          .setName("role_hombre")
          .setDescription("Rol para identificar como hombre/masculino")
          .setRequired(true)
      )
      .addRoleOption(option =>
        option
          .setName("role_mujer")
          .setDescription("Rol para identificar como mujer/femenino")
          .setRequired(true)
      )
      .addRoleOption(option =>
        option
          .setName("role_nobinario")
          .setDescription("Rol para identificar como no binario (opcional)")
          .setRequired(false)
      )
      .addIntegerOption(option =>
        option
          .setName("timeout")
          .setDescription("Segundos de espera antes de enviar mensaje neutral (30-600)")
          .setMinValue(30)
          .setMaxValue(600)
          .setRequired(false)
      )
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName("disable")
      .setDescription("Desactiva el sistema de género (bienvenidas inmediatas)")
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName("status")
      .setDescription("Muestra la configuración actual del sistema")
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName("test")
      .setDescription("Prueba el sistema enviando una bienvenida de ejemplo")
      .addStringOption(option =>
        option
          .setName("gender")
          .setDescription("Género a simular")
          .setRequired(true)
          .addChoices(
            { name: "Hombre/Masculino", value: "male" },
            { name: "Mujer/Femenino", value: "female" },
            { name: "No Binario/Neutral", value: "nonbinary" }
          )
      )
  );

export async function execute(context) {
  // ✅ CORREGIDO: Extraer la interacción del objeto Context
  // El CommandHandler pasa un Context, no la interacción directamente
  const interaction = context.source || context.interaction || context;
  
  // Validar que tenemos una interacción válida
  if (!interaction || !interaction.options) {
    logger.error('Invalid interaction object received in execute');
    if (context && context.reply) {
      await context.reply({
        content: "❌ Error interno: objeto de interacción inválido",
        flags: MessageFlags.Ephemeral
      }).catch(() => {});
    }
    return;
  }
  
  const subcommand = interaction.options.getSubcommand();
  const guildId = interaction.guild.id;
  const genderConfig = getGenderRolesConfig();

  const t = await createTranslator(
    { category: "settings", name: "gender" },
    interaction
  );

  try {
    switch (subcommand) {
      case "enable":
        await handleEnable(context, interaction, guildId, genderConfig, t);
        break;
      
      case "disable":
        await handleDisable(context, interaction, guildId, genderConfig, t);
        break;
      
      case "status":
        await handleStatus(context, interaction, guildId, genderConfig, t);
        break;
      
      case "test":
        await handleTest(context, interaction, guildId, genderConfig, t);
        break;
      
      default:
        await context.reply({
          content: "❌ Subcomando no reconocido",
          flags: MessageFlags.Ephemeral
        });
    }
  } catch (error) {
    logger.error(`Command execution failed: ${subcommand}`, error);
    
    await context.reply({
      content: "❌ Ocurrió un error al procesar el comando",
      flags: MessageFlags.Ephemeral
    }).catch(() => {});
  }
}

/**
 * Habilita el sistema de género
 */
async function handleEnable(context, interaction, guildId, genderConfig, t) {
  const roleMale = interaction.options.getRole("role_hombre");
  const roleFemale = interaction.options.getRole("role_mujer");
  const roleNonbinary = interaction.options.getRole("role_nobinario");
  const timeoutSeconds = interaction.options.getInteger("timeout") || 300;

  // Validar que los roles sean diferentes
  const roleIds = [roleMale.id, roleFemale.id, roleNonbinary?.id].filter(Boolean);
  const uniqueRoles = new Set(roleIds);
  
  if (uniqueRoles.size !== roleIds.length) {
    return context.reply({
      content: "❌ Los roles deben ser diferentes entre sí",
      flags: MessageFlags.Ephemeral
    });
  }

  // Validar que los roles no sean @everyone
  if (roleMale.id === guildId || roleFemale.id === guildId || roleNonbinary?.id === guildId) {
    return context.reply({
      content: "❌ No puedes usar el rol @everyone",
      flags: MessageFlags.Ephemeral
    });
  }

  // Configurar
  const config = {
    enabled: true,
    roles: {
      male: { id: roleMale.id },
      female: { id: roleFemale.id },
      nonbinary: roleNonbinary ? { id: roleNonbinary.id } : { id: null }
    },
    timeout: timeoutSeconds * 1000,
    fallbackBehavior: 'neutral',
    notifyOnTimeout: false
  };

  const success = genderConfig.setGuildConfig(guildId, config);

  if (!success) {
    return context.reply({
      content: "❌ Error al guardar la configuración",
      flags: MessageFlags.Ephemeral
    });
  }

  // Crear embed de confirmación
  const embed = new EmbedBuilder()
    .setColor(0x00ff00)
    .setTitle("✅ Sistema de Género Activado")
    .setDescription(
      "El bot ahora esperará a que los nuevos miembros seleccionen su rol de género antes de enviar la bienvenida."
    )
    .addFields(
      { 
        name: "🚹 Rol Masculino", 
        value: `${roleMale}`, 
        inline: true 
      },
      { 
        name: "🚺 Rol Femenino", 
        value: `${roleFemale}`, 
        inline: true 
      },
      { 
        name: "⚧️ Rol No Binario", 
        value: roleNonbinary ? `${roleNonbinary}` : "No configurado", 
        inline: true 
      },
      { 
        name: "⏱️ Tiempo de Espera", 
        value: `${timeoutSeconds} segundos`, 
        inline: true 
      },
      { 
        name: "💡 ¿Qué pasa si no eligen?", 
        value: "Se enviará un mensaje neutral después del timeout", 
        inline: false 
      }
    )
    .setFooter({ text: "Usa /configuregender test para probar el sistema" })
    .setTimestamp();

  await context.reply({
    embeds: [embed],
    flags: MessageFlags.Ephemeral
  });

  logger.info(
    `Gender system enabled for guild ${guildId} ` +
    `(male: ${roleMale.id}, female: ${roleFemale.id}, timeout: ${timeoutSeconds}s)`
  );
}

/**
 * Desactiva el sistema de género
 */
async function handleDisable(context, interaction, guildId, genderConfig, t) {
  const currentConfig = genderConfig.getGuildConfig(guildId);
  
  if (!currentConfig.enabled) {
    return context.reply({
      content: "ℹ️ El sistema de género ya está desactivado",
      flags: MessageFlags.Ephemeral
    });
  }

  // Desactivar manteniendo la configuración
  const config = { ...currentConfig, enabled: false };
  genderConfig.setGuildConfig(guildId, config);

  const embed = new EmbedBuilder()
    .setColor(0xffa500)
    .setTitle("⚠️ Sistema de Género Desactivado")
    .setDescription(
      "Las bienvenidas ahora se enviarán **inmediatamente** sin esperar selección de rol.\n\n" +
      "Tu configuración de roles se ha guardado y puedes reactivarla con `/configuregender enable`"
    )
    .setTimestamp();

  await context.reply({
    embeds: [embed],
    flags: MessageFlags.Ephemeral
  });

  logger.info(`Gender system disabled for guild ${guildId}`);
}

/**
 * Muestra el estado actual del sistema
 */
async function handleStatus(context, interaction, guildId, genderConfig, t) {
  const config = genderConfig.getGuildConfig(guildId);
  const stats = genderConfig.getStats();

  const statusEmoji = config.enabled ? "🟢" : "🔴";
  const statusText = config.enabled ? "Activado" : "Desactivado";

  const embed = new EmbedBuilder()
    .setColor(config.enabled ? 0x00ff00 : 0xff0000)
    .setTitle(`${statusEmoji} Estado del Sistema de Género`)
    .setDescription(
      config.enabled
        ? "El bot está esperando selección de roles antes de enviar bienvenidas"
        : "Las bienvenidas se envían inmediatamente al unirse"
    )
    .addFields(
      { 
        name: "Estado", 
        value: statusText, 
        inline: true 
      },
      { 
        name: "Timeout", 
        value: `${config.timeout / 1000}s`, 
        inline: true 
      },
      { 
        name: "Comportamiento si Expira", 
        value: config.fallbackBehavior === 'neutral' ? 'Mensaje Neutral' : 'Omitir', 
        inline: true 
      }
    )
    .setTimestamp();

  // Añadir roles si están configurados
  if (config.enabled) {
    const maleRole = interaction.guild.roles.cache.get(config.roles.male?.id);
    const femaleRole = interaction.guild.roles.cache.get(config.roles.female?.id);
    const nbRole = interaction.guild.roles.cache.get(config.roles.nonbinary?.id);

    embed.addFields(
      { 
        name: "🚹 Rol Masculino", 
        value: maleRole ? `${maleRole}` : "⚠️ Rol eliminado", 
        inline: true 
      },
      { 
        name: "🚺 Rol Femenino", 
        value: femaleRole ? `${femaleRole}` : "⚠️ Rol eliminado", 
        inline: true 
      },
      { 
        name: "⚧️ Rol No Binario", 
        value: nbRole ? `${nbRole}` : "No configurado", 
        inline: true 
      }
    );
  }

  // Estadísticas globales
  embed.addFields({
    name: "📊 Estadísticas Globales",
    value: 
      `Servidores con sistema activo: ${stats.enabledGuilds}\n` +
      `Total de servidores configurados: ${stats.totalGuilds}`,
    inline: false
  });

  await context.reply({
    embeds: [embed],
    flags: MessageFlags.Ephemeral
  });
}

/**
 * Prueba el sistema con un mensaje de ejemplo
 */
async function handleTest(context, interaction, guildId, genderConfig, t) {
  const gender = interaction.options.getString("gender");
  
  await context.deferReply({ flags: MessageFlags.Ephemeral });

  try {
    // Importar dinámicamente para evitar dependencias circulares
    const { generateWelcomeImage } = await import("../utils/welcomeImage.js");

    const testMessages = {
      male: {
        title: "¡Bienvenido!",
        message: "Nos alegra tenerte aquí, " + interaction.user.username
      },
      female: {
        title: "¡Bienvenida!",
        message: "Nos alegra tenerte aquí, " + interaction.user.username
      },
      nonbinary: {
        title: "¡Bienvenide!",
        message: "Nos alegra tenerte aquí, " + interaction.user.username
      }
    };

    const { title, message } = testMessages[gender];

    const imageBuffer = await generateWelcomeImage(
      interaction.user.username,
      interaction.user.displayAvatarURL({ extension: "png", size: 256 }),
      message,
      title,
      { imageVariant: gender }
    );

    const { AttachmentBuilder } = await import("discord.js");
    const attachment = new AttachmentBuilder(imageBuffer, { name: "test-welcome.png" });

    await context.editReply({
      content: `✅ **Prueba de bienvenida (${gender})**\n\nAsí se vería el mensaje:`,
      files: [attachment],
      flags: MessageFlags.Ephemeral
    });

    logger.info(`Test welcome generated for ${interaction.user.tag} (gender: ${gender})`);

  } catch (error) {
    logger.error("Test generation failed", error);
    
    await context.editReply({
      content: "❌ Error al generar la imagen de prueba",
      flags: MessageFlags.Ephemeral
    });
  }
}