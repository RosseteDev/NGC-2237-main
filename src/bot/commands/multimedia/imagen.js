import { 
  SlashCommandBuilder, 
  EmbedBuilder, 
  ActionRowBuilder, 
  ButtonBuilder, 
  ButtonStyle,
  ComponentType,
  AttachmentBuilder
} from "discord.js";
import { useLang } from "../../localization/TranslatorHelper.js";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CACHE_FOLDER = path.join(__dirname, "..", "..", "image_cache");
const TAGS_FILE = path.join(CACHE_FOLDER, "tags.json");

// ✅ Configuración de cache
const CACHE_CONFIG = {
  MIN_IMAGES: 20,
  FETCH_LIMIT: 100,
  MAX_CACHE: 500
};

// Descargar imagen como buffer
async function downloadImage(url) {
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    
    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } catch (error) {
    console.error(`Error descargando imagen: ${error.message}`);
    throw error;
  }
}

// Obtener extensión de archivo desde URL
function getFileExtension(url) {
  const match = url.match(/\.(jpg|jpeg|png|gif|webp)(\?|$)/i);
  return match ? match[1].toLowerCase() : 'jpg';
}

// Asegurarse de que la carpeta de caché existe
async function ensureCacheFolder() {
  try {
    await fs.mkdir(CACHE_FOLDER, { recursive: true });
  } catch (error) {
    console.error("Error creando carpeta de caché:", error);
  }
}

// Cargar etiquetas guardadas
async function loadTags() {
  try {
    const data = await fs.readFile(TAGS_FILE, "utf-8");
    return JSON.parse(data);
  } catch {
    return [];
  }
}

// Guardar etiquetas
async function saveTags(tags) {
  try {
    await fs.writeFile(TAGS_FILE, JSON.stringify(tags, null, 2));
  } catch (error) {
    console.error("Error guardando tags:", error);
  }
}

// Cargar caché de imágenes para una tag combinada
async function loadCache(combinedTag) {
  try {
    const cacheFile = path.join(CACHE_FOLDER, `${combinedTag}.json`);
    const data = await fs.readFile(cacheFile, "utf-8");
    const parsed = JSON.parse(data);
    
    if (!Array.isArray(parsed)) {
      console.warn(`Cache corrupto para ${combinedTag}, reiniciando`);
      return [];
    }
    
    return parsed;
  } catch {
    return [];
  }
}

// Guardar caché de imágenes
async function saveCache(combinedTag, images) {
  try {
    const cacheFile = path.join(CACHE_FOLDER, `${combinedTag}.json`);
    const limitedImages = images.slice(-CACHE_CONFIG.MAX_CACHE);
    await fs.writeFile(cacheFile, JSON.stringify(limitedImages, null, 2));
    console.log(`💾 Cache guardado: ${combinedTag} (${limitedImages.length} imágenes)`);
  } catch (error) {
    console.error("Error guardando caché:", error);
  }
}

// Buscar imágenes en Rule34 API con offset
async function searchRule34(tags, userId, apiKey, page = 0) {
  const tagsQuery = tags.join("+");
  const pid = page * CACHE_CONFIG.FETCH_LIMIT;
  const url = `https://api.rule34.xxx/index.php?page=dapi&s=post&q=index&tags=${tagsQuery}&limit=${CACHE_CONFIG.FETCH_LIMIT}&pid=${pid}&json=1&user_id=${userId}&api_key=${apiKey}`;

  try {
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    
    if (Array.isArray(data)) {
      return data
        .filter(post => 
          post.file_url && 
          (post.file_url.endsWith('.jpg') || 
           post.file_url.endsWith('.jpeg') || 
           post.file_url.endsWith('.png') || 
           post.file_url.endsWith('.gif'))
        )
        .map(post => ({
          url: post.file_url, // URL de calidad original
          id: post.id,
          score: post.score || 0,
          width: post.width,
          height: post.height
        }));
    }
    
    return [];
  } catch (error) {
    console.error("Error buscando en Rule34:", error);
    throw error;
  }
}

