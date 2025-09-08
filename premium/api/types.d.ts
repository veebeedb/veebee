import { Request } from 'express';

declare global {
    namespace Express {
        interface Request {
            user?: {
                id: string;
                username: string;
                discriminator: string;
                avatar?: string;
                bot?: boolean;
                system?: boolean;
                mfa_enabled?: boolean;
                locale?: string;
                verified?: boolean;
                email?: string;
                flags?: number;
                premium_type?: number;
                public_flags?: number;
            }
        }
    }
}

export {};
