// src/commands/nsfw/video.js

import { 
  ActionRowBuilder, 
  ButtonBuilder, 
  ButtonStyle,
  ComponentType
} from "discord.js";
import { buildCommand } from "../../utils/commandbuilder.js";
import { createTranslator } from "../../utils/TranslatorHelper.js";
import { createLogger } from "../../utils/Logger.js";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const logger = createLogger("nsfw:video");

// ============================================
// CONFIGURACIÓN
// ============================================

const CACHE_FOLDER = path.join(__dirname, "..", "..", "video_cache");
const TAGS_FILE = path.join(CACHE_FOLDER, "tags.json");

const CACHE_CONFIG = {
  MIN_VIDEOS: 15,
  FETCH_LIMIT: 100,
  MAX_CACHE: 300
};

const INTERACTION_TIMEOUT = 900_000;

// ============================================
// UTILIDADES
// ============================================

async function ensureCacheFolder() {
  await fs.mkdir(CACHE_FOLDER, { recursive: true }).catch(() => {});
}

async function loadTags() {
  try {
    return JSON.parse(await fs.readFile(TAGS_FILE, "utf-8"));
  } catch {
    return [];
  }
}

async function saveTags(tags) {
  try {
    await fs.writeFile(TAGS_FILE, JSON.stringify(tags, null, 2));
  } catch (error) {
    logger.error("Error guardando tags:", error);
  }
}

async function loadCache(combinedTag) {
  try {
    const cacheFile = path.join(CACHE_FOLDER, `${combinedTag}.json`);
    const parsed = JSON.parse(await fs.readFile(cacheFile, "utf-8"));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function saveCache(combinedTag, videos) {
  try {
    const cacheFile = path.join(CACHE_FOLDER, `${combinedTag}.json`);
    const limited = videos.slice(-CACHE_CONFIG.MAX_CACHE);
    await fs.writeFile(cacheFile, JSON.stringify(limited, null, 2));
    logger.debug(`💾 Cache guardado: ${combinedTag} (${limited.length} videos)`);
  } catch (error) {
    logger.error("Error guardando caché:", error);
  }
}

// ============================================
// API
// ============================================

async function searchRule34(tags, userId, apiKey, page = 0) {
  const tagsQuery = tags.join("+");
  const pid = page * CACHE_CONFIG.FETCH_LIMIT;
  const url = `https://api.rule34.xxx/index.php?page=dapi&s=post&q=index&tags=${tagsQuery}&limit=${CACHE_CONFIG.FETCH_LIMIT}&pid=${pid}&json=1&user_id=${userId}&api_key=${apiKey}`;

  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);

  const data = await response.json();
  if (!Array.isArray(data)) return [];
  
  return data
    .filter(post => 
      post.file_url && 
      /\.(mp4|webm)$/i.test(post.file_url)
    )
    .map(post => ({
      url: post.file_url,
      preview: post.preview_url || post.sample_url,
      id: post.id,
      score: post.score || 0,
      width: post.width,
      height: post.height
    }));
}

async function getVideos(tags, userId, apiKey) {
  const combinedTag = tags.join("_");
  let cached = await loadCache(combinedTag);
  
  logger.debug(`📦 Cache: ${cached.length} videos para "${combinedTag}"`);
  
  if (cached.length >= CACHE_CONFIG.MIN_VIDEOS) {
    return { videos: cached, fromCache: true, newCount: 0 };
  }
  
  logger.debug(`🔍 Cache insuficiente, buscando nuevos...`);
  
  const page = Math.floor(cached.length / CACHE_CONFIG.FETCH_LIMIT);
  const results = await searchRule34(tags, userId, apiKey, page);
  
  if (results.length === 0) {
    logger.warn(`⚠️ No se encontraron más videos (página ${page})`);
    return { videos: cached, fromCache: true, newCount: 0, exhausted: true };
  }
  
  const existingUrls = new Set(cached.map(v => v.url));
  const newVideos = results.filter(v => !existingUrls.has(v.url));
  
  logger.debug(`✨ Nuevos: ${newVideos.length} videos`);
  
  const updated = [...cached, ...newVideos];
  await saveCache(combinedTag, updated);
  
  return { videos: updated, fromCache: false, newCount: newVideos.length };
}

// ============================================
// AUTOCOMPLETE
// ============================================

export async function autocomplete(interaction) {
  const focused = interaction.options.getFocused();
  
  if (focused.length < 2) {
    return interaction.respond([
      { name: "🔥 Busca al menos 2 caracteres", value: "anime" }
    ]);
  }
  
  const tags = await loadTags();
  const matches = tags
    .filter(tag => tag.toLowerCase().includes(focused.toLowerCase()))
    .slice(0, 25)
    .map(tag => ({ name: tag, value: tag }));
  
  if (matches.length === 0) {
    return interaction.respond([
      { name: `"${focused}" - Escribe y presiona Enter`, value: focused }
    ]);
  }
  
  await interaction.respond(matches);
}

// ============================================
// UI
// ============================================

function createNavigationButtons(page, total, disabled = false) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("first")
      .setEmoji("⏮️")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(disabled || page === 1),
    new ButtonBuilder()
      .setCustomId("prev")
      .setEmoji("◀️")
      .setStyle(ButtonStyle.Primary)
      .setDisabled(disabled || page === 1),
    new ButtonBuilder()
      .setCustomId("stop")
      .setEmoji("✖️")
      .setStyle(ButtonStyle.Danger)
      .setDisabled(disabled),
    new ButtonBuilder()
      .setCustomId("next")
      .setEmoji("▶️")
      .setStyle(ButtonStyle.Primary)
      .setDisabled(disabled || page === total),
    new ButtonBuilder()
      .setCustomId("last")
      .setEmoji("⏭️")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(disabled || page === total)
  );
}

