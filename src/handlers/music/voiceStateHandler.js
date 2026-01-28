// Voice State Update Handler
// Este handler es la FUENTE DE VERDAD para saber cuándo Discord liberó la conexión

import { createLogger } from "../../utils/Logger.js";

const logger = createLogger("voiceStateHandler");

// ✅ IMPORTANTE: Este Set es compartido con play.js
export const hardLockedGuilds = new Set();

/**
 * Configura el listener de voiceStateUpdate
 * Este es el ÚNICO evento confiable para saber cuándo Discord liberó la conexión
 * 
 * @param {Client} client - Cliente de Discord.js
 */
export function setupVoiceStateHandler(client) {
  client.on("voiceStateUpdate", (oldState, newState) => {
    // Solo nos importa cuando el BOT cambia de estado
    if (oldState.id !== client.user.id) return;
    
    const guildId = oldState.guild.id;
    
    // ✅ CASO CRÍTICO: Bot salió de un canal de voz
    if (oldState.channelId && !newState.channelId) {
      logger.info(`🔓 Bot desconectado del canal en guild ${guildId}`);
      logger.debug(`  Old channel: ${oldState.channelId}`);
      logger.debug(`  New channel: null`);
      
      // ✅ LIBERAR HARD LOCK - Discord confirmó que liberó la conexión
      if (hardLockedGuilds.has(guildId)) {
        hardLockedGuilds.delete(guildId);
        logger.info(`✅ Hard lock liberado para guild ${guildId} - listo para reconectar`);
      }
    }
    
    // Logging adicional para debugging
    if (oldState.channelId !== newState.channelId) {
      logger.debug(`Voice state change para bot en guild ${guildId}:`);
      logger.debug(`  ${oldState.channelId || 'null'} → ${newState.channelId || 'null'}`);
    }
  });
  
  logger.info("✅ Voice State Handler configurado");
}
