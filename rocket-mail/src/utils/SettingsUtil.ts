import { IPersistence, IRead, IPersistenceRead } from '@rocket.chat/apps-engine/definition/accessors';
import { RocketMailApp } from '../../RocketMailApp';

// Export helper functions instead of a class
export function getRead(app: RocketMailApp): IRead {
    return app.getAccessors().reader;
}

export function getPersistenceReader(app: RocketMailApp): IPersistenceRead {
    return getRead(app).getPersistenceReader();
}

export async function getDeepInfraApiKey(app: RocketMailApp): Promise<string> {
    try {
        const value = await app.getAccessors().environmentReader.getSettings().getValueById('rocket_mail_deepinfra_api_key');
        return value ? String(value) : '';
    } catch (error) {
        app.getLogger().error('Error getting DeepInfra API key:', error);
        return '';
    }
}

export async function getOAuthClientId(app: RocketMailApp): Promise<string> {
    try {
        const value = await app.getAccessors().environmentReader.getSettings().getValueById('oauth_client_id');
        return value ? String(value) : '';
    } catch (error) {
        app.getLogger().error('Error getting OAuth client ID:', error);
        return '';
    }
}

export async function getOAuthClientSecret(app: RocketMailApp): Promise<string> {
    try {
        const value = await app.getAccessors().environmentReader.getSettings().getValueById('oauth_client_secret');
        return value ? String(value) : '';
    } catch (error) {
        app.getLogger().error('Error getting OAuth client secret:', error);
        return '';
    }
}

export async function getOAuthRedirectUri(app: RocketMailApp): Promise<string> {
    try {
        const value = await app.getAccessors().environmentReader.getSettings().getValueById('oauth_redirect_uri');
        return value ? String(value) : '';
    } catch (error) {
        app.getLogger().error('Error getting OAuth redirect URI:', error);
        return '';
    }
}
