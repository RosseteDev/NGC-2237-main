// test/welcome-image-tester.js
import { Client, GatewayIntentBits, AttachmentBuilder } from "discord.js";
import { generateWelcomeImage } from "../src/bot/utils/welcomeImage.js";
import fs from "fs";
import path from "path";

const TEST_CONFIG = {
  // Cambia estos valores para probar diferentes escenarios
  username: "SuperLongUsername123",
  avatarUrl: "https://cdn.discordapp.com/embed/avatars/0.png",
  welcomeText: "¡Bienvenido a nuestro servidor increíble!",
  guildName: "Test Server",
  
  // Salida
  outputDir: "./test/output",
  outputFilename: "welcome-test.png"
};

/**
 * Genera una imagen de prueba y la guarda localmente
 */
async function testLocal() {
  console.log("🧪 Iniciando prueba local de imagen de bienvenida...\n");
  
  try {
    const imageBuffer = await generateWelcomeImage(
      TEST_CONFIG.username,
      TEST_CONFIG.avatarUrl,
      TEST_CONFIG.welcomeText.replace("{user}", TEST_CONFIG.username)
        .replace("{server}", TEST_CONFIG.guildName)
    );

    // Crear directorio si no existe
    if (!fs.existsSync(TEST_CONFIG.outputDir)) {
      fs.mkdirSync(TEST_CONFIG.outputDir, { recursive: true });
    }

    const outputPath = path.join(TEST_CONFIG.outputDir, TEST_CONFIG.outputFilename);
    fs.writeFileSync(outputPath, imageBuffer);

    console.log(`✅ Imagen generada exitosamente`);
    console.log(`📁 Guardada en: ${outputPath}`);
    console.log(`📏 Tamaño: ${(imageBuffer.length / 1024).toFixed(2)} KB\n`);
    console.log(`Abre el archivo para verificar el diseño.`);
    
  } catch (error) {
    console.error("❌ Error generando imagen:", error);
    process.exit(1);
  }
}

/**
 * Bot de prueba en Discord - envía imagen a un canal específico
 */
async function testDiscord() {
  if (!process.env.DISCORD_TOKEN || !process.env.TEST_CHANNEL_ID) {
    console.error("❌ Faltan variables de entorno:");
    console.error("   DISCORD_TOKEN - Token del bot");
    console.error("   TEST_CHANNEL_ID - ID del canal de prueba");
    process.exit(1);
  }

  console.log("🤖 Iniciando bot de prueba...\n");

  const client = new Client({
    intents: [GatewayIntentBits.Guilds]
  });

  client.once("ready", async () => {
    console.log(`✅ Bot conectado como ${client.user.tag}`);
    
    try {
      const channel = await client.channels.fetch(process.env.TEST_CHANNEL_ID);
      
      if (!channel?.isTextBased()) {
        console.error("❌ El canal no es de texto");
        process.exit(1);
      }

      console.log(`📤 Generando y enviando imagen a #${channel.name}...\n`);

      const imageBuffer = await generateWelcomeImage(
        TEST_CONFIG.username,
        TEST_CONFIG.avatarUrl,
        TEST_CONFIG.welcomeText.replace("{user}", TEST_CONFIG.username)
          .replace("{server}", TEST_CONFIG.guildName)
      );

      const attachment = new AttachmentBuilder(imageBuffer, { name: "welcome-test.png" });

      await channel.send({
        content: `**🧪 Prueba de imagen de bienvenida**\n` +
                 `Usuario: \`${TEST_CONFIG.username}\`\n` +
                 `Texto: \`${TEST_CONFIG.welcomeText}\``,
        files: [attachment]
      });

      console.log("✅ Imagen enviada correctamente");
      console.log("🔄 Modifica TEST_CONFIG en el archivo para probar diferentes escenarios\n");
      
      process.exit(0);
      
    } catch (error) {
      console.error("❌ Error:", error);
      process.exit(1);
    }
  });

  client.login(process.env.DISCORD_TOKEN);
}

/**
 * Comando interactivo para ajustar coordenadas
 */
async function interactiveTest() {
  const readline = require("readline").createInterface({
    input: process.stdin,
    output: process.stdout
  });

  const prompt = (question) => new Promise(resolve => {
    readline.question(question, resolve);
  });

  console.log("🎨 Modo interactivo - Ajuste de coordenadas\n");
  
  const scenarios = [
    { name: "Corto", username: "John", text: "Welcome!" },
    { name: "Medio", username: "JohnDoe123", text: "¡Bienvenido al servidor!" },
    { name: "Largo", username: "SuperLongUsername", text: "¡Bienvenido a nuestro increíble servidor de Discord!" },
    { name: "Emoji", username: "User🎮", text: "Welcome 🎉🎊" }
  ];

  console.log("Escenarios disponibles:");
  scenarios.forEach((s, i) => {
    console.log(`${i + 1}. ${s.name}: "${s.username}" - "${s.text}"`);
  });
  console.log("0. Todos los escenarios\n");

  const choice = await prompt("Selecciona un escenario (0-4): ");
  
  const selected = choice === "0" 
    ? scenarios 
    : [scenarios[parseInt(choice) - 1]];

  if (!selected[0]) {
    console.error("❌ Opción inválida");
    process.exit(1);
  }

  if (!fs.existsSync(TEST_CONFIG.outputDir)) {
    fs.mkdirSync(TEST_CONFIG.outputDir, { recursive: true });
  }

  for (const scenario of selected) {
    console.log(`\n📸 Generando: ${scenario.name}...`);
    
    const imageBuffer = await generateWelcomeImage(
      scenario.username,
      TEST_CONFIG.avatarUrl,
      scenario.text
    );

    const filename = `welcome-${scenario.name.toLowerCase()}.png`;
    const outputPath = path.join(TEST_CONFIG.outputDir, filename);
    fs.writeFileSync(outputPath, imageBuffer);

    console.log(`   ✅ ${filename} (${(imageBuffer.length / 1024).toFixed(2)} KB)`);
  }

  console.log(`\n✅ Todas las imágenes generadas en: ${TEST_CONFIG.outputDir}`);
  readline.close();
}

// CLI
const mode = process.argv[2];

switch (mode) {
  case "local":
    testLocal();
    break;
  case "discord":
    testDiscord();
    break;
  case "interactive":
    interactiveTest();
    break;
  default:
    console.log(`

`);
    process.exit(0);
}