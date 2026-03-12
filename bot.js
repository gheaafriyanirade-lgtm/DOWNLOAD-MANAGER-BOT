const {
  Client, GatewayIntentBits, EmbedBuilder,
  ActionRowBuilder, ButtonBuilder, ButtonStyle,
  ModalBuilder, TextInputBuilder, TextInputStyle,
  SlashCommandBuilder, REST, Routes
} = require('discord.js');

// ─── CONFIG ───────────────────────────────────────────────────────────────────
const TOKEN     = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.DISCORD_CLIENT_ID;
const GUILD_ID  = process.env.DISCORD_GUILD_ID;

// ─── BRANDING ─────────────────────────────────────────────────────────────────
const BRAND = {
  footerText: 'DOWNLOAD MANAGER',
  iconUrl: '',       // ← optional: URL to your logo
  pingEveryone: true // ← set false to disable @everyone ping
};

// ─── UPDATE TYPES ─────────────────────────────────────────────────────────────
const UPDATE_TYPES = [
  { id: 'status_change', label: 'Status Change', emoji: '🔄', color: 0x5865F2 },
  { id: 'maintenance',   label: 'Maintenance',   emoji: '🔧', color: 0xEB459E },
  { id: 'update',        label: 'Update',        emoji: '⬆️', color: 0x57F287 },
  { id: 'patch',         label: 'Patch',         emoji: '🩹', color: 0xFEE75C },
  { id: 'undetected',    label: 'Undetected',    emoji: '✅', color: 0x57F287 },
  { id: 'detected',      label: 'Detected',      emoji: '🚨', color: 0xED4245 },
  { id: 'disabled',      label: 'Disabled',      emoji: '⛔', color: 0x95A5A6 },
];

// ─── STATUS EMOJIS ────────────────────────────────────────────────────────────
const STATUS_EMOJI = {
  online: '🟢', offline: '🔴', updating: '🔵', updated: '🟢',
  detected: '🔴', undetected: '✅', disabled: '⛔', maintenance: '🔧',
  degraded: '🟡', unknown: '⚪'
};

function prettifyStatus(s) {
  if (!s) return '';
  const lower = s.trim().toLowerCase();
  const emoji = STATUS_EMOJI[lower] || '▪️';
  return `${emoji} ${s.trim().charAt(0).toUpperCase() + s.trim().slice(1)}`;
}

// ─── URL HELPER ───────────────────────────────────────────────────────────────
function fixUrl(url) {
  if (!url || !url.trim()) return null;
  const t = url.trim();
  return (t.startsWith('http://') || t.startsWith('https://')) ? t : `https://${t}`;
}
function isValidUrl(url) {
  try { new URL(url); return true; } catch { return false; }
}

// ─── SLASH COMMAND ────────────────────────────────────────────────────────────
const commands = [
  new SlashCommandBuilder()
    .setName('postupdate')
    .setDescription('Open the product update form')
    .toJSON()
];

// ─── REGISTER COMMANDS ────────────────────────────────────────────────────────
async function registerCommands() {
  const rest = new REST({ version: '10' }).setToken(TOKEN);
  try {
    console.log('Registering slash commands...');
    if (GUILD_ID) {
      await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: commands });
      console.log(`✅ Commands registered to guild ${GUILD_ID}`);
    } else {
      await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
      console.log('✅ Commands registered globally');
    }
  } catch (err) {
    console.error('Failed to register commands:', err);
  }
}

// ─── BOT SETUP ────────────────────────────────────────────────────────────────
const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once('ready', async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
  await registerCommands();
});

