import type { Request, Response, NextFunction } from "express";
import fetch from "node-fetch";
import "../types.d";

export async function verifyDiscordToken(req: Request, res: Response, next: NextFunction) {
    const authHeader = req.headers.authorization;
    
    if (!authHeader) {
        return res.status(401).json({
            success: false,
            message: "No authorization token provided"
        });
    }
    
    try {
        const response = await fetch("https://discord.com/api/users/@me", {
            headers: {
                Authorization: authHeader
            }
        });
        
        if (!response.ok) {
            return res.status(401).json({
                success: false,
                message: "Invalid Discord token"
            });
        }
        
        const userData = await response.json() as Record<string, unknown>;
        
        if (!userData || 
            typeof userData.id !== 'string' || 
            typeof userData.username !== 'string' || 
            typeof userData.discriminator !== 'string') {
            return res.status(401).json({
                success: false,
                message: "Invalid Discord user data"
            });
        }

        req.user = {
            id: userData.id,
            username: userData.username,
            discriminator: userData.discriminator,
            avatar: typeof userData.avatar === 'string' ? userData.avatar : undefined,
            bot: typeof userData.bot === 'boolean' ? userData.bot : undefined,
            system: typeof userData.system === 'boolean' ? userData.system : undefined,
            mfa_enabled: typeof userData.mfa_enabled === 'boolean' ? userData.mfa_enabled : undefined,
            locale: typeof userData.locale === 'string' ? userData.locale : undefined,
            verified: typeof userData.verified === 'boolean' ? userData.verified : undefined,
            email: typeof userData.email === 'string' ? userData.email : undefined,
            flags: typeof userData.flags === 'number' ? userData.flags : undefined,
            premium_type: typeof userData.premium_type === 'number' ? userData.premium_type : undefined,
            public_flags: typeof userData.public_flags === 'number' ? userData.public_flags : undefined
        };
        next();
    } catch (error) {
        console.error("Error verifying Discord token:", error);
        res.status(500).json({
            success: false,
            message: "Failed to verify Discord token"
        });
    }
}
