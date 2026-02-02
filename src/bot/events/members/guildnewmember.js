import { Events, AttachmentBuilder } from "discord.js";
import { detectLanguage, createTranslator } from "../../utils/TranslatorHelper.js";
import { generateWelcomeImage } from "../../utils/welcomeImage.js";
import { createLogger } from "../../utils/Logger.js";

const logger = createLogger("event:welcome");

export default client => {
  client.on(Events.GuildMemberAdd, async member => {
    try {
      const db = client.db;
      const guildId = member.guild.id;

      // Resolve welcome channel from DB
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

      // Build a minimal context so detectLanguage + createTranslator work
      // detectLanguage only needs: { guild: { id }, locale }
      const eventContext = {
        guild: member.guild,
        locale: member.guild.preferredLocale || "en-US",
        user: member.user
      };

      const locale = await detectLanguage(eventContext);

      // createTranslator loads: common/*.json + commands/{category}/{name}.json
      // Welcome message lives at commands/utils/welcome.json
      const t = await createTranslator(
        { category: "utils", name: "welcome" },
        eventContext
      );

      const welcomeMsg = t("message", {
        user: member.user.username,
        server: member.guild.name
      });

      // Generate welcome image
      const imageBuffer = await generateWelcomeImage(
        member.user.username,
        member.user.displayAvatarURL({ extension: "png", size: 256 }),
        welcomeMsg
      );

      const attachment = new AttachmentBuilder(imageBuffer, { name: "welcome.png" });

      await welcomeChannel.send({
        content: `<@${member.id}>`,
        files: [attachment]
      });

      logger.info(`Welcome image sent to ${welcomeChannel.name} for ${member.user.tag}`);

    } catch (err) {
      logger.error("GuildMemberAdd handler failed", err);
    }
  });
};