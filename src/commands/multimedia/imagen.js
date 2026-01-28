// src/commands/nsfw/imagen.js

import { 
  ActionRowBuilder, 
  ButtonBuilder, 
  ButtonStyle,
  ComponentType,
  AttachmentBuilder
} from "discord.js";
import { buildCommand } from "../../utils/commandbuilder.js";
import { createTranslator } from "../../utils/TranslatorHelper.js";
import { createLogger } from "../../utils/Logger.js";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const logger = createLogger("nsfw:imagen");

// ============================================
// CONFIGURACIÓN
// ============================================

const CACHE_FOLDER = path.join(__dirname, "..", "..", "image_cache");
const TAGS_FILE = path.join(CACHE_FOLDER, "tags.json");

const CACHE_CONFIG = {
  MIN_IMAGES: 20,
  FETCH_LIMIT: 100,
  MAX_CACHE: 500
};

const INTERACTION_TIMEOUT = 900_000; // 15 minutos

// ============================================
// UTILIDADES DE ARCHIVO
// ============================================

async function downloadImage(url) {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    }
  });
  
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  
  return Buffer.from(await response.arrayBuffer());
}

function getFileExtension(url) {
  const match = url.match(/\.(jpg|jpeg|png|gif|webp)(\?|$)/i);
  return match ? match[1].toLowerCase() : 'jpg';
}

async function ensureCacheFolder() {
  await fs.mkdir(CACHE_FOLDER, { recursive: true }).catch(() => {});
}

// ============================================
// CACHE DE TAGS
// ============================================

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

// ============================================
// CACHE DE IMÁGENES
// ============================================

async function loadCache(combinedTag) {
  try {
    const cacheFile = path.join(CACHE_FOLDER, `${combinedTag}.json`);
    const parsed = JSON.parse(await fs.readFile(cacheFile, "utf-8"));
    
    if (!Array.isArray(parsed)) {
      logger.warn(`Cache corrupto: ${combinedTag}`);
      return [];
    }
    
    return parsed;
  } catch {
    return [];
  }
}

async function saveCache(combinedTag, images) {
  try {
    const cacheFile = path.join(CACHE_FOLDER, `${combinedTag}.json`);
    const limited = images.slice(-CACHE_CONFIG.MAX_CACHE);
    await fs.writeFile(cacheFile, JSON.stringify(limited, null, 2));
    logger.debug(`💾 Cache guardado: ${combinedTag} (${limited.length} imgs)`);
  } catch (error) {
    logger.error("Error guardando caché:", error);
  }
}

// ============================================
// API DE RULE34
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
      /\.(jpg|jpeg|png|gif)$/i.test(post.file_url)
    )
    .map(post => ({
      url: post.file_url,
      id: post.id,
      score: post.score || 0,
      width: post.width,
      height: post.height
    }));
}

async function getImages(tags, userId, apiKey) {
  const combinedTag = tags.join("_");
  let cached = await loadCache(combinedTag);
  
  logger.debug(`📦 Cache: ${cached.length} imágenes para "${combinedTag}"`);
  
  if (cached.length >= CACHE_CONFIG.MIN_IMAGES) {
    return { images: cached, fromCache: true, newCount: 0 };
  }
  
  logger.debug(`🔍 Cache insuficiente, buscando nuevas...`);
  
  const page = Math.floor(cached.length / CACHE_CONFIG.FETCH_LIMIT);
  const results = await searchRule34(tags, userId, apiKey, page);
  
  if (results.length === 0) {
    logger.warn(`⚠️ No se encontraron más imágenes (página ${page})`);
    return { images: cached, fromCache: true, newCount: 0, exhausted: true };
  }
  
  const existingUrls = new Set(cached.map(img => img.url));
  const newImages = results.filter(img => !existingUrls.has(img.url));
  
  logger.debug(`✨ Nuevas: ${newImages.length} imágenes`);
  
  const updated = [...cached, ...newImages];
  await saveCache(combinedTag, updated);
  
  return { images: updated, fromCache: false, newCount: newImages.length };
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

async function updateMessage(context, currentPage, totalPages, image, tagList, t) {
  const imageBuffer = await downloadImage(image.url);
  const ext = getFileExtension(image.url);
  const attachment = new AttachmentBuilder(imageBuffer, { 
    name: `image_${image.id}.${ext}` 
  });

  const embed = context.embeds.info(
    t("page_title", { current: currentPage, total: totalPages }),
    t("image_info", {
      tags: tagList.join(", "),
      score: image.score,
      id: image.id,
      width: image.width,
      height: image.height
    })
  );
  
  embed.setImage(`attachment://image_${image.id}.${ext}`);
  embed.setFooter({ text: t("footer", { count: totalPages }) });

  return { embeds: [embed], files: [attachment] };
}

// ============================================
// COMMAND
// ============================================

export const data = buildCommand("nsfw", "imagen");

export async function execute(context) {
  const t = await createTranslator(data, context);

  // Validaciones
  if (!context.guild) {
    return context.reply({ content: t("guild_only"), ephemeral: true });
  }

  if (!context.channel.nsfw) {
    return context.reply({ content: t("nsfw_only"), ephemeral: true });
  }

  // Credenciales
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

    // Guardar tags para autocomplete
    const savedTags = await loadTags();
    const newTags = [...new Set([...savedTags, ...tagList])];
    if (newTags.length !== savedTags.length) {
      await saveTags(newTags);
    }

    // Obtener imágenes
    const result = await getImages(tagList, userId, apiKey);

    if (result.images.length === 0) {
      return context.editReply({
        content: t("no_images", { tags: tagList.join(", ") })
      });
    }

    // Estado inicial
    let currentPage = 1;
    const totalPages = result.images.length;
    const currentImage = result.images[0];

    // Primera imagen
    const initialMessage = await updateMessage(
      context, 
      currentPage, 
      totalPages, 
      currentImage, 
      tagList, 
      t
    );
    
    const buttons = createNavigationButtons(currentPage, totalPages);
    const message = await context.editReply({
      ...initialMessage,
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

      const newImage = result.images[currentPage - 1];
      const updated = await updateMessage(
        context, 
        currentPage, 
        totalPages, 
        newImage, 
        tagList, 
        t
      );

      const newButtons = createNavigationButtons(currentPage, totalPages);
      await i.update({ ...updated, components: [newButtons] });
    });

    collector.on("end", async () => {
      const disabled = createNavigationButtons(currentPage, totalPages, true);
      try {
        await message.edit({ components: [disabled] });
      } catch (error) {
        logger.debug("No se pudo deshabilitar botones (mensaje eliminado?)");
      }
    });

  } catch (error) {
    logger.error("Error en /imagen:", error);
    
    const errorMsg = { content: t("unexpected_error") };
    if (context.deferred || context.replied) {
      await context.editReply(errorMsg);
    } else {
      await context.reply({ ...errorMsg, ephemeral: true });
    }
  }
}