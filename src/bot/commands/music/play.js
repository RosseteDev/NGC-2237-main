// src/commands/music/play.js

import { buildCommand } from "../../utils/commandbuilder.js";
import { createLogger } from "../../utils/Logger.js";
import { createTranslator } from "../../localization/TranslatorHelper.js";
import { queues, buildSearchIdentifier } from "../../handlers/music/utils.js";
import { hardLockedGuilds } from "../../handlers/music/voiceStateHandler.js";
import { createNowPlayingEmbed } from "../../handlers/music/utils.js";

const logger = createLogger("music:play");

export const data = buildCommand("music", "play");

export async function autocomplete(interaction) {
  const focusedOption = interaction.options.getFocused(true);
  
  if (focusedOption.name !== 'query') {
    return interaction.respond([]);
  }
  
  const query = focusedOption.value;
  
  if (!query || query.length < 2) {
    return interaction.respond([]);
  }
  
  if (/^https?:\/\//.test(query)) {
    return interaction.respond([]);
  }
  
  try {
    const shoukaku = interaction.client.lavalink?.shoukaku;
    if (!shoukaku) {
      return interaction.respond([]);
    }
    
    const node = shoukaku.getIdealNode();
    if (!node) {
      return interaction.respond([]);
    }
    
    const result = await node.rest.resolve(`ytsearch:${query}`);
    
    if (result?.loadType !== 'search' || !result.data?.length) {
      return interaction.respond([]);
    }
    
    const choices = result.data.slice(0, 10).map(track => {
      const duration = formatDuration(track.info.length);
      return {
        name: truncate(`${track.info.title} - ${track.info.author} [${duration}]`, 100),
        value: track.info.uri || track.info.identifier
      };
    });
    
    await interaction.respond(choices);
    
  } catch (error) {
    logger.error("Error en autocomplete:", error);
    await interaction.respond([]);
  }
}

function truncate(text, maxLength) {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength - 3) + '...';
}

