// src/commands/debug/translation-debug.js
// ============================================
// COMANDO: Translation System Debugger
// Diagnostica problemas con el sistema de traducciones
// ============================================

import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } from "discord.js";
import { getCacheStats, createTranslator, detectLanguage, clearTranslationCache } from "../utils/TranslatorHelper.js";
import { readdir, readFile } from "fs/promises";
import { join } from "path";
import { createLogger } from "../utils/Logger.js";

const logger = createLogger("command:translation-debug");

export const data = new SlashCommandBuilder()
  .setName("translation-debug")
  .setDescription("Debug translation system (Admin only)")
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addSubcommand(sub =>
    sub
      .setName("status")
      .setDescription("Show translation system status")
  )
  .addSubcommand(sub =>
    sub
      .setName("test")
      .setDescription("Test translation for current command")
      .addStringOption(opt =>
        opt
          .setName("command")
          .setDescription("Command to test (category/name)")
          .setRequired(true)
      )
  )
  .addSubcommand(sub =>
    sub
      .setName("files")
      .setDescription("List available translation files")
      .addStringOption(opt =>
        opt
          .setName("locale")
          .setDescription("Locale to inspect")
          .setRequired(false)
          .addChoices(
            { name: "English (en)", value: "en" },
            { name: "Español (es)", value: "es" }
          )
      )
  )
  .addSubcommand(sub =>
    sub
      .setName("clear-cache")
      .setDescription("Clear translation cache")
  )
  .addSubcommand(sub =>
    sub
      .setName("inspect")
      .setDescription("Inspect a specific translation file")
      .addStringOption(opt =>
        opt
          .setName("path")
          .setDescription("File path (e.g. commands/music/play.json)")
          .setRequired(true)
      )
      .addStringOption(opt =>
        opt
          .setName("locale")
          .setDescription("Locale")
          .setRequired(false)
          .addChoices(
            { name: "English (en)", value: "en" },
            { name: "Español (es)", value: "es" }
          )
      )
  );

export async function execute(context) {
  const subcommand = context.options.data[0]?.name || 'status';
  
  logger.debug(`translation-debug subcommand: ${subcommand}`);

  try {
    switch (subcommand) {
      case 'status':
        await showStatus(context);
        break;
      
      case 'test':
        await testTranslation(context);
        break;
      
      case 'files':
        await listFiles(context);
        break;
      
      case 'clear-cache':
        await clearCache(context);
        break;
      
      case 'inspect':
        await inspectFile(context);
        break;
      
      default:
        await showStatus(context);
    }
    
  } catch (error) {
    logger.error("Error en translation-debug", error);
    await context.reply({
      content: `❌ Error: ${error.message}`,
      ephemeral: true
    });
  }
}

// ========================================
// SUBCOMANDO: STATUS
// ========================================

async function showStatus(context) {
  const stats = getCacheStats();
  const locale = await detectLanguage(context);
  
  const embed = new EmbedBuilder()
    .setColor(0x5865F2)
    .setTitle('🌍 Translation System Status')
    .addFields(
      {
        name: '📊 Cache Statistics',
        value: 
          `**Cached Files:** ${stats.size}\n` +
          `**Files Loaded:** ${stats.stats.filesLoaded}\n` +
          `**Files Failed:** ${stats.stats.filesFailed}\n` +
          `**Translations:** ${stats.stats.translationsLoaded}\n` +
          `**Cache Hits:** ${stats.stats.cacheHits}\n` +
          `**Cache Misses:** ${stats.stats.cacheMisses}`,
        inline: true
      },
      {
        name: '🗣️ Current Locale',
        value: `\`${locale}\``,
        inline: true
      },
      {
        name: '📁 Cached Files',
        value: stats.keys.length > 0
          ? '```\n' + stats.keys.slice(0, 10).join('\n') + (stats.keys.length > 10 ? `\n... and ${stats.keys.length - 10} more` : '') + '\n```'
          : '*No files in cache*',
        inline: false
      }
    )
    .setTimestamp();
  
  await context.reply({ embeds: [embed], ephemeral: true });
}

// ========================================
// SUBCOMANDO: TEST
// ========================================

