import { SlashCommandBuilder, PermissionFlagsBits } from "discord.js";
import { createTranslator } from "../../localization/TranslatorHelper.js";

export const data = new SlashCommandBuilder()
  .setName("setwelcome")
  .setDescription("Configura el canal de bienvenida para este servidor.")
  .setDMPermission(false)
  .addChannelOption(option =>
    option.setName("canal")
      .setDescription("Canal donde se enviarán las bienvenidas")
      .addChannelTypes(0) // GuildText
      .setRequired(true)
  )
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

export async function execute(interaction) {
  if (!interaction.guild) {
    return interaction.reply({
      content: "❌ Este comando solo puede usarse en servidores.",
      flags: 64
    });
  }

  const channel = interaction.options.getChannel("canal");
  const guildId = interaction.guild.id;
  const db = interaction.client.db;

  const t = await createTranslator(
    { category: "settings", name: "welcome" },
    interaction
  );

  if (!channel) {
    const errorMsg = t("error_no_channel", {});
    return interaction.reply({
      content: errorMsg,
      flags: 64
    });
  }

  db.setWelcomeChannel(guildId, channel.id);

  const msg = t("set", { channel: `<#${channel.id}>` });
  await interaction.reply({
    content: msg,
    flags: 64
  });
}

