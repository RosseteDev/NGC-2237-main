// src/bot/commands/admin/setupdegeneracyden.js
// ⚠️ COMANDO PROVISIONAL - Solo para el servidor específico

import { SlashCommandBuilder, PermissionFlagsBits } from "discord.js";
import { createLogger } from "../../utils/Logger.js";

const logger = createLogger("command:setup-degeneracy");

// ✅ ID del servidor autorizado (Degeneracy Den)
const AUTHORIZED_GUILD_ID = "1467020037784211520";

// Estructura completa de roles
const ROLE_STRUCTURE = {
  moderadores: [
    { name: "Fundador / Dueño", color: "#000000", position: 100 },
    { name: "Co-Fundador / Gestor", color: "#370617", position: 99 },
    { name: "Consejero de la Den", color: "#5E60CE", position: 98 },
    { name: "Inquisidor", color: "#A61E4D", position: 97 },
    { name: "Defensor de la Den", color: "#E63946", position: 96 },
    { name: "Guardián Nocturno", color: "#FF8C42", position: 95 },
    { name: "Alma en Prueba", color: "#FF6B6B", position: 94 }
  ],
  
  vip: [
    { name: "Noble de la Corte", color: "#E0115F", position: 93 },
    { name: "Titular de un Lugar en la Den", color: "#FFC300", position: 92 },
    { name: "Guardián del Santuario", color: "#BF00FF", position: 91 },
    { name: "Aliado de la Den", color: "#E6B0AA", position: 90 },
    { name: "Mecenas de la Decadencia", color: "#39FF14", position: 89 },
    { name: "Patrón de la Oscuridad", color: "#00D9FF", position: 88 }
  ],
  
  contribucion: [
    { name: "Guía de Novatos", color: "#BFFF00", position: 87 },
    { name: "Artista de la Den", color: "#E6E6FA", position: 86 },
    { name: "Meme Lord", color: "#FFDB58", position: 85 }
  ],
  
  niveles: [
    { name: "Deidad del Anime", color: "#FF10F0", position: 84 },
    { name: "El Elegido", color: "#B3E5FC", position: 83 },
    { name: "Mito Viviente", color: "#F5F5F5", position: 82 },
    { name: "Leyenda de la Den", color: "#FFA500", position: 81 },
    { name: "Sabio de los Foros", color: "#FFD700", position: 80 },
    { name: "Anciano de Akihabara", color: "#D4AF37", position: 79 },
    { name: "Veterano de la Oscuridad", color: "#E67E22", position: 78 },
    { name: "Erudito del Manga", color: "#FFB347", position: 77 },
    { name: "Maestro del Shipping", color: "#D6A2E8", position: 76 },
    { name: "Arquitecto de Teorías", color: "#C77DFF", position: 75 },
    { name: "Guardián de los Memes", color: "#E91E63", position: 74 },
    { name: "Vocal de la Comunidad", color: "#9B59B6", position: 73 },
    { name: "Experto en Openings", color: "#4ECDC4", position: 72 },
    { name: "Conocedor de Tropos", color: "#5AA8C7", position: 71 },
    { name: "Coleccionista de Waifus", color: "#6FCF97", position: 70 },
    { name: "Buscador de Tesoros", color: "#4A7C59", position: 69 },
    { name: "Residente de la Guarida", color: "#3A5A8A", position: 68 },
    { name: "Habitante Nocturno", color: "#2A2D3A", position: 67 },
    { name: "Explorador de la Guarida", color: "#7A7A7A", position: 66 },
    { name: "Novato Degenerado", color: "#4A4A4A", position: 65 }
  ],
  
  castigo: [
    { name: "En Observación", color: "#CC9900", position: 10 },
    { name: "Muteo de Voz", color: "#5C4033", position: 9 },
    { name: "Muteado", color: "#2C2C2C", position: 8 },
    { name: "Aislado / Cuarentena", color: "#808080", position: 7 }
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
            { name: "🎨 Contribución (3 roles)", value: "contribucion" },
            { name: "⭐ Niveles (20 roles)", value: "niveles" },
            { name: "⛔ Castigo (4 roles)", value: "castigo" },
            { name: "🌐 TODOS (40 roles)", value: "all" }
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
            { name: "🎨 Contribución", value: "contribucion" },
            { name: "⭐ Niveles", value: "niveles" },
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
 * Crear roles
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
    content: `🔄 Creando ${totalRoles} roles...\n\n*Esto puede tomar varios minutos debido a rate limits de Discord.*`
  });

  const results = {
    moderadores: { created: [], skipped: [], errors: [] },
    vip: { created: [], skipped: [], errors: [] },
    contribucion: { created: [], skipped: [], errors: [] },
    niveles: { created: [], skipped: [], errors: [] },
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

        // Crear rol
        const role = await context.guild.roles.create({
          name: roleData.name,
          color: roleData.color,
          position: roleData.position,
          mentionable: false,
          reason: "Setup automático de jerarquía - Degeneracy Den"
        });

        logger.info(`✅ Rol creado: ${roleData.name}`);
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

  // Generar reporte
  let report = `✅ **Proceso Completado**\n\n`;
  report += `📊 **Resumen:**\n`;
  report += `• Creados: **${created}**\n`;
  report += `• Omitidos (ya existían): **${skipped}**\n`;
  report += `• Errores: **${errors}**\n\n`;

  // Detalles por categoría
  for (const [category, data] of Object.entries(results)) {
    if (categoriesToCreate.includes(category) || categoryOption === "all") {
      const emoji = {
        moderadores: "🛡️",
        vip: "👑",
        contribucion: "🎨",
        niveles: "⭐",
        castigo: "⛔"
      }[category];

      report += `${emoji} **${category.toUpperCase()}:**\n`;
      
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

  await context.editReply({ content: report });
}

/**
 * Previsualizar roles
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
    contribucion: "🎨",
    niveles: "⭐",
    castigo: "⛔"
  }[category];

  let preview = `${emoji} **Preview: ${category.toUpperCase()}** (${roles.length} roles)\n\n`;

  for (const role of roles) {
    const colorBox = `\`${role.color}\``;
    const existing = context.guild.roles.cache.find(r => r.name === role.name);
    const status = existing ? "✅" : "➕";
    
    preview += `${status} **${role.name}** ${colorBox}\n`;
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