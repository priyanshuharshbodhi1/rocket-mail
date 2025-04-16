// import {
//     IHttp,
//     IModify,
//     IPersistence,
//     IRead,
// } from "@rocket.chat/apps-engine/definition/accessors";
// import { getEmailSettings } from "../config/SettingsManager";
// import { RocketMailApp } from "../../RocketMailApp";
// import { EmailServiceFactory } from "../email-providers/EmailServiceFactory";

// export async function getReport({
//     params,
//     sender,
//     room,
//     read,
//     modify,
//     http,
//     persistence,
//     app
// }: {
//     params: { days: number };
//     sender: any;
//     room: any;
//     read: IRead;
//     modify: IModify;
//     http: IHttp;
//     persistence: IPersistence;
//     app: RocketMailApp;
// }): Promise<{ success: boolean; message: string; data?: any }> {
//     const days = params.days || 7;

//     if (isNaN(days) || days <= 0 || days > 90) {
//         return {
//             success: false,
//             message: "Invalid number of days. Please specify a number between 1 and 90."
//         };
//     }

//     try {
//         const settings = await getEmailSettings(
//             read.getEnvironmentReader().getSettings()
//         );

//         // Create the appropriate email service
//         const emailService = await EmailServiceFactory.createEmailService(
//             settings,
//             sender.id,
//             app.getLogger(),
//             http,
//             read,
//             persistence
//         );

//         // Calculate date range for the report
//         const endDate = new Date().toISOString().split('T')[0];
//         const startDate = new Date();
//         startDate.setDate(startDate.getDate() - days);
//         const formattedStartDate = startDate.toISOString().split('T')[0];

//         // Generate the report
//         const report = await emailService.generateEmailReport(formattedStartDate, endDate);

//         // Format the report into a readable message
//         let resultText = `📊 **Email Activity Report (Last ${days} days)**\n\n`;

//         // Email volume statistics
//         resultText += `**📨 Email Volume**\n`;
//         resultText += `Total emails: ${report.total_emails || 0}\n`;
//         resultText += `Received: ${report.received_emails || 0}\n`;
//         resultText += `Sent: ${report.sent_emails || 0}\n\n`;

//         // Top senders
//         if (report.top_senders && Object.keys(report.top_senders).length > 0) {
//             resultText += `**👥 Top Senders**\n`;

//             const sortedSenders = Object.entries(report.top_senders)
//                 .sort((a, b) => b[1] - a[1])
//                 .slice(0, 5);

//             for (const [sender, count] of sortedSenders) {
//                 resultText += `${sender}: ${count} emails\n`;
//             }
//             resultText += `\n`;
//         }

//         // Daily breakdown
//         if (report.daily_counts && Object.keys(report.daily_counts).length > 0) {
//             resultText += `**📅 Daily Breakdown**\n`;

//             const sortedDates = Object.entries(report.daily_counts)
//                 .sort((a, b) => a[0].localeCompare(b[0]));

//             for (const [date, count] of sortedDates) {
//                 resultText += `${date}: ${count} emails\n`;
//             }
//             resultText += `\n`;
//         }

//         // Email categories
//         if (report.mails_by_category && Object.keys(report.mails_by_category).length > 0) {
//             resultText += `**🏷️ Email Categories**\n`;

//             for (const [category, count] of Object.entries(report.mails_by_category)) {
//                 resultText += `${category.charAt(0).toUpperCase() + category.slice(1)}: ${count} emails\n`;
//             }
//             resultText += `\n`;
//         }

//         resultText += `Report generated on ${new Date().toLocaleString()}`;

//         return {
//             success: true,
//             message: resultText,
//             data: report
//         };
//     } catch (error) {
//         app.getLogger().error("Error generating email report:", error);

//         if (error.message && error.message.includes("not authenticated")) {
//             return {
//                 success: false,
//                 message: `🔒 ${error.message} - Please use /rocket-mail login to authenticate first.`
//             };
//         }

//         return {
//             success: false,
//             message: `❌ Error generating email report: ${error.message}`
//         };
//     }
// }
