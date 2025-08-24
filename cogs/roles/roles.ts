import {
    SlashCommandBuilder,
    ChatInputCommandInteraction,
    PermissionFlagsBits,
    GuildMember,
    Role,
    User,
    MessageFlags
} from "discord.js";
import { setAutorole, getAutorole, deleteAutorole } from "./autorole";

export default {
    data: new SlashCommandBuilder()
        .setName("role")
        .setDescription("Manage server roles")
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
        .addSubcommand(sub =>
            sub.setName("set-autorole")
                .setDescription("Set a role to auto-assign on join")
                .addRoleOption(option =>
                    option.setName("role")
                        .setDescription("Role to assign")
                        .setRequired(true)
                )
        )
        .addSubcommand(sub =>
            sub.setName("remove-autorole")
                .setDescription("Remove the current autorole")
        )
        .addSubcommand(sub =>
            sub.setName("view")
                .setDescription("View the current autorole")
        )
        .addSubcommand(sub =>
            sub.setName("give")
                .setDescription("Manually give a role to someone")
                .addUserOption(option =>
                    option.setName("user")
                        .setDescription("User to give the role to")
                        .setRequired(true)
                )
                .addRoleOption(option =>
                    option.setName("role")
                        .setDescription("Role to assign")
                        .setRequired(true)
                )
        )
        .addSubcommand(sub =>
            sub.setName("take")
                .setDescription("Manually remove a role from someone")
                .addUserOption(option =>
                    option.setName("user")
                        .setDescription("User to remove the role from")
                        .setRequired(true)
                )
                .addRoleOption(option =>
                    option.setName("role")
                        .setDescription("Role to remove")
                        .setRequired(true)
                )
        ),

    async execute(interaction: ChatInputCommandInteraction) {
        if (!interaction.inGuild()) {
            return interaction.reply({
                content: "You must use this command in a server.",
                flags: MessageFlags.Ephemeral
            });
        }

        const sub = interaction.options.getSubcommand();
        const guild = interaction.guild;

        if (!guild) {
            return interaction.reply({
                content: "This command must be used in a server.",
                flags: MessageFlags.Ephemeral
            });
        }

        try {
            const botMember = await guild.members.fetchMe();
            if (!botMember.permissions.has(PermissionFlagsBits.ManageRoles)) {
                return interaction.reply({
                    content: "I need the Manage Roles permission to do that.",
                    flags: MessageFlags.Ephemeral
                });
            }

            switch (sub) {
                case "set-autorole": {
                    const role = interaction.options.getRole("role", true) as Role;

                    if (role.position >= botMember.roles.highest.position) {
                        return interaction.reply({
                            content: "I can't assign that role (it's higher than my highest role).",
                            flags: MessageFlags.Ephemeral
                        });
                    }

                    const success = setAutorole(guild.id, role.id);
                    if (!success) throw new Error("Failed to set autorole in database");

                    return interaction.reply({
                        content: `Autorole set to ${role.name}`,
                        flags: MessageFlags.Ephemeral
                    });
                }

                case "remove-autorole": {
                    const success = deleteAutorole(guild.id);
                    if (!success) throw new Error("Failed to delete autorole from database");

                    return interaction.reply({
                        content: "Autorole removed",
                        flags: MessageFlags.Ephemeral
                    });
                }

                case "view": {
                    const roleId = getAutorole(guild.id);
                    if (!roleId) {
                        return interaction.reply({
                            content: "No autorole is currently set",
                            flags: MessageFlags.Ephemeral
                        });
                    }

                    const role = guild.roles.cache.get(roleId);
                    if (!role) {
                        deleteAutorole(guild.id);
                        return interaction.reply({
                            content: "The autorole no longer exists and has been cleared",
                            flags: MessageFlags.Ephemeral
                        });
                    }

                    return interaction.reply({
                        content: `Current autorole: ${role.name}`,
                        flags: MessageFlags.Ephemeral
                    });
                }

                case "give": {
                    const user = interaction.options.getUser("user", true);
                    const role = interaction.options.getRole("role", true) as Role;
                    const member = await guild.members.fetch(user.id);

                    if (role.position >= botMember.roles.highest.position) {
                        return interaction.reply({
                            content: "That role is above my highest role. I can't assign it.",
                            flags: MessageFlags.Ephemeral
                        });
                    }

                    if (member.roles.cache.has(role.id)) {
                        return interaction.reply({
                            content: `${user.tag} already has the ${role.name} role`,
                            flags: MessageFlags.Ephemeral
                        });
                    }

                    await member.roles.add(role);
                    return interaction.reply({
                        content: `Gave ${role.name} to ${user.tag}`,
                        flags: MessageFlags.Ephemeral
                    });
                }

                case "take": {
                    const user = interaction.options.getUser("user", true);
                    const role = interaction.options.getRole("role", true) as Role;
                    const member = await guild.members.fetch(user.id);

                    if (role.position >= botMember.roles.highest.position) {
                        return interaction.reply({
                            content: "That role is above my highest role. I can't remove it.",
                            flags: MessageFlags.Ephemeral
                        });
                    }

                    if (!member.roles.cache.has(role.id)) {
                        return interaction.reply({
                            content: `${user.tag} doesn't have the ${role.name} role`,
                            flags: MessageFlags.Ephemeral
                        });
                    }

                    await member.roles.remove(role);
                    return interaction.reply({
                        content: `Removed ${role.name} from ${user.tag}`,
                        flags: MessageFlags.Ephemeral
                    });
                }

                default:
                    return interaction.reply({
                        content: "Unknown subcommand",
                        flags: MessageFlags.Ephemeral
                    });
            }
        } catch (error) {
            console.error(`[Role Command] Error in ${sub} subcommand:`, error);
            return interaction.reply({
                content: "An error occurred while processing your request",
                flags: MessageFlags.Ephemeral
            });
        }
    }
};