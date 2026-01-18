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
  EmbedBuilder,
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
  buttonPanels: {} // channelId: [{ label, addRole, removeRole, response, ephemeral }]
};

/* ===== 權限判斷 ===== */
function hasPermission(member) {
  if (!config.adminRoleId)
    return member.permissions.has("Administrator");
  return member.roles.cache.has(config.adminRoleId);
}

/* ===== 配置面板 ===== */
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
    ),
    new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId("add_button_panel")
        .setPlaceholder("新增按鈕面板頻道")
        .addOptions(channelOptions)
    )
  ];
}

/* ===== 文字指令 ===== */
client.on(Events.MessageCreate, async message => {
  if (message.author.bot) return;
  const content = message.content.trim();

  if (content === "!config" || content === "/config") {
    if (!hasPermission(message.member))
      return message.reply({ content: "❌ 你沒有權限", flags: 64 }).catch(console.error);

    return message.reply({
      content: "🔧 伺服器設定面板",
      components: getConfigComponents(message.guild)
    }).catch(console.error);
  }

  if (content === "!announce" || content === "/announce") {
    if (!hasPermission(message.member))
      return message.reply({ content: "❌ 你沒有權限", flags: 64 }).catch(console.error);

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

    return message.reply({ content: "📢 選擇伺服器", components: [row] }).catch(console.error);
  }
});

/* ===== Interaction ===== */
client.on(Events.InteractionCreate, async interaction => {
  try {
    if (interaction.isStringSelectMenu()) {
      const value = interaction.values[0];

      // 管理身份組
      if (interaction.customId === "set_admin_role") {
        config.adminRoleId = value;
        return interaction.reply({ content: "✅ 已設定管理身份組", flags: 64 }).catch(console.error);
      }

      // 新成員身份組
      if (interaction.customId === "set_auto_role") {
        config.autoRoleId = value;
        return interaction.reply({ content: "✅ 已設定新成員身份組", flags: 64 }).catch(console.error);
      }

      // 新增歡迎頻道
      if (interaction.customId === "add_welcome_channel") {
        const modal = new ModalBuilder()
          .setCustomId(`welcome_modal_${value}`)
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

      // 新增按鈕面板
      if (interaction.customId === "add_button_panel") {
        const modal = new ModalBuilder()
          .setCustomId(`button_modal_${value}`)
          .setTitle("新增按鈕設定");

        modal.addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId("label")
              .setLabel("按鈕文字")
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
          )
        );
        modal.addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId("addRole")
              .setLabel("新增身份組ID")
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
          )
        );
        modal.addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId("removeRole")
              .setLabel("移除身份組ID（可留空）")
              .setStyle(TextInputStyle.Short)
              .setRequired(false)
          )
        );
        modal.addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId("response")
              .setLabel("回應訊息")
              .setStyle(TextInputStyle.Paragraph)
              .setRequired(false)
          )
        );
        modal.addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId("ephemeral")
              .setLabel("回應是否 Ephemeral (true/false)")
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
          )
        );
        return interaction.showModal(modal);
      }

      // 公告選擇伺服器
      if (interaction.customId === "announce_guild") {
        const guildId = value;
        const guild = client.guilds.cache.get(guildId);
        if (!guild) return interaction.reply({ content: "❌ 找不到伺服器", flags: 64 }).catch(console.error);

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

        return interaction.update({ content: "選擇公告頻道", components: [row] }).catch(console.error);
      }

      // 公告選擇頻道後 Modal 填寫
      if (interaction.customId.startsWith("announce_channel_")) {
        const [ , guildId ] = interaction.customId.split("_");
        const channelId = value;
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

    // Modal Submit
    if (interaction.isModalSubmit()) {
      const cid = interaction.customId;

      // 歡迎訊息
      if (cid.startsWith("welcome_modal_")) {
        const channelId = cid.replace("welcome_modal_", "");
        const text = interaction.fields.getTextInputValue("text");
        config.welcomeChannels[channelId] = text;
        return interaction.reply({ content: "✅ 已設定歡迎訊息", flags: 64 }).catch(console.error);
      }

      // 按鈕面板
      if (cid.startsWith("button_modal_")) {
        const channelId = cid.replace("button_modal_", "");
        const label = interaction.fields.getTextInputValue("label");
        const addRole = interaction.fields.getTextInputValue("addRole");
        const removeRole = interaction.fields.getTextInputValue("removeRole");
        const response = interaction.fields.getTextInputValue("response") || "";
        const ephemeral = interaction.fields.getTextInputValue("ephemeral") === "true";

        if (!config.buttonPanels[channelId]) config.buttonPanels[channelId] = [];
        config.buttonPanels[channelId].push({ label, addRole, removeRole, response, ephemeral });

        const buttons = new ActionRowBuilder();
        for (const btn of config.buttonPanels[channelId]) {
          buttons.addComponents(
            new ButtonBuilder()
              .setCustomId(`btn_${channelId}_${btn.addRole}`)
              .setLabel(btn.label)
              .setStyle(ButtonStyle.Primary)
          );
        }

        const channel = interaction.guild.channels.cache.get(channelId);
        if (channel && channel.isTextBased()) {
          await channel.send({ content: "🎛 按鈕面板", components: [buttons] }).catch(() => {});
        }

        return interaction.reply({ content: "✅ 已新增按鈕面板", flags: 64 }).catch(console.error);
      }

      // 公告
      if (cid.startsWith("announce_modal_")) {
        const [ , guildId, channelId ] = cid.split("_");
        const content = interaction.fields.getTextInputValue("text");

        const guild = client.guilds.cache.get(guildId);
        if (!guild) return interaction.reply({ content: "❌ 找不到伺服器", flags: 64 }).catch(console.error);

        const channel = guild.channels.cache.get(channelId);
        if (!channel || !channel.isTextBased())
          return interaction.reply({ content: "❌ 無效公告頻道", flags: 64 }).catch(console.error);

        await channel.send({ content }).catch(console.error);
        return interaction.reply({ content: "✅ 公告已發送", flags: 64 }).catch(console.error);
      }
    }

    // 按鈕點擊
    if (interaction.isButton()) {
      const [ , channelId, addRole ] = interaction.customId.split("_");
      const btnConfig = config.buttonPanels[channelId].find(b => b.addRole === addRole);
      if (!btnConfig) return;

      const member = interaction.member;
      // 新增身份組
      const role = interaction.guild.roles.cache.get(btnConfig.addRole);
      if (role) await member.roles.add(role).catch(() => {});

      // 移除身份組
      if (btnConfig.removeRole) {
        const r = interaction.guild.roles.cache.get(btnConfig.removeRole);
        if (r) await member.roles.remove(r).catch(() => {});
      }

      // 回應訊息
      if (btnConfig.response) {
        await interaction.reply({ content: btnConfig.response, ephemeral: btnConfig.ephemeral }).catch(() => {});
      } else {
        await interaction.deferUpdate().catch(() => {});
      }
    }

  } catch (err) {
    console.error(err);
    if (interaction.isRepliable()) interaction.reply({ content: "❌ 發生錯誤", flags: 64 }).catch(() => {});
  }
});

/* ===== 新成員加入 ===== */
client.on(Events.GuildMemberAdd, async member => {
  try {
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
  } catch (err) {
    console.error(err);
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