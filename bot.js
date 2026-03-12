const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, SlashCommandBuilder, REST, Routes } = require('discord.js');

// ─── CONFIG ───────────────────────────────────────────────────────────────────
const TOKEN = process.env.DISCORD_TOKEN;         // Your bot token
const CLIENT_ID = process.env.DISCORD_CLIENT_ID; // Your bot's application ID
const GUILD_ID = process.env.DISCORD_GUILD_ID;   // (Optional) Your server ID for instant slash command updates

// ─── BRANDING ─────────────────────────────────────────────────────────────────
const BRAND = {
  name: 'YourBrand',              // ← Change this
  iconUrl: '',                    // ← Change this (URL to your logo image)
  color: 0x5865F2,                // ← Change this (hex color as integer)
  footerText: 'YourBrand Updates' // ← Change this
};

// ─── BOT SETUP ────────────────────────────────────────────────────────────────
const client = new Client({ intents: [GatewayIntentBits.Guilds] });

// ─── SLASH COMMANDS ───────────────────────────────────────────────────────────
const commands = [
  new SlashCommandBuilder()
    .setName('statusupdate')
    .setDescription('Post a product status update embed')
    .addStringOption(opt =>
      opt.setName('product').setDescription('Product name').setRequired(true))
    .addStringOption(opt =>
      opt.setName('old_status').setDescription('Previous status').setRequired(true)
        .addChoices(
          { name: '🟢 Online', value: 'Online' },
          { name: '🔴 Offline', value: 'Offline' },
          { name: '🟡 Degraded', value: 'Degraded' },
          { name: '🔧 Maintenance', value: 'Maintenance' },
          { name: '⚪ Unknown', value: 'Unknown' },
        ))
    .addStringOption(opt =>
      opt.setName('new_status').setDescription('New status').setRequired(true)
        .addChoices(
          { name: '🟢 Online', value: 'Online' },
          { name: '🔴 Offline', value: 'Offline' },
          { name: '🟡 Degraded', value: 'Degraded' },
          { name: '🔧 Maintenance', value: 'Maintenance' },
          { name: '⚪ Unknown', value: 'Unknown' },
        ))
    .addStringOption(opt =>
      opt.setName('note').setDescription('Additional notes').setRequired(false))
    .addStringOption(opt =>
      opt.setName('download_url').setDescription('Download link (optional)').setRequired(false))
    .addStringOption(opt =>
      opt.setName('download_label').setDescription('Download button label (default: Download)').setRequired(false))
    .toJSON()
];

// ─── STATUS HELPERS ───────────────────────────────────────────────────────────
const STATUS_EMOJI = {
  Online: '🟢', Offline: '🔴', Degraded: '🟡', Maintenance: '🔧', Unknown: '⚪'
};

const STATUS_COLOR = {
  Online: 0x57F287,
  Offline: 0xED4245,
  Degraded: 0xFEE75C,
  Maintenance: 0xEB459E,
  Unknown: 0x95A5A6
};

function statusLabel(s) { return `${STATUS_EMOJI[s] ?? '⚪'} ${s}`; }

// ─── REGISTER COMMANDS ────────────────────────────────────────────────────────
async function registerCommands() {
  const rest = new REST({ version: '10' }).setToken(TOKEN);
  try {
    console.log('Registering slash commands...');
    if (GUILD_ID) {
      // Guild commands update instantly (great for testing)
      await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: commands });
      console.log(`✅ Commands registered to guild ${GUILD_ID}`);
    } else {
      // Global commands take ~1 hour to propagate
      await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
      console.log('✅ Commands registered globally');
    }
  } catch (err) {
    console.error('Failed to register commands:', err);
  }
}

// ─── READY ────────────────────────────────────────────────────────────────────
client.once('ready', async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
  await registerCommands();
});

