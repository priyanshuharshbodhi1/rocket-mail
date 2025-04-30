import {
    IHttp,
    IModify,
    IPersistence,
    IRead,
} from "@rocket.chat/apps-engine/definition/accessors";
import { IRoom } from "@rocket.chat/apps-engine/definition/rooms";
import { IUser } from "@rocket.chat/apps-engine/definition/users";
import {
    ISlashCommand,
    SlashCommandContext,
} from "@rocket.chat/apps-engine/definition/slashcommands";
import { ButtonStyle } from '@rocket.chat/apps-engine/definition/uikit';
import { BlockBuilder } from "@rocket.chat/apps-engine/definition/uikit";
import { RocketMailApp } from "../../../RocketMailApp";
import { GoogleOAuthService } from "../../email-providers/OAuth/GoogleOAuthService";
import { getEmailSettings } from "../../config/SettingsManager";
import { EmailProviders } from "../../types/enums/EmailProviders";

export class LoginCommand implements ISlashCommand {
    public command = "login";
    public i18nDescription = "Login to your email provider";
    public i18nParamsExample = "";
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

        const appUser = (await read.getUserReader().getAppUser()) as IUser;

        const messageBuilder = modify
            .getCreator()
            .startMessage()
            .setSender(appUser)
            .setRoom(room)
            .setGroupable(false);

        try {
            // Get email settings to determine provider
            const settings = await getEmailSettings(
                read.getEnvironmentReader().getSettings()
            );

            // Initialize OAuth service
            const oauthSettings = {
                get: async (key: string) => {
                    const settingsReader = read
                        .getEnvironmentReader()
                        .getSettings();
                    return (await settingsReader.getValueById(key)) as string;
                },
            };

            const oauthService = new GoogleOAuthService(
                http,
                persistence,
                read,
                this.app.getLogger(),
                oauthSettings
            );
            await oauthService.initialize();

            // Check if user is already authenticated
            const isAuthenticated = await oauthService.isAuthenticated(
                sender.id
            );
            if (isAuthenticated) {
                const userInfo = await oauthService.getUserInfo(sender.id);
                messageBuilder.setText(
                    `✅ You are already logged in as ${userInfo.email}. If you want to logout, use \`/rocket-mail logout\`.`
                );
                return read
                    .getNotifier()
                    .notifyUser(sender, messageBuilder.getMessage());
            }

            // Handle provider-specific login
            switch (settings.provider) {
                case EmailProviders.GMAIL:
                    await this.handleGmailLogin(
                        oauthService,
                        sender.id,
                        messageBuilder,
                        modify,
                        read,
                        sender
                    );
                    break;
                case EmailProviders.OUTLOOK:
                case EmailProviders.YAHOO:
                case EmailProviders.PROTON:
                    messageBuilder.setText(
                        `⚠️ Authentication for ${settings.provider} is not yet implemented. Please use Gmail for now.`
                    );
                    return read
                        .getNotifier()
                        .notifyUser(sender, messageBuilder.getMessage());
                default:
                    messageBuilder.setText(
                        `⚠️ Authentication for ${settings.provider} is not yet implemented. Please use Gmail for now.`
                    );
                    return read
                        .getNotifier()
                        .notifyUser(sender, messageBuilder.getMessage());
            }
        } catch (error) {
            this.app.getLogger().error("Error in login command:", error);
            messageBuilder.setText(
                `❌ Error processing login: ${error.message}`
            );
            return read
                .getNotifier()
                .notifyUser(sender, messageBuilder.getMessage());
        }
    }

    /**
     * Handle Gmail login - generate and send OAuth URL
     */
    private async handleGmailLogin(
        oauthService: GoogleOAuthService,
        userId: string,
        messageBuilder: any,
        modify: IModify,
        read: IRead,
        sender: IUser
    ): Promise<void> {
        try {
            // Generate the authorization URL
            const authUrl = await oauthService.getAuthorizationUrl(userId);

            // Create a UI block with a button
            const block = modify.getCreator().getBlockBuilder();

            block.addSectionBlock({
                text: block.newMarkdownTextObject(
                    "🔐 Login to your Gmail account"
                ),
            });
            block.addActionsBlock({
                elements: [
                    block.newButtonElement({
                        actionId: "gmail_login_action",
                        text: block.newPlainTextObject("Gmail Login"),
                        url: authUrl,
                        style: ButtonStyle.PRIMARY,
                    }),
                ],
            });

            // Send message with auth URL as a clickable link
            // messageBuilder.setText(`🔐 Login to your Gmail account: [Click here to Login](${authUrl})`);

            messageBuilder.setBlocks(block.getBlocks());

            return read
                .getNotifier()
                .notifyUser(sender, messageBuilder.getMessage());

        } catch (error) {
            messageBuilder.setText(
                `❌ Error generating authentication URL: ${error.message}`
            );
            return read
                .getNotifier()
                .notifyUser(sender, messageBuilder.getMessage());
        }
    }

    /**
     * For other email providers similar methods like handleGmailLogin() can be implemented
     */

}
