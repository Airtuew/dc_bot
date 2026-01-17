const { 
  Client, GatewayIntentBits, Partials, Events, ActionRowBuilder, 
  StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, 
  ButtonBuilder, ButtonStyle, EmbedBuilder 
} = require("discord.js");
const express = require("express");

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
  partials: [Partials.Channel]
});

// ===== Express 保活 =====
const app = express();
app.get("/", (req, res) => res.send("Bot is running"));
app.listen(process.env.PORT || 3000, () => console.log("✅ Express server running"));

// ===== 設定 =====
let config = {
  adminRoleId: process.env.ADMIN_ROLE_ID || null,
  welcomeChannelId: process.env.WELCOME_CHANNEL_ID || null,
  welcomeMessage: "🎉 歡迎 {user} 加入 {server}！目前伺服器正在開發中，敬請期待！",
  announcementChannels: {}
};

// ===== 權限判斷 =====
const hasPermission = (member) => {
  if (!config.adminRoleId) return member.permissions.has("Administrator");
  return member.roles.cache.has(config.adminRoleId);
};

// ===== Config Components =====
function getConfigComponents(guild) {
  const roleOptions = guild.roles.cache
    .filter(r => !r.managed && r.id !== guild.id)
    .map(r => ({ label: r.name, value: r.id }))
    .slice(0, 25);

  const adminRoleSelect = new StringSelectMenuBuilder()
    .setCustomId("set_admin_role")
    .setPlaceholder("選擇可使用機器人指令的身份組")
    .addOptions(roleOptions);
  const roleRow = new ActionRowBuilder().addComponents(adminRoleSelect);

  const channelOptions = guild.channels.cache
    .filter(c => c.isTextBased())
    .map(c => ({ label: `#${c.name}`, value: c.id }))
    .slice(0, 25);

  const welcomeSelect = new StringSelectMenuBuilder()
    .setCustomId("set_welcome_channel")
    .setPlaceholder("選擇歡迎訊息頻道")
    .addOptions(channelOptions);
  const welcomeRow = new ActionRowBuilder().addComponents(welcomeSelect);

  const announceSelect = new StringSelectMenuBuilder()
    .setCustomId("set_announce_channel")
    .setPlaceholder("選擇公告頻道")
    .addOptions(channelOptions);
  const announceRow = new ActionRowBuilder().addComponents(announceSelect);

  const welcomeButton = new ButtonBuilder()
    .setCustomId("edit_welcome")
    .setLabel("📝 設定歡迎文字")
    .setStyle(ButtonStyle.Primary);
  const buttonRow = new ActionRowBuilder().addComponents(welcomeButton);

  return [roleRow, welcomeRow, announceRow, buttonRow];
}

// ===== /config =====
client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  if (interaction.commandName === "config") {
    if (!hasPermission(interaction.member))
      return interaction.reply({ content: "❌ 你沒有權限使用此指令", ephemeral: true });

    return interaction.reply({ 
      content: "🔧 **伺服器設定面板**", 
      components: getConfigComponents(interaction.guild), 
      ephemeral: true 
    });
  }
});

// ===== 下拉 & 按鈕 =====
client.on(Events.InteractionCreate, async (interaction) => {
  if (interaction.isStringSelectMenu()) {
    if (interaction.customId === "set_admin_role") {
      config.adminRoleId = interaction.values[0];
      return interaction.reply({ content: "✅ 已設定可使用指令身份組", ephemeral: true });
    }
    if (interaction.customId === "set_welcome_channel") {
      config.welcomeChannelId = interaction.values[0];
      return interaction.reply({ content: "✅ 已設定歡迎訊息頻道", ephemeral: true });
    }
    if (interaction.customId === "set_announce_channel") {
      config.announcementChannels[interaction.guild.id] = interaction.values[0];
      return interaction.reply({ content: "✅ 已設定公告頻道", ephemeral: true });
    }
  }

  if (interaction.isButton() && interaction.customId === "edit_welcome") {
    const modal = new ModalBuilder()
      .setCustomId("welcome_modal")
      .setTitle("設定歡迎訊息");

    const input = new TextInputBuilder()
      .setCustomId("welcome_text")
      .setLabel("歡迎訊息（可用 {user} / {server}）")
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(true)
      .setValue(config.welcomeMessage);

    modal.addComponents(new ActionRowBuilder().addComponents(input));
    return interaction.showModal(modal);
  }

  if (interaction.isModalSubmit() && interaction.customId === "welcome_modal") {
    config.welcomeMessage = interaction.fields.getTextInputValue("welcome_text");
    return interaction.reply({ content: "✅ 歡迎訊息已更新", ephemeral: true });
  }
});

