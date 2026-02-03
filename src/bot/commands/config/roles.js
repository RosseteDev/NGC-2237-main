// src/bot/commands/admin/setupdegeneracyden.js
// ⚠️ COMANDO PROVISIONAL - Solo para el servidor específico

import { SlashCommandBuilder, PermissionFlagsBits } from "discord.js";
import { createLogger } from "../../utils/Logger.js";

const logger = createLogger("command:setup-degeneracy");

// ✅ ID del servidor autorizado (Degeneracy Den)
const AUTHORIZED_GUILD_ID = "1467020037784211520";

// Estructura completa de roles CON PERMISOS ESPECÍFICOS
const ROLE_STRUCTURE = {
  moderadores: [
    { 
      name: "Fundador / Dueño", 
      color: "#000000", 
      position: 100,
      permissions: [
        PermissionFlagsBits.Administrator // Todos los permisos
      ]
    },
    { 
      name: "Co-Fundador / Gestor", 
      color: "#370617", 
      position: 99,
      permissions: [
        PermissionFlagsBits.ManageGuild,
        PermissionFlagsBits.ManageRoles,
        PermissionFlagsBits.ManageChannels,
        PermissionFlagsBits.KickMembers,
        PermissionFlagsBits.BanMembers,
        PermissionFlagsBits.ManageMessages,
        PermissionFlagsBits.ManageWebhooks,
        PermissionFlagsBits.ManageEmojisAndStickers,
        PermissionFlagsBits.ViewAuditLog,
        PermissionFlagsBits.ModerateMembers
      ]
    },
    { 
      name: "Consejero de la Den", 
      color: "#5E60CE", 
      position: 98,
      permissions: [
        PermissionFlagsBits.ManageChannels,
        PermissionFlagsBits.KickMembers,
        PermissionFlagsBits.BanMembers,
        PermissionFlagsBits.ManageMessages,
        PermissionFlagsBits.ViewAuditLog,
        PermissionFlagsBits.ModerateMembers,
        PermissionFlagsBits.MuteMembers,
        PermissionFlagsBits.DeafenMembers,
        PermissionFlagsBits.MoveMembers
      ]
    },
    { 
      name: "Inquisidor", 
      color: "#A61E4D", 
      position: 97,
      permissions: [
        PermissionFlagsBits.KickMembers,
        PermissionFlagsBits.BanMembers,
        PermissionFlagsBits.ManageMessages,
        PermissionFlagsBits.ModerateMembers,
        PermissionFlagsBits.ViewAuditLog,
        PermissionFlagsBits.MuteMembers,
        PermissionFlagsBits.DeafenMembers
      ]
    },
    { 
      name: "Defensor de la Den", 
      color: "#E63946", 
      position: 96,
      permissions: [
        PermissionFlagsBits.KickMembers,
        PermissionFlagsBits.ManageMessages,
        PermissionFlagsBits.ModerateMembers,
        PermissionFlagsBits.MuteMembers,
        PermissionFlagsBits.DeafenMembers,
        PermissionFlagsBits.MoveMembers
      ]
    },
    { 
      name: "Guardián Nocturno", 
      color: "#FF8C42", 
      position: 95,
      permissions: [
        PermissionFlagsBits.ManageMessages,
        PermissionFlagsBits.ModerateMembers,
        PermissionFlagsBits.MuteMembers,
        PermissionFlagsBits.DeafenMembers
      ]
    },
    { 
      name: "Alma en Prueba", 
      color: "#FF6B6B", 
      position: 94,
      permissions: [
        PermissionFlagsBits.ManageMessages,
        PermissionFlagsBits.MuteMembers
      ]
    }
  ],
  
  vip: [
    { 
      name: "Noble de la Corte", 
      color: "#E0115F", 
      position: 93,
      permissions: [
        PermissionFlagsBits.CreateInstantInvite,
        PermissionFlagsBits.ChangeNickname,
        PermissionFlagsBits.ManageNicknames,
        PermissionFlagsBits.EmbedLinks,
        PermissionFlagsBits.AttachFiles,
        PermissionFlagsBits.UseExternalEmojis,
        PermissionFlagsBits.UseExternalStickers
      ]
    },
    { 
      name: "Titular de un Lugar en la Den", 
      color: "#FFC300", 
      position: 92,
      permissions: [
        PermissionFlagsBits.CreateInstantInvite,
        PermissionFlagsBits.ChangeNickname,
        PermissionFlagsBits.EmbedLinks,
        PermissionFlagsBits.AttachFiles,
        PermissionFlagsBits.UseExternalEmojis
      ]
    },
    { 
      name: "Guardián del Santuario", 
      color: "#BF00FF", 
      position: 91,
      permissions: [
        PermissionFlagsBits.CreateInstantInvite,
        PermissionFlagsBits.ChangeNickname,
        PermissionFlagsBits.EmbedLinks,
        PermissionFlagsBits.AttachFiles
      ]
    },
    { 
      name: "Aliado de la Den", 
      color: "#E6B0AA", 
      position: 90,
      permissions: [
        PermissionFlagsBits.ChangeNickname,
        PermissionFlagsBits.EmbedLinks
      ]
    },
    { 
      name: "Mecenas de la Decadencia", 
      color: "#39FF14", 
      position: 89,
      permissions: [
        PermissionFlagsBits.ChangeNickname
      ]
    },
    { 
      name: "Patrón de la Oscuridad", 
      color: "#00D9FF", 
      position: 88,
      permissions: [] // Sin permisos especiales
    }
  ],
  
  genero: [
    { 
      name: "♂️ Hombre", 
      color: "#4A90E2", // Azul clásico masculino
      position: 86,
      permissions: [
        PermissionFlagsBits.ChangeNickname
      ]
    },
    { 
      name: "♀️ Mujer", 
      color: "#FF69B4", // Rosa clásico femenino
      position: 85,
      permissions: [
        PermissionFlagsBits.ChangeNickname
      ]
    },
    { 
      name: "⚧️ No Binario", 
      color: "#9B59B6", // Púrpura (neutro)
      position: 84,
      permissions: [
        PermissionFlagsBits.ChangeNickname
      ]
    },
    { 
      name: "❓ Prefiero no decir", 
      color: "#95A5A6", // Gris neutro
      position: 83,
      permissions: [
        PermissionFlagsBits.ChangeNickname
      ]
    }
  ],
  
  contribucion: [
    { 
      name: "Guía de Novatos", 
      color: "#BFFF00", 
      position: 82,
      permissions: [
        PermissionFlagsBits.MentionEveryone,
        PermissionFlagsBits.EmbedLinks
      ]
    },
    { 
      name: "Artista de la Den", 
      color: "#E6E6FA", 
      position: 81,
      permissions: [
        PermissionFlagsBits.AttachFiles,
        PermissionFlagsBits.EmbedLinks
      ]
    },
    { 
      name: "Meme Lord", 
      color: "#FFDB58", 
      position: 80,
      permissions: [
        PermissionFlagsBits.AttachFiles,
        PermissionFlagsBits.UseExternalEmojis
      ]
    }
  ],
  
  niveles: [
    { name: "Deidad del Anime", color: "#FF10F0", position: 79, permissions: [] },
    { name: "El Elegido", color: "#B3E5FC", position: 78, permissions: [] },
    { name: "Mito Viviente", color: "#F5F5F5", position: 77, permissions: [] },
    { name: "Leyenda de la Den", color: "#FFA500", position: 76, permissions: [] },
    { name: "Sabio de los Foros", color: "#FFD700", position: 75, permissions: [] },
    { name: "Anciano de Akihabara", color: "#D4AF37", position: 74, permissions: [] },
    { name: "Veterano de la Oscuridad", color: "#E67E22", position: 73, permissions: [] },
    { name: "Erudito del Manga", color: "#FFB347", position: 72, permissions: [] },
    { name: "Maestro del Shipping", color: "#D6A2E8", position: 71, permissions: [] },
    { name: "Arquitecto de Teorías", color: "#C77DFF", position: 70, permissions: [] },
    { name: "Guardián de los Memes", color: "#E91E63", position: 69, permissions: [] },
    { name: "Vocal de la Comunidad", color: "#9B59B6", position: 68, permissions: [] },
    { name: "Experto en Openings", color: "#4ECDC4", position: 67, permissions: [] },
    { name: "Conocedor de Tropos", color: "#5AA8C7", position: 66, permissions: [] },
    { name: "Coleccionista de Waifus", color: "#6FCF97", position: 65, permissions: [] },
    { name: "Buscador de Tesoros", color: "#4A7C59", position: 64, permissions: [] },
    { name: "Residente de la Guarida", color: "#3A5A8A", position: 63, permissions: [] },
    { name: "Habitante Nocturno", color: "#2A2D3A", position: 62, permissions: [] },
    { name: "Explorador de la Guarida", color: "#7A7A7A", position: 61, permissions: [] },
    { name: "Novato Degenerado", color: "#4A4A4A", position: 60, permissions: [] }
  ],
  
  lgbt: [
    { 
      name: "🏳️‍🌈 LGBT+", 
      color: "#FF69B4", // Rosa vibrante (representación general)
      position: 59,
      permissions: [
        PermissionFlagsBits.ChangeNickname,
        PermissionFlagsBits.UseExternalEmojis
      ]
    },
    { 
      name: "🏳️‍⚧️ Trans", 
      color: "#5BCEFA", // Azul celeste (bandera trans)
      position: 58,
      permissions: [
        PermissionFlagsBits.ChangeNickname,
        PermissionFlagsBits.UseExternalEmojis
      ]
    },
    { 
      name: "💙 Gay", 
      color: "#078D70", // Verde azulado (bandera gay MLM)
      position: 57,
      permissions: [
        PermissionFlagsBits.ChangeNickname,
        PermissionFlagsBits.UseExternalEmojis
      ]
    },
    { 
      name: "💗 Lesbiana", 
      color: "#D62900", // Naranja/rojo (bandera lesbiana)
      position: 56,
      permissions: [
        PermissionFlagsBits.ChangeNickname,
        PermissionFlagsBits.UseExternalEmojis
      ]
    },
    { 
      name: "💜 Bisexual", 
      color: "#D60270", // Magenta (bandera bisexual)
      position: 55,
      permissions: [
        PermissionFlagsBits.ChangeNickname,
        PermissionFlagsBits.UseExternalEmojis
      ]
    },
    { 
      name: "💚 Pansexual", 
      color: "#FF218C", // Rosa fucsia (bandera pansexual)
      position: 54,
      permissions: [
        PermissionFlagsBits.ChangeNickname,
        PermissionFlagsBits.UseExternalEmojis
      ]
    },
    { 
      name: "🎀 Cuestionable", 
      color: "#B4B4B4", // Gris (cuestionándose)
      position: 40,
      permissions: [
        PermissionFlagsBits.ChangeNickname,
        PermissionFlagsBits.UseExternalEmojis
      ]
    }
  ],
  
  especiales: [
    { 
      name: "🎂 Cumpleañero del Mes", 
      color: "#FFD700", // Dorado
      position: 39,
      permissions: [
        PermissionFlagsBits.UseExternalEmojis,
        PermissionFlagsBits.EmbedLinks
      ]
    },
    { 
      name: "🎮 Streamer de la Den", 
      color: "#9146FF", // Púrpura Twitch
      position: 38,
      permissions: [
        PermissionFlagsBits.CreateInstantInvite,
        PermissionFlagsBits.Stream,
        PermissionFlagsBits.UseExternalEmojis
      ]
    },
    { 
      name: "📺 Creador de Contenido", 
      color: "#FF0000", // Rojo YouTube
      position: 37,
      permissions: [
        PermissionFlagsBits.EmbedLinks,
        PermissionFlagsBits.AttachFiles,
        PermissionFlagsBits.UseExternalEmojis
      ]
    },
    { 
      name: "🎨 Artista Comisionado", 
      color: "#00D9FF", // Cian brillante
      position: 36,
      permissions: [
        PermissionFlagsBits.AttachFiles,
        PermissionFlagsBits.EmbedLinks,
        PermissionFlagsBits.UseExternalStickers
      ]
    },
    { 
      name: "🌟 MVP del Mes", 
      color: "#FFA500", // Naranja
      position: 35,
      permissions: [
        PermissionFlagsBits.UseExternalEmojis,
        PermissionFlagsBits.ChangeNickname
      ]
    },
    { 
      name: "🎭 Participante de Eventos", 
      color: "#E91E63", // Rosa evento
      position: 34,
      permissions: [
        PermissionFlagsBits.UseExternalEmojis
      ]
    },
    { 
      name: "🏆 Ganador de Torneo", 
      color: "#FFD700", // Oro
      position: 33,
      permissions: [
        PermissionFlagsBits.UseExternalEmojis,
        PermissionFlagsBits.ChangeNickname
      ]
    },
    { 
      name: "🎲 Jugador de Mesa", 
      color: "#71368A", // Púrpura tabletop
      position: 29,
      permissions: []
    },
    { 
      name: "🎸 Músico", 
      color: "#1DB954", // Verde Spotify
      position: 28,
      permissions: [
        PermissionFlagsBits.UseExternalEmojis
      ]
    },
    { 
      name: "📚 Lector Ávido", 
      color: "#8B4513", // Café libro
      position: 27,
      permissions: []
    },
    { 
      name: "🎬 Cinéfilo", 
      color: "#FFD700", // Dorado película
      position: 26,
      permissions: []
    },
    { 
      name: "🍜 Comensal", 
      color: "#FF6347", // Rojo tomate
      position: 25,
      permissions: []
    },
    { 
      name: "✈️ Viajero", 
      color: "#87CEEB", // Azul cielo
      position: 24,
      permissions: []
    }
  ],
  
  castigo: [
    { 
      name: "En Observación", 
      color: "#CC9900", 
      position: 10,
      permissions: [] // Sin permisos especiales, restricciones aplicadas por canal
    },
    { 
      name: "Muteo de Voz", 
      color: "#5C4033", 
      position: 9,
      permissions: [] // Restricciones de voz aplicadas manualmente
    },
    { 
      name: "Muteado", 
      color: "#2C2C2C", 
      position: 8,
      permissions: [] // Timeout/mute aplicado por ModerateMembers
    },
    { 
      name: "Aislado / Cuarentena", 
      color: "#808080", 
      position: 7,
      permissions: [] // Canal específico de cuarentena
    }
  ]
};

