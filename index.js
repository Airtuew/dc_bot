const {
  Client,
  GatewayIntentBits,
  Partials,
  Events,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder
} = require("discord.js");
const express = require("express");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers
  ],
  partials: [Partials.Channel]
});

/* ===== Express（Render 保活） ===== */
const app = express();
app.get("/", (req, res) => res.send("Bot is running"));
app.listen(process.env.PORT || 3000, () =>
  console.log("✅ Express server running")
);

/* ===== 設定資料 ===== */
let config = {
  adminRoleId: null,
  autoRoleId: null,

  // 多頻道歡迎（channelId: message）
  welcomeChannels: {},

  announcementChannels: {}
};

/* ===== 權限判斷 ===== */
function hasPermission(member) {
  if (!config.adminRoleId)
    return member.permissions.has("Administrator");
  return member.roles.cache.has(config.adminRoleId);
}

/* ===== 產生 Config 面板 ===== */
function getConfigComponents(guild) {
  const roleOptions = guild.roles.cache
    .filter(r => !r.managed && r.id !== guild.id)
    .map(r => ({ label: r.name, value: r.id }))
    .slice(0, 25);

  const channelOptions = guild.channels.cache
    .filter(c => c.isTextBased())
    .map(c => ({ label: `#${c.name}`, value: c.id }))
    .slice(0, 25);

  return [
    new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId("set_admin_role")
        .setPlaceholder("設定管理身份組")
        .addOptions(roleOptions)
    ),
    new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId("set_auto_role")
        .setPlaceholder("新成員自動身份組")
        .addOptions(roleOptions)
    ),
    new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId("add_welcome_channel")
        .setPlaceholder("新增歡迎訊息頻道")
        .addOptions(channelOptions)
    )
  ];
}

/* ===== Slash 指令 ===== */
client.on(Events.InteractionCreate, async interaction => {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === "config") {
    if (!hasPermission(interaction.member))
      return interaction.reply({
        content: "❌ 你沒有權限",
        ephemeral: true
      });

    return interaction.reply({
      content: "🔧 伺服器設定面板",
      components: getConfigComponents(interaction.guild),
      ephemeral: true
    });
  }

  if (interaction.commandName === "announce") {
    if (!hasPermission(interaction.member))
      return interaction.reply({ content: "❌ 你沒有權限", ephemeral: true });

    const guildOptions = client.guilds.cache.map(g => ({
      label: g.name,
      value: g.id
    })).slice(0, 25);

    return interaction.reply({
      content: "選擇公告伺服器",
      components: [
        new ActionRowBuilder().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId("announce_guild")
            .setPlaceholder("選擇伺服器")
            .addOptions(guildOptions)
        )
      ],
      ephemeral: true
    });
  }
});

/* ===== 下拉 / Modal ===== */
client.on(Events.InteractionCreate, async interaction => {
  if (interaction.isStringSelectMenu()) {
    if (interaction.customId === "set_admin_role") {
      config.adminRoleId = interaction.values[0];
      return interaction.reply({ content: "✅ 已設定管理身份組", ephemeral: true });
    }

    if (interaction.customId === "set_auto_role") {
      config.autoRoleId = interaction.values[0];
      return interaction.reply({ content: "✅ 已設定新成員身份組", ephemeral: true });
    }

    if (interaction.customId === "add_welcome_channel") {
      const channelId = interaction.values[0];

      const modal = new ModalBuilder()
        .setCustomId(`welcome_modal_${channelId}`)
        .setTitle("設定歡迎訊息");

      modal.addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId("text")
            .setLabel("歡迎訊息（可用 {user} / {server}）")
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(true)
            .setValue("🎉 歡迎 {user} 加入 {server}！")
        )
      );

      return interaction.showModal(modal);
    }
  }

  if (interaction.isModalSubmit()
   && interaction.customId.startsWith("welcome_modal_")) {

    const channelId = interaction.customId.replace("welcome_modal_", "");
    const text = interaction.fields.getTextInputValue("text");

    config.welcomeChannels[channelId] = text;

    return interaction.reply({
      content: "✅ 已設定該頻道的歡迎訊息",
      ephemeral: true
    });
  }
});

/* ===== 新成員加入 ===== */
client.on(Events.GuildMemberAdd, async member => {
  if (config.autoRoleId) {
    const role = member.guild.roles.cache.get(config.autoRoleId);
    if (role) await member.roles.add(role).catch(() => {});
  }

  for (const [channelId, text] of Object.entries(config.welcomeChannels)) {
    const channel = member.guild.channels.cache.get(channelId);
    if (!channel) continue;

    const embed = new EmbedBuilder()
      .setColor("Random")
      .setTitle("🎉 歡迎加入")
      .setDescription(
        text
          .replace(/{user}/g, `<@${member.id}>`)
          .replace(/{server}/g, member.guild.name)
      )
      .setTimestamp();

    await channel.send({
      content: `<@${member.id}>`,
      embeds: [embed]
    }).catch(() => {});
  }
});

/* ===== Bot Ready ===== */
client.once(Events.ClientReady, async () => {
  await client.application.commands.set([
    { name: "config", description: "伺服器設定" },
    { name: "announce", description: "發布公告" }
  ]);
  console.log(`✅ Bot 已啟動：${client.user.tag}`);
});

client.login(process.env.DISCORD_TOKEN);