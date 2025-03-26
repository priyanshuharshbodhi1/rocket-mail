import { IHttp, ILogger } from "@rocket.chat/apps-engine/definition/accessors";
import {
    IEmailSettings,
    IEmailContent,
    ISearchOptions,
    IEmailSummary,
    IEmailDetails,
} from "../interfaces/IEmailService";
import { IEmailSearchParams, IEmailCountParams } from "../models/LLMTask";

export class EmailService {
    private settings: IEmailSettings;
    private logger: ILogger;
    private http: IHttp;

    constructor(settings: IEmailSettings, logger: ILogger, http: IHttp) {
        this.settings = settings;
        this.logger = logger;
        this.http = http;
    }

    /**
     * Send an email using SMTP
     */
    public async sendEmail(emailContent: IEmailContent): Promise<boolean> {
        this.logger.debug("EmailService.sendEmail -> Preparing to send email");

        try {
            // Use a proxy service to send SMTP emails since we can't use direct TCP/SMTP from App Engine
            const response = await this.http.post('https://youremailproxy.com/smtp/send', {
                headers: {
                    'Content-Type': 'application/json',
                },
                data: {
                    auth: {
                        user: this.settings.email,
                        pass: this.settings.password,
                        host: this.settings.smtpServer,
                        port: this.settings.smtpPort,
                    },
                    email: {
                        from: emailContent.from,
                        to: emailContent.to,
                        subject: emailContent.subject,
                        text: emailContent.text,
                        html: emailContent.html,
                    }
                },
            });

            if (response.statusCode === 200) {
                this.logger.debug('EmailService.sendEmail -> Email sent successfully');
                return true;
            } else {
                throw new Error(`Failed to send email. Status code: ${response.statusCode}`);
            }
        } catch (error) {
            this.logger.error(
                `EmailService.sendEmail -> Error sending email: ${error}`
            );
            throw new Error(`Failed to send email: ${error}`);
        }
    }

    /**
     * Send a simple introductory email
     * @param to Email address to send to
     */
    public async sendIntroductoryEmail(to: string): Promise<boolean> {
        return this.sendEmail({
            from: this.settings.email,
            to,
            subject: "Hello from Rocket.Mail",
            text: `Hello,

            This is an introductory email from Rocket.Mail.
            I'm reaching out to you from the Rocket.Chat platform.

            Best regards,
            Rocket.Mail Bot`,
        });
    }

    /**
     * Get the most recent email from the inbox using IMAP
     */
    public async getLastReceivedEmail(): Promise<IEmailDetails> {
        this.logger.debug(
            "EmailService.getLastReceivedEmail -> Getting last received email"
        );

        try {
            // Use a proxy service for IMAP operations
            const response = await this.http.post('https://youremailproxy.com/imap/getLatest', {
                headers: {
                    'Content-Type': 'application/json',
                },
                data: {
                    auth: {
                        user: this.settings.email,
                        pass: this.settings.password,
                        host: this.settings.imapServer,
                        port: 993, // Standard IMAP SSL port
                    },
                    options: {
                        mailbox: 'INBOX'
                    }
                },
            });

            if (response.statusCode === 200) {
                const data = response.data;
                return {
                    id: data.id,
                    from: data.from,
                    to: data.to,
                    date: data.date,
                    subject: data.subject,
                    content: data.content
                };
            } else {
                throw new Error(`Failed to get latest email. Status code: ${response.statusCode}`);
            }
        } catch (error) {
            this.logger.error(
                `EmailService.getLastReceivedEmail -> Error retrieving last email: ${error}`
            );
            throw new Error(`Failed to retrieve latest email: ${error}`);
        }
    }

    /**
     * Search emails based on criteria
     */
    public async searchEmails(params: IEmailSearchParams): Promise<IEmailSummary[]> {
        this.logger.debug("EmailService.searchEmails -> Searching emails with params:", params);

        try {
            const response = await this.http.post('https://youremailproxy.com/imap/search', {
                headers: {
                    'Content-Type': 'application/json',
                },
                data: {
                    auth: {
                        user: this.settings.email,
                        pass: this.settings.password,
                        host: this.settings.imapServer,
                        port: 993,
                    },
                    search: {
                        startDate: params.startDate,
                        endDate: params.endDate,
                        sender: params.sender,
                        subject: params.subject,
                        body: params.body,
                        folder: params.folder || 'INBOX',
                        limit: params.limit || 20
                    }
                },
            });

            if (response.statusCode === 200) {
                return response.data.emails.map((email: any) => ({
                    id: email.id,
                    from: email.from,
                    date: email.date,
                    subject: email.subject
                }));
            } else {
                throw new Error(`Failed to search emails. Status code: ${response.statusCode}`);
            }
        } catch (error) {
            this.logger.error(`EmailService.searchEmails -> Error searching emails: ${error}`);
            throw new Error(`Failed to search emails: ${error}`);
        }
    }

    /**
     * Count emails by date range and optional criteria
     */
    public async countEmails(params: IEmailCountParams): Promise<Record<string, number>> {
        this.logger.debug("EmailService.countEmails -> Counting emails with params:", params);

        try {
            const response = await this.http.post('https://youremailproxy.com/imap/count', {
                headers: {
                    'Content-Type': 'application/json',
                },
                data: {
                    auth: {
                        user: this.settings.email,
                        pass: this.settings.password,
                        host: this.settings.imapServer,
                        port: 993,
                    },
                    search: {
                        startDate: params.startDate,
                        endDate: params.endDate,
                        sender: params.sender,
                    }
                },
            });

            if (response.statusCode === 200) {
                return response.data.counts;
            } else {
                throw new Error(`Failed to count emails. Status code: ${response.statusCode}`);
            }
        } catch (error) {
            this.logger.error(`EmailService.countEmails -> Error counting emails: ${error}`);
            throw new Error(`Failed to count emails: ${error}`);
        }
    }

    /**
     * Get full content of a specific email by ID
     */
    public async getEmailById(emailId: string): Promise<IEmailDetails> {
        this.logger.debug(`EmailService.getEmailById -> Getting email with ID: ${emailId}`);

        try {
            const response = await this.http.post('https://youremailproxy.com/imap/getMessage', {
                headers: {
                    'Content-Type': 'application/json',
                },
                data: {
                    auth: {
                        user: this.settings.email,
                        pass: this.settings.password,
                        host: this.settings.imapServer,
                        port: 993,
                    },
                    options: {
                        messageId: emailId
                    }
                },
            });

            if (response.statusCode === 200) {
                const data = response.data;
                return {
                    id: data.id,
                    from: data.from,
                    to: data.to,
                    date: data.date,
                    subject: data.subject,
                    content: data.content
                };
            } else {
                throw new Error(`Failed to get email. Status code: ${response.statusCode}`);
            }
        } catch (error) {
            this.logger.error(`EmailService.getEmailById -> Error retrieving email: ${error}`);
            throw new Error(`Failed to retrieve email: ${error}`);
        }
    }
}
