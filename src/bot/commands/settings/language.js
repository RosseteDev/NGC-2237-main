// src/commands/settings/language.js

import { buildCommand } from "../../utils/commandbuilder.js";
import { createTranslator } from "../../utils/TranslatorHelper.js";
import { createLogger } from "../../utils/Logger.js";
import { db } from "../../database/ResilientDatabaseManager.js";

const logger = createLogger("settings:language");

export const data = buildCommand("settings", "language");

export async function execute(context) {
  const t = await createTranslator(data, context);
  const lang = context.options.getString("lang");

  logger.debug(`Cambio de idioma: ${lang} | Usuario: ${context.user.tag}`);

  try {
    await db.setGuildLang(context.guild.id, lang);
    
    logger.info(`✅ Idioma → ${lang} en ${context.guild.name}`);

    // Analytics opcional
    if (db.analytics?.logCommand) {
      db.analytics.logCommand(context, true);
    }

    const langName = lang === 'es' ? 'Español 🇪🇸' : 'English 🇺🇸';

    await context.success(
      t("updated_title"),
      t("updated_description", { lang: langName })
    );
    
  } catch (error) {
    logger.error("Error cambiando idioma:", error);
    
    if (db.analytics?.logCommand) {
      db.analytics.logCommand(context, false);
    }
    
    await context.error(
      t("error_title"),
      t("error_description")
    );
  }
}