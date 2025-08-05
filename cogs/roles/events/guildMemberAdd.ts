import { Client, GuildMember, PermissionsBitField } from "discord.js";
import { getAutorole } from "../autorole";

export default (client: Client) => {
    client.on("guildMemberAdd", async (member: GuildMember) => {
        const roleId = getAutorole(member.guild.id);
        if (!roleId) return;

        const botMember = await member.guild.members.fetchMe();
        const role = member.guild.roles.cache.get(roleId);

        if (!role) {
            console.log(`[Autorole] Role ${roleId} not found in guild ${member.guild.name}`);
            return;
        }

        if (!botMember.permissions.has(PermissionsBitField.Flags.ManageRoles)) {
            console.log(`[Autorole] Missing Manage Roles permission in ${member.guild.name}`);
            return;
        }

        if (botMember.roles.highest.position <= role.position) {
            console.log(`[Autorole] Role ${role.name} is higher than bot's highest role in ${member.guild.name}`);
            return;
        }

        try {
            await member.roles.add(role);
            console.log(`[Autorole] Assigned ${role.name} to ${member.user.tag} in ${member.guild.name}`);
        } catch (error) {
            console.error(`[Autorole] Failed to assign ${role.name} to ${member.user.tag} in ${member.guild.name}`, error);
        }
    });
};