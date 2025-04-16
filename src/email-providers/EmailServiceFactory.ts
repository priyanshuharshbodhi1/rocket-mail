import { IHttp, ILogger, IPersistence, IRead } from '@rocket.chat/apps-engine/definition/accessors';
import { IEmailSettings } from '../types/interfaces/IEmailService';
import { GmailService } from '../services/GmailService';
import { GoogleOAuthService } from './OAuth/GoogleOAuthService';
import { EmailProviders } from '../types/enums/EmailProviders';

export class EmailServiceFactory {
    /**
     * Create an email service instance based on the email provider
     */
    public static async createEmailService(
        settings: IEmailSettings,
        userId: string,
        logger: ILogger,
        http: IHttp,
        read: IRead,
        persistence: IPersistence
    ): Promise<GmailService> {
        logger.debug('EmailServiceFactory.createEmailService -> Creating service for provider:', settings.provider);

        if (settings.provider === EmailProviders.GMAIL) {
            // Create the OAuth service
            const oauthSettings = {
                get: async (key: string) => {
                    const settingsReader = read.getEnvironmentReader().getSettings();
                    return await settingsReader.getValueById(key) as string;
                }
            };

            const oauthService = new GoogleOAuthService(http, persistence, read, logger, oauthSettings);
            await oauthService.initialize();

            // Check if the user is authenticated
            const isAuthenticated = await oauthService.isAuthenticated(userId);
            if (!isAuthenticated) {
                try {
                    // Generate authorization URL
                    const authUrl = await oauthService.getAuthorizationUrl(userId);

                    // Simply provide a link for authentication
                    throw new Error(`You need to authenticate with ${settings.provider} first. Use /rocket-mail login command or [Click here to Login](${authUrl})`);
                } catch (error) {
                    // Handle any errors in generating the authentication URL
                    if (error.message.includes(`authenticate with ${settings.provider} first`)) {
                        throw error; // Re-throw our custom error message
                    } else {
                        throw new Error(`Authentication error: ${error.message}. Please try /rocket-mail login to authenticate.`);
                    }
                }
            }

            try {
                // Create and return a Gmail service
                return new GmailService(userId, oauthService, http, logger);
            } catch (error) {
                // Handle errors that might be related to token expiration
                if (error.message.includes('expired') || error.message.includes('invalid') || error.message.includes('authentication')) {
                    // Try to trigger a login flow
                    const authUrl = await oauthService.getAuthorizationUrl(userId);
                    throw new Error(`Your authentication has expired. Please use /rocket-mail login to re-authenticate or click this link: ${authUrl}`);
                }
                throw error;
            }
        }

        //IMPORTANT: For other providers (to be implemented later)
        throw new Error(`Email provider ${settings.provider} is not supported yet. Currently only Gmail is supported.`);
    }
}
