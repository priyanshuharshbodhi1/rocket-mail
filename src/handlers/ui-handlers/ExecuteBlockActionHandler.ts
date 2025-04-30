import {
    UIKitBlockInteractionContext,
    IUIKitResponse
} from '@rocket.chat/apps-engine/definition/uikit';
import { IUser } from '@rocket.chat/apps-engine/definition/users';
import { IPersistence, IRead, IModify, IHttp } from '@rocket.chat/apps-engine/definition/accessors';
import { GoogleOAuthService } from '../../email-providers/OAuth/GoogleOAuthService';
import { RocketMailApp } from '../../../RocketMailApp';

export class ExecuteBlockActionHandler{
    constructor(
		protected readonly app: RocketMailApp,
		protected readonly read: IRead,
		protected readonly http: IHttp,
		protected readonly persistence: IPersistence,
		protected readonly modify: IModify,
		protected readonly context: UIKitBlockInteractionContext,
	) {}

    public async handleActions(): Promise<IUIKitResponse> {
        const interactionData = this.context.getInteractionData();
        const { actionId, user, room } = interactionData;

        if (!room) {
            return this.context.getInteractionResponder().errorResponse();
        }

        if (actionId === 'gmail_logout_action') {
            // Initialize OAuth service (mimic LogoutHandler logic)
            const settings = {
                get: async (key: string) => {
                    const settingsReader = this.read.getEnvironmentReader().getSettings();
                    return await settingsReader.getValueById(key) as string;
                }
            };
            const oauthService = new GoogleOAuthService(this.http, this.persistence, this.read, this.app.getLogger(), settings);
            await oauthService.initialize();

            const appUser = await this.read.getUserReader().getAppUser() as IUser;
            const messageBuilder = this.modify
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
                    await this.read.getNotifier().notifyUser(user, messageBuilder.getMessage());
                } else {
                    messageBuilder.setText('❌ Error during logout process. Please try again.');
                    await this.read.getNotifier().notifyUser(user, messageBuilder.getMessage());
                }
            } catch (error) {
                messageBuilder.setText(`❌ Error logging out: ${error.message}`);
                await this.read.getNotifier().notifyUser(user, messageBuilder.getMessage());
            }
            // Optionally, close the modal or update the UI
            return this.context.getInteractionResponder().successResponse();
        }

        // Handle other block actions if needed...

        // Default: do nothing
        return this.context.getInteractionResponder().successResponse();
    }
}