// ─── INTERACTIONS ─────────────────────────────────────────────────────────────
client.on('interactionCreate', async (interaction) => {
  try {

    // ── Step 1: /postupdate → show update type buttons ───────────────────────
    if (interaction.isChatInputCommand() && interaction.commandName === 'postupdate') {

      // Build rows of buttons (max 5 per row)
      const rows = [];
      let currentRow = new ActionRowBuilder();
      let count = 0;

      for (const type of UPDATE_TYPES) {
        if (count > 0 && count % 4 === 0) {
          rows.push(currentRow);
          currentRow = new ActionRowBuilder();
        }
        currentRow.addComponents(
          new ButtonBuilder()
            .setCustomId(`type_${type.id}`)
            .setLabel(type.label)
            .setEmoji(type.emoji)
            .setStyle(ButtonStyle.Secondary)
        );
        count++;
      }
      rows.push(currentRow);

      await interaction.reply({
        content: '### Select update type...',
        components: rows,
        ephemeral: true
      });
    }

    // ── Step 2: Type button clicked → open modal form ────────────────────────
    if (interaction.isButton() && interaction.customId.startsWith('type_')) {
      const typeId   = interaction.customId.replace('type_', '');
      const typeInfo = UPDATE_TYPES.find(t => t.id === typeId) || { label: typeId, emoji: '📦' };

      const modal = new ModalBuilder()
        .setCustomId(`submit_${typeId}`)
        .setTitle(`${typeInfo.emoji} ${typeInfo.label} — Product Update`);

      const productInput = new TextInputBuilder()
        .setCustomId('product')
        .setLabel('PRODUCT NAME')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('e.g. AIO Spoofer - Ancient')
        .setRequired(true)
        .setMaxLength(100);

      const oldStatusInput = new TextInputBuilder()
        .setCustomId('old_status')
        .setLabel('CHANGED FROM (previous status)')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('e.g. Updating')
        .setRequired(true)
        .setMaxLength(50);

      const newStatusInput = new TextInputBuilder()
        .setCustomId('new_status')
        .setLabel('NEW STATUS')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('e.g. Updated')
        .setRequired(true)
        .setMaxLength(50);

      const notesInput = new TextInputBuilder()
        .setCustomId('notes')
        .setLabel('NOTES (separate bullet points with |)')
        .setStyle(TextInputStyle.Paragraph)
        .setPlaceholder('e.g. Updated for latest patch | Keys have been unfrozen')
        .setRequired(false)
        .setMaxLength(1000);

      const downloadInput = new TextInputBuilder()
        .setCustomId('download_url')
        .setLabel('DOWNLOAD URL (optional)')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('e.g. https://gofile.io/d/yourfile')
        .setRequired(false)
        .setMaxLength(500);

      modal.addComponents(
        new ActionRowBuilder().addComponents(productInput),
        new ActionRowBuilder().addComponents(oldStatusInput),
        new ActionRowBuilder().addComponents(newStatusInput),
        new ActionRowBuilder().addComponents(notesInput),
        new ActionRowBuilder().addComponents(downloadInput),
      );

      await interaction.showModal(modal);
    }

    // ── Step 3: Modal submitted → post embed ─────────────────────────────────
    if (interaction.isModalSubmit() && interaction.customId.startsWith('submit_')) {
      const typeId   = interaction.customId.replace('submit_', '');
      const typeInfo = UPDATE_TYPES.find(t => t.id === typeId) || { label: typeId, emoji: '📦', color: 0x5865F2 };

      const product   = interaction.fields.getTextInputValue('product');
      const oldStatus = interaction.fields.getTextInputValue('old_status');
      const newStatus = interaction.fields.getTextInputValue('new_status');
      const notesRaw  = interaction.fields.getTextInputValue('notes');
      const rawUrl    = interaction.fields.getTextInputValue('download_url');

      // Parse notes: split by | into bullet points
      const notesLines = notesRaw
        ? notesRaw.split('|').map(n => `• ${n.trim()}`).filter(n => n.length > 2).join('\n')
        : null;

      // Fix URL
      const downloadUrl = fixUrl(rawUrl);
      if (downloadUrl && !isValidUrl(downloadUrl)) {
        await interaction.reply({
          content: `❌ Invalid download URL: \`${rawUrl}\`\nExample: \`https://gofile.io/d/yourfile\``,
          ephemeral: true
        });
        return;
      }

      const now = new Date();

      const embed = new EmbedBuilder()
        .setColor(typeInfo.color)
        .setTitle(`${product}`)
        .addFields(
          { name: 'Product', value: product, inline: false },
          { name: 'Type', value: `${typeInfo.emoji} ${typeInfo.label}`, inline: false },
          { name: 'Changed from', value: prettifyStatus(oldStatus), inline: false },
          { name: 'New Status',   value: prettifyStatus(newStatus), inline: false },
        )
        .setTimestamp(now)
        .setFooter({
          text: `${BRAND.footerText} | Today at ${now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`,
          iconURL: BRAND.iconUrl || undefined
        });

      if (notesLines) {
        embed.addFields({ name: 'Notes', value: notesLines });
      }

      // Buttons
      const buttons = [];

      if (downloadUrl) {
        buttons.push(
          new ButtonBuilder()
            .setLabel('Download')
            .setStyle(ButtonStyle.Link)
            .setURL(downloadUrl)
            .setEmoji('⬇️')
        );
      }

      const components = buttons.length > 0
        ? [new ActionRowBuilder().addComponents(...buttons)]
        : [];

      // Post the embed + optional @everyone
      await interaction.reply({
        content: BRAND.pingEveryone ? '@everyone' : undefined,
        embeds: [embed],
        components,
        allowedMentions: { parse: BRAND.pingEveryone ? ['everyone'] : [] }
      });
    }

  } catch (err) {
    console.error('Interaction error:', err);
    try {
      const msg = { content: '❌ Something went wrong. Please try again.', ephemeral: true };
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(msg);
      } else {
        await interaction.reply(msg);
      }
    } catch (_) {}
  }
});

// ─── LOGIN ────────────────────────────────────────────────────────────────────
client.login(TOKEN);
