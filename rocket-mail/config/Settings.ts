import { ISetting, SettingType } from '@rocket.chat/apps-engine/definition/settings';

export enum SettingsIds {
    EmailAddress = 'rocket_mail_email',
    EmailProvider = 'rocket_mail_provider',
    DeepInfraApiKey = 'rocket_mail_deepinfra_api_key',
}

export enum EmailProviders {
    GMAIL = 'gmail',
    OUTLOOK = 'outlook',
    YAHOO = 'yahoo',
    PROTON = 'proton',
}

export const settings: Array<ISetting> = [
    {
        id: SettingsIds.EmailAddress,
        type: SettingType.STRING,
        packageValue: '',
        required: true,
        public: false,
        i18nLabel: 'Email Address',
        i18nDescription: 'The email address used for sending and receiving emails',
    },
    {
        id: SettingsIds.EmailProvider,
        type: SettingType.SELECT,
        packageValue: EmailProviders.GMAIL,
        required: true,
        public: false,
        i18nLabel: 'Email Provider',
        i18nDescription: 'The email service provider for this account',
        values: [
            {
                key: EmailProviders.GMAIL,
                i18nLabel: 'Gmail',
            },
            {
                key: EmailProviders.OUTLOOK,
                i18nLabel: 'Outlook',
            },
            {
                key: EmailProviders.YAHOO,
                i18nLabel: 'Yahoo',
            },
            {
                key: EmailProviders.PROTON,
                i18nLabel: 'ProtonMail',
            },
        ],
    },
    {
        id: SettingsIds.DeepInfraApiKey,
        type: SettingType.PASSWORD,
        packageValue: '',
        required: true,
        public: false,
        i18nLabel: 'DeepInfra API Key',
        i18nDescription: 'API key for DeepInfra LLM service (used for summarization and other AI tasks)',
    },
];
