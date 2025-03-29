import { ISetting, SettingType } from '@rocket.chat/apps-engine/definition/settings';
// import { SettingsIds } from '../enums/SettingsIds';
// import { EmailProviders } from '../enums/EmailProviders';

// IMP:Shows some error in terminal when updating app. Will be fixing it later.

export enum EmailProviders {
    GMAIL = 'gmail',
    OUTLOOK = 'outlook',
    YAHOO = 'yahoo',
    PROTON = 'protonmail',
}

export enum SettingsIds {
    EmailAddress = 'rocket_mail_email',
    EmailProvider = 'rocket_mail_provider',
    DeepInfraApiKey = 'rocket_mail_deepinfra_api_key',
    OAuthClientId = 'oauth_client_id',
    OAuthClientSecret = 'oauth_client_secret',
    OAuthRedirectUri = 'oauth_redirect_uri',
    ReportEnabled = 'rocket_mail_report_enabled',
    ReportTime = 'rocket_mail_report_time',
    ReportMaxEmails = 'rocket_mail_report_max_emails',
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
        id: SettingsIds.OAuthClientId,
        type: SettingType.STRING,
        packageValue: '',
        required: true,
        public: false,
        i18nLabel: 'OAuth Client ID',
        i18nDescription: 'OAuth client ID for Gmail',
    },
    {
        id: SettingsIds.OAuthClientSecret,
        type: SettingType.STRING,
        packageValue: '',
        required: true,
        public: false,
        i18nLabel: 'OAuth Client Secret',
        i18nDescription: 'OAuth client secret for Gmail',
    },
    {
        id: SettingsIds.OAuthRedirectUri,
        type: SettingType.STRING,
        packageValue: '',
        required: true,
        public: false,
        i18nLabel: 'OAuth Redirect URI',
        i18nDescription: 'OAuth redirect URI for Gmail',
    },
    {
        id: SettingsIds.ReportEnabled,
        type: SettingType.BOOLEAN,
        packageValue: false,
        required: true,
        public: false,
        i18nLabel: 'Enable Automatic Daily Reports',
        i18nDescription: 'When enabled, users will receive a daily email report',
    },
    {
        id: SettingsIds.ReportTime,
        type: SettingType.STRING,
        packageValue: '09:00',
        required: true,
        public: false,
        i18nLabel: 'Automatic Report Time',
        i18nDescription: 'Time to send automatic daily reports (HH:MM in 24-hour format)',
    },
    {
        id: SettingsIds.ReportMaxEmails,
        type: SettingType.NUMBER,
        packageValue: 15,
        required: true,
        public: false,
        i18nLabel: 'Maximum Emails in Report',
        i18nDescription: 'Maximum number of emails to show in reports',
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