export async function execute(context) {
  logger.group("🎵 Comando Play Iniciado", () => {
    logger.debug(`Usuario: ${context.user.tag} (${context.user.id})`);
    logger.debug(`Servidor: ${context.guild?.name} (${context.guild?.id})`);
    logger.debug(`Canal: ${context.channel?.name} (${context.channel?.id})`);
  });
  
  const { member, guild, client, channel } = context;
  
  const t = await createTranslator(data, context);
  
  try {
    const query = context.options.getString("query", true);
    logger.info(`🔍 Query: "${query}"`);
    
    // ========================================
    // VALIDACIONES INICIALES
    // ========================================
    
    if (!member?.voice?.channel) {
      logger.debug("❌ Usuario no está en canal de voz");
      return context.reply({
        content: t("no_voice"),
        ephemeral: true
      });
    }
    
    logger.debug(`✅ Usuario en canal: ${member.voice.channel.name}`);
    
    const shoukaku = client.lavalink?.shoukaku;
    if (!shoukaku) {
      logger.error("❌ Shoukaku no disponible");
      return context.reply({
        content: t("music_system_unavailable"),
        ephemeral: true
      });
    }
    
    const node = shoukaku.getIdealNode();
    if (!node) {
      logger.error("❌ Sin nodos de Lavalink disponibles");
      return context.reply({
        content: t("no_music_nodes"),
        ephemeral: true
      });
    }
    
    logger.info(`✅ Nodo seleccionado: ${node.name}`);
    
    await context.deferReply();
    logger.debug("⏳ Reply diferido");
    
    // ========================================
    // VALIDACIÓN: HARD LOCK ACTIVO
    // ========================================
    
    if (hardLockedGuilds.has(guild.id)) {
      logger.warn(`⚠️ Guild ${guild.id} está bloqueado por desconexión forzada`);
      
      return context.editReply({
        content: t("guild_locked")
      });
    }
    
    // ========================================
    // BÚSQUEDA EN LAVALINK
    // ========================================
    
    const identifier = buildSearchIdentifier(query);
    logger.debug(`🔍 Identificador de búsqueda: ${identifier}`);
    
    logger.time("Búsqueda en Lavalink");
    
    let result;
    try {
      result = await node.rest.resolve(identifier);
      logger.timeEnd("Búsqueda en Lavalink");
      
      logger.group("📦 Resultado de búsqueda", () => {
        logger.debug(`Tipo: ${result?.loadType}`);
        logger.debug(`Datos: ${result?.data ? 'Presente' : 'Ausente'}`);
      });
      
    } catch (error) {
      logger.error("❌ Error en búsqueda de Lavalink", error);
      
      if (!/^https?:\/\//.test(query)) {
        logger.debug("🔄 Intentando fallback a SoundCloud...");
        
        try {
          result = await node.rest.resolve(`scsearch:${query}`);
          logger.info("✅ Resultado encontrado en SoundCloud");
        } catch (scError) {
          logger.error("❌ Fallback a SoundCloud falló", scError);
          throw scError;
        }
      } else {
        throw error;
      }
    }
    
    // ========================================
    // PROCESAR RESULTADOS
    // ========================================
    
    logger.debug("🎵 Procesando resultados...");
    
    let tracks = [];
    let playlistInfo = null;
    
    switch (result?.loadType) {
      case "track":
        tracks = [result.data];
        logger.debug("✅ 1 track encontrado");
        break;
        
      case "search":
        tracks = result.data;
        logger.debug(`✅ ${tracks.length} tracks encontrados en búsqueda`);
        break;
        
      case "playlist":
        tracks = result.data.tracks;
        playlistInfo = {
          name: result.data.info?.name || "Unknown Playlist",
          count: tracks.length
        };
        logger.info(`✅ Playlist: ${playlistInfo.name} (${playlistInfo.count} tracks)`);
        break;
        
      case "error":
        logger.error("❌ Error de Lavalink:", result.data);
        return context.editReply({
          content: t("no_results", { query })
        });
        
      case "empty":
        logger.debug("❌ Búsqueda sin resultados");
        return context.editReply({
          content: t("no_results", { query })
        });
        
      default:
        logger.warn(`⚠️ Tipo de carga desconocido: ${result?.loadType}`);
    }
    
    if (!tracks.length) {
      logger.debug("❌ Sin resultados para mostrar");
      return context.editReply({
        content: t("no_results", { query })
      });
    }
    
    const track = tracks[0];
    
    logger.group("🎵 Track Seleccionado", () => {
      logger.debug(`Título: ${track.info.title}`);
      logger.debug(`Autor: ${track.info.author}`);
      logger.debug(`Duración: ${track.info.length}ms (${formatDuration(track.info.length)})`);
      logger.debug(`URL: ${track.info.uri}`);
    });
    
    // ========================================
    // CONEXIÓN A VOZ CON VALIDACIÓN SIMPLE
    // ========================================
    
    let player = shoukaku.players.get(guild.id);
    const voiceChannel = member.voice.channel;
    
    /**
     * Limpia completamente todos los recursos del servidor
     * Útil cuando el bot fue expulsado o la conexión está corrupta
     */
    async function cleanupGuildResources(reason = "cleanup") {
      logger.debug(`🧹 Limpieza completa de recursos (${reason})...`);
      
      if (player) {
        try {
          // Remover listeners para evitar eventos durante cleanup
          player.removeAllListeners("end");
          player.removeAllListeners("exception");
          player.removeAllListeners("closed");
          player.removeAllListeners("stuck");
          
          // ✅ CORRECTO: Destruir el player (libera VoiceState de Discord)
          player.destroy();
          logger.debug("✅ Player destruido");
        } catch (err) {
          logger.debug(`No crítico durante cleanup: ${err.message}`);
        }
      }
      
      // Limpiar registros
      shoukaku.players.delete(guild.id);
      queues.delete(guild.id);
      
      logger.debug("✅ Recursos limpiados completamente");
    }
    
    // ✅ VALIDACIÓN SIMPLE: Si hay player Y el usuario está en otro canal
    if (player) {
      const botVoiceState = guild.members.me?.voice;
      const playerChannel = botVoiceState?.channelId;
      
      logger.debug(`🔍 Player existente detectado`);
      logger.debug(`  Bot en canal: ${playerChannel || 'null'}`);
      logger.debug(`  Usuario en canal: ${voiceChannel.id}`);
      
      // Si el bot está en OTRO canal diferente al del usuario
      if (playerChannel && playerChannel !== voiceChannel.id) {
        logger.debug(`❌ Usuario en canal diferente al bot`);
        return context.editReply({
          content: t("music_in_other_channel")
        });
      }
      
      // Si el bot NO está en ningún canal pero hay player (zombie)
      if (!playerChannel) {
        logger.warn("⚠️ Player zombie detectado (bot no en canal) - limpiando...");
        await cleanupGuildResources("zombie_player");
        player = null;
      }
    }
    
    // ✅ CREAR PLAYER si no existe o fue limpiado
    if (!player) {
      logger.debug("🔌 Conectando a canal de voz...");
      
      try {
        // Verificar permisos ANTES de intentar conectar
        const permissions = voiceChannel.permissionsFor(guild.members.me);
        
        if (!permissions.has('Connect')) {
          logger.error("❌ Bot no tiene permiso Connect");
          return context.editReply({
            content: t("no_connect_permission")
          });
        }
        
        if (!permissions.has('Speak')) {
          logger.error("❌ Bot no tiene permiso Speak");
          return context.editReply({
            content: t("no_speak_permission")
          });
        }
        
        logger.debug("✅ Permisos verificados");
        
        // ✅ LIMPIEZA PREVENTIVA SIMPLE (si hay residuos)
        try {
          logger.debug("🔄 Iniciando conexión a canal de voz...");
          
          const existingPlayer = shoukaku.players.get(guild.id);
          
          if (existingPlayer) {
            logger.warn("🧹 Player residual detectado - destruyendo...");
            existingPlayer.removeAllListeners();
            existingPlayer.destroy();
            queues.delete(guild.id);
            logger.debug("✅ Limpieza preventiva completada");
          }
          
          // Crear conexión
          logger.debug("🔌 Creando nueva conexión...");
          player = await Promise.race([
            shoukaku.joinVoiceChannel({
              guildId: guild.id,
              channelId: voiceChannel.id,
              shardId: guild.shardId ?? 0,
              deaf: true
            }),
            new Promise((_, reject) => 
              setTimeout(() => reject(new Error('Connection timeout after 10s')), 10000)
            )
          ]);
          
          if (!player) {
            throw new Error('Player is null after connection');
          }
          
          logger.debug("⏳ Esperando estabilización (1s)...");
          await new Promise(resolve => setTimeout(resolve, 1000));
          
          // Verificar que el bot está en el canal
          const botVoice = guild.members.me?.voice;
          if (botVoice?.channelId !== voiceChannel.id) {
            throw new Error('Bot not in voice channel after connection');
          }
          
          logger.info(`🔊 Conectado exitosamente a: ${voiceChannel.name}`);
          
        } catch (connectionError) {
          logger.error("❌ Error en conexión:", connectionError.message);
          
          // Limpiar cualquier player fallido
          if (player) {
            try {
              player.removeAllListeners();
              player.destroy();
            } catch {}
            player = null;
          }
          
          return context.editReply({
            content: t("connection_error", { error: connectionError.message })
          });
        }
        
      } catch (error) {
        logger.error("❌ Error crítico conectando a voz", error);
        
        // Limpiar cualquier residuo
        await cleanupGuildResources("critical_connection_error").catch(() => {});
        
        return context.editReply({
          content: `❌ Error al conectar: ${error.message}`
        });
      }
    } else {
      logger.debug(`✅ Usando player existente`);
    }
    
    // ========================================
    // GESTIÓN DE COLA
    // ========================================
    
    logger.debug("📋 Gestionando cola...");
    
    let queue = queues.get(guild.id);
    
    if (!queue) {
      logger.debug("🆕 Creando nueva cola");
      queue = {
        playing: false,
        tracks: [],
        textChannel: channel,
        originalContext: context,
        contextHandled: false,
        listenersConfigured: false,
        voiceChannelId: voiceChannel.id, // ✅ NUEVO: Guardar ID del canal
        translator: t // ✅ NUEVO: Guardar traductor para event listeners
      };
      queues.set(guild.id, queue);
    }
    
    // ✅ VALIDACIÓN: Verificar que el usuario sigue en el mismo canal
    if (queue.voiceChannelId && queue.voiceChannelId !== voiceChannel.id) {
      return context.editReply({
        content: t("music_in_other_channel")
      });
    }
    
    // Añadir track(s) a la cola
    if (playlistInfo) {
      queue.tracks.push(...tracks);
      logger.info(`✅ ${tracks.length} tracks añadidos a la cola`);
      
      await context.editReply({
        content: t("playlist_added", {
          count: playlistInfo.count,
          name: playlistInfo.name
        })
      });
      queue.contextHandled = true;
      
    } else {
      queue.tracks.push(track);
      logger.debug(`✅ Track añadido. Cola: ${queue.tracks.length} tracks`);
    }
    
    // Si ya está reproduciendo, solo confirmar adición
    if (queue.playing) {
      logger.debug("▶️ Ya hay reproducción activa, añadiendo a cola");
      
      if (!playlistInfo) {
        const position = queue.tracks.length;
        await context.editReply({
          content: t("added", {
            title: track.info.title,
            position: position
          })
        });
        queue.contextHandled = true;
      }
      
      return;
    }
    
    // ========================================
    // FUNCIÓN DE REPRODUCCIÓN CON VALIDACIÓN CONTINUA
    // ========================================
    
    async function playNext() {
      const queueLength = queue.tracks.length;
      logger.debug(`▶️ playNext() - Cola: ${queueLength} tracks`);
      
      const next = queue.tracks.shift();
      
      if (!next) {
        logger.info("🏁 Cola vacía, deteniendo reproducción");
        queue.playing = false;
        return;
      }
      
      queue.playing = true;
      
      logger.group("🎵 Reproduciendo Track", () => {
        logger.info(`Título: ${next.info.title}`);
        logger.debug(`Autor: ${next.info.author}`);
        logger.debug(`Duración: ${formatDuration(next.info.length)}`);
      });
      
      try {
        // ✅ VALIDACIÓN PRE-PLAY: Verificar que player sigue válido
        const currentPlayer = shoukaku.players.get(guild.id);
        const botVoice = guild.members.me?.voice;
        
        if (!currentPlayer) {
          logger.error("❌ Player no existe antes de play");
          queue.playing = false;
          
          queue.textChannel?.send({
            content: t("playback_stopped_no_player")
          });
          
          return;
        }
        
        if (botVoice?.channelId !== queue.voiceChannelId) {
          logger.error("❌ Bot desconectado antes de play");
          queue.playing = false;
          
          queue.textChannel?.send({
            content: t("playback_stopped_disconnected")
          });
          
          return;
        }
        
        await currentPlayer.playTrack({ 
          track: { encoded: next.encoded } 
        });
        
        logger.info("✅ Reproducción iniciada correctamente");
        
        // Enviar embed
        const embed = createNowPlayingEmbed(next, t); // ← Usar función helper

        if (!queue.contextHandled && queue.originalContext) {
          await queue.originalContext.editReply({ embeds: [embed] });
          queue.contextHandled = true;
        } else {
          queue.textChannel?.send({ embeds: [embed] });
        }
        
      } catch (error) {
        logger.error("❌ Error reproduciendo track", error);
        queue.playing = false;
        
        if (!queue.contextHandled && queue.originalContext) {
          await queue.originalContext.editReply({
            content: t("failed_to_play")
          });
          queue.contextHandled = true;
        } else {
          queue.textChannel?.send({
            content: t("track_error", { title: next.info.title })
          });
        }
        
        logger.debug("🔄 Intentando siguiente track...");
        await playNext();
      }
    }
    
    // ========================================
    // EVENT LISTENERS (SOLO UNA VEZ) CON VALIDACIÓN
    // ========================================
    
    if (!queue.listenersConfigured) {
      logger.debug("🎧 Configurando event listeners...");
      
      player.removeAllListeners("end");
      player.removeAllListeners("exception");
      player.removeAllListeners("closed");
      player.removeAllListeners("stuck");
      
      player.on("end", async (data) => {
        logger.group("⏹️ Evento END", () => {
          logger.debug(`Razón: ${data.reason}`);
          logger.debug(`Cola restante: ${queue.tracks.length} tracks`);
        });
        
        const shouldContinue = ["finished", "loadFailed"].includes(data.reason);
        
        if (shouldContinue) {
          if (queue.tracks.length > 0) {
            logger.debug("▶️ Continuando con siguiente track");
            await playNext();
          } else {
            logger.info("🏁 Cola terminada");
            queue.playing = false;
          }
        } else {
          logger.debug(`⏸️ Reproducción detenida: ${data.reason}`);
          queue.playing = false;
        }
      });
      
      player.on("exception", async (data) => {
        logger.error("💥 Excepción en playback", data.exception);
        
        queue.textChannel?.send({
          content: t("track_error", { title: data.track?.info?.title || 'Unknown' })
        });
        
        logger.debug("🔄 Intentando siguiente track tras excepción");
        await playNext();
      });
      
      // ✅ DETECTAR DESCONEXIONES FORZADAS
      player.on("closed", (data) => {
        logger.warn("🔌 Conexión cerrada por Discord", data);
        
        queue.playing = false;
        
        // ✅ SOLUCIÓN PROFESIONAL: Hard lock el guild
        hardLockedGuilds.add(guild.id);
        logger.info(`🔒 Guild ${guild.id} bloqueado - esperando VOICE_STATE_UPDATE`);
        
        // ✅ LIMPIEZA SIMPLE Y DIRECTA
        try {
          const currentPlayer = shoukaku.players.get(guild.id);
          
          if (currentPlayer) {
            logger.debug("🧹 Destruyendo player...");
            currentPlayer.removeAllListeners();
            currentPlayer.destroy();
          }
          
          queues.delete(guild.id);
          
          logger.info("✅ Player y cola limpiados");
        } catch (cleanupErr) {
          logger.error("Error en limpieza:", cleanupErr);
        }
        
        // ✅ FALLBACK: Si por alguna razón no llega VOICE_STATE_UPDATE, liberar después de 15s
        setTimeout(() => {
          if (hardLockedGuilds.has(guild.id)) {
            logger.warn(`⚠️ Hard lock timeout para guild ${guild.id} - liberando por seguridad`);
            hardLockedGuilds.delete(guild.id);
          }
        }, 15000);
        
        // Notificar al usuario usando el traductor de la cola
        const queueTranslator = queue.translator;
        if (queueTranslator && queue.textChannel) {
          queue.textChannel.send({
            content: queueTranslator("connection_closed")
          }).catch(() => {});
        }
      });
      
      queue.listenersConfigured = true;
      logger.debug("✅ Event listeners configurados");
    } else {
      logger.debug("✅ Event listeners ya configurados, reutilizando");
    }
    
    // ========================================
    // INICIAR REPRODUCCIÓN
    // ========================================
    
    logger.info("🚀 Iniciando reproducción...");
    await playNext();
    logger.info("✅ Comando play completado exitosamente");
    
  } catch (error) {
    logger.error("💥 Error general en comando play", error);
    
    try {
      const errorMessage = t("general_error");
      
      if (context.deferred || context.replied) {
        await context.editReply({ content: errorMessage });
      } else {
        await context.reply({ content: errorMessage, ephemeral: true });
      }
    } catch (replyError) {
      logger.error("❌ No se pudo enviar mensaje de error al usuario", replyError);
    }
  }
}

function formatDuration(ms) {
  const seconds = Math.floor(ms / 1000);
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  
  if (mins >= 60) {
    const hours = Math.floor(mins / 60);
    const remainMins = mins % 60;
    return `${hours}:${remainMins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  }
  
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}