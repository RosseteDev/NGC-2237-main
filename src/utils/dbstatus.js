// src/commands/utils/dbstatus.js
// ============================================
// COMANDO: Database Status Monitor
// Monitoreo completo del sistema de base de datos
// ============================================

import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } from "discord.js";
import { db } from "../../database/ResilientDatabaseManager.js";
import { createLogger } from "../../utils/Logger.js";

const logger = createLogger("command:dbstatus");

export const data = new SlashCommandBuilder()
  .setName("dbstatus")
  .setDescription("View database system status (Admin only)")
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addSubcommand(sub =>
    sub
      .setName("overview")
      .setDescription("General system overview")
  )
  .addSubcommand(sub =>
    sub
      .setName("sync")
      .setDescription("Synchronization queue status")
  )
  .addSubcommand(sub =>
    sub
      .setName("force-sync")
      .setDescription("Force immediate synchronization to PostgreSQL")
  )
  .addSubcommand(sub =>
    sub
      .setName("health")
      .setDescription("Run health check on PostgreSQL")
  );

export async function execute(context) {
  const subcommand = context.options.data[0]?.name || 'overview';
  
  logger.debug(`dbstatus subcommand: ${subcommand}`);

  try {
    switch (subcommand) {
      case 'overview':
        await showOverview(context);
        break;
      
      case 'sync':
        await showSyncStatus(context);
        break;
      
      case 'force-sync':
        await forceSyncNow(context);
        break;
      
      case 'health':
        await runHealthCheck(context);
        break;
      
      default:
        await showOverview(context);
    }
    
  } catch (error) {
    logger.error("Error en dbstatus", error);
    await context.error(
      "Error",
      "Failed to retrieve database status"
    );
  }
}

// ========================================
// SUBCOMANDO: OVERVIEW
// ========================================

async function showOverview(context) {
  const stats = db.getStats();
  
  // Determinar color según modo
  const modeColors = {
    postgres: 0x00ff00,  // Verde
    local: 0xffa500,     // Naranja
    disabled: 0xff0000   // Rojo
  };
  
  const color = modeColors[stats.mode] || 0x808080;
  
  // Determinar icono de estado
  const statusIcons = {
    postgres: '✅',
    local: '⚠️',
    disabled: '❌'
  };
  
  const statusIcon = statusIcons[stats.mode] || '❓';
  
  // Calcular métricas
  const cacheHitRate = stats.pgStats 
    ? calculateHitRate(stats.pgStats.hits, stats.pgStats.misses)
    : 'N/A';
  
  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(`${statusIcon} Database System Status`)
    .setDescription(getModeDescription(stats.mode))
    .addFields(
      {
        name: '🔧 System Mode',
        value: `\`${stats.mode.toUpperCase()}\``,
        inline: true
      },
      {
        name: '📊 Available',
        value: stats.available ? '✅ Yes' : '❌ No',
        inline: true
      },
      {
        name: '📦 Sync Queue',
        value: `${stats.syncQueueSize} items`,
        inline: true
      }
    )
    .setTimestamp();
  
  // Si PostgreSQL está activo, añadir stats
  if (stats.pgStats) {
    embed.addFields(
      {
        name: '💾 PostgreSQL Cache',
        value: 
          `**Hits:** ${stats.pgStats.hits.toLocaleString()}\n` +
          `**Misses:** ${stats.pgStats.misses.toLocaleString()}\n` +
          `**Hit Rate:** ${cacheHitRate}`,
        inline: true
      }
    );
  }
  
  // Warnings si hay problemas
  const warnings = getSystemWarnings(stats);
  if (warnings.length > 0) {
    embed.addFields({
      name: '⚠️ Warnings',
      value: warnings.join('\n'),
      inline: false
    });
  }
  
  embed.setFooter({
    text: `Use /dbstatus sync to view queue details • Last check: ${new Date().toLocaleTimeString()}`
  });
  
  await context.reply({ embeds: [embed], ephemeral: true });
}

// ========================================
// SUBCOMANDO: SYNC STATUS
// ========================================

async function showSyncStatus(context) {
  await context.deferReply({ ephemeral: true });
  
  const stats = db.getStats();
  const queue = db.local.getSyncQueue(20); // Top 20
  
  const embed = new EmbedBuilder()
    .setColor(stats.syncQueueSize > 100 ? 0xff0000 : 0x00ff00)
    .setTitle('📤 Synchronization Queue Status')
    .addFields(
      {
        name: 'Queue Size',
        value: `${stats.syncQueueSize} operations pending`,
        inline: true
      },
      {
        name: 'Mode',
        value: `\`${stats.mode.toUpperCase()}\``,
        inline: true
      }
    );
  
  if (queue.length > 0) {
    const queuePreview = queue.slice(0, 10).map((item, i) => {
      const age = getTimeAgo(item.created_at);
      const retries = item.retries > 0 ? ` (${item.retries} retries)` : '';
      
      return `${i + 1}. \`${item.table_name}\` - ${item.operation} - ${age}${retries}`;
    }).join('\n');
    
    embed.addFields({
      name: 'Recent Operations (Top 10)',
      value: queuePreview || 'No items in queue',
      inline: false
    });
    
    if (queue.length > 10) {
      embed.addFields({
        name: 'Additional Info',
        value: `... and ${queue.length - 10} more items`,
        inline: false
      });
    }
    
    // Stats por tabla
    const tableStats = {};
    for (const item of queue) {
      tableStats[item.table_name] = (tableStats[item.table_name] || 0) + 1;
    }
    
    const tableBreakdown = Object.entries(tableStats)
      .map(([table, count]) => `**${table}:** ${count}`)
      .join('\n');
    
    embed.addFields({
      name: 'Breakdown by Table',
      value: tableBreakdown,
      inline: false
    });
  } else {
    embed.addFields({
      name: 'Status',
      value: '✅ Queue is empty - all operations synchronized',
      inline: false
    });
  }
  
  embed.setFooter({
    text: `Use /dbstatus force-sync to sync immediately`
  });
  
  await context.editReply({ embeds: [embed] });
}

