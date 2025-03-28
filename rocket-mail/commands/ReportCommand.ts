import {
    IHttp,
    IModify,
    IRead,
    IPersistence,
} from "@rocket.chat/apps-engine/definition/accessors";
import { getEmailSettings } from "../config/SettingsManager";
import { RocketMailApp } from "../RocketMailApp";
import { EmailServiceFactory } from "../services/EmailServiceFactory";
import { formatDate } from "../services/helpers";

export class ReportCommand {
    constructor(private readonly app: RocketMailApp) {}

    public async execute(
        args: Array<string>,
        sender,
        room,
        read: IRead,
        modify: IModify,
        http: IHttp,
        persistence: IPersistence
    ): Promise<void> {
        const messageBuilder = modify
            .getCreator()
            .startMessage()
            .setSender(sender)
            .setRoom(room);

        if (args.length === 0) {
            messageBuilder.setText(
                "Usage: /rocket-mail report <number_of_days>"
            );
            await modify.getCreator().finish(messageBuilder);
            return;
        }

        // Parse number of days
        const numDays = parseInt(args[0]);
        if (isNaN(numDays) || numDays <= 0) {
            messageBuilder.setText(
                "❌ Please provide a valid positive number of days."
            );
            await modify.getCreator().finish(messageBuilder);
            return;
        }

        // Generate date range
        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(endDate.getDate() - numDays);

        // Format for display
        const startDateStr = formatDate(startDate);
        const endDateStr = formatDate(endDate);

        messageBuilder.setText(`📊 Generating email report for the last ${numDays} days (${startDateStr} to ${endDateStr}). Please wait...`);
        await modify.getCreator().finish(messageBuilder);

        try {
            const settings = await getEmailSettings(
                read.getEnvironmentReader().getSettings()
            );

            try {
                // Create the appropriate email service
                const emailService = await EmailServiceFactory.createEmailService(
                    settings,
                    sender.id,
                    this.app.getLogger(),
                    http,
                    read,
                    persistence
                );

                // Get the maximum report limit from settings or use default
                const reportSettings = await read.getEnvironmentReader().getSettings().getById('rocket_mail_report_max_emails');
                const maxEmails = reportSettings ? (reportSettings.value as number) : 15;

                // Search for emails in the date range
                const searchParams = {
                    startDate: startDateStr,
                    endDate: endDateStr,
                    limit: maxEmails
                };

                const emails = await emailService.searchEmails(searchParams);
                
                // Count emails by sender domain
                const domainCounts: Record<string, number> = {};
                emails.forEach(email => {
                    const senderMatch = email.from.match(/@([^>]+)/) || email.from.match(/@(.+)/);
                    if (senderMatch) {
                        const domain = senderMatch[1].trim();
                        domainCounts[domain] = (domainCounts[domain] || 0) + 1;
                    }
                });

                // Count emails by day
                const dayCounts = await emailService.countEmails({
                    startDate: startDateStr,
                    endDate: endDateStr
                });

                // Generate report
                let report = `# 📈 Email Report: Last ${numDays} Days\n\n`;
                
                // Summary section
                report += `## Summary\n`;
                report += `📆 **Period**: ${startDateStr} to ${endDateStr}\n`;
                report += `📧 **Total Emails**: ${emails.length}\n\n`;
                
                // Daily breakdown section
                report += `## Daily Breakdown\n`;
                for (const [date, count] of Object.entries(dayCounts)) {
                    report += `- **${date}**: ${count} emails\n`;
                }
                report += `\n`;
                
                // Domain breakdown section
                report += `## Top Sending Domains\n`;
                const sortedDomains = Object.entries(domainCounts)
                    .sort((a, b) => b[1] - a[1])
                    .slice(0, 5);
                
                for (const [domain, count] of sortedDomains) {
                    report += `- **${domain}**: ${count} emails\n`;
                }
                report += `\n`;
                
                // Recent emails section
                report += `## Recent Emails\n`;
                if (emails.length > 0) {
                    for (let i = 0; i < Math.min(5, emails.length); i++) {
                        const email = emails[i];
                        report += `### ${i+1}. ${email.subject}\n`;
                        report += `**From**: ${email.from}\n`;
                        report += `**Date**: ${email.date}\n`;
                        report += `**ID**: ${email.id}\n\n`;
                    }
                    
                    if (emails.length > 5) {
                        report += `*...and ${emails.length - 5} more*\n\n`;
                    }
                    
                    report += `To view a specific email, use \`/rocket-mail view <email_id>\`\n`;
                } else {
                    report += `No emails found in this period.\n`;
                }
                
                // Send the report
                const resultMessageBuilder = modify
                    .getCreator()
                    .startMessage()
                    .setSender(sender)
                    .setRoom(room);
                
                resultMessageBuilder.setText(report);
                await modify.getCreator().finish(resultMessageBuilder);
            } catch (error) {
                // Check if this is an authentication error
                if (error.message && error.message.includes("authenticate")) {
                    const authErrorMessage = modify
                        .getCreator()
                        .startMessage()
                        .setSender(sender)
                        .setRoom(room);
                    
                    authErrorMessage.setText(`🔒 ${error.message}`);
                    await modify.getCreator().finish(authErrorMessage);
                } else {
                    throw error;
                }
            }
        } catch (error) {
            this.app.getLogger().error("Error generating email report:", error);
            
            const errorMessage = modify
                .getCreator()
                .startMessage()
                .setSender(sender)
                .setRoom(room);
            
            errorMessage.setText(`❌ Error generating email report: ${error.message}`);
            await modify.getCreator().finish(errorMessage);
        }
    }

    /**
     * Generate an automatic daily report for a user
     */
    public async generateAutomaticReport(
        userId: string,
        read: IRead,
        modify: IModify,
        http: IHttp,
        persistence: IPersistence
    ): Promise<void> {
        try {
            // Get the user
            const user = await read.getUserReader().getById(userId);
            if (!user) {
                this.app.getLogger().error(`Cannot generate automatic report: User ${userId} not found`);
                return;
            }
            
            // Get DM room with the user
            const room = await read.getRoomReader().getDirectByUsernames(['rocket.cat', user.username]);
            if (!room) {
                this.app.getLogger().error(`Cannot generate automatic report: DM room not found for user ${userId}`);
                return;
            }
            
            // Generate a one-day report
            const args = ['1'];
            await this.execute(args, user, room, read, modify, http, persistence);
            
            this.app.getLogger().debug(`Generated automatic report for user ${userId}`);
        } catch (error) {
            this.app.getLogger().error(`Error generating automatic report: ${error.message}`);
        }
    }
}
