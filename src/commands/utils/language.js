// src/commands/settings/language.js

import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import { createTranslator } from "../../utils/TranslatorHelper.js";
import { createLogger } from "../../utils/Logger.js";
import { db } from "../../database/ResilientDatabaseManager.js";

const logger = createLogger("settings:language");

export const data = new SlashCommandBuilder()
  .setName("language")
  .setNameLocalizations({
    "es-ES": "idioma",
    "es-419": "idioma"
  })
  .setDescription("Change server language")
  .setDescriptionLocalizations({
    "es-ES": "Cambiar el idioma del servidor",
    "es-419": "Cambiar el idioma del servidor"
  })
  .addStringOption(o =>
    o.setName("lang")
      .setNameLocalizations({
        "es-ES": "idioma",
        "es-419": "idioma"
      })
      .setDescription("Language code")
      .setDescriptionLocalizations({
        "es-ES": "Código de idioma",
        "es-419": "Código de idioma"
      })
      .setRequired(true)
      .addChoices(
        { name: "English", value: "en" },
        { name: "Español", value: "es" }
      )
  );

export async function execute(context) {
  const lang = context.options.getString("lang");

  logger.debug(`Cambio de idioma solicitado: ${lang}`);
  logger.debug(`Usuario: ${context.user.tag}`);
  logger.debug(`Servidor: ${context.guild.name}`);

  try {
    await db.setGuildLang(context.guild.id, lang);
    
    logger.info(`Idioma cambiado a ${lang} en ${context.guild.name}`);

    // ✅ Analytics opcional (safe)
    if (db.analytics?.logCommand) {
      db.analytics.logCommand(context, true);
    }

    // ✅ USAR HELPER DE TRADUCCIÓN CON NAMESPACE
    const t = await createTranslator(data, context);

    // ✅ Usar context.success() si está disponible, sino crear embed manual
    if (context.success) {
      await context.success(
        t("responses.updated_title"),
        t("responses.changed", { lang })
      );
    } else {
      // Fallback: embed manual
      const embed = new EmbedBuilder()
        .setColor(0x00ff00)
        .setTitle(t("responses.updated_title"))
        .setDescription(t("responses.changed", { lang }))
        .setTimestamp();

      await context.reply({ embeds: [embed] });
    }
    
  } catch (error) {
    logger.error("Error cambiando idioma", error);
    
    // ✅ Analytics de fallo opcional
    if (db.analytics?.logCommand) {
      db.analytics.logCommand(context, false);
    }
    
    // ✅ Usar context.error() si está disponible
    if (context.error) {
      await context.error(null, "Error al cambiar el idioma. Intenta de nuevo.");
    } else {
      await context.reply({
        content: "❌ Error al cambiar el idioma. Intenta de nuevo.",
        ephemeral: true
      });
    }
  }
}