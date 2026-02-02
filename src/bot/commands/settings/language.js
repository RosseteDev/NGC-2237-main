// src/commands/settings/language.js

import { buildCommand } from "../../utils/commandbuilder.js";
import { createTranslator } from "../../localization/TranslatorHelper.js";
import { createLogger } from "../../utils/Logger.js";
import { db } from "../../database/ResilientDatabaseManager.js";

const logger = createLogger("settings:language");

export const data = buildCommand("settings", "language");

export async function execute(context) {
  // ✅ IMPORTANTE: createTranslator detecta el idioma del CLIENTE automáticamente
  // Esto asegura que los mensajes se muestren en el idioma del usuario que ejecuta el comando
  const t = await createTranslator(data, context);
  
  // ✅ Obtener el idioma seleccionado (soporta ambos nombres de opción)
  const lang = context.options.getString("lang") || 
               context.options.getString("idioma");

  logger.debug(`Cambio de idioma: ${lang} | Usuario: ${context.user.tag}`);

  try {
    await db.setGuildLang(context.guild.id, lang);
    
    logger.info(`✅ Idioma → ${lang} en ${context.guild.name}`);

    // Analytics opcional
    if (db.analytics?.logCommand) {
      db.analytics.logCommand(context, true);
    }

    // ✅ SOLUCIÓN AL BUG: Obtener el nombre del idioma desde las traducciones del CLIENTE
    // Busca en options.lang.choices[].display según el idioma seleccionado
    const choices = t.rawTranslations?.options?.lang?.choices || [];
    const selectedChoice = choices.find(c => c.value === lang);
    const langName = selectedChoice?.display || lang.toUpperCase();

    // ✅ Mensaje de éxito con toda la información
    await context.success(
      t("responses.updated_title"),
      t("responses.updated_description", { lang: langName })
    );
    
  } catch (error) {
    logger.error("Error cambiando idioma:", error);
    
    if (db.analytics?.logCommand) {
      db.analytics.logCommand(context, false);
    }
    
    // ✅ Mensaje de error completo
    await context.error(
      t("responses.error_title"),
      t("responses.error_description")
    );
  }
}