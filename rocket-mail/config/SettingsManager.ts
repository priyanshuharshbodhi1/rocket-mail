import { ISettingsExtend, ISettingRead } from '@rocket.chat/apps-engine/definition/accessors';
import { settings, SettingsIds } from './Settings';
import { IEmailSettings } from '../interfaces/IEmailService';

/**
 * Initialize app settings
 * @param settingsExtend The settings extend accessor
 */
export async function extendSettings(settingsExtend: ISettingsExtend): Promise<void> {
    for (const setting of settings) {
        await settingsExtend.provideSetting(setting);
    }
}

/**
 * Get email settings from the app settings
 * @param settingsReader The settings reader accessor
 */
export async function getEmailSettings(settingsReader: ISettingRead): Promise<IEmailSettings> {
    return {
        email: await settingsReader.getValueById(SettingsIds.EmailAddress) as string,
        password: await settingsReader.getValueById(SettingsIds.EmailPassword) as string,
        imapServer: await settingsReader.getValueById(SettingsIds.ImapServer) as string,
        smtpServer: await settingsReader.getValueById(SettingsIds.SmtpServer) as string,
        smtpPort: await settingsReader.getValueById(SettingsIds.SmtpPort) as number,
    };
}

/**
 * Get DeepInfra API key from settings
 */
export async function getDeepInfraApiKey(settingsReader: ISettingRead): Promise<string> {
    return (await settingsReader.getValueById(SettingsIds.DeepInfraApiKey) as string) || '';
}
