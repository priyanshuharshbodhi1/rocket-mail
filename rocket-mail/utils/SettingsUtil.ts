import { IPersistence, IRead, IPersistenceRead } from '@rocket.chat/apps-engine/definition/accessors';
import { RocketMailApp } from '../RocketMailApp';

export class SettingsUtil {
    constructor(private readonly app: RocketMailApp) {}

    public getRead(): IRead {
        return this.app.getAccessors().reader;
    }

    public getPersistenceReader(): IPersistenceRead {
        return this.getRead().getPersistenceReader();
    }

    public async getDeepInfraApiKey(): Promise<string> {
        try {
            const value = await this.app.getAccessors().environmentReader.getSettings().getValueById('rocket_mail_deepinfra_api_key');
            return value ? String(value) : '';
        } catch (error) {
            this.app.getLogger().error('Error getting DeepInfra API key:', error);
            return '';
        }
    }

    public async getOAuthClientId(): Promise<string> {
        try {
            const value = await this.app.getAccessors().environmentReader.getSettings().getValueById('oauth_client_id');
            return value ? String(value) : '';
        } catch (error) {
            this.app.getLogger().error('Error getting OAuth client ID:', error);
            return '';
        }
    }

    public async getOAuthClientSecret(): Promise<string> {
        try {
            const value = await this.app.getAccessors().environmentReader.getSettings().getValueById('oauth_client_secret');
            return value ? String(value) : '';
        } catch (error) {
            this.app.getLogger().error('Error getting OAuth client secret:', error);
            return '';
        }
    }

    public async getOAuthRedirectUri(): Promise<string> {
        try {
            const value = await this.app.getAccessors().environmentReader.getSettings().getValueById('oauth_redirect_uri');
            return value ? String(value) : '';
        } catch (error) {
            this.app.getLogger().error('Error getting OAuth redirect URI:', error);
            return '';
        }
    }
}
