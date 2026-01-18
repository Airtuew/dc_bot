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
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
  partials: [Partials.Channel]
});

/* ===== Express 保活 ===== */
const app = express();
app.get("/", (req, res) => res.send("Bot is running"));
app.listen(process.env.PORT || 3000, () =>
  console.log("✅ Express server running")
);

/* ===== 設定 ===== */
let config = {
  adminRoleId: null,
  autoRoleId: null,
  welcomeChannels: {}, // channelId: 歡迎訊息
  announcementChannels: {}, // guildId: channelId
  buttonPanels: {} // channelId: [{ label, addRole, removeRole, response }]
};

/* ===== 權限判斷 ===== */
function hasPermission(member) {
  if (!config.adminRoleId)
    return member.permissions.has("Administrator");
  return member.roles.cache.has(config.adminRoleId);
}

/* ===== 工具函數: 產生 Config 面板 ===== */
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

/* ===== 指令監聽 (Slash + ! 指令) ===== */
client.on(Events.MessageCreate, async message => {
  if (message.author.bot) return;

  const content = message.content.trim();

  if (content === "!config" || content === "/config") {
    if (!hasPermission(message.member))
      return message.reply("❌ 你沒有權限");

    const components = getConfigComponents(message.guild);
    return message.reply({ content: "🔧 伺服器設定面板", components });
  }

  if (content === "!announce" || content === "/announce") {
    if (!hasPermission(message.member))
      return message.reply("❌ 你沒有權限");

    const guildOptions = client.guilds.cache.map(g => ({
      label: g.name,
      value: g.id
    })).slice(0, 25);

    const row = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId("announce_guild")
        .setPlaceholder("選擇伺服器")
        .addOptions(guildOptions)
    );

    return message.reply({ content: "📢 選擇伺服器", components: [row] });
  }
});

/* ===== Interaction (下拉 + Modal + 按鈕) ===== */
client.on(Events.InteractionCreate, async interaction => {

  // ===== 下拉選單 =====
  if (interaction.isStringSelectMenu()) {

    // 管理身份組
    if (interaction.customId === "set_admin_role") {
      config.adminRoleId = interaction.values[0];
      return interaction.reply({ content: "✅ 已設定管理身份組", ephemeral: true });
    }

    // 新成員身份組
    if (interaction.customId === "set_auto_role") {
      config.autoRoleId = interaction.values[0];
      return interaction.reply({ content: "✅ 已設定新成員身份組", ephemeral: true });
    }

    // 新增歡迎頻道
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

    // 公告選擇伺服器
    if (interaction.customId === "announce_guild") {
      const guildId = interaction.values[0];
      const guild = client.guilds.cache.get(guildId);
      if (!guild) return interaction.reply({ content: "❌ 找不到伺服器", ephemeral: true });

      const channelOptions = guild.channels.cache
        .filter(c => c.isTextBased())
        .map(c => ({ label: `#${c.name}`, value: c.id }))
        .slice(0, 25);

      const row = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(`announce_channel_${guildId}`)
          .setPlaceholder("選擇公告頻道")
          .addOptions(channelOptions)
      );

      return interaction.update({ content: "選擇公告頻道", components: [row] });
    }

    // 公告選擇 @everyone
    if (interaction.customId.startsWith("announce_channel_")) {
      const guildId = interaction.customId.replace("announce_channel_", "");
      const channelId = interaction.values[0];

      const modal = new ModalBuilder()
        .setCustomId(`announce_modal_${guildId}_${channelId}`)
        .setTitle("填寫公告內容");

      modal.addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId("text")
            .setLabel("公告內容")
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(true)
        )
      );

      return interaction.showModal(modal);
    }
  }

  // ===== Modal 提交 =====
  if (interaction.isModalSubmit()) {
    // 歡迎訊息
    if (interaction.customId.startsWith("welcome_modal_")) {
      const channelId = interaction.customId.replace("welcome_modal_", "");
      const text = interaction.fields.getTextInputValue("text");
      config.welcomeChannels[channelId] = text;
      return interaction.reply({ content: "✅ 已設定歡迎訊息", ephemeral: true });
    }

    // 公告
    if (interaction.customId.startsWith("announce_modal_")) {
      const [ , guildId, channelId] = interaction.customId.split("_");
      const content = interaction.fields.getTextInputValue("text");

      const guild = client.guilds.cache.get(guildId);
      if (!guild) return interaction.reply({ content: "❌ 找不到伺服器", ephemeral: true });

      const channel = guild.channels.cache.get(channelId);
      if (!channel || !channel.isTextBased())
        return interaction.reply({ content: "❌ 無效公告頻道", ephemeral: true });

      await channel.send({ content });
      return interaction.reply({ content: "✅ 公告已發送", ephemeral: true });
    }
  }
});

/* ===== 新成員加入 ===== */
client.on(Events.GuildMemberAdd, async member => {
  // 自動身份組
  if (config.autoRoleId) {
    const role = member.guild.roles.cache.get(config.autoRoleId);
    if (role) await member.roles.add(role).catch(() => {});
  }

  // 多頻道歡迎訊息
  for (const [channelId, text] of Object.entries(config.welcomeChannels)) {
    const channel = member.guild.channels.cache.get(channelId);
    if (!channel || !channel.isTextBased()) continue;

    const embed = new EmbedBuilder()
      .setColor("Random")
      .setTitle("🎉 歡迎加入")
      .setDescription(text.replace(/{user}/g, `<@${member.id}>`).replace(/{server}/g, member.guild.name))
      .setTimestamp();

    await channel.send({ content: `<@${member.id}>`, embeds: [embed] }).catch(() => {});
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