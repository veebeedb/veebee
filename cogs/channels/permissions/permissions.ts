import fs from 'fs';
import path from 'path';
import {
    SlashCommandBuilder,
    ChatInputCommandInteraction,
    PermissionFlagsBits,
    PermissionsBitField,
    TextChannel,
    VoiceChannel,
    StageChannel,
    ForumChannel,
    CategoryChannel,
    ChannelType,
    Role,
    EmbedBuilder,
} from 'discord.js';

type EditableChannel = TextChannel | VoiceChannel | StageChannel | ForumChannel | CategoryChannel;

const PRESET_FILE = path.resolve(process.cwd(), 'perm_presets.json');

const SYNONYMS: Record<string, string> = {
    createposts: 'CreatePublicThreads',
    createpost: 'CreatePublicThreads',
    sendmessagesinpublicthreads: 'SendMessagesInThreads',
    sendmessagesinprivatethreads: 'SendMessagesInThreads',
    sendmessagesinthreads: 'SendMessagesInThreads',

    createpolls: 'SendPolls',
    createpoll: 'SendPolls',
    sendpolls: 'SendPolls',
    polls: 'SendPolls',
    poll: 'SendPolls',

    voice: 'Connect',

    view: 'ViewChannel',
    viewchannel: 'ViewChannel',
    send: 'SendMessages',
    sendmessages: 'SendMessages',
    embed: 'EmbedLinks',
    embedlinks: 'EmbedLinks',
    attach: 'AttachFiles',
    attachfiles: 'AttachFiles',
    react: 'AddReactions',
    addreactions: 'AddReactions',
    externalemojis: 'UseExternalEmojis',
    externalstickers: 'UseExternalStickers',
    readhistory: 'ReadMessageHistory',
    readmessagehistory: 'ReadMessageHistory',
    connect: 'Connect',
    speak: 'Speak',
    mute: 'MuteMembers',
    deafen: 'DeafenMembers',
};

function parsePermissions(input: string) {
    if (!input) return { flags: [] as bigint[], invalid: [] as string[] };
    const rawParts = input
        .split(',')
        .map(p => p.trim())
        .filter(Boolean);
    const flags: bigint[] = [];
    const invalid: string[] = [];

    const officialKeys = Object.keys(PermissionFlagsBits) as Array<keyof typeof PermissionFlagsBits>;
    const keyByLower: Record<string, keyof typeof PermissionFlagsBits> = {};
    for (const k of officialKeys) keyByLower[k.toLowerCase()] = k;

    for (const raw of rawParts) {
        const low = raw.toLowerCase().replace(/[\s_\-]/g, '');

        if (SYNONYMS[low]) {
            const candidate = SYNONYMS[low];
            if ((PermissionFlagsBits as any)[candidate] !== undefined) {
                if (low === 'voice') {
                    flags.push((PermissionFlagsBits as any)[candidate] as bigint);
                    if ((PermissionFlagsBits as any)['Speak'] !== undefined) {
                        flags.push((PermissionFlagsBits as any)['Speak'] as bigint);
                    }
                } else {
                    flags.push((PermissionFlagsBits as any)[candidate] as bigint);
                }
                continue;
            } else {
                invalid.push(raw);
                continue;
            }
        }

        if (keyByLower[low]) {
            const key = keyByLower[low];
            flags.push(PermissionFlagsBits[key] as bigint);
            continue;
        }

        if ((PermissionFlagsBits as any)[raw] !== undefined) {
            flags.push((PermissionFlagsBits as any)[raw] as bigint);
            continue;
        }

        invalid.push(raw);
    }

    return { flags, invalid };
}

function isEditableChannel(ch: unknown): ch is EditableChannel {
    if (!ch || typeof ch !== 'object') return false;
    const t = (ch as any).type;
    return (
        t === ChannelType.GuildText ||
        t === ChannelType.GuildVoice ||
        t === ChannelType.GuildStageVoice ||
        t === ChannelType.GuildForum ||
        t === ChannelType.GuildCategory
    );
}

