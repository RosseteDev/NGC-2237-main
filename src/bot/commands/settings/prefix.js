// src/commands/settings/prefix.js

import { EmbedBuilder } from "discord.js";
import { buildCommand } from "../../utils/commandbuilder.js";
import { createTranslator } from "../../utils/TranslatorHelper.js";
import { db } from "../../database/ResilientDatabaseManager.js";

const DEFAULT_PREFIX = "r!";

export const data = buildCommand("settings", "prefix");

export async function execute(context) {
  const t = await createTranslator(data, context);
  
  let newPrefix = context.options.getString("new_prefix");
  const currentPrefix = await db.getGuildPrefix(context.guild?.id);

  // Solo ver prefix actual
  if (!newPrefix) {
    const embed = new EmbedBuilder()
      .setColor(0x5865F2)
      .setTitle(t("current_prefix_title"))
      .setDescription(
        t("current_prefix_description", {
          currentPrefix: currentPrefix,
          defaultPrefix: DEFAULT_PREFIX
        })
      )
      .addFields({
        name: t("how_to_change"),
        value: t("how_to_change_value", { currentPrefix: currentPrefix })
      })
      .setFooter({ 
        text: t("restore_footer", {
          currentPrefix: currentPrefix,
          defaultPrefix: DEFAULT_PREFIX.replace('!', '')
        })
      })
      .setTimestamp();

    return context.reply({ embeds: [embed] });
  }

  // Cambiar prefix - verificar permisos
  if (!context.member?.permissions.has("ManageGuild")) {
    return context.reply({
      content: t("no_permission"),
      ephemeral: true
    });
  }

  // ✅ AÑADIR ! AUTOMÁTICAMENTE si no tiene símbolo al final
  const specialChars = ['!', '?', '.', '>', '$', '#', '*', '~', '-', '_', '+'];
  const hasSpecialChar = specialChars.some(char => newPrefix.endsWith(char));
  
  if (!hasSpecialChar) {
    newPrefix = newPrefix + '!';
  }

  // Validaciones
  if (newPrefix.length > 10) {
    return context.reply({
      content: t("prefix_too_long"),
      ephemeral: true
    });
  }

  if (newPrefix.includes(" ")) {
    return context.reply({
      content: t("prefix_has_spaces"),
      ephemeral: true
    });
  }

  if (newPrefix.startsWith("/")) {
    return context.reply({
      content: t("prefix_starts_with_slash"),
      ephemeral: true
    });
  }

  // Guardar nuevo prefix
  try {
    await db.setGuildPrefix(context.guild.id, newPrefix);
    
    // ✅ CRÍTICO: Invalidar cache del prefix handler
    try {
      const { invalidatePrefixCache } = await import("../../handlers/prefixHandler.js");
      const invalidated = invalidatePrefixCache(context.guild.id);
      console.log(`✅ Cache de prefix invalidado para ${context.guild.id}: ${invalidated}`);
    } catch (error) {
      console.error("❌ ERROR invalidando cache:", error.message);
      console.error("Stack:", error.stack);
      // Aún así continuar - el prefix se guardó en DB
    }

    const embed = new EmbedBuilder()
      .setColor(0x00ff00)
      .setTitle(t("prefix_updated_title"))
      .setDescription(
        t("prefix_updated_description", {
          oldPrefix: currentPrefix,
          newPrefix: newPrefix
        })
      )
      .setFooter({ 
        text: t("restore_footer", {
          currentPrefix: newPrefix,
          defaultPrefix: DEFAULT_PREFIX.replace('!', '')
        })
      })
      .setTimestamp();

    await context.reply({ embeds: [embed] });
    
  } catch (error) {
    console.error("Error guardando prefix:", error);
    return context.reply({
      content: t("error_saving"),
      ephemeral: true
    });
  }
}