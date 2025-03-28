import {
    IHttp,
    IModify,
    IPersistence,
    IRead,
} from '@rocket.chat/apps-engine/definition/accessors';
import { SlashCommandContext } from '@rocket.chat/apps-engine/definition/slashcommands';
import { RocketMailApp } from '../RocketMailApp';
import { OAuthService } from '../services/OAuthService';

export class LogoutCommand {
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

        // Initialize OAuth service
        const settings = {
            get: async (key: string) => {
                const settingsReader = read.getEnvironmentReader().getSettings();
                return await settingsReader.getValueById(key) as string;
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

        try {
            // Attempt to revoke the token
            const success = await oauthService.revokeToken(sender.id);
            
            if (success) {
                messageBuilder.setText('✅ Successfully disconnected your email account.');
                await modify.getCreator().finish(messageBuilder);
            } else {
                messageBuilder.setText('❌ You are not currently authenticated with an email provider.');
                await modify.getCreator().finish(messageBuilder);
            }
        } catch (error) {
            messageBuilder.setText(`❌ Error logging out: ${error.message}`);
            await modify.getCreator().finish(messageBuilder);
        }
    }
}
