import {
    IHttp,
    IModify,
    IRead,
    IPersistence,
} from "@rocket.chat/apps-engine/definition/accessors";
import { getEmailSettings } from "../config/SettingsManager";
import { RocketMailApp } from "../../RocketMailApp";
import { EmailServiceFactory } from "../email-providers/EmailServiceFactory";
import { formatDate } from "../utils/FormatDate";

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

                // Generate comprehensive email report
                const reportData = await emailService.generateEmailReport(startDateStr, endDateStr);

                // Get recent emails to show in the report
                const searchParams = {
                    startDate: startDateStr,
                    endDate: endDateStr,
                    limit: 5 // Just show a few recent emails
                };

                const recentEmails = await emailService.searchEmails(searchParams);

                // Format the report
                let report = `# 📈 Email Report: Last ${numDays} Days\n\n`;

                // Statistics section
                report += `### 📊 Statistics\n`;
                report += `📆 **Period**: ${startDateStr} to ${endDateStr}\n`;
                report += `📥 **Total Emails Received**: ${reportData.total_mails_received}\n`;
                report += `📤 **Emails Sent**: ${reportData.mails_sent}\n`;
                report += `🔔 **Unread Emails**: ${reportData.unread_mails}\n`;
                report += `📎 **Emails with Attachments**: ${reportData.mails_with_attachments}\n`;
                report += `⏰ **Emails with Deadlines**: ${reportData.mails_with_deadlines}\n\n`;

                // Email categories section
                if (reportData.mails_by_category && Object.keys(reportData.mails_by_category).length > 0) {
                    report += `### 📋 Email Categories\n`;
                    for (const [category, count] of Object.entries(reportData.mails_by_category)) {
                        // Capitalize the first letter of the category
                        const formattedCategory = category.charAt(0).toUpperCase() + category.slice(1);
                        report += `- **${formattedCategory}**: ${count} emails\n`;
                    }
                    report += `\n`;
                }

                // Daily breakdown section (if we have it)
                if (numDays > 1) {
                    const dayCounts = await emailService.countEmails({
                        startDate: startDateStr,
                        endDate: endDateStr
                    });

                    if (Object.keys(dayCounts).length > 0) {
                        report += `### 📅 Daily Breakdown\n`;
                        for (const [date, count] of Object.entries(dayCounts)) {
                            report += `- **${date}**: ${count} emails\n`;
                        }
                        report += `\n`;
                    }
                }

                // Recent emails section
                report += `### 📬 Recent Emails\n`;
                if (recentEmails.length > 0) {
                    for (let i = 0; i < recentEmails.length; i++) {
                        const email = recentEmails[i];
                        report += `### ${i+1}. ${email.subject}\n`;
                        report += `**From**: ${email.from}\n`;
                        report += `**Date**: ${email.date}\n`;
                        report += `**ID**: ${email.id}\n\n`;
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