// ========================================
// SUBCOMANDO: FORCE SYNC
// ========================================

async function forceSyncNow(context) {
  await context.deferReply({ ephemeral: true });
  
  const stats = db.getStats();
  
  if (stats.mode !== 'postgres') {
    return context.editReply({
      content: '⚠️ Cannot sync: PostgreSQL is not available\n' +
               `Current mode: \`${stats.mode.toUpperCase()}\``
    });
  }
  
  if (stats.syncQueueSize === 0) {
    return context.editReply({
      content: '✅ Nothing to sync - queue is already empty'
    });
  }
  
  const initialQueueSize = stats.syncQueueSize;
  
  await context.editReply({
    content: `🔄 Starting sync of ${initialQueueSize} operations...`
  });
  
  try {
    const startTime = Date.now();
    
    // Ejecutar sincronización
    await db.syncToPostgres();
    
    const elapsed = Date.now() - startTime;
    const finalStats = db.getStats();
    const synced = initialQueueSize - finalStats.syncQueueSize;
    
    const embed = new EmbedBuilder()
      .setColor(finalStats.syncQueueSize === 0 ? 0x00ff00 : 0xffa500)
      .setTitle('✅ Synchronization Complete')
      .addFields(
        {
          name: 'Synced',
          value: `${synced} operations`,
          inline: true
        },
        {
          name: 'Time',
          value: `${elapsed}ms`,
          inline: true
        },
        {
          name: 'Remaining',
          value: `${finalStats.syncQueueSize} items`,
          inline: true
        }
      )
      .setTimestamp();
    
    if (finalStats.syncQueueSize > 0) {
      embed.addFields({
        name: '⚠️ Note',
        value: `${finalStats.syncQueueSize} items could not be synced (will retry later)`,
        inline: false
      });
    }
    
    await context.editReply({ content: null, embeds: [embed] });
    
    logger.info(`Manual sync completed: ${synced}/${initialQueueSize} in ${elapsed}ms`);
    
  } catch (error) {
    logger.error("Error en force sync", error);
    
    await context.editReply({
      content: `❌ Sync failed: ${error.message}\n` +
               `Items will be retried automatically.`
    });
  }
}

// ========================================
// SUBCOMANDO: HEALTH CHECK
// ========================================

async function runHealthCheck(context) {
  await context.deferReply({ ephemeral: true });
  
  await context.editReply({
    content: '🔍 Running health check on PostgreSQL...'
  });
  
  const startTime = Date.now();
  
  try {
    const isHealthy = await db.checkHealth(5000);
    const elapsed = Date.now() - startTime;
    
    const embed = new EmbedBuilder()
      .setColor(isHealthy ? 0x00ff00 : 0xff0000)
      .setTitle(isHealthy ? '✅ PostgreSQL Healthy' : '❌ PostgreSQL Unhealthy')
      .addFields(
        {
          name: 'Response Time',
          value: `${elapsed}ms`,
          inline: true
        },
        {
          name: 'Status',
          value: isHealthy ? '✅ Online' : '❌ Offline',
          inline: true
        },
        {
          name: 'Current Mode',
          value: `\`${db.mode.toUpperCase()}\``,
          inline: true
        }
      )
      .setTimestamp();
    
    if (!isHealthy) {
      embed.addFields({
        name: '⚠️ Degradation',
        value: 
          'PostgreSQL is unreachable. System is running in LOCAL mode.\n' +
          'Data is being saved locally and will sync when PostgreSQL recovers.',
        inline: false
      });
    }
    
    await context.editReply({ content: null, embeds: [embed] });
    
  } catch (error) {
    await context.editReply({
      content: `❌ Health check failed: ${error.message}`
    });
  }
}

// ========================================
// UTILIDADES
// ========================================

function getModeDescription(mode) {
  const descriptions = {
    postgres: '✅ **PRIMARY MODE** - All systems operational. Data is being written to both PostgreSQL and local backup.',
    local: '⚠️ **FALLBACK MODE** - PostgreSQL is unavailable. Running on local SQLite backup. Changes will sync when PostgreSQL recovers.',
    disabled: '❌ **DISABLED MODE** - Database is disabled by configuration. Only local storage is active.'
  };
  
  return descriptions[mode] || 'Unknown mode';
}

function calculateHitRate(hits, misses) {
  const total = hits + misses;
  if (total === 0) return '0%';
  
  const rate = (hits / total * 100).toFixed(2);
  return `${rate}%`;
}

function getSystemWarnings(stats) {
  const warnings = [];
  
  if (stats.mode === 'local') {
    warnings.push('⚠️ Running in FALLBACK mode - PostgreSQL unavailable');
  }
  
  if (stats.syncQueueSize > 100) {
    warnings.push(`⚠️ Large sync queue: ${stats.syncQueueSize} items pending`);
  }
  
  if (stats.syncQueueSize > 500) {
    warnings.push('🚨 CRITICAL: Sync queue exceeds 500 items - potential sync issues');
  }
  
  if (stats.pgStats) {
    const hitRate = parseFloat(calculateHitRate(stats.pgStats.hits, stats.pgStats.misses));
    if (hitRate < 80) {
      warnings.push(`⚠️ Low cache hit rate: ${hitRate.toFixed(2)}% (target: >80%)`);
    }
  }
  
  return warnings;
}

function getTimeAgo(timestamp) {
  const now = Math.floor(Date.now() / 1000);
  const diff = now - timestamp;
  
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}