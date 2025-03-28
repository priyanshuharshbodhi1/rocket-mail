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
import { extendSettings } from './config/SettingsManager';
import { CommandHandler } from './handlers/CommandHandler';

export class RocketMailApp extends App {
    constructor(info: IAppInfo, logger: ILogger, accessors: IAppAccessors) {
        super(info, logger, accessors);
    }

    /**
     * Initialize the app
     */
    public async extendConfiguration(configuration: IConfigurationExtend): Promise<void> {
        await Promise.all([
            extendSettings(configuration.settings),
            configuration.slashCommands.provideSlashCommand(new CommandHandler(this)),
        ]);
    }

    /**
     * Get the persistence accessor
     * Note: Direct persistence access is not available from the App class.
     * Use the persistence provided in command and endpoint methods instead.
     */
    public getPersistence(): IPersistence {
        throw new Error('IPersistence is not directly accessible. Use the persistence provided in command and endpoint methods.');
    }

    /**
     * Get the read accessor
     */
    public getRead(): IRead {
        return this.getAccessors().reader;
    }

    /**
     * Get the persistence reader directly
     */
    public getPersistenceReader(): IPersistenceRead {
        return this.getRead().getPersistenceReader();
    }

    /**
     * Get DeepInfra API key from settings
     */
    public async getDeepInfraApiKey(): Promise<string> {
        try {
            const value = await this.getAccessors().environmentReader.getSettings().getValueById('DeepInfraApiKey');
            return value ? String(value) : '';
        } catch (error) {
            this.getLogger().error('Error getting DeepInfra API key:', error);
            return '';
        }
    }

    /**
     * Get OAuth client ID from settings
     */
    public async getOAuthClientId(): Promise<string> {
        try {
            const value = await this.getAccessors().environmentReader.getSettings().getValueById('oauth_client_id');
            return value ? String(value) : '';
        } catch (error) {
            this.getLogger().error('Error getting OAuth client ID:', error);
            return '';
        }
    }

    /**
     * Get OAuth client secret from settings
     */
    public async getOAuthClientSecret(): Promise<string> {
        try {
            const value = await this.getAccessors().environmentReader.getSettings().getValueById('oauth_client_secret');
            return value ? String(value) : '';
        } catch (error) {
            this.getLogger().error('Error getting OAuth client secret:', error);
            return '';
        }
    }

    /**
     * Get OAuth redirect URI from settings
     */
    public async getOAuthRedirectUri(): Promise<string> {
        try {
            const value = await this.getAccessors().environmentReader.getSettings().getValueById('oauth_redirect_uri');
            return value ? String(value) : '';
        } catch (error) {
            this.getLogger().error('Error getting OAuth redirect URI:', error);
            return '';
        }
    }
}
