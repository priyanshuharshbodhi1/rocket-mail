import {
    IHttp,
    IModify,
    IPersistence,
    IRead,
} from '@rocket.chat/apps-engine/definition/accessors';
import {
    ISlashCommand,
    SlashCommandContext,
} from '@rocket.chat/apps-engine/definition/slashcommands';
import { RocketMailApp } from '../../RocketMailApp';
import { OAuthService } from '../email-providers/OAuth/OAuthService';
import { getEmailSettings } from '../config/SettingsManager';
import { EmailProviders } from '../types/enums/EmailProviders';

export class LoginCommand implements ISlashCommand {
    public command = 'login';
    public i18nDescription = 'Login to your email provider';
    public i18nParamsExample = '';
    public providesPreview = false;

    constructor(private readonly app: RocketMailApp) {}

    public async executor(
        context: SlashCommandContext,
        read: IRead,
        modify: IModify,
        http: IHttp,
        persistence: IPersistence
    ): Promise<void> {
        const sender = context.getSender();
        const room = context.getRoom();

        // Create message builder
        const messageBuilder = modify
            .getCreator()
            .startMessage()
            .setSender(sender)
            .setRoom(room);

        try {
            // Get email settings to determine provider
            const settings = await getEmailSettings(read.getEnvironmentReader().getSettings());

            // Initialize OAuth service
            const oauthSettings = {
                get: async (key: string) => {
                    const settingsReader = read.getEnvironmentReader().getSettings();
                    return await settingsReader.getValueById(key) as string;
                }
            };

            const oauthService = new OAuthService(http, persistence, read, this.app.getLogger(), oauthSettings);
            await oauthService.initialize();

            // Check if user is already authenticated
            const isAuthenticated = await oauthService.isAuthenticated(sender.id);
            if (isAuthenticated) {
                const userInfo = await oauthService.getUserInfo(sender.id);
                messageBuilder.setText(`✅ You are already logged in as ${userInfo.email}. If you want to logout, use \`/rocket-mail logout\`.`);
                await modify.getCreator().finish(messageBuilder);
                return;
            }

            // Handle provider-specific login
            switch (settings.provider) {
                case EmailProviders.GMAIL:
                    await this.handleGmailLogin(oauthService, sender.id, messageBuilder, modify);
                    break;
                case EmailProviders.OUTLOOK:
                case EmailProviders.YAHOO:
                case EmailProviders.PROTON:
                    messageBuilder.setText(`⚠️ Authentication for ${settings.provider} is not yet implemented. Please use Gmail for now.`);
                    await modify.getCreator().finish(messageBuilder);
                    break;
                default:
                    messageBuilder.setText(`❌ Unknown email provider: ${settings.provider}`);
                    await modify.getCreator().finish(messageBuilder);
            }
        } catch (error) {
            this.app.getLogger().error('Error in login command:', error);
            messageBuilder.setText(`❌ Error processing login: ${error.message}`);
            await modify.getCreator().finish(messageBuilder);
        }
    }

    /**
     * Handle Gmail login - generate and send OAuth URL
     */
    private async handleGmailLogin(
        oauthService: OAuthService,
        userId: string,
        messageBuilder: any,
        modify: IModify
    ): Promise<void> {
        try {
            // Generate the authorization URL
            const authUrl = await oauthService.getAuthorizationUrl(userId);

            // Send message with auth URL as a clickable link
            messageBuilder.setText(`🔐 Connect your Gmail account: [Click here to Login](${authUrl})`);
            await modify.getCreator().finish(messageBuilder);
        } catch (error) {
            messageBuilder.setText(`❌ Error generating authentication URL: ${error.message}`);
            await modify.getCreator().finish(messageBuilder);
        }
    }
}
