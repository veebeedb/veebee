import { Client, GuildMember } from "discord.js";
import { getAutorole } from "../../roles/autorole";

export default (client: Client) => {
    client.on("guildMemberAdd", async (member: GuildMember) => {
        const roleId = getAutorole(member.guild.id);
        if (!roleId) return;

        const botMember = await member.guild.members.fetchMe();
        const role = member.guild.roles.cache.get(roleId);
        if (!role || botMember.roles.highest.position <= role.position) return;

        try {
            await member.roles.add(role);
        } catch (error) {
            console.error(`[Autorole] Failed to assign ${role.name} to ${member.user.tag}`, error);
        }
    });
};
