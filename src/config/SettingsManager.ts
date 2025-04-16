import { ISettingsExtend, ISettingRead } from '@rocket.chat/apps-engine/definition/accessors';
import { settings } from './Settings';
import { SettingsIds } from '../types/enums/SettingsIds';
import { EmailProviders } from '../types/enums/EmailProviders';
import { IEmailSettings } from '../types/interfaces/IEmailService';

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
        provider: await settingsReader.getValueById(SettingsIds.EmailProvider) as EmailProviders,
    };
}



// /**
//  * Get DeepInfra API key from settings
//  */
// export async function getDeepInfraApiKey(settingsReader: ISettingRead): Promise<string> {
//     return (await settingsReader.getValueById(SettingsIds.DeepInfraApiKey) as string) || '';
// }
