import { App } from "@rocket.chat/apps-engine/definition/App";
import {
    IAppAccessors,
    IConfigurationExtend,
    ILogger,
    IRead,
    IHttp,
    IPersistence,
    IModify
} from "@rocket.chat/apps-engine/definition/accessors";
import {
	IUIKitResponse,
	UIKitBlockInteractionContext,
} from '@rocket.chat/apps-engine/definition/uikit';
import { SlashCommandContext } from '@rocket.chat/apps-engine/definition/slashcommands';
import { IAppInfo } from "@rocket.chat/apps-engine/definition/metadata";
import { extendSettings } from "./src/config/SettingsManager";
import { RocketMailCommand } from "./src/commands/RocketMailCommand";
import { GoogleOAuthEndpoint } from "./src/email-providers/OAuth/GoogleOAuthEndpoint";
import { SettingType } from "@rocket.chat/apps-engine/definition/settings";
import {
    ApiSecurity,
    ApiVisibility,
} from "@rocket.chat/apps-engine/definition/api";
import { ExecuteBlockActionHandler } from "./src/handlers/ui-handlers/ExecuteBlockActionHandler";
// import { ExecuteActionButtonHandler } from './src/handlers/ui-handlers/ExecuteActionButtonHandler';
// import { ExecuteViewSubmitHandler } from './src/handlers/ui-handlers/ExecuteViewSubmitHandler';
// import { ExecuteViewCancelHandler } from './src/handlers/ui-handlers/ExecuteViewCancelHandler';

export class RocketMailApp extends App {
    constructor(info: IAppInfo, logger: ILogger, accessors: IAppAccessors) {
        super(info, logger, accessors);
    }

    /**
     * Initialize the app
     */
    public async extendConfiguration(
        configuration: IConfigurationExtend
    ): Promise<void> {
        // Register OAuth settings
        await configuration.settings.provideSetting({
            id: "oauth_client_id",
            type: SettingType.STRING,
            packageValue: "",
            required: true,
            public: false,
            i18nLabel: "Google OAuth Client ID",
            i18nDescription: "Client ID for Google OAuth authentication",
        });

        await configuration.settings.provideSetting({
            id: "oauth_client_secret",
            type: SettingType.STRING,
            packageValue: "",
            required: true,
            public: false,
            i18nLabel: "Google OAuth Client Secret",
            i18nDescription: "Client secret for Google OAuth authentication",
        });

        await configuration.settings.provideSetting({
            id: "oauth_redirect_uri",
            type: SettingType.STRING,
            packageValue: "",
            required: true,
            public: false,
            i18nLabel: "OAuth Redirect URI",
            i18nDescription:
                "Redirect URI for OAuth (should end with /api/apps/public/[app-id]/oauth-callback)",
        });

        // Register API endpoints
        await configuration.api.provideApi({
            visibility: ApiVisibility.PUBLIC,
            security: ApiSecurity.UNSECURE,
            endpoints: [new GoogleOAuthEndpoint(this)],
        });

        // Register application settings and commands
        await Promise.all([
            extendSettings(configuration.settings),
            configuration.slashCommands.provideSlashCommand(
                new RocketMailCommand(this)
            ),
        ]);
    }

	public async executeBlockActionHandler(
		context: UIKitBlockInteractionContext,
		read: IRead,
		http: IHttp,
		persistence: IPersistence,
		modify: IModify,
	): Promise<IUIKitResponse> {
		const handler = new ExecuteBlockActionHandler(
			this,
			read,
			http,
			persistence,
			modify,
			context,
		);

		return await handler.handleActions();
	}

    // public async executeActionButtonHandler(context, read, http, persistence, modify) {
    //     return new ExecuteActionButtonHandler().executeActionButton(context, read, http, persistence, modify);
    // }

    // public async executeViewSubmitHandler(context, read, http, persistence, modify) {
    //     return new ExecuteViewSubmitHandler().executeViewSubmit(context, read, http, persistence, modify);
    // }

    // public async executeViewCancelHandler(context, read, http, persistence, modify) {
    //     return new ExecuteViewCancelHandler().executeViewCancel(context, read, http, persistence, modify);
    // }


}
