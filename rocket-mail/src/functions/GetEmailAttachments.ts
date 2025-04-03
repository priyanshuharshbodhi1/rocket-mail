// import {
//     IHttp,
//     IModify,
//     IPersistence,
//     IRead,
// } from "@rocket.chat/apps-engine/definition/accessors";
// import { getEmailSettings } from "../config/SettingsManager";
// import { RocketMailApp } from "../../RocketMailApp";
// import { EmailServiceFactory } from "../email-providers/EmailServiceFactory";

// interface IAttachmentParams {
//     emailId: string;
//     attachmentId?: string;
//     downloadAll?: boolean;
// }

// export async function getEmailAttachments({
//     params,
//     sender,
//     room,
//     read,
//     modify,
//     http,
//     persistence,
//     app
// }: {
//     params: IAttachmentParams;
//     sender: any;
//     room: any;
//     read: IRead;
//     modify: IModify;
//     http: IHttp;
//     persistence: IPersistence;
//     app: RocketMailApp;
// }): Promise<{ success: boolean; message: string; data?: any }> {
//     if (!params.emailId) {
//         return {
//             success: false,
//             message: "Missing required parameter: emailId"
//         };
//     }

//     try {
//         const settings = await getEmailSettings(
//             read.getEnvironmentReader().getSettings()
//         );

//         const emailService = await EmailServiceFactory.createEmailService(
//             settings,
//             sender.id,
//             app.getLogger(),
//             http,
//             read,
//             persistence
//         );

//         // Get the full email details first
//         const email = await emailService.getEmailById(params.emailId);

//         if (!email || !email.attachments || email.attachments.length === 0) {
//             return {
//                 success: true,
//                 message: "This email doesn't have any attachments.",
//                 data: { emailId: params.emailId, attachments: [] }
//             };
//         }

//         // If a specific attachment is requested
//         if (params.attachmentId) {
//             const attachment = email.attachments.find(a => a.id === params.attachmentId);

//             if (!attachment) {
//                 return {
//                     success: false,
//                     message: `No attachment found with ID: ${params.attachmentId}`,
//                     data: { emailId: params.emailId, availableAttachments: email.attachments }
//                 };
//             }

//             // Here you would typically download and handle the specific attachment
//             // As it depends on email provider implementation
//             return {
//                 success: true,
//                 message: `Attachment "${attachment.name}" (${attachment.size} bytes) is ready for download.`,
//                 data: {
//                     emailId: params.emailId,
//                     attachment: attachment
//                 }
//             };
//         }

//         // List all attachments
//         let resultText = `📎 **Attachments in Email**\n\n`;
//         resultText += `Subject: ${email.subject}\n`;
//         resultText += `From: ${email.from}\n`;
//         resultText += `Attachments (${email.attachments.length}):\n\n`;

//         email.attachments.forEach((attachment, index) => {
//             resultText += `${index + 1}. ${attachment.name} (${attachment.size} bytes)\n`;
//             resultText += `   ID: ${attachment.id}\n\n`;
//         });

//         resultText += `To download an attachment, use: \`/rocket-mail attachment ${params.emailId} <attachment_id>\``;

//         return {
//             success: true,
//             message: resultText,
//             data: {
//                 emailId: params.emailId,
//                 attachments: email.attachments
//             }
//         };

//     } catch (error) {
//         app.getLogger().error("Error retrieving email attachments:", error);

//         if (error.message && error.message.includes("not authenticated")) {
//             return {
//                 success: false,
//                 message: `🔒 ${error.message} - Please use /rocket-mail login to authenticate first.`
//             };
//         }

//         return {
//             success: false,
//             message: `❌ Error retrieving email attachments: ${error.message}`
//         };
//     }
// }
