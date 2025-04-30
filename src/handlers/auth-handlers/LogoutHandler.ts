import {
    IHttp,
    IModify,
    IPersistence,
    IRead,
} from '@rocket.chat/apps-engine/definition/accessors';
import { IUser } from '@rocket.chat/apps-engine/definition/users';
import { SlashCommandContext } from '@rocket.chat/apps-engine/definition/slashcommands';
import { RocketMailApp } from '../../../RocketMailApp';
import { GoogleOAuthService } from '../../email-providers/OAuth/GoogleOAuthService';
import { ButtonStyle } from '@rocket.chat/apps-engine/definition/uikit';

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

        const oauthService = new GoogleOAuthService(http, persistence, read, this.app.getLogger(), settings);
        await oauthService.initialize();

        const appUser = await read.getUserReader().getAppUser() as IUser;
        // Create message builder
        const messageBuilder = modify
            .getCreator()
            .startMessage()
            .setSender(appUser)
            .setRoom(room)
            .setGroupable(false);

        try {
            // Check if user is authenticated first
            const isAuthenticated = await oauthService.isAuthenticated(sender.id);

            if (!isAuthenticated) {
                messageBuilder.setText('❌ You are not currently authenticated with an email provider. Use `/rocket-mail login` to login.');
                return read.getNotifier().notifyUser(sender, messageBuilder.getMessage());
            }

            // Get user info to show in confirmation message
            const userInfo = await oauthService.getUserInfo(sender.id);

            // Create a UI block with a confirmation button
            const block = modify.getCreator().getBlockBuilder();

            block.addSectionBlock({
                text: block.newMarkdownTextObject(
                    `🔓 Are you sure you want to logout from *${userInfo.email}*?`
                ),
            });

            block.addActionsBlock({
                elements: [
                    block.newButtonElement({
                        actionId: "gmail_logout_action",
                        text: block.newPlainTextObject("Confirm Logout"),
                        style: ButtonStyle.DANGER,
                    }),
                ],
            });

            // Set the blocks in the message
            messageBuilder.setBlocks(block.getBlocks());
            return read.getNotifier().notifyUser(sender, messageBuilder.getMessage());

        } catch (error) {
            messageBuilder.setText(`❌ Error preparing logout: ${error.message}`);
            return read.getNotifier().notifyUser(sender, messageBuilder.getMessage());
        }
    }

    /**
     * Handle the actual logout when the button is clicked
     */
    public async handleLogoutAction(
        user: IUser,
        room: any,
        read: IRead,
        modify: IModify,
        http: IHttp,
        persistence: IPersistence
    ): Promise<void> {
        // Initialize OAuth service
        const settings = {
            get: async (key: string) => {
                const settingsReader = read.getEnvironmentReader().getSettings();
                return await settingsReader.getValueById(key) as string;
            }
        };

        const oauthService = new GoogleOAuthService(http, persistence, read, this.app.getLogger(), settings);
        await oauthService.initialize();

        const appUser = await read.getUserReader().getAppUser() as IUser;
        const messageBuilder = modify
            .getCreator()
            .startMessage()
            .setSender(appUser)
            .setRoom(room)
            .setGroupable(false);

        try {
            // Attempt to revoke the token
            const success = await oauthService.revokeToken(user.id);

            if (success) {
                messageBuilder.setText('✅ Successfully Logged Out from your email account.');
                return read.getNotifier().notifyUser(user, messageBuilder.getMessage());
            } else {
                messageBuilder.setText('❌ Error during logout process. Please try again.');
                return read.getNotifier().notifyUser(user, messageBuilder.getMessage());
            }
        } catch (error) {
            messageBuilder.setText(`❌ Error logging out: ${error.message}`);
            return read.getNotifier().notifyUser(user, messageBuilder.getMessage());
        }
    }
}
