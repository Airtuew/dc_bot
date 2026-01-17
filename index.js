const { Client, GatewayIntentBits, Partials, Events, ActionRowBuilder, StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ButtonBuilder, ButtonStyle, View } = require("discord.js");
const express = require("express");

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
  partials: [Partials.Channel]
});

// ===== Express 保活 =====
const app = express();
app.get("/", (req, res) => res.send("Bot is running"));
app.listen(process.env.PORT || 3000);

// ===== 設定 =====
let config = {
  adminRoleId: process.env.ADMIN_ROLE_ID || null,
  welcomeChannelId: process.env.WELCOME_CHANNEL_ID || null,
  welcomeMessage: "🎉 歡迎 {user} 加入 {server}！目前伺服器正在開發中，敬請期待！",
  announcementChannels: {}  // 每個伺服器公告頻道
};

// ===== 權限判斷 =====
const hasPermission = (member) => {
  if (!config.adminRoleId) return member.permissions.has("Administrator");
  return member.roles.cache.has(config.adminRoleId);
};

// ===== Config 面板 =====
class ConfigView extends View {
  constructor(guild) {
    super({ timeout: 180 });

    const roleOptions = guild.roles.cache
      .filter(r => !r.managed && r.id !== guild.id)
      .map(r => ({ label: r.name, value: r.id }))
      .slice(0, 25);

    const adminRoleSelect = new StringSelectMenuBuilder()
      .setCustomId("set_admin_role")
      .setPlaceholder("選擇可使用機器人指令的身份組")
      .addOptions(roleOptions);
    this.addItem(new ActionRowBuilder().addComponents(adminRoleSelect));

    const channelOptions = guild.channels.cache
      .filter(c => c.isTextBased())
      .map(c => ({ label: `#${c.name}`, value: c.id }))
      .slice(0, 25);

    const welcomeChannelSelect = new StringSelectMenuBuilder()
      .setCustomId("set_welcome_channel")
      .setPlaceholder("選擇歡迎訊息頻道")
      .addOptions(channelOptions);
    this.addItem(new ActionRowBuilder().addComponents(welcomeChannelSelect));

    const announceChannelSelect = new StringSelectMenuBuilder()
      .setCustomId("set_announce_channel")
      .setPlaceholder("選擇公告頻道")
      .addOptions(channelOptions);
    this.addItem(new ActionRowBuilder().addComponents(announceChannelSelect));

    const welcomeButton = new ButtonBuilder()
      .setCustomId("edit_welcome")
      .setLabel("📝 設定歡迎文字")
      .setStyle(ButtonStyle.Primary);
    this.addItem(new ActionRowBuilder().addComponents(welcomeButton));
  }
}

// ===== /config =====
client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  if (interaction.commandName === "config") {
    if (!hasPermission(interaction.member)) return interaction.reply({ content: "❌ 你沒有權限使用此指令", ephemeral: true });
    return interaction.reply({ content: "🔧 **伺服器設定面板**", components: [new ConfigView(interaction.guild)], ephemeral: true });
  }
});

// ===== 下拉選單 & 按鈕 =====
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

// ===== 新成員歡迎 =====
client.on(Events.GuildMemberAdd, async (member) => {
  if (!config.welcomeChannelId) return;
  const channel = member.guild.channels.cache.get(config.welcomeChannelId);
  if (!channel) return;
  const msg = config.welcomeMessage.replace(/{user}/g, `${member}`).replace(/{server}/g, member.guild.name);
  channel.send(msg);
});

// ===== /announce =====
// （同之前公告流程，支援 @everyone，下拉選伺服器 → 選是否 @everyone → Modal）