export const data = new SlashCommandBuilder()
  .setName("setupdegeneracyden")
  .setDescription("⚠️ Setup provisional de roles para Degeneracy Den")
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addSubcommand(sub =>
    sub
      .setName("create")
      .setDescription("Crear todos los roles de la jerarquía")
      .addStringOption(opt =>
        opt
          .setName("category")
          .setDescription("Categoría de roles a crear")
          .setRequired(false)
          .addChoices(
            { name: "🛡️ Moderadores (7 roles)", value: "moderadores" },
            { name: "👑 VIP (6 roles)", value: "vip" },
            { name: "⚧️ Género (4 roles)", value: "genero" },
            { name: "🎨 Contribución (3 roles)", value: "contribucion" },
            { name: "⭐ Niveles (20 roles)", value: "niveles" },
            { name: "🏳️‍🌈 LGBT+ (20 roles)", value: "lgbt" },
            { name: "✨ Especiales (20 roles)", value: "especiales" },
            { name: "⛔ Castigo (4 roles)", value: "castigo" },
            { name: "🌐 TODOS (84 roles)", value: "all" }
          )
      )
  )
  .addSubcommand(sub =>
    sub
      .setName("preview")
      .setDescription("Ver preview de los roles sin crearlos")
      .addStringOption(opt =>
        opt
          .setName("category")
          .setDescription("Categoría a previsualizar")
          .setRequired(true)
          .addChoices(
            { name: "🛡️ Moderadores", value: "moderadores" },
            { name: "👑 VIP", value: "vip" },
            { name: "⚧️ Género", value: "genero" },
            { name: "🎨 Contribución", value: "contribucion" },
            { name: "⭐ Niveles", value: "niveles" },
            { name: "🏳️‍🌈 LGBT+", value: "lgbt" },
            { name: "✨ Especiales", value: "especiales" },
            { name: "⛔ Castigo", value: "castigo" }
          )
      )
  )
  .addSubcommand(sub =>
    sub
      .setName("cleanup")
      .setDescription("⚠️ ELIMINAR todos los roles creados por este comando")
  );

