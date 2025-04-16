import { App } from '@rocket.chat/apps-engine/definition/App';
import {
    IAppAccessors,
    IConfigurationExtend,
    ILogger,
} from '@rocket.chat/apps-engine/definition/accessors';
import { IAppInfo } from '@rocket.chat/apps-engine/definition/metadata';
import { extendSettings } from './src/config/SettingsManager';
import { RocketMailCommand } from './src/commands/RocketMailCommand';
import { GoogleOAuthEndpoint } from './src/email-providers/OAuth/GoogleOAuthEndpoint';
import { SettingType } from '@rocket.chat/apps-engine/definition/settings';
import { ApiSecurity, ApiVisibility } from '@rocket.chat/apps-engine/definition/api';

export class RocketMailApp extends App {
    constructor(info: IAppInfo, logger: ILogger, accessors: IAppAccessors) {
        super(info, logger, accessors);
    }

    /**
     * Initialize the app
     */
    public async extendConfiguration(configuration: IConfigurationExtend): Promise<void> {
        // Register OAuth settings
        await configuration.settings.provideSetting({
            id: 'oauth_client_id',
            type: SettingType.STRING,
            packageValue: '',
            required: true,
            public: false,
            i18nLabel: 'Google OAuth Client ID',
            i18nDescription: 'Client ID for Google OAuth authentication',
        });

        await configuration.settings.provideSetting({
            id: 'oauth_client_secret',
            type: SettingType.STRING,
            packageValue: '',
            required: true,
            public: false,
            i18nLabel: 'Google OAuth Client Secret',
            i18nDescription: 'Client secret for Google OAuth authentication',
        });

        await configuration.settings.provideSetting({
            id: 'oauth_redirect_uri',
            type: SettingType.STRING,
            packageValue: '',
            required: true,
            public: false,
            i18nLabel: 'OAuth Redirect URI',
            i18nDescription: 'Redirect URI for OAuth (should end with /api/apps/public/[app-id]/oauth-callback)',
        });

        // Register API endpoints
        await configuration.api.provideApi({
            visibility: ApiVisibility.PUBLIC,
            security: ApiSecurity.UNSECURE,
            endpoints: [
                new GoogleOAuthEndpoint(this),
            ],
        });

        // Register application settings and commands
        await Promise.all([
            extendSettings(configuration.settings),
            configuration.slashCommands.provideSlashCommand(new RocketMailCommand(this)),
        ]);
    }




    // /**
    //  * Get the read accessor
    //  */
    // public getRead(): IRead {
    //     return SettingsUtil.getRead(this);
    // }

    // /**
    //  * Get the persistence reader directly
    //  */
    // public getPersistenceReader(): IPersistenceRead {
    //     return SettingsUtil.getPersistenceReader(this);
    // }
}