function buildOverwriteOptions(allowBitfield: bigint, denyBitfield: bigint) {
    const opts: Partial<Record<keyof typeof PermissionFlagsBits, boolean | null>> = {};
    const keys = Object.keys(PermissionFlagsBits) as Array<keyof typeof PermissionFlagsBits>;

    for (const key of keys) {
        const bit = PermissionFlagsBits[key] as bigint;
        if ((allowBitfield & bit) === bit) {
            opts[key] = true;
        } else if (denyBitfield && (denyBitfield & bit) === bit) {
            opts[key] = false;
        } else {
        }
    }

    return opts;
}

function readPresetFile(): any {
    try {
        if (!fs.existsSync(PRESET_FILE)) return {};
        const raw = fs.readFileSync(PRESET_FILE, 'utf-8');
        return JSON.parse(raw || '{}');
    } catch (err) {
        console.error('Failed to read preset file:', err);
        return {};
    }
}

function writePresetFile(data: any) {
    try {
        fs.writeFileSync(PRESET_FILE, JSON.stringify(data, null, 2), 'utf-8');
    } catch (err) {
        console.error('Failed to write preset file:', err);
        throw err;
    }
}

function savePreset(guildId: string, name: string, allowInput: string, denyInput: string) {
    const all = readPresetFile();
    if (!all[guildId]) all[guildId] = {};
    all[guildId][name] = { allow: allowInput, deny: denyInput, savedAt: new Date().toISOString() };
    writePresetFile(all);
}

function deletePreset(guildId: string, name: string) {
    const all = readPresetFile();
    if (!all[guildId] || !all[guildId][name]) return false;
    delete all[guildId][name];
    writePresetFile(all);
    return true;
}

function listPresets(guildId: string) {
    const all = readPresetFile();
    if (!all[guildId]) return {};
    return all[guildId];
}

function overwritesEqual(a: any, b: any): boolean {
    const aArr: any[] = Array.from(a?.values?.() ?? []);
    const bArr: any[] = Array.from(b?.values?.() ?? []);

    if (aArr.length !== bArr.length) return false;

    const bMap = new Map<string, any>();
    for (const ow of bArr) {
        if (!ow || !ow.id) continue;
        bMap.set(String(ow.id), ow);
    }

    for (const owA of aArr) {
        if (!owA || !owA.id) return false;
        const owB = bMap.get(String(owA.id));
        if (!owB) return false;

        const allowA = typeof owA.allow?.bitfield !== 'undefined' ? BigInt(owA.allow.bitfield) : BigInt(owA.allow ?? 0);
        const denyA = typeof owA.deny?.bitfield !== 'undefined' ? BigInt(owA.deny.bitfield) : BigInt(owA.deny ?? 0);

        const allowB = typeof owB.allow?.bitfield !== 'undefined' ? BigInt(owB.allow.bitfield) : BigInt(owB.allow ?? 0);
        const denyB = typeof owB.deny?.bitfield !== 'undefined' ? BigInt(owB.deny.bitfield) : BigInt(owB.deny ?? 0);

        if (allowA !== allowB) return false;
        if (denyA !== denyB) return false;
        if (owA.type !== owB.type) return false;
    }

    return true;
}

function isSyncedToParent(ch: EditableChannel): boolean {
    const parent = (ch as any).parent as CategoryChannel | null;
    if (!parent) return false;

    const childOverwrites = (ch as any).permissionOverwrites?.cache ?? (ch as any).permissionOverwrites;
    const parentOverwrites = (parent as any).permissionOverwrites?.cache ?? (parent as any).permissionOverwrites;

    if (!childOverwrites || !parentOverwrites) return false;

    return overwritesEqual(childOverwrites, parentOverwrites);
}

function errorEmbed(title: string, description?: string) {
    return new EmbedBuilder()
        .setTitle(title)
        .setDescription(description ?? '')
        .setColor(0xff5c5c);
}