export async function execute(context) {
  // ✅ VALIDACIÓN: Solo permitir en el servidor autorizado
  if (context.guild.id !== AUTHORIZED_GUILD_ID) {
    return context.reply({
      content: "❌ Este comando solo está disponible en **Degeneracy Den**.",
      ephemeral: true
    });
  }

  // ✅ CORRECCIÓN: Acceder al subcomando desde la source directamente
  const subcommand = context.source.options.getSubcommand();

  try {
    switch (subcommand) {
      case "create":
        await handleCreate(context);
        break;
      
      case "preview":
        await handlePreview(context);
        break;
      
      case "cleanup":
        await handleCleanup(context);
        break;
        
      default:
        await handleCreate(context);
    }
  } catch (error) {
    logger.error("Error en setupdegeneracyden", error);
    await context.reply({
      content: `❌ Error: ${error.message}`,
      ephemeral: true
    });
  }
}

/**
 * Crear roles CON PERMISOS
 */
async function handleCreate(context) {
  await context.deferReply({ ephemeral: true });

  const categoryOption = context.source.options.getString("category") || "all";
  
  // Determinar qué categorías crear
  const categoriesToCreate = categoryOption === "all" 
    ? Object.keys(ROLE_STRUCTURE)
    : [categoryOption];

  let totalRoles = 0;
  let created = 0;
  let skipped = 0;
  let errors = 0;

  // Contar total
  for (const category of categoriesToCreate) {
    totalRoles += ROLE_STRUCTURE[category].length;
  }

  await context.editReply({
    content: `🔄 Creando ${totalRoles} roles con sus permisos específicos...\n\n*Esto puede tomar varios minutos debido a rate limits de Discord.*`
  });

  const results = {
    moderadores: { created: [], skipped: [], errors: [] },
    vip: { created: [], skipped: [], errors: [] },
    genero: { created: [], skipped: [], errors: [] },
    contribucion: { created: [], skipped: [], errors: [] },
    niveles: { created: [], skipped: [], errors: [] },
    lgbt: { created: [], skipped: [], errors: [] },
    especiales: { created: [], skipped: [], errors: [] },
    castigo: { created: [], skipped: [], errors: [] }
  };

  // Crear roles por categoría
  for (const category of categoriesToCreate) {
    logger.info(`Creando categoría: ${category}`);
    
    for (const roleData of ROLE_STRUCTURE[category]) {
      try {
        // Verificar si ya existe
        const existing = context.guild.roles.cache.find(r => r.name === roleData.name);
        
        if (existing) {
          logger.debug(`Rol ya existe: ${roleData.name}`);
          results[category].skipped.push(roleData.name);
          skipped++;
          continue;
        }

        // ✅ CRÍTICO: Crear rol CON PERMISOS
        const roleConfig = {
          name: roleData.name,
          color: roleData.color,
          position: roleData.position,
          mentionable: false,
          reason: "Setup automático de jerarquía - Degeneracy Den"
        };

        // Solo agregar permissions si existen (evitar array vacío)
        if (roleData.permissions && roleData.permissions.length > 0) {
          roleConfig.permissions = roleData.permissions;
        }

        const role = await context.guild.roles.create(roleConfig);

        logger.info(
          `✅ Rol creado: ${roleData.name} ` +
          `(Permisos: ${roleData.permissions?.length || 0})`
        );
        
        results[category].created.push(roleData.name);
        created++;

        // Rate limit protection (Discord permite ~50 roles por minuto)
        await sleep(1200); // 1.2 segundos entre cada rol

      } catch (error) {
        logger.error(`Error creando rol ${roleData.name}:`, error);
        results[category].errors.push(`${roleData.name}: ${error.message}`);
        errors++;
      }
    }
  }

  // Generar reporte detallado
  let report = `✅ **Proceso Completado**\n\n`;
  report += `📊 **Resumen:**\n`;
  report += `• Creados: **${created}** (con permisos configurados)\n`;
  report += `• Omitidos (ya existían): **${skipped}**\n`;
  report += `• Errores: **${errors}**\n\n`;

  // Detalles por categoría
  for (const [category, data] of Object.entries(results)) {
    if (categoriesToCreate.includes(category) || categoryOption === "all") {
      const emoji = {
        moderadores: "🛡️",
        vip: "👑",
        genero: "⚧️",
        contribucion: "🎨",
        niveles: "⭐",
        lgbt: "🏳️‍🌈",
        especiales: "✨",
        castigo: "⛔"
      }[category];

      const permissionInfo = getPermissionSummary(category);

      report += `${emoji} **${category.toUpperCase()}:** ${permissionInfo}\n`;
      
      if (data.created.length > 0) {
        report += `✅ Creados (${data.created.length}): ${data.created.slice(0, 3).join(", ")}${data.created.length > 3 ? "..." : ""}\n`;
      }
      
      if (data.skipped.length > 0) {
        report += `⏭️ Omitidos (${data.skipped.length})\n`;
      }
      
      if (data.errors.length > 0) {
        report += `❌ Errores (${data.errors.length})\n`;
      }
      
      report += `\n`;
    }
  }

  report += `\n💡 **Nota:** Los roles de moderadores tienen permisos administrativos activos.`;

  await context.editReply({ content: report });
}