// ============================================
// COMMAND
// ============================================

export const data = buildCommand("nsfw", "video");

export async function execute(context) {
  const t = await createTranslator(data, context);

  // Validaciones
  if (!context.guild) {
    return context.reply({ content: t("guild_only"), ephemeral: true });
  }

  if (!context.channel.nsfw) {
    return context.reply({ content: t("nsfw_only"), ephemeral: true });
  }

  const userId = process.env.RULE34_USER_ID;
  const apiKey = process.env.RULE34_API_KEY;

  if (!userId || !apiKey) {
    return context.reply({ content: t("api_not_configured"), ephemeral: true });
  }

  await context.deferReply();

  try {
    await ensureCacheFolder();

    // Parsear tags
    const tagsInput = context.options.getString("tags");
    const tagList = tagsInput
      .split(",")
      .map(tag => tag.trim().replace(/\s+/g, "_"))
      .filter(tag => tag.length > 0);

    if (tagList.length === 0) {
      return context.editReply({ content: t("no_tags") });
    }

    // Guardar tags
    const savedTags = await loadTags();
    const newTags = [...new Set([...savedTags, ...tagList])];
    if (newTags.length !== savedTags.length) {
      await saveTags(newTags);
    }

    // Obtener videos
    const result = await getVideos(tagList, userId, apiKey);

    if (result.videos.length === 0) {
      return context.editReply({
        content: t("no_videos", { tags: tagList.join(", ") })
      });
    }

    // Estado inicial
    let currentPage = 1;
    const totalPages = result.videos.length;
    const currentVideo = result.videos[0];

    // Primera respuesta
    const embed = context.embeds.info(
      t("page_title", { current: currentPage, total: totalPages }),
      t("video_info", {
        tags: tagList.join(", "),
        score: currentVideo.score,
        id: currentVideo.id,
        width: currentVideo.width,
        height: currentVideo.height,
        url: currentVideo.url
      })
    );
    
    if (currentVideo.preview) {
      embed.setImage(currentVideo.preview);
    }
    
    embed.setFooter({ text: t("footer", { count: totalPages }) });

    const buttons = createNavigationButtons(currentPage, totalPages);
    const message = await context.editReply({
      embeds: [embed],
      components: [buttons]
    });

    // Collector
    const collector = message.createMessageComponentCollector({
      componentType: ComponentType.Button,
      time: INTERACTION_TIMEOUT
    });

    collector.on("collect", async (i) => {
      if (i.user.id !== context.user.id) {
        return i.reply({ content: t("not_your_interaction"), ephemeral: true });
      }

      if (i.customId === "stop") {
        collector.stop("user_stopped");
        const disabled = createNavigationButtons(currentPage, totalPages, true);
        return i.update({ components: [disabled] });
      }

      // Navegación
      switch (i.customId) {
        case "first": currentPage = 1; break;
        case "prev": if (currentPage > 1) currentPage--; break;
        case "next": if (currentPage < totalPages) currentPage++; break;
        case "last": currentPage = totalPages; break;
      }

      const newVideo = result.videos[currentPage - 1];
      
      const newEmbed = context.embeds.info(
        t("page_title", { current: currentPage, total: totalPages }),
        t("video_info", {
          tags: tagList.join(", "),
          score: newVideo.score,
          id: newVideo.id,
          width: newVideo.width,
          height: newVideo.height,
          url: newVideo.url
        })
      );
      
      if (newVideo.preview) {
        newEmbed.setImage(newVideo.preview);
      }
      
      newEmbed.setFooter({ text: t("footer", { count: totalPages }) });

      const newButtons = createNavigationButtons(currentPage, totalPages);
      await i.update({ embeds: [newEmbed], components: [newButtons] });
    });

    collector.on("end", async () => {
      const disabled = createNavigationButtons(currentPage, totalPages, true);
      try {
        await message.edit({ components: [disabled] });
      } catch (error) {
        logger.debug("No se pudo deshabilitar botones");
      }
    });

  } catch (error) {
    logger.error("Error en /video:", error);
    
    const errorMsg = { content: t("unexpected_error") };
    if (context.deferred || context.replied) {
      await context.editReply(errorMsg);
    } else {
      await context.reply({ ...errorMsg, ephemeral: true });
    }
  }
}