async function testTranslation(context) {
  await context.deferReply({ ephemeral: true });
  
  const commandPath = context.options.getString("command", true);
  const [category, commandName] = commandPath.split('/');
  
  if (!category || !commandName) {
    return context.editReply({
      content: '❌ Invalid format. Use: `category/command` (e.g. `music/play`)'
    });
  }
  
  try {
    // Crear traductor con logging habilitado
    const mockCommandData = { category, name: commandName };
    const t = await createTranslator(mockCommandData, context);
    
    // Probar algunas traducciones comunes
    const testKeys = [
      'responses.no_voice',
      'responses.added',
      'embed.now_playing_title',
      'embed.author',
      'embed.duration',
      'current_prefix_title',
      'how_to_change'
    ];
    
    let results = '**Translation Test Results:**\n\n';
    
    for (const key of testKeys) {
      const translation = t(key);
      const status = translation.startsWith('[Missing:') ? '❌' : '✅';
      results += `${status} \`${key}\`\n`;
      results += `   → "${translation}"\n\n`;
    }
    
    const embed = new EmbedBuilder()
      .setColor(0x5865F2)
      .setTitle(`🧪 Translation Test: ${category}/${commandName}`)
      .setDescription(results)
      .addFields({
        name: 'Locale',
        value: `\`${t.locale}\``,
        inline: true
      })
      .setTimestamp();
    
    await context.editReply({ embeds: [embed] });
    
  } catch (error) {
    await context.editReply({
      content: `❌ Test failed: ${error.message}\n\`\`\`\n${error.stack}\n\`\`\``
    });
  }
}

// ========================================
// SUBCOMANDO: FILES
// ========================================

async function listFiles(context) {
  await context.deferReply({ ephemeral: true });
  
  const locale = context.options.getString("locale") || await detectLanguage(context);
  
  try {
    const i18nPath = join(process.cwd(), 'src', 'bot', 'i18n', locale);
    
    const files = await scanDirectory(i18nPath);
    
    const embed = new EmbedBuilder()
      .setColor(0x5865F2)
      .setTitle(`📁 Translation Files (${locale})`)
      .setDescription(
        `Found **${files.length}** translation files:\n\n` +
        '```\n' + files.slice(0, 20).join('\n') + (files.length > 20 ? `\n... and ${files.length - 20} more` : '') + '\n```'
      )
      .setTimestamp();
    
    await context.editReply({ embeds: [embed] });
    
  } catch (error) {
    await context.editReply({
      content: `❌ Error scanning files: ${error.message}`
    });
  }
}

async function scanDirectory(dirPath, relativePath = '') {
  const files = [];
  
  try {
    const entries = await readdir(dirPath, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = join(dirPath, entry.name);
      const relPath = join(relativePath, entry.name);
      
      if (entry.isDirectory()) {
        const subFiles = await scanDirectory(fullPath, relPath);
        files.push(...subFiles);
      } else if (entry.name.endsWith('.json')) {
        files.push(relPath);
      }
    }
  } catch (error) {
    logger.error(`Error scanning ${dirPath}:`, error);
  }
  
  return files;
}

// ========================================
// SUBCOMANDO: CLEAR CACHE
// ========================================

async function clearCache(context) {
  const statsBefore = getCacheStats();
  
  clearTranslationCache();
  
  const embed = new EmbedBuilder()
    .setColor(0x00ff00)
    .setTitle('✅ Translation Cache Cleared')
    .addFields(
      {
        name: 'Files Removed',
        value: `${statsBefore.size}`,
        inline: true
      },
      {
        name: 'Translations Freed',
        value: `${statsBefore.stats.translationsLoaded}`,
        inline: true
      }
    )
    .setDescription('Next translation request will reload files from disk.')
    .setTimestamp();
  
  await context.reply({ embeds: [embed], ephemeral: true });
}

// ========================================
// SUBCOMANDO: INSPECT
// ========================================

async function inspectFile(context) {
  await context.deferReply({ ephemeral: true });
  
  const filePath = context.options.getString("path", true);
  const locale = context.options.getString("locale") || await detectLanguage(context);
  
  try {
    const fullPath = join(process.cwd(), 'src', 'bot', 'i18n', locale, filePath);
    
    const content = await readFile(fullPath, 'utf-8');
    const data = JSON.parse(content);
    
    const keysCount = countKeys(data);
    const preview = JSON.stringify(data, null, 2);
    
    const embed = new EmbedBuilder()
      .setColor(0x5865F2)
      .setTitle(`🔍 File Inspection: ${filePath}`)
      .addFields(
        {
          name: 'Locale',
          value: `\`${locale}\``,
          inline: true
        },
        {
          name: 'Total Keys',
          value: `${keysCount}`,
          inline: true
        },
        {
          name: 'File Size',
          value: `${content.length} bytes`,
          inline: true
        },
        {
          name: 'Content Preview',
          value: '```json\n' + preview.substring(0, 1800) + (preview.length > 1800 ? '\n...' : '') + '\n```',
          inline: false
        }
      )
      .setTimestamp();
    
    await context.editReply({ embeds: [embed] });
    
  } catch (error) {
    await context.editReply({
      content: `❌ Error reading file: ${error.message}\n\nPath: \`${filePath}\``
    });
  }
}

function countKeys(obj) {
  let count = 0;
  
  for (const value of Object.values(obj)) {
    if (typeof value === 'string') {
      count++;
    } else if (typeof value === 'object' && value !== null) {
      count += countKeys(value);
    }
  }
  
  return count;
}