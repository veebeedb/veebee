import {
    SlashCommandBuilder,
    ChatInputCommandInteraction,
    PermissionFlagsBits,
    GuildMember,
    Role,
    User
} from "discord.js";
import { setAutorole, getAutorole, deleteAutorole } from "../../cogs/roles/autorole";

export default {
    data: new SlashCommandBuilder()
        .setName("role")
        .setDescription("Manage server roles")
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
        ),

    async execute(interaction: ChatInputCommandInteraction) {
        const sub = interaction.options.getSubcommand();
        const guild = interaction.guild;

        if (!guild) {
            return interaction.reply({ content: "You must use this in a server.", ephemeral: true });
        }

        const botMember = await guild.members.fetchMe();
        if (!botMember.permissions.has(PermissionFlagsBits.ManageRoles)) {
            return interaction.reply({ content: "I need Manage Roles permission to do that.", ephemeral: true });
        }

        switch (sub) {
            case "set-autorole": {
                const role = interaction.options.getRole("role", true) as Role;

                if (role.position >= botMember.roles.highest.position) {
                    return interaction.reply({ content: "I can't assign that role (it's higher than mine).", ephemeral: true });
                }

                setAutorole(guild.id, role.id);
                return interaction.reply({ content: `Autorole set to **${role.name}**.`, ephemeral: true });
            }

            case "remove-autorole": {
                deleteAutorole(guild.id);
                return interaction.reply({ content: "Autorole removed.", ephemeral: true });
            }

            case "view": {
                const roleId = getAutorole(guild.id);
                if (!roleId) {
                    return interaction.reply({ content: "No autorole is currently set.", ephemeral: true });
                }

                const role = guild.roles.cache.get(roleId);
                if (!role) {
                    deleteAutorole(guild.id);
                    return interaction.reply({ content: "The autorole no longer exists and was cleared.", ephemeral: true });
                }

                return interaction.reply({ content: `Current autorole: **${role.name}**`, ephemeral: true });
            }

            case "give": {
                const user = interaction.options.getUser("user", true) as User;
                const role = interaction.options.getRole("role", true) as Role;
                const member = await guild.members.fetch(user.id);

                if (role.position >= botMember.roles.highest.position) {
                    return interaction.reply({ content: "That role is above my role. I can't assign it.", ephemeral: true });
                }

                try {
                    await (member as GuildMember).roles.add(role);
                    return interaction.reply({ content: `Gave **${role.name}** to ${user.tag}.`, ephemeral: true });
                } catch (error) {
                    console.error(error);
                    return interaction.reply({ content: "Failed to assign role. Check permissions or hierarchy.", ephemeral: true });
                }
            }

            default:
                return interaction.reply({ content: "Unknown subcommand.", ephemeral: true });
        }
    }
};