// ─── INTERACTIONS ─────────────────────────────────────────────────────────────
client.on('interactionCreate', async (interaction) => {

  // ── /statusupdate command ──────────────────────────────────────────────────
  if (interaction.isChatInputCommand() && interaction.commandName === 'statusupdate') {
    const product     = interaction.options.getString('product');
    const oldStatus   = interaction.options.getString('old_status');
    const newStatus   = interaction.options.getString('new_status');
    const note        = interaction.options.getString('note') || null;
    const downloadUrl = interaction.options.getString('download_url') || null;
    const downloadLabel = interaction.options.getString('download_label') || 'Download';

    const now = new Date();
    const timestamp = `<t:${Math.floor(now.getTime() / 1000)}:F>`; // Discord timestamp

    const embed = new EmbedBuilder()
      .setColor(STATUS_COLOR[newStatus] ?? BRAND.color)
      .setTitle(`📦  ${product}`)
      .addFields(
        { name: 'Changed From', value: statusLabel(oldStatus), inline: true },
        { name: 'New Status',   value: statusLabel(newStatus), inline: true },
      )
      .setTimestamp(now)
      .setFooter({
        text: `${BRAND.footerText} • ${now.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`,
        iconURL: BRAND.iconUrl || undefined
      });

    if (note) {
      embed.addFields({ name: '📝 Note', value: note });
    }

    // Build button row
    const buttons = [];

    if (downloadUrl) {
      buttons.push(
        new ButtonBuilder()
          .setLabel(downloadLabel)
          .setStyle(ButtonStyle.Link)
          .setURL(downloadUrl)
          .setEmoji('⬇️')
      );
    }

    // "More Info" button that opens a modal with extra details
    buttons.push(
      new ButtonBuilder()
        .setCustomId(`moreinfo_${product}_${newStatus}`)
        .setLabel('More Info')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('ℹ️')
    );

    const row = new ActionRowBuilder().addComponents(...buttons);

    await interaction.reply({
      embeds: [embed],
      components: [row]
    });
  }

  // ── "More Info" button → opens modal ──────────────────────────────────────
  if (interaction.isButton() && interaction.customId.startsWith('moreinfo_')) {
    const parts = interaction.customId.split('_');
    const product   = parts[1] || 'Product';
    const newStatus = parts[2] || 'Unknown';

    const modal = new ModalBuilder()
      .setCustomId(`infomodal_${product}`)
      .setTitle(`${product} — Status Details`);

    // We just show info; for a real app you could let staff add more notes
    const infoInput = new TextInputBuilder()
      .setCustomId('extra_note')
      .setLabel('Add a follow-up note (optional)')
      .setStyle(TextInputStyle.Paragraph)
      .setPlaceholder('Type any additional information here...')
      .setRequired(false);

    const downloadInput = new TextInputBuilder()
      .setCustomId('download_url_modal')
      .setLabel('Download / Redirect URL')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('https://example.com/download')
      .setRequired(false);

    modal.addComponents(
      new ActionRowBuilder().addComponents(infoInput),
      new ActionRowBuilder().addComponents(downloadInput),
    );

    await interaction.showModal(modal);
  }

  // ── Modal submit ───────────────────────────────────────────────────────────
  if (interaction.isModalSubmit() && interaction.customId.startsWith('infomodal_')) {
    const product     = interaction.customId.replace('infomodal_', '');
    const extraNote   = interaction.fields.getTextInputValue('extra_note');
    const downloadUrl = interaction.fields.getTextInputValue('download_url_modal');

    const replyParts = [`**Follow-up for ${product}**`];
    if (extraNote)   replyParts.push(`📝 ${extraNote}`);
    if (downloadUrl) replyParts.push(`⬇️ [Click here to download / visit](${downloadUrl})`);

    if (replyParts.length === 1) replyParts.push('No additional info provided.');

    await interaction.reply({ content: replyParts.join('\n'), ephemeral: true });
  }

});

// ─── LOGIN ────────────────────────────────────────────────────────────────────
client.login(TOKEN);
