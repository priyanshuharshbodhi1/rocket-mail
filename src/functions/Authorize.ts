// import {
//     IHttp,
//     IModify,
//     IPersistence,
//     IRead,
// } from "@rocket.chat/apps-engine/definition/accessors";
// import { getEmailSettings } from "../config/SettingsManager";
// import { RocketMailApp } from "../../RocketMailApp";
// import { EmailServiceFactory } from "../email-providers/EmailServiceFactory";

// export async function authorize({
//     params,
//     sender,
//     room,
//     read,
//     modify,
//     http,
//     persistence,
//     app
// }: {
//     params: {
//         authCode?: string;
//         refreshToken?: string;
//         force?: boolean;
//     };
//     sender: any;
//     room: any;
//     read: IRead;
//     modify: IModify;
//     http: IHttp;
//     persistence: IPersistence;
//     app: RocketMailApp;
// }): Promise<{ success: boolean; message: string; data?: any }> {
//     try {
//         const settings = await getEmailSettings(
//             read.getEnvironmentReader().getSettings()
//         );

//         // Try to create an email service - this will attempt to use existing tokens if available
//         try {
//             const emailService = await EmailServiceFactory.createEmailService(
//                 settings,
//                 sender.id,
//                 app.getLogger(),
//                 http,
//                 read,
//                 persistence,
//                 params.force
//             );

//             // If we got here without an exception and not forcing re-auth, the user is already authenticated
//             if (!params.force && !params.authCode) {
//                 return {
//                     success: true,
//                     message: "You are already authenticated with your email provider."
//                 };
//             }
//         } catch (error) {
//             // If not forced and there's no auth code, we need to generate an auth URL
//             if (!params.force && !params.authCode) {
//                 const authUrl = await EmailServiceFactory.getAuthUrl(
//                     settings,
//                     sender.id,
//                     app.getLogger(),
//                     http,
//                     read,
//                     persistence
//                 );

//                 if (!authUrl) {
//                     return {
//                         success: false,
//                         message: "Failed to generate authentication URL."
//                     };
//                 }

//                 return {
//                     success: true,
//                     message: `Please visit the following URL to authenticate with your email provider:\n\n${authUrl}\n\nAfter authorization, copy the code from the URL and use \`/rocket-mail login <auth_code>\` to complete the authentication.`,
//                     data: { authUrl }
//                 };
//             }
//         }

//         // If we have an auth code, use it to complete the authentication
//         if (params.authCode) {
//             const tokens = await EmailServiceFactory.completeAuth(
//                 settings,
//                 sender.id,
//                 params.authCode,
//                 app.getLogger(),
//                 http,
//                 read,
//                 persistence
//             );

//             if (!tokens || !tokens.access_token) {
//                 return {
//                     success: false,
//                     message: "Failed to complete authentication. Please try again."
//                 };
//             }

//             return {
//                 success: true,
//                 message: "Authentication successful! You can now use Rocket Mail with your email account.",
//                 data: { authenticated: true }
//             };
//         }

//         // If we have a refresh token, use it to refresh the access token
//         if (params.refreshToken) {
//             const tokens = await EmailServiceFactory.refreshToken(
//                 settings,
//                 sender.id,
//                 params.refreshToken,
//                 app.getLogger(),
//                 http,
//                 read,
//                 persistence
//             );

//             if (!tokens || !tokens.access_token) {
//                 return {
//                     success: false,
//                     message: "Failed to refresh authentication token. Please re-authenticate."
//                 };
//             }

//             return {
//                 success: true,
//                 message: "Authentication token refreshed successfully.",
//                 data: { authenticated: true }
//             };
//         }

//         // Fallback for other scenarios
//         const authUrl = await EmailServiceFactory.getAuthUrl(
//             settings,
//             sender.id,
//             app.getLogger(),
//             http,
//             read,
//             persistence
//         );

//         if (!authUrl) {
//             return {
//                 success: false,
//                 message: "Failed to generate authentication URL."
//             };
//         }

//         return {
//             success: true,
//             message: `Please visit the following URL to authenticate with your email provider:\n\n${authUrl}\n\nAfter authorization, copy the code from the URL and use \`/rocket-mail login <auth_code>\` to complete the authentication.`,
//             data: { authUrl }
//         };

//     } catch (error) {
//         app.getLogger().error("Error during authorization:", error);

//         return {
//             success: false,
//             message: `❌ Error during authorization: ${error.message}`
//         };
//     }
// }