// Sistema inteligente de gestión de cache
async function getImages(tags, userId, apiKey) {
  const combinedTag = tags.join("_");
  let cachedImages = await loadCache(combinedTag);
  
  console.log(`📦 Cache actual: ${cachedImages.length} imágenes para "${combinedTag}"`);
  
  if (cachedImages.length >= CACHE_CONFIG.MIN_IMAGES) {
    console.log(`✅ Usando ${cachedImages.length} imágenes del cache`);
    return {
      images: cachedImages,
      fromCache: true,
      newCount: 0
    };
  }
  
  console.log(`🔍 Cache insuficiente (${cachedImages.length}/${CACHE_CONFIG.MIN_IMAGES}), buscando nuevas...`);
  
  try {
    const page = Math.floor(cachedImages.length / CACHE_CONFIG.FETCH_LIMIT);
    const results = await searchRule34(tags, userId, apiKey, page);
    
    if (results.length === 0) {
      console.log(`⚠️ No se encontraron más imágenes en la página ${page}`);
      return {
        images: cachedImages,
        fromCache: true,
        newCount: 0,
        exhausted: true
      };
    }
    
    const existingUrls = new Set(cachedImages.map(img => img.url));
    const newImages = results.filter(img => !existingUrls.has(img.url));
    
    console.log(`✨ Encontradas ${newImages.length} imágenes nuevas`);
    
    const updatedCache = [...cachedImages, ...newImages];
    await saveCache(combinedTag, updatedCache);
    
    return {
      images: updatedCache,
      fromCache: false,
      newCount: newImages.length
    };
    
  } catch (error) {
    console.error("Error buscando nuevas imágenes:", error);
    
    if (cachedImages.length > 0) {
      console.log(`⚠️ Usando cache por error en API`);
      return {
        images: cachedImages,
        fromCache: true,
        newCount: 0,
        error: error.message
      };
    }
    
    throw error;
  }
}

// AUTOCOMPLETADO
async function autocompleteTags(interaction, current) {
  try {
    console.log('\n🔍 [AUTOCOMPLETE] ==================');
    console.log('📝 Input completo:', JSON.stringify(current));
    
    const parts = current.split(',').map(s => s.trim());
    const lastTag = parts[parts.length - 1];
    const previousTags = parts.slice(0, -1);
    
    console.log('🏷️  Última tag:', JSON.stringify(lastTag));
    console.log('📋 Tags previas:', JSON.stringify(previousTags));
    
    if (!lastTag || lastTag.length < 2) {
      console.log('⚠️  Tag muy corta, ignorando (mínimo 2 caracteres)');
      return [];
    }
    
    const suggestions = await fetchSuggestionsWithRetry(lastTag);
    
    console.log(`✨ Sugerencias obtenidas: ${suggestions?.length || 0}`);
    if (suggestions && suggestions.length > 0) {
      console.log('📦 Primeras 3 sugerencias:', JSON.stringify(suggestions.slice(0, 3), null, 2));
    }
    
    if (!suggestions || suggestions.length === 0) {
      console.log('❌ Sin sugerencias, retornando vacío');
      return [];
    }
    
    const prefix = previousTags.length > 0 ? previousTags.join(', ') + ', ' : '';
    
    const formatted = suggestions
      .slice(0, 25)
      .map(item => {
        const tag = typeof item === 'string' ? item : (item.value || item.label);
        const label = typeof item === 'object' && item.label ? item.label : tag;
        
        return {
          name: label.substring(0, 100),
          value: (prefix + tag).substring(0, 100)
        };
      });
    
    console.log(`✅ Retornando ${formatted.length} opciones formateadas`);
    console.log('📤 Primera opción:', JSON.stringify(formatted[0]));
    console.log('==================\n');
    
    return formatted;
      
  } catch (error) {
    console.error('❌ [AUTOCOMPLETE] Error:', error.message);
    console.error(error.stack);
    return [];
  }
}

