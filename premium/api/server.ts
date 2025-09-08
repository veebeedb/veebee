import express from "express";
import type { Request, Response, NextFunction } from "express";
import cors from "cors";
import { ShardingManager } from "discord.js";
import { sql } from "../../cogs/core/database/database";
import { addPremiumUser, removePremiumUser } from "../premiumManager";
import { verifyDiscordToken } from "./middleware/auth";


const app = express();
const PORT = process.env.API_PORT || 3000;

app.use(cors());
app.use(express.json());

interface SubscriptionRequest {
    userId: string;
    durationDays: number;
    paymentId: string;
}

sql`
    CREATE TABLE IF NOT EXISTS premium_subscriptions (
        payment_id TEXT PRIMARY KEY,
        user_id TEXT,
        started_at INTEGER,
        expires_at INTEGER,
        amount REAL,
        currency TEXT
    )
`;

app.post("/api/premium/subscribe", verifyDiscordToken, async (req, res) => {
    const { userId, durationDays, paymentId } = req.body as SubscriptionRequest;
    
    try {
        const startedAt = Date.now();
        const expiresAt = startedAt + (durationDays * 24 * 60 * 60 * 1000);
        
        sql`
            INSERT INTO premium_subscriptions (
                payment_id, user_id, started_at, expires_at, amount, currency
            ) VALUES (
                ${paymentId}, ${userId}, ${startedAt}, ${expiresAt}, ${0}, ${"USD"}
            )
        `;
        
        await addPremiumUser(userId, durationDays, 'API_SUBSCRIPTION');
        
        res.json({
            success: true,
            message: "Premium subscription activated",
            expiresAt
        });
    } catch (error) {
        console.error("Error activating premium:", error);
        res.status(500).json({
            success: false,
            message: "Failed to activate premium subscription"
        });
    }
});

app.get("/api/premium/status/:userId", verifyDiscordToken, async (req, res) => {
    const userId = req.params.userId;
    if (!userId) {
        return res.status(400).json({
            success: false,
            message: "User ID is required"
        });
    }
    
    try {
        const subscription = sql<{expires_at: number}>`
            SELECT expires_at FROM premium_users 
            WHERE user_id = ${userId}
        `;
        
        if (subscription.length === 0) {
            return res.json({
                success: true,
                isPremium: false
            });
        }
        
        const expiresAt = subscription[0]?.expires_at;
        if (!expiresAt) {
            return res.json({
                success: true,
                isPremium: false
            });
        }

        const isPremium = expiresAt > Date.now();
        
        res.json({
            success: true,
            isPremium,
            expiresAt
        });
    } catch (error) {
        console.error("Error checking premium status:", error);
        res.status(500).json({
            success: false,
            message: "Failed to check premium status"
        });
    }
});

app.delete("/api/premium/cancel/:userId", verifyDiscordToken, async (req, res) => {
    const userId = req.params.userId;
    if (!userId) {
        return res.status(400).json({
            success: false,
            message: "User ID is required"
        });
    }
    
    try {
        await removePremiumUser(userId, 'API_SUBSCRIPTION_CANCEL');
        
        sql`
            UPDATE premium_subscriptions 
            SET expires_at = ${Date.now()} 
            WHERE user_id = ${userId} AND expires_at > ${Date.now()}
        `;
        
        res.json({
            success: true,
            message: "Premium subscription cancelled"
        });
    } catch (error) {
        console.error("Error cancelling premium:", error);
        res.status(500).json({
            success: false,
            message: "Failed to cancel premium subscription"
        });
    }
});

export function initializePremiumAPI(manager: ShardingManager) {
    app.set('sharding_manager', manager);

    app.use(async (req, res, next) => {
        const authHeader = req.headers.authorization;
        if (!authHeader) {
            return res.status(401).json({
                success: false,
                message: "No authorization token provided"
            });
        }

        try {
            const results = await manager.broadcastEval(async (c, { token }) => {
                try {
                    const response = await fetch("https://discord.com/api/users/@me", {
                        headers: { Authorization: token }
                    });
                    if (!response.ok) return null;
                    const userData = await response.json() as Record<string, unknown>;
                    
                    if (!userData || 
                        typeof userData.id !== 'string' || 
                        typeof userData.username !== 'string' || 
                        typeof userData.discriminator !== 'string') {
                        return null;
                    }

                    return {
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
                } catch (error) {
                    return null;
                }
            }, { context: { token: authHeader }});

            const user = results.find(result => result !== null);
            if (!user) {
                return res.status(401).json({
                    success: false,
                    message: "Invalid Discord token"
                });
            }

            req.user = user;
            next();
        } catch (error) {
            console.error("Error verifying Discord token:", error);
            res.status(500).json({
                success: false,
                message: "Failed to verify Discord token"
            });
        }
    });

    app.listen(PORT, () => {
        console.log(`Premium API running on port ${PORT}`);
    });
}
