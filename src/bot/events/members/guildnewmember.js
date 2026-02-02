// src/bot/events/members/guildnewmember.js

import { Events, AttachmentBuilder } from "discord.js";
import { detectLanguage, createTranslator } from "../../localization/TranslatorHelper.js";
import { generateWelcomeImage } from "../../utils/welcomeImage.js";
import { createLogger } from "../../utils/Logger.js";

const logger = createLogger("event:welcome");

export default client => {
  client.on(Events.GuildMemberAdd, async member => {
    try {
      const db = client.db;
      const guildId = member.guild.id;

      let channelId = db.getWelcomeChannel(guildId);
      if (channelId instanceof Promise) channelId = await channelId;

      if (!channelId) {
        logger.debug(`No welcome channel configured for guild ${guildId}`);
        return;
      }

      const welcomeChannel = member.guild.channels.cache.get(channelId);
      if (!welcomeChannel || !welcomeChannel.isTextBased()) {
        logger.warn(`Welcome channel ${channelId} not found or not text-based in guild ${guildId}`);
        return;
      }

      const eventContext = {
        guild: member.guild,
        locale: member.guild.preferredLocale || "en-US",
        user: member.user
      };

      const locale = await detectLanguage(eventContext);

      const t = await createTranslator(
        { category: "utils", name: "welcome" },
        eventContext
      );

      const title = t("title");

      const welcomeMsg = t("message", {
        user: member.user.username,
        server: member.guild.name
      });

      logger.debug(`Welcome message (${locale}): title="${title}", msg="${welcomeMsg}"`);

      const imageBuffer = await generateWelcomeImage(
        member.user.username,
        member.user.displayAvatarURL({ extension: "png", size: 256 }),
        welcomeMsg,  
        title        
      );

      const attachment = new AttachmentBuilder(imageBuffer, { name: "welcome.png" });

      await welcomeChannel.send({
        content: `<@${member.id}>`,
        files: [attachment]
      });

      logger.info(`Welcome image sent to ${welcomeChannel.name} for ${member.user.tag} (locale: ${locale})`);

    } catch (err) {
      logger.error("GuildMemberAdd handler failed", err);
    }
  });
};