// ===== 新成員歡迎（Embed + @新用戶） =====
client.on(Events.GuildMemberAdd, async (member) => {
  if (!config.welcomeChannelId) return;
  const channel = member.guild.channels.cache.get(config.welcomeChannelId);
  if (!channel) return;

  const embed = new EmbedBuilder()
    .setColor("Random")
    .setTitle("🎉 歡迎新成員！")
    .setDescription(config.welcomeMessage.replace(/{user}/g, `${member}`).replace(/{server}/g, member.guild.name))
    .setTimestamp();

  channel.send({ content: `${member}`, embeds: [embed] });
});

// ===== /announce =====
client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  if (interaction.commandName === "announce") {
    if (!hasPermission(interaction.member)) return interaction.reply({ content: "❌ 你沒有權限", ephemeral: true });

    const guildOptions = client.guilds.cache.map(g => ({ label: g.name, value: g.id })).slice(0, 25);
    const guildSelect = new StringSelectMenuBuilder()
      .setCustomId("announce_guild")
      .setPlaceholder("選擇要公告的伺服器")
      .addOptions(guildOptions);

    return interaction.reply({ content: "📢 選擇伺服器", components: [new ActionRowBuilder().addComponents(guildSelect)], ephemeral: true });
  }
});

// ===== 公告流程 =====
client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isStringSelectMenu() && !interaction.isModalSubmit()) return;

  if (interaction.isStringSelectMenu() && interaction.customId === "announce_guild") {
    const guildId = interaction.values[0];
    const pingMenu = new StringSelectMenuBuilder()
      .setCustomId(`announce_ping_${guildId}`)
      .setPlaceholder("是否 @everyone")
      .addOptions([
        { label: "📣 公告並 @everyone", value: "yes" },
        { label: "🔕 公告但不 @everyone", value: "no" }
      ]);
    return interaction.update({ content: "📢 是否 @everyone？", components: [new ActionRowBuilder().addComponents(pingMenu)] });
  }

  if (interaction.isStringSelectMenu() && interaction.customId.startsWith("announce_ping_")) {
    const guildId = interaction.customId.replace("announce_ping_", "");
    const ping = interaction.values[0];

    const modal = new ModalBuilder()
      .setCustomId(`announce_modal_${guildId}_${ping}`)
      .setTitle("填寫公告內容");

    const input = new TextInputBuilder()
      .setCustomId("announce_text")
      .setLabel("公告內容")
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(true);

    modal.addComponents(new ActionRowBuilder().addComponents(input));
    return interaction.showModal(modal);
  }

  if (interaction.isModalSubmit() && interaction.customId.startsWith("announce_modal_")) {
    const [ , , guildId, ping ] = interaction.customId.split("_");
    const content = interaction.fields.getTextInputValue("announce_text");

    const guild = client.guilds.cache.get(guildId);
    if (!guild) return interaction.reply({ content: "❌ 找不到伺服器", ephemeral: true });

    const channelId = config.announcementChannels[guildId];
    const channel = guild.channels.cache.get(channelId);
    if (!channel || !channel.isTextBased()) return interaction.reply({ content: "❌ 公告頻道無效", ephemeral: true });

    let msg = `📢 **公告**\n\n${content}`;
    if (ping === "yes" && channel.permissionsFor(guild.members.me).has("MentionEveryone")) {
      msg = `@everyone\n${msg}`;
    }

    await channel.send({ content: msg });
    return interaction.reply({ content: "✅ 公告已發送", ephemeral: true });
  }
});

// ===== Bot 上線 =====
client.once(Events.ClientReady, async () => {
  await client.application.commands.create({ name: "config", description: "伺服器設定面板" });
  await client.application.commands.create({ name: "announce", description: "發送公告" });
  console.log(`✅ Bot 已啟動：${client.user.tag}`);
});
// ===== 文字指令 !config =====
client.on("messageCreate", async (message) => {
  // 忽略 Bot 自己
  if (message.author.bot) return;

  // 文字命令
  if (message.content === "!config") {
    if (!hasPermission(message.member))
      return message.reply("❌ 你沒有權限使用此指令");

    // 送出設定面板
    message.reply({
      content: "🔧 **伺服器設定面板**",
      components: getConfigComponents(message.guild),
    });
  }
});


client.login(process.env.DISCORD_TOKEN);