function successEmbed(title: string, description?: string) {
    return new EmbedBuilder()
        .setTitle(title)
        .setDescription(description ?? '')
        .setColor(0x57f287);
}

function infoEmbed(title: string, description?: string) {
    return new EmbedBuilder()
        .setTitle(title)
        .setDescription(description ?? '')
        .setColor(0x2f3136);
}

export default {
    data: new SlashCommandBuilder()
        .setName('permissions')
        .setDescription('Manage role permissions across channels and categories (uses embeds).')
        .addSubcommand((sc) =>
            sc
                .setName('apply')
                .setDescription('Apply allow/deny permission changes to selected channels/categories.')
                .addRoleOption(opt => opt.setName('role').setDescription('Role to modify').setRequired(true))
                .addStringOption(opt => opt.setName('allowperms').setDescription('Comma-separated permissions to ALLOW').setRequired(false))
                .addStringOption(opt => opt.setName('denyperms').setDescription('Comma-separated permissions to DENY').setRequired(false))
                .addStringOption(opt => opt.setName('includechannels').setDescription('Comma-separated channel IDs to explicitly include (overrides category selection)').setRequired(false))
                .addStringOption(opt => opt.setName('includecategories').setDescription('Comma-separated category IDs: only modify channels under these (optional)').setRequired(false))
                .addStringOption(opt => opt.setName('excludecategories').setDescription('Comma-separated category IDs to exclude channels under them from modification (optional)').setRequired(false))
                .addBooleanOption(opt => opt.setName('modifycategories').setDescription('Also modify the category objects themselves if their IDs are targeted or matched?').setRequired(false))
                .addStringOption(opt => opt.setName('preset').setDescription('Name of a saved preset to apply (overridden by explicit allow/deny inputs)').setRequired(false))
        )
        .addSubcommand((sc) =>
            sc
                .setName('save')
                .setDescription('Save a permissions preset for this guild (name + allow/deny strings).')
                .addStringOption(opt => opt.setName('name').setDescription('Preset name').setRequired(true))
                .addStringOption(opt => opt.setName('allowperms').setDescription('Comma-separated permissions to ALLOW').setRequired(false))
                .addStringOption(opt => opt.setName('denyperms').setDescription('Comma-separated permissions to DENY').setRequired(false))
        )
        .addSubcommand((sc) =>
            sc
                .setName('list')
                .setDescription('List saved presets for this guild.')
        )
        .addSubcommand((sc) =>
            sc
                .setName('delete')
                .setDescription('Delete a saved preset for this guild.')
                .addStringOption(opt => opt.setName('name').setDescription('Preset name to delete').setRequired(true))
        ),

    async execute(interaction: ChatInputCommandInteraction): Promise<void> {
        if (!interaction.guild) {
            await interaction.reply({ embeds: [errorEmbed('Guild-only command', 'This command must be used in a server (guild).')], ephemeral: true });
            return;
        }

        await interaction.deferReply({ ephemeral: true });

        const sub = interaction.options.getSubcommand(true);

        try {
            if (sub === 'save') {
                const name = interaction.options.getString('name', true).trim();
                const allowInput = interaction.options.getString('allowperms') ?? '';
                const denyInput = interaction.options.getString('denyperms') ?? '';

                savePreset(interaction.guild.id, name, allowInput, denyInput);
                await interaction.editReply({ embeds: [successEmbed('Preset saved', `Saved preset **${name}** for this server.`)] });
                return;
            }

            if (sub === 'list') {
                const presets = listPresets(interaction.guild.id);
                const names = Object.keys(presets);
                if (names.length === 0) {
                    await interaction.editReply({ embeds: [infoEmbed('No presets', 'No presets saved for this server.')] });
                    return;
                }

                const embed = new EmbedBuilder()
                    .setTitle('Saved presets')
                    .setColor(0x2f3136);

                for (const n of names) {
                    const p = presets[n];
                    const allow = p.allow ?? '';
                    const deny = p.deny ?? '';
                    embed.addFields([{ name: n, value: `Allow: ${allow || '(none)'}\nDeny: ${deny || '(none)'}\nSaved: ${p.savedAt ?? 'unknown'}`, inline: false }]);
                }

                await interaction.editReply({ embeds: [embed] });
                return;
            }

            if (sub === 'delete') {
                const name = interaction.options.getString('name', true).trim();
                const ok = deletePreset(interaction.guild.id, name);
                if (!ok) {
                    await interaction.editReply({ embeds: [errorEmbed('Preset not found', `Preset **${name}** not found for this server.`)] });
                } else {
                    await interaction.editReply({ embeds: [successEmbed('Preset deleted', `Deleted preset **${name}**.`)] });
                }
                return;
            }

            if (sub === 'apply') {
                const role = interaction.options.getRole('role', true) as Role;
                let allowInput = interaction.options.getString('allowperms') ?? '';
                let denyInput = interaction.options.getString('denyperms') ?? '';
                const includeChannelsInput = interaction.options.getString('includechannels') ?? '';
                const includeCategoriesInput = interaction.options.getString('includecategories') ?? '';
                const excludeCategoriesInput = interaction.options.getString('excludecategories') ?? '';
                const modifyCategories = interaction.options.getBoolean('modifycategories') ?? false;
                const presetName = interaction.options.getString('preset') ?? '';

                if (presetName) {
                    const presets = listPresets(interaction.guild.id);
                    if (!presets[presetName]) {
                        await interaction.editReply({ embeds: [errorEmbed('Preset not found', `Preset **${presetName}** not found for this server.`)] });
                        return;
                    }
                    const p = presets[presetName];
                    if (!allowInput) allowInput = p.allow ?? '';
                    if (!denyInput) denyInput = p.deny ?? '';
                }

                const { flags: allowFlagsRaw, invalid: invalidAllow } = parsePermissions(allowInput);
                const { flags: denyFlagsRaw, invalid: invalidDeny } = parsePermissions(denyInput);

                const invalidAll = [...invalidAllow, ...invalidDeny];
                if (invalidAll.length > 0) {
                    await interaction.editReply({
                        embeds: [errorEmbed('Invalid permission names', `Invalid: ${invalidAll.join(', ')}. Use PermissionFlagsBits keys (e.g. ViewChannel) or common synonyms.`)],
                    });
                    return;
                }

                const finalAllow = allowFlagsRaw;
                const finalDeny = denyFlagsRaw;

                const allowBitfield = finalAllow.length ? PermissionsBitField.resolve(finalAllow) : 0n;
                const denyBitfield = finalDeny.length ? PermissionsBitField.resolve(finalDeny) : 0n;

                const explicitChannelIds = includeChannelsInput.split(',').map(s => s.trim()).filter(Boolean);
                const includeCategoryIds = includeCategoriesInput.split(',').map(s => s.trim()).filter(Boolean);
                const excludeCategoryIds = excludeCategoriesInput.split(',').map(s => s.trim()).filter(Boolean);

                const guildChannels = interaction.guild.channels.cache;

                const categoriesToEdit = new Map<string, CategoryChannel>();
                const channelsToEdit: EditableChannel[] = [];

                if (explicitChannelIds.length > 0) {
                    for (const id of explicitChannelIds) {
                        const ch = guildChannels.get(id);
                        if (!ch) continue;
                        if (!isEditableChannel(ch)) continue;

                        if ((ch as any).type === ChannelType.GuildCategory) {
                            if (modifyCategories) {
                                categoriesToEdit.set(ch.id, ch as CategoryChannel);
                            } else {
                                continue;
                            }
                            continue;
                        }

                        const parent = (ch as any).parent as CategoryChannel | null;
                        if (parent && excludeCategoryIds.includes(parent.id)) continue;

                        if (parent) {
                            if (!isSyncedToParent(ch as EditableChannel)) {
                                continue;
                            }
                            if (includeCategoryIds.length > 0 && includeCategoryIds.includes(parent.id)) {
                                continue;
                            }
                        }

                        channelsToEdit.push(ch as EditableChannel);
                    }
                } else {
                    guildChannels.forEach(ch => {
                        if (!isEditableChannel(ch)) return;

                        if ((ch as any).type === ChannelType.GuildCategory) {
                            if (modifyCategories) {
                                if (includeCategoryIds.length > 0) {
                                    if (includeCategoryIds.includes(ch.id)) categoriesToEdit.set(ch.id, ch as CategoryChannel);
                                } else {
                                    categoriesToEdit.set(ch.id, ch as CategoryChannel);
                                }
                            }
                            return;
                        }

                        const parent = (ch as any).parent as CategoryChannel | null;

                        if (includeCategoryIds.length > 0) {
                            if (parent) {
                                if (!includeCategoryIds.includes(parent.id)) return;
                            } else {
                            }
                        }

                        if (parent && excludeCategoryIds.includes(parent.id)) return;

                        if (parent) {
                            if (!isSyncedToParent(ch as EditableChannel)) return;
                        }

                        channelsToEdit.push(ch as EditableChannel);
                    });
                }

                if (includeCategoryIds.length > 0) {
                    for (const catId of includeCategoryIds) {
                        const c = guildChannels.get(catId);
                        if (c && (c as any).type === ChannelType.GuildCategory) {
                            categoriesToEdit.set(catId, c as CategoryChannel);
                        }
                    }
                }

                const finalChannels = channelsToEdit.filter(ch => {
                    const parent = (ch as any).parent as CategoryChannel | null;
                    if (parent && categoriesToEdit.has(parent.id)) return false;
                    return true;
                });

                const uniqueChannels = Array.from(new Map(finalChannels.map(c => [c.id, c])).values());

                if (categoriesToEdit.size === 0 && uniqueChannels.length === 0) {
                    await interaction.editReply({ embeds: [infoEmbed('Nothing to do', 'No editable categories/channels found with the provided parameters.')] });
                    return;
                }

                const overwriteOptions = buildOverwriteOptions(allowBitfield, denyBitfield);

                const failed: string[] = [];
                let successCount = 0;

                for (const [id, cat] of categoriesToEdit) {
                    try {
                        await (cat as any).permissionOverwrites.edit(role, overwriteOptions);
                        successCount++;
                    } catch (err) {
                        console.error(`Failed to edit category ${id}:`, err);
                        failed.push(`${id} (category)`);
                    }
                }

                for (const ch of uniqueChannels) {
                    try {
                        await (ch as any).permissionOverwrites.edit(role, overwriteOptions);
                        successCount++;
                    } catch (err) {
                        console.error(`Failed to edit channel ${ch.id}:`, err);
                        failed.push(ch.id);
                    }
                }

                const summaryEmbed = new EmbedBuilder()
                    .setTitle('Permissions applied')
                    .setColor(0x57f287)
                    .addFields(
                        { name: 'Role', value: `<@&${role.id}>`, inline: true },
                        { name: 'Categories processed', value: `${categoriesToEdit.size}`, inline: true },
                        { name: 'Channels processed', value: `${uniqueChannels.length}`, inline: true },
                        { name: 'Successful updates', value: `${successCount}`, inline: true },
                    );

                if (failed.length > 0) {
                    const failedDisplay = failed.length > 10 ? `${failed.slice(0, 10).join(', ')}... (+${failed.length - 10} more)` : failed.join(', ');
                    summaryEmbed.addFields({ name: `Failed (${failed.length})`, value: failedDisplay, inline: false });
                    summaryEmbed.setColor(0xff5c5c);
                }

                await interaction.editReply({ embeds: [summaryEmbed] });
                return;
            }

            await interaction.editReply({ embeds: [errorEmbed('Unknown subcommand', 'The subcommand was not recognized.')] });
        } catch (err) {
            console.error('Permissions command error:', err);
            await interaction.editReply({ embeds: [errorEmbed('Command error', String(err))] });
        }
    },
};
