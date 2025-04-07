import { App } from '@rocket.chat/apps-engine/definition/App';
import {
    IAppAccessors,
    IConfigurationExtend,
    ILogger,
    IPersistence,
    IRead,
    IPersistenceRead,
} from '@rocket.chat/apps-engine/definition/accessors';
import { IAppInfo } from '@rocket.chat/apps-engine/definition/metadata';
import { extendSettings } from './src/config/SettingsManager';
import { RocketMailCommand } from './src/commands/RocketMailCommand';
import { GoogleOAuthEndpoint } from './src/email-providers/OAuth/GoogleOAuthEndpoint';
import { SettingType } from '@rocket.chat/apps-engine/definition/settings';
import { ApiSecurity, ApiVisibility } from '@rocket.chat/apps-engine/definition/api';
import * as SettingsUtil from './src/utils/SettingsUtil';

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

    /**
     * Get the persistence accessor
     * Provides an accessor to write data to the App's persistent storage. A App only has access to its own persistent storage and does not have access to any other App's.
     */
    public getPersistence(): IPersistence {
        throw new Error('Provides an accessor to write data to the App\'s persistent storage. A App only has access to its own persistent storage and does not have access to any other App\'s.');
    }

    /**
     * Get the read accessor
     */
    public getRead(): IRead {
        return SettingsUtil.getRead(this);
    }

    /**
     * Get the persistence reader directly
     */
    public getPersistenceReader(): IPersistenceRead {
        return SettingsUtil.getPersistenceReader(this);
    }

    /**
     * Get DeepInfra API key from settings
     */
    public async getDeepInfraApiKey(): Promise<string> {
        return SettingsUtil.getDeepInfraApiKey(this);
    }

    /**
     * Get OAuth client ID from settings
     */
    public async getOAuthClientId(): Promise<string> {
        return SettingsUtil.getOAuthClientId(this);
    }

    /**
     * Get OAuth client secret from settings
     */
    public async getOAuthClientSecret(): Promise<string> {
        return SettingsUtil.getOAuthClientSecret(this);
    }

    /**
     * Get OAuth redirect URI from settings
     */
    public async getOAuthRedirectUri(): Promise<string> {
        return SettingsUtil.getOAuthRedirectUri(this);
    }
}
