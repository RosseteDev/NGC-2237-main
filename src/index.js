// src/index.js
import { Client, Collection, GatewayIntentBits } from "discord.js";
import "dotenv/config";
import path from "path";
import { loadCommands } from "./utils/loadCommands.js";
import LavalinkManager from "./music/LavalinkManager.js";
import { handlePrefixCommand } from "./handlers/prefixHandler.js";
import CommandHandler from "./utils/CommandHandler.js";
import { createLogger } from "./utils/Logger.js";
import { db } from "./database/ResilientDatabaseManager.js";

const logger = createLogger("main");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

// ✅ IMPORTANTE: Agregar db al cliente
client.db = db;

client.commands = new Collection();
client.commandHandler = new CommandHandler(client);
client.lavalink = new LavalinkManager(client);

// Cargar comandos
logger.info("Cargando comandos...");
await loadCommands(path.resolve("src/commands"), client.commands);
logger.info(`✅ ${client.commands.size} comandos cargados`);

// Inicializar base de datos
logger.info("Inicializando base de datos...");
try {
  await db.init();
} catch (error) {
  logger.warn("⚠️ Base de datos no disponible, continuando sin DB");
  db.available = false;
}

// Event handlers
import("./events/ready.js").then(m => m.default(client));
import("./events/interactionCreate.js").then(m => m.default(client));

// Prefix commands
client.on("messageCreate", async (message) => {
  await handlePrefixCommand(message, client);
});

// ✅ GRACEFUL SHUTDOWN
async function shutdown(signal) {
  logger.info(`\n🛑 Señal recibida: ${signal}`);
  logger.info("Cerrando servicios...");
  
  try {
    // Cerrar base de datos
    await db.shutdown();
    logger.info("✅ Base de datos cerrada");
    
    // Destruir cliente
    client.destroy();
    logger.info("✅ Cliente destruido");
    
    logger.info("👋 Apagado completo");
    process.exit(0);
  } catch (error) {
    logger.error("❌ Error durante apagado:", error);
    process.exit(1);
  }
}

// Capturar señales de terminación
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

// Manejo de errores globales
process.on("unhandledRejection", (error) => {
  logger.error("Unhandled Promise Rejection", error);
});

process.on("uncaughtException", (error) => {
  logger.error("Uncaught Exception", error);
  shutdown("uncaughtException");
});

logger.info("🚀 Iniciando bot...");
client.login(process.env.DISCORD_TOKEN);

const GUILD_ID = "1455779364720607344";

setTimeout(async () => {
  console.log("🔍 Testing prefix...");
  
  const prefix = await db.getGuildPrefix(GUILD_ID);
  console.log("DB retorna:", prefix);
  
  const sqlite = db.local.stmts.getGuildPrefix.get(GUILD_ID);
  console.log("SQLite tiene:", sqlite);
  
  console.log("Modo:", db.mode);
}, 5000); // Espera 5s después de iniciar