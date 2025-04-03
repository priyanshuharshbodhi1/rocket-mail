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

export class AuthCommand implements ISlashCommand {
    public command = 'auth';
    public i18nDescription = 'Authenticate with Google Gmail';
    public i18nParamsExample = 'login | logout';
    public providesPreview = false;

    constructor(private readonly app: RocketMailApp) {}

    public async executor(
        context: SlashCommandContext,
        read: IRead,
        modify: IModify,
        http: IHttp,
        persistence: IPersistence
    ): Promise<void> {
        const [action = 'status'] = context.getArguments();
        const sender = context.getSender();
        const room = context.getRoom();

        // Initialize OAuth service
        const settings = {
            get: async (key: string) => {
                switch(key) {
                    case 'oauth_client_id':
                        return await this.app.getOAuthClientId();
                    case 'oauth_client_secret':
                        return await this.app.getOAuthClientSecret();
                    case 'oauth_redirect_uri':
                        return await this.app.getOAuthRedirectUri();
                    default:
                        return '';
                }
            }
        };

        const oauthService = new OAuthService(http, persistence, read, this.app.getLogger(), settings);
        await oauthService.initialize();

        // Create message builder
        const messageBuilder = modify
            .getCreator()
            .startMessage()
            .setSender(sender)
            .setRoom(room);

        switch (action.toLowerCase()) {
            case 'login':
                await this.handleLogin(oauthService, sender.id, messageBuilder);
                break;

            case 'logout':
                await this.handleLogout(oauthService, sender.id, messageBuilder, persistence);
                break;

            case 'status':
            default:
                await this.handleStatus(oauthService, sender.id, messageBuilder);
                break;
        }
    }

    /**
     * Handle login action - generate and send OAuth URL
     */
    private async handleLogin(
        oauthService: OAuthService,
        userId: string,
        messageBuilder: any
    ): Promise<void> {
        try {
            // Generate the authorization URL
            const authUrl = await oauthService.getAuthorizationUrl(userId);

            // Send message with auth URL
            await messageBuilder
                .setText(`🔐 Connect your Gmail account by clicking this link: [Click here to authenticate with Google](${authUrl})`)
                .build();
        } catch (error) {
            await messageBuilder
                .setText(`❌ Error generating authentication URL: ${error.message}`)
                .build();
        }
    }

    /**
     * Handle logout action - revoke tokens and clear credentials
     */
    private async handleLogout(
        oauthService: OAuthService,
        userId: string,
        messageBuilder: any,
        persistence: IPersistence
    ): Promise<void> {
        try {
            // Attempt to revoke the token
            const success = await oauthService.revokeToken(userId);

            if (success) {
                await messageBuilder
                    .setText('✅ Successfully disconnected your Gmail account.')
                    .build();
            } else {
                await messageBuilder
                    .setText('❌ You are not currently authenticated with Gmail.')
                    .build();
            }
        } catch (error) {
            await messageBuilder
                .setText(`❌ Error logging out: ${error.message}`)
                .build();
        }
    }

    /**
     * Handle status action - check if user is authenticated
     */
    private async handleStatus(
        oauthService: OAuthService,
        userId: string,
        messageBuilder: any
    ): Promise<void> {
        try {
            // Check if the user is authenticated
            const isAuthenticated = await oauthService.isAuthenticated(userId);

            if (isAuthenticated) {
                // Get user email if possible
                const userInfo = await oauthService.getUserInfo(userId);
                const emailDisplay = userInfo?.email ? ` as ${userInfo.email}` : '';

                await messageBuilder
                    .setText(`✅ You are currently authenticated with Gmail${emailDisplay}.`)
                    .build();
            } else {
                await messageBuilder
                    .setText('🔒 You are not currently authenticated with Gmail. Use `/rocket-mail auth login` to connect your account.')
                    .build();
            }
        } catch (error) {
            await messageBuilder
                .setText(`❌ Error checking authentication status: ${error.message}`)
                .build();
        }
    }
}
