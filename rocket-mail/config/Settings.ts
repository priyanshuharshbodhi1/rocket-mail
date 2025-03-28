import { ISetting, SettingType } from '@rocket.chat/apps-engine/definition/settings';

export enum SettingsIds {
    EmailAddress = 'rocket_mail_email',
    EmailPassword = 'rocket_mail_password',
    ImapServer = 'rocket_mail_imap_server',
    SmtpServer = 'rocket_mail_smtp_server',
    SmtpPort = 'rocket_mail_smtp_port',
    DeepInfraApiKey = 'rocket_mail_deepinfra_api_key',
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
        id: SettingsIds.EmailPassword,
        type: SettingType.PASSWORD,
        packageValue: '',
        required: true,
        public: false,
        i18nLabel: 'Email Password',
        i18nDescription: 'The password or app-specific password for the email account',
    },
    {
        id: SettingsIds.ImapServer,
        type: SettingType.STRING,
        packageValue: 'imap.gmail.com',
        required: true,
        public: false,
        i18nLabel: 'IMAP Server',
        i18nDescription: 'The IMAP server address (e.g., imap.gmail.com)',
    },
    {
        id: SettingsIds.SmtpServer,
        type: SettingType.STRING,
        packageValue: 'smtp.gmail.com',
        required: true,
        public: false,
        i18nLabel: 'SMTP Server',
        i18nDescription: 'The SMTP server address (e.g., smtp.gmail.com)',
    },
    {
        id: SettingsIds.SmtpPort,
        type: SettingType.NUMBER,
        packageValue: 587,
        required: true,
        public: false,
        i18nLabel: 'SMTP Port',
        i18nDescription: 'The SMTP server port (e.g., 587 for TLS, 465 for SSL)',
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
