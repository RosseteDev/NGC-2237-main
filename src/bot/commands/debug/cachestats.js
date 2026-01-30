// src/commands/utils/cachestats.js

import { buildCommand } from "../../utils/commandbuilder.js";
import { createTranslator } from "../../utils/TranslatorHelper.js";
import { db } from "../../database/ResilientDatabaseManager.js";

export const data = buildCommand("utils", "cachestats");

export async function execute(context) {
  const t = await createTranslator(data, context);
  
  const stats = db.getStats();
  
  // Calcular hit rate
  const cacheStats = stats.pgStats || { hits: 0, misses: 0 };
  const total = cacheStats.hits + cacheStats.misses;
  const hitRate = total > 0 
    ? `${(cacheStats.hits / total * 100).toFixed(2)}%`
    : '0%';
  
  const embed = context.embeds.info(
    t("title"),
    t("description")
  ).addFields(
    { 
      name: t("hit_rate"), 
      value: `${hitRate} (${cacheStats.hits}/${total})`,
      inline: true
    },
    {
      name: t("misses"),
      value: `${cacheStats.misses}`,
      inline: true
    },
    {
      name: t("mode"),
      value: `\`${stats.mode.toUpperCase()}\``,
      inline: true
    },
    {
      name: t("sync_queue"),
      value: `${stats.syncQueueSize} ${t("pending")}`,
      inline: true
    },
    {
      name: t("status"),
      value: stats.available ? t("online") : t("offline"),
      inline: true
    }
  );
  
  await context.reply({ embeds: [embed] });
}