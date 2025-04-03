// import {
//     IHttp,
//     IModify,
//     IPersistence,
//     IRead,
// } from "@rocket.chat/apps-engine/definition/accessors";
// import { getEmailSettings } from "../config/SettingsManager";
// import { RocketMailApp } from "../../RocketMailApp";
// import { EmailServiceFactory } from "../email-providers/EmailServiceFactory";

// interface ICalendarEventParams {
//     title: string;
//     description?: string;
//     startTime: string; // ISO format
//     endTime?: string; // ISO format
//     location?: string;
//     attendees?: string[];
//     reminderMinutes?: number;
// }

// export async function addToCalendar({
//     params,
//     sender,
//     room,
//     read,
//     modify,
//     http,
//     persistence,
//     app
// }: {
//     params: ICalendarEventParams;
//     sender: any;
//     room: any;
//     read: IRead;
//     modify: IModify;
//     http: IHttp;
//     persistence: IPersistence;
//     app: RocketMailApp;
// }): Promise<{ success: boolean; message: string; data?: any }> {
//     if (!params.title) {
//         return {
//             success: false,
//             message: "Event title is required"
//         };
//     }

//     if (!params.startTime) {
//         return {
//             success: false,
//             message: "Event start time is required"
//         };
//     }

//     try {
//         // Validate date formats
//         const startDate = new Date(params.startTime);
//         if (isNaN(startDate.getTime())) {
//             return {
//                 success: false,
//                 message: "Invalid start time format. Use ISO format (YYYY-MM-DDTHH:MM:SS.sssZ)"
//             };
//         }

//         let endDate;
//         if (params.endTime) {
//             endDate = new Date(params.endTime);
//             if (isNaN(endDate.getTime())) {
//                 return {
//                     success: false,
//                     message: "Invalid end time format. Use ISO format (YYYY-MM-DDTHH:MM:SS.sssZ)"
//                 };
//             }

//             if (endDate <= startDate) {
//                 return {
//                     success: false,
//                     message: "End time must be after start time"
//                 };
//             }
//         } else {
//             // Default to 1 hour after start time if not provided
//             endDate = new Date(startDate.getTime());
//             endDate.setHours(endDate.getHours() + 1);
//         }

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

//         // Check if the email service supports calendar functionality
//         if (!emailService.addCalendarEvent) {
//             return {
//                 success: false,
//                 message: "Calendar functionality is not supported by the current email provider"
//             };
//         }

//         // Create calendar event object
//         const calendarEvent = {
//             summary: params.title,
//             description: params.description || '',
//             location: params.location || '',
//             start: {
//                 dateTime: startDate.toISOString(),
//                 timeZone: 'UTC'
//             },
//             end: {
//                 dateTime: endDate.toISOString(),
//                 timeZone: 'UTC'
//             },
//             attendees: params.attendees ? params.attendees.map(email => ({ email })) : [],
//             reminders: {
//                 useDefault: false,
//                 overrides: [
//                     { method: 'email', minutes: params.reminderMinutes || 30 },
//                     { method: 'popup', minutes: 10 }
//                 ]
//             }
//         };

//         // Add the event to the calendar
//         const eventResult = await emailService.addCalendarEvent(calendarEvent);

//         if (!eventResult || !eventResult.id) {
//             return {
//                 success: false,
//                 message: "Failed to create calendar event"
//             };
//         }

//         // Format a user-friendly confirmation message
//         const dateOptions: Intl.DateTimeFormatOptions = {
//             weekday: 'long',
//             year: 'numeric',
//             month: 'long',
//             day: 'numeric',
//             hour: '2-digit',
//             minute: '2-digit'
//         };

//         const startDateFormatted = new Date(startDate).toLocaleString('en-US', dateOptions);
//         const endDateFormatted = new Date(endDate).toLocaleString('en-US', dateOptions);

//         let resultText = `📅 **Calendar Event Created**\n\n`;
//         resultText += `**Title:** ${params.title}\n`;

//         if (params.description) {
//             resultText += `**Description:** ${params.description}\n`;
//         }

//         resultText += `**When:** ${startDateFormatted} to ${endDateFormatted}\n`;

//         if (params.location) {
//             resultText += `**Where:** ${params.location}\n`;
//         }

//         if (params.attendees && params.attendees.length > 0) {
//             resultText += `**Attendees:** ${params.attendees.join(', ')}\n`;
//         }

//         resultText += `\nEvent has been added to your calendar.`;

//         if (eventResult.htmlLink) {
//             resultText += ` [View in Calendar](${eventResult.htmlLink})`;
//         }

//         return {
//             success: true,
//             message: resultText,
//             data: eventResult
//         };
//     } catch (error) {
//         app.getLogger().error("Error adding event to calendar:", error);

//         if (error.message && error.message.includes("not authenticated")) {
//             return {
//                 success: false,
//                 message: `🔒 ${error.message} - Please use /rocket-mail login to authenticate first.`
//             };
//         }

//         return {
//             success: false,
//             message: `❌ Error adding event to calendar: ${error.message}`
//         };
//     }
// }
