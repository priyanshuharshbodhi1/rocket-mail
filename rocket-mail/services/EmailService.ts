import { IHttp, ILogger } from "@rocket.chat/apps-engine/definition/accessors";
import {
    IEmailSettings,
    IEmailContent,
    ISearchOptions,
    IEmailSummary,
    IEmailDetails,
} from "../interfaces/IEmailService";
import { IEmailSearchParams, IEmailCountParams } from "../models/LLMTask";
import { EmailProviders } from "../config/Settings";

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
     * Send an email
     * This method is now a placeholder for backwards compatibility.
     * Actual email sending should be done through provider-specific services
     * like GmailService that use OAuth.
     */
    public async sendEmail(emailContent: IEmailContent): Promise<boolean> {
        this.logger.debug("EmailService.sendEmail -> Preparing to send email");

        try {
            throw new Error(`Direct SMTP sending is no longer supported. Please use ${this.settings.provider} OAuth authentication to send emails.`);
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
     * Get the most recent email from the inbox
     * This method is now a placeholder for backwards compatibility.
     */
    public async getLastReceivedEmail(): Promise<IEmailDetails> {
        this.logger.debug(
            "EmailService.getLastReceivedEmail -> Getting last received email"
        );

        try {
            throw new Error(`Direct IMAP access is no longer supported. Please use ${this.settings.provider} OAuth authentication to access emails.`);
        } catch (error) {
            this.logger.error(
                `EmailService.getLastReceivedEmail -> Error retrieving last email: ${error}`
            );
            throw new Error(`Failed to retrieve latest email: ${error}`);
        }
    }

    /**
     * Search emails based on criteria
     * This method is now a placeholder for backwards compatibility.
     */
    public async searchEmails(params: IEmailSearchParams): Promise<IEmailSummary[]> {
        this.logger.debug("EmailService.searchEmails -> Searching emails with params:", params);

        try {
            throw new Error(`Direct IMAP access is no longer supported. Please use ${this.settings.provider} OAuth authentication to search emails.`);
        } catch (error) {
            this.logger.error(`EmailService.searchEmails -> Error searching emails: ${error}`);
            throw new Error(`Failed to search emails: ${error}`);
        }
    }

    /**
     * Count emails by date range and optional criteria
     * This method is now a placeholder for backwards compatibility.
     */
    public async countEmails(params: IEmailCountParams): Promise<Record<string, number>> {
        this.logger.debug("EmailService.countEmails -> Counting emails with params:", params);

        try {
            throw new Error(`Direct IMAP access is no longer supported. Please use ${this.settings.provider} OAuth authentication to count emails.`);
        } catch (error) {
            this.logger.error(`EmailService.countEmails -> Error counting emails: ${error}`);
            throw new Error(`Failed to count emails: ${error}`);
        }
    }

    /**
     * Get full content of a specific email by ID
     * This method is now a placeholder for backwards compatibility.
     */
    public async getEmailById(emailId: string): Promise<IEmailDetails> {
        this.logger.debug(`EmailService.getEmailById -> Getting email with ID: ${emailId}`);

        try {
            throw new Error(`Direct IMAP access is no longer supported. Please use ${this.settings.provider} OAuth authentication to get email details.`);
        } catch (error) {
            this.logger.error(`EmailService.getEmailById -> Error retrieving email: ${error}`);
            throw new Error(`Failed to retrieve email: ${error}`);
        }
    }
}
