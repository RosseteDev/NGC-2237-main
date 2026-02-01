import { Events, AttachmentBuilder } from "discord.js";
import { getTranslation } from "../../localization/useLang.js";
import { generateWelcomeImage } from "../../utils/welcomeImage.js";

export default client => {
  client.on(Events.GuildMemberAdd, async member => {
    try {
      console.log(`[DEBUG] GuildMemberAdd detectado: ${member.user.tag} (${member.id}) en ${member.guild?.name || 'unknown guild'}`);
      const db = client.db;
      const guildId = member.guild.id;
      // Buscar canal configurado en la base de datos
      let channelId = db.getWelcomeChannel(guildId);
      if (channelId instanceof Promise) channelId = await channelId;
      if (!channelId) {
        console.error(`[ERROR] No hay canal de bienvenida configurado para guild ${guildId}`);
        return;
      }
      const welcomeChannel = member.guild.channels.cache.get(channelId);
      if (!welcomeChannel || !welcomeChannel.isTextBased()) {
        console.error(`[ERROR] Canal de bienvenida no encontrado o no es de texto: ${channelId}`);
        return;
      }

      // Obtener idioma y traducción
      let lang = db.getGuildLang(guildId);
      if (lang instanceof Promise) lang = await lang;
      const welcomeMsg = getTranslation(lang || "en", "utils.welcome.message");

      // Generar imagen dinámica
      const imageBuffer = await generateWelcomeImage(
        member.user.username,
        member.user.displayAvatarURL({ extension: 'png', size: 256 }),
        welcomeMsg.replace("{user}", member.user.username).replace("{server}", member.guild.name)
      );
      const attachment = new AttachmentBuilder(imageBuffer, { name: 'welcome.png' });

      await welcomeChannel.send({
        content: `<@${member.id}>`,
        files: [attachment]
      });
      console.log(`[DEBUG] Imagen de bienvenida enviada a ${welcomeChannel.name} para ${member.user.tag}`);
    } catch (err) {
      console.error(`[ERROR] Fallo en GuildMemberAdd:`, err);
    }
  });
};