/**
 * Obtener resumen de permisos por categoría
 */
function getPermissionSummary(category) {
  const summaries = {
    moderadores: "Permisos de moderación activos",
    vip: "Permisos sociales especiales",
    genero: "Rol de identidad de género",
    contribucion: "Permisos de contenido",
    niveles: "Roles cosméticos (sin permisos)",
    lgbt: "Permisos sociales básicos",
    especiales: "Roles de eventos y comunidad",
    castigo: "Roles restrictivos (sin permisos)"
  };
  
  return summaries[category] || "";
}

/**
 * Previsualizar roles CON INFO DE PERMISOS
 */
async function handlePreview(context) {
  const category = context.source.options.getString("category");
  const roles = ROLE_STRUCTURE[category];

  if (!roles) {
    return context.reply({
      content: "❌ Categoría inválida",
      ephemeral: true
    });
  }

  const emoji = {
    moderadores: "🛡️",
    vip: "👑",
    genero: "⚧️",
    contribucion: "🎨",
    niveles: "⭐",
    lgbt: "🏳️‍🌈",
    especiales: "✨",
    castigo: "⛔"
  }[category];

  let preview = `${emoji} **Preview: ${category.toUpperCase()}** (${roles.length} roles)\n\n`;

  for (const role of roles) {
    const colorBox = `\`${role.color}\``;
    const existing = context.guild.roles.cache.find(r => r.name === role.name);
    const status = existing ? "✅" : "➕";
    const permCount = role.permissions?.length || 0;
    const permInfo = permCount > 0 ? ` (${permCount} permisos)` : " (sin permisos)";
    
    preview += `${status} **${role.name}** ${colorBox}${permInfo}\n`;
  }

  preview += `\n💡 Usa \`/setupdegeneracyden create category:${category}\` para crear estos roles.`;

  await context.reply({
    content: preview,
    ephemeral: true
  });
}