async function fetchSuggestionsWithRetry(tag) {
  try {
    const url = `https://ac.rule34.xxx/autocomplete.php?q=${encodeURIComponent(tag)}`;
    
    console.log('🌐 [API] Llamando URL:', url);
    console.log('⏱️  [API] Timeout: 5000ms');
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/javascript, */*; q=0.01',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'Referer': 'https://rule34.xxx/',
        'Origin': 'https://rule34.xxx',
        'Connection': 'keep-alive',
        'Sec-Fetch-Dest': 'empty',
        'Sec-Fetch-Mode': 'cors',
        'Sec-Fetch-Site': 'same-site',
        'Sec-Ch-Ua': '"Not_A Brand";v="8", "Chromium";v="120"',
        'Sec-Ch-Ua-Mobile': '?0',
        'Sec-Ch-Ua-Platform': '"Linux"'
      },
      signal: AbortSignal.timeout(5000)
    });
    
    console.log('📡 [API] Status:', response.status, response.statusText);
    
    if (!response.ok) {
      console.log('❌ [API] Response not OK - Status:', response.status);
      throw new Error(`HTTP ${response.status}`);
    }
    
    const contentType = response.headers.get('content-type') || '';
    console.log('📄 [API] Content-Type:', contentType);
    
    const rawText = await response.text();
    console.log('📝 [API] Raw response length:', rawText.length);
    console.log('📝 [API] Raw response (primeros 200 chars):', rawText.substring(0, 200));
    
    // Intentar parsear JSON
    const data = JSON.parse(rawText);
    console.log('✅ [API] JSON parseado correctamente');
    console.log('📊 [API] Tipo:', Array.isArray(data) ? 'Array' : typeof data);
    console.log('📊 [API] Items:', Array.isArray(data) ? data.length : 'N/A');
    
    if (Array.isArray(data) && data.length > 0 && data[0] !== "error") {
      console.log('📦 [API] Muestra:', JSON.stringify(data.slice(0, 2), null, 2));
      console.log('✅ [API] Retornando datos válidos');
      return data;
    }
    
    console.log('⚠️  [API] Array vacío o contiene error');
    throw new Error('Empty or invalid response');
    
  } catch (error) {
    console.error(`❌ [API] Error:`, error.message);
    console.error(`📚 [API] Type:`, error.name);
    console.log('🔄 [FALLBACK] Usando tags populares');
    return getPopularTagsSuggestions(tag);
  }
}

function getPopularTagsSuggestions(input) {
  const popularTags = [
    'animated', 'video', '3d', '2d', 'sound', 'loop',
    'anal', 'oral', 'vaginal', 'pov', 'first_person_view',
    'big_breasts', 'small_breasts', 'ass', 'pussy', 'penis',
    'cum', 'creampie', 'facial', 'handjob', 'blowjob',
    'lesbian', 'yuri', 'yaoi', 'futanari', 'trap',
    'milf', 'teen', 'young', 'old', 'mature',
    'furry', 'anthro', 'feral', 'pokemon', 'digimon',
    'solo', 'duo', 'group', 'male', 'female',
    'penetration', 'sex', 'nude', 'breasts', 'nipples',
    'tongue', 'saliva', 'sweat', 'bdsm', 'bondage',
    'tentacles', 'monster', 'demon', 'dragon', 'elf',
    'pregnancy', 'lactation', 'inflation', 'vore', 'macro',
    'swimsuit', 'lingerie', 'stockings', 'panties', 'bra',
    'glasses', 'horns', 'tail', 'wings', 'animal_ears'
  ];
  
  const lowerInput = input.toLowerCase();
  const matches = popularTags
    .filter(tag => tag.includes(lowerInput) || lowerInput.includes(tag))
    .map(tag => ({ value: tag, label: tag }));
  
  console.log(`🏷️  [FALLBACK] ${matches.length} tags populares para "${input}"`);
  
  return matches;
}

// UI HELPERS
function createNavigationButtons(currentPage, totalPages, disabled = false) {
  return new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId("first")
        .setEmoji("⏮️")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(disabled || currentPage === 1),
      new ButtonBuilder()
        .setCustomId("prev")
        .setEmoji("◀️")
        .setStyle(ButtonStyle.Primary)
        .setDisabled(disabled || currentPage === 1),
      new ButtonBuilder()
        .setCustomId("stop")
        .setEmoji("✖️")
        .setStyle(ButtonStyle.Danger)
        .setDisabled(disabled),
      new ButtonBuilder()
        .setCustomId("next")
        .setEmoji("▶️")
        .setStyle(ButtonStyle.Primary)
        .setDisabled(disabled || currentPage === totalPages),
      new ButtonBuilder()
        .setCustomId("last")
        .setEmoji("⏭️")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(disabled || currentPage === totalPages)
    );
}

// EXPORTS DEL COMANDO
export const data = new SlashCommandBuilder()
  .setName("imagen")
  .setNameLocalizations({
    "es-ES": "imagen",
    "es-419": "imagen"
  })
  .setDescription("Search images by tags")
  .setDescriptionLocalizations({
    "es-ES": "Busca imágenes por etiquetas",
    "es-419": "Busca imágenes por etiquetas"
  })
  .addStringOption(option =>
    option
      .setName("tags")
      .setNameLocalizations({
        "es-ES": "etiquetas",
        "es-419": "etiquetas"
      })
      .setDescription("Tags to search (comma separated)")
      .setDescriptionLocalizations({
        "es-ES": "Etiquetas para buscar (separadas por comas)",
        "es-419": "Etiquetas para buscar (separadas por comas)"
      })
      .setRequired(true)
      .setAutocomplete(true)
  )
  .setNSFW(true);

export async function autocomplete(interaction) {
  try {
    const focusedOption = interaction.options.getFocused(true);
    
    if (focusedOption.name === "tags" || focusedOption.name === "etiquetas") {
      const choices = await autocompleteTags(interaction, focusedOption.value);
      await interaction.respond(choices);
    } else {
      await interaction.respond([]);
    }
  } catch (error) {
    console.error('Error en autocomplete:', error);
    try {
      await interaction.respond([]);
    } catch {}
  }
}

export async function execute(interaction) {
  const t = await useLang(interaction);

  if (!interaction.guild) {
    return interaction.reply({
      content: t("common.errors.guild_only"),
      ephemeral: true
    });
  }

  if (!interaction.channel.nsfw) {
    return interaction.reply({
      content: t("common.errors.nsfw_only"),
      ephemeral: true
    });
  }

  await interaction.deferReply();

  try {
    await ensureCacheFolder();

    const userId = process.env.RULE34_USER_ID;
    const apiKey = process.env.RULE34_API_KEY;

    if (!userId || !apiKey) {
      return interaction.editReply({
        content: "❌ API credentials not configured."
      });
    }

    const tagsInput = interaction.options.getString("tags") || interaction.options.getString("etiquetas");
    const tagList = tagsInput
      .split(",")
      .map(tag => tag.trim().replace(/\s+/g, "_"))
      .filter(tag => tag.length > 0);

    if (tagList.length === 0) {
      return interaction.editReply({
        content: t("rule34.no_tags")
      });
    }

    const result = await getImages(tagList, userId, apiKey);

    if (result.images.length === 0) {
      return interaction.editReply({
        content: `❌ No se encontraron imágenes para: ${tagList.join(", ")}`
      });
    }

    const savedTags = await loadTags();
    const updatedTags = [...new Set([...savedTags, ...tagList])];
    await saveTags(updatedTags);

    let currentPage = 1;
    const totalPages = result.images.length;

    // ✅ DESCARGA Y ENVÍA LA IMAGEN COMO ARCHIVO
    const currentImage = result.images[0];
    const imageBuffer = await downloadImage(currentImage.url);
    const fileExtension = getFileExtension(currentImage.url);
    const attachment = new AttachmentBuilder(imageBuffer, { 
      name: `image_${currentImage.id}.${fileExtension}` 
    });

    const embed = new EmbedBuilder()
      .setTitle(`Página ${currentPage} de ${totalPages}`)
      .setDescription(
        `**Tags:** ${tagList.join(", ")}\n` +
        `**Score:** ${currentImage.score} | **ID:** ${currentImage.id}\n` +
        `**Resolución:** ${currentImage.width}x${currentImage.height}`
      )
      .setColor(0x0099FF)
      .setFooter({ text: `${result.images.length} imágenes en cache` })
      .setImage(`attachment://image_${currentImage.id}.${fileExtension}`); // Referencia al archivo adjunto
    
    const buttons = createNavigationButtons(currentPage, totalPages);

    const message = await interaction.editReply({
      embeds: [embed],
      files: [attachment],
      components: [buttons]
    });

    const collector = message.createMessageComponentCollector({
      componentType: ComponentType.Button,
      time: 900_000
    });

    collector.on("collect", async (i) => {
      if (i.user.id !== interaction.user.id) {
        return i.reply({
          content: t("common.errors.not_your_interaction"),
          ephemeral: true
        });
      }

      if (i.customId === "stop") {
        collector.stop("user_stopped");
        
        const disabledButtons = createNavigationButtons(currentPage, totalPages, true);
        await i.update({
          embeds: [i.message.embeds[0]],
          files: i.message.attachments.map(a => a),
          components: [disabledButtons]
        });
        return;
      }

      switch (i.customId) {
        case "first":
          currentPage = 1;
          break;
        case "prev":
          if (currentPage > 1) currentPage--;
          break;
        case "next":
          if (currentPage < totalPages) currentPage++;
          break;
        case "last":
          currentPage = totalPages;
          break;
      }

      // ✅ DESCARGA Y ENVÍA LA NUEVA IMAGEN
      const newImage = result.images[currentPage - 1];
      const newImageBuffer = await downloadImage(newImage.url);
      const newFileExtension = getFileExtension(newImage.url);
      const newAttachment = new AttachmentBuilder(newImageBuffer, { 
        name: `image_${newImage.id}.${newFileExtension}` 
      });

      const newEmbed = new EmbedBuilder()
        .setTitle(`Página ${currentPage} de ${totalPages}`)
        .setDescription(
          `**Tags:** ${tagList.join(", ")}\n` +
          `**Score:** ${newImage.score} | **ID:** ${newImage.id}\n` +
          `**Resolución:** ${newImage.width}x${newImage.height}`
        )
        .setColor(0x0099FF)
        .setFooter({ text: `${result.images.length} imágenes en cache` })
        .setImage(`attachment://image_${newImage.id}.${newFileExtension}`);

      const newButtons = createNavigationButtons(currentPage, totalPages);

      await i.update({
        embeds: [newEmbed],
        files: [newAttachment],
        components: [newButtons]
      });
    });

    collector.on("end", async () => {
      const disabledButtons = createNavigationButtons(currentPage, totalPages, true);
      
      try {
        await message.edit({ components: [disabledButtons] });
      } catch (error) {
        console.error("Error deshabilitando botones:", error);
      }
    });

  } catch (error) {
    console.error("Error en /imagen:", error);
    
    const errorMessage = { content: t("common.errors.unexpected") };

    if (interaction.deferred || interaction.replied) {
      await interaction.editReply(errorMessage);
    } else {
      await interaction.reply({ ...errorMessage, ephemeral: true });
    }
  }
}