/**
 * Limpiar roles creados
 */
async function handleCleanup(context) {
  await context.deferReply({ ephemeral: true });

  await context.editReply({
    content: "⚠️ **ADVERTENCIA**\n\nEsta acción eliminará TODOS los roles creados por este setup.\n\n*Procesando en 5 segundos...*"
  });

  await sleep(5000);

  let deleted = 0;
  let errors = 0;

  // Obtener todos los nombres de roles del setup
  const allRoleNames = new Set();
  for (const category of Object.values(ROLE_STRUCTURE)) {
    for (const role of category) {
      allRoleNames.add(role.name);
    }
  }

  for (const roleName of allRoleNames) {
    const role = context.guild.roles.cache.find(r => r.name === roleName);
    
    if (role) {
      try {
        await role.delete("Cleanup de setup provisional");
        deleted++;
        logger.info(`🗑️ Rol eliminado: ${roleName}`);
        await sleep(1000); // Rate limit protection
      } catch (error) {
        logger.error(`Error eliminando rol ${roleName}:`, error);
        errors++;
      }
    }
  }

  await context.editReply({
    content: `✅ **Cleanup Completado**\n\n• Eliminados: **${deleted}**\n• Errores: **${errors}**`
  });
}

/**
 * Utilidad: Sleep
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}