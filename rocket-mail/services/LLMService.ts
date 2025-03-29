import { IHttp, ILogger } from "@rocket.chat/apps-engine/definition/accessors";
import {
    ILLMEmailAction,
    ILLMTaskRequest,
    ILLMTaskResult,
    LLMEmailActionType,
} from "../models/LLMTask";
import { ISummarizeParams } from "../models/SummarizeParams";
import { RocketMailApp } from "../RocketMailApp";

export class LLMService {
    private apiUrl =
        "https://api.deepinfra.com/v1/inference/meta-llama/Llama-3.3-70B-Instruct-Turbo";
    private apiKey: string;

    constructor(
        private readonly http: IHttp,
        private readonly logger: ILogger,
        private readonly app?: RocketMailApp
    ) {
        this.apiKey = "";
        this.initialize();
    }

    private async initialize() {
        if (this.app) {
            try {
                this.apiKey = await this.app.getDeepInfraApiKey();
                // this.apiKey = "CatSHn3si0FHeUqCZAjfMHezROTvXPH";
            } catch (error) {
                this.logger.error("Failed to initialize LLM API key:", error);
            }
        }
    }

    //I WAS DEBUGGING SO U MAY FIND SOME COMMENTED SIMILAR FUNCTIONS:

    /**
     * Process an email task using LLM
     */
    public async processEmailTask(
        taskRequest: ILLMTaskRequest
    ): Promise<ILLMEmailAction> {
        this.logger.debug(
            `LLMService.processEmailTask -> Processing task: ${taskRequest.task}`
        );

        const prompt = `You are an email assistant that helps users process email-related tasks.
            Based on the user's request, determine what email action they want to perform and extract relevant parameters.

            Possible actions:
            1. search-emails: Find emails matching certain criteria
            2. count-emails: Count emails matching certain criteria
            3. view-email: View a specific email or the latest email
            4. send-email: Compose and send a new email
            5. unknown: If the user's intent doesn't match any of the above

            For the request: "${taskRequest.task}"

            Respond in this JSON format only:
            {
            "action": "one of [search-emails, count-emails, view-email, send-email, unknown]",
            "parameters": {
                // Parameters specific to the action
                // For search-emails: startDate, endDate, sender, subject, body, folder, limit
                // For count-emails: startDate, endDate, sender
                // For view-email: emailId (use "latest" for the most recent email)
                // For send-email: to, subject, body, cc
            }
            }

            EXTREMELY IMPORTANT:
            - For send-email, always include: "to" (email addresses), "subject" (can be empty string if no subject mentioned), and "body"
            - If the user explicitly wants to send an email WITHOUT a subject or says "no subject", set subject to an empty string ""
            - If the user doesn't mention subject at all, try to generate an appropriate subject based on the content
            - Parse time periods like "yesterday", "last week", "today" into actual date ranges
            - Extract email addresses accurately - they typically contain @ symbol
            - Never make up email content that the user didn't specify
            - Never add extra text to subject or body content beyond what the user specified`;

        try {
            const response = await this.http.post(this.apiUrl, {
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${this.apiKey}`,
                },
                data: {
                    input: prompt,
                    temperature: 0.1,
                    max_tokens: 1000,
                },
            });

            if (response.statusCode !== 200) {
                const errorContent =
                    typeof response.content === "string"
                        ? response.content
                        : "No content returned";
                this.logger.error(
                    `LLMService.processEmailTask -> Error: ${errorContent}`
                );
                throw new Error(
                    `LLM API returned status ${response.statusCode}`
                );
            }

            if (!response.content) {
                throw new Error("Empty response from LLM API");
            }

            const data = JSON.parse(response.content);
            if (!data.output) {
                throw new Error("Invalid response from LLM API");
            }

            // Extract the JSON from the response
            const jsonMatch = data.output.match(/\{[\s\S]*\}/);
            if (!jsonMatch) {
                throw new Error("Could not extract JSON from LLM response");
            }

            const llmResponse = JSON.parse(jsonMatch[0]);

            // Parse the LLM's response into our action format
            const emailAction: ILLMEmailAction = {
                action: this.mapActionType(llmResponse.action),
                parameters: llmResponse.parameters || {},
            };

            // For send email action, ensure parameters are properly formatted
            if (emailAction.action === LLMEmailActionType.SEND_EMAIL) {
                // Ensure to/recipient is always in array format
                if (typeof emailAction.parameters.to === "string") {
                    emailAction.parameters.to = [emailAction.parameters.to];
                }

                // Handle case where a user explicitly wants no subject (check for phrases or empty string)
                const taskLower = taskRequest.task.toLowerCase();
                const noSubjectPhrases = [
                    "no subject",
                    "without subject",
                    "without a subject",
                ];

                const hasNoSubjectPhrase = noSubjectPhrases.some((phrase) =>
                    taskLower.includes(phrase)
                );

                // If user specifically wants no subject or subject is set to empty string, keep it that way
                if (
                    hasNoSubjectPhrase ||
                    emailAction.parameters.subject === ""
                ) {
                    emailAction.parameters.subject = "";
                }
                // If subject is undefined but not explicitly requested to be empty, provide a default
                else if (
                    emailAction.parameters.subject === undefined ||
                    emailAction.parameters.subject === null
                ) {
                    // Try to generate a minimal subject from the body (first few words)
                    const bodyText = emailAction.parameters.body || "";
                    const subjectFromBody = bodyText
                        .split(" ")
                        .slice(0, 3)
                        .join(" ");
                    emailAction.parameters.subject =
                        subjectFromBody || "No Subject";
                }

                // Ensure body is not undefined
                if (!emailAction.parameters.body) {
                    emailAction.parameters.body =
                        emailAction.parameters.text || "No content provided";
                }
            }

            // Handle special case for count emails
            if (emailAction.action === LLMEmailActionType.COUNT_EMAILS) {
                // If startDate or endDate is missing, set defaults
                if (!emailAction.parameters.startDate) {
                    // Default to 7 days ago
                    const oneWeekAgo = new Date();
                    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
                    emailAction.parameters.startDate = oneWeekAgo
                        .toISOString()
                        .split("T")[0];
                }

                if (!emailAction.parameters.endDate) {
                    // Default to today
                    emailAction.parameters.endDate = new Date()
                        .toISOString()
                        .split("T")[0];
                }
            }

            this.logger.debug(
                `LLMService.processEmailTask -> Parsed action: ${JSON.stringify(
                    emailAction
                )}`
            );
            return emailAction;
        } catch (error) {
            this.logger.error(
                `LLMService.processEmailTask -> Error: ${error.message}`
            );
            // Default to unknown action on error
            return {
                action: LLMEmailActionType.UNKNOWN,
                parameters: {},
            };
        }
    }

    /**
     * Make a direct call to the LLM with a custom prompt
     * @param prompt The prompt to send to the LLM
     * @returns The LLM's response
     */
    public async callLLM(prompt: string): Promise<string> {
        this.logger.debug(`LLMService.callLLM -> Processing prompt`);

        try {
            const response = await this.http.post(this.apiUrl, {
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${this.apiKey}`,
                },
                data: {
                    input: prompt,
                    temperature: 0.3,
                    max_tokens: 1500,
                },
            });

            if (response.statusCode !== 200) {
                const errorContent =
                    typeof response.content === "string"
                        ? response.content
                        : "No content returned";
                this.logger.error(
                    `LLMService.callLLM -> Error: ${errorContent}`
                );
                throw new Error(
                    `LLM API returned status ${response.statusCode}`
                );
            }

            if (!response.content) {
                throw new Error("Empty response from LLM API");
            }

            const data = JSON.parse(response.content);
            if (!data.output) {
                throw new Error("Invalid response from LLM API");
            }

            return data.output.trim();
        } catch (error) {
            this.logger.error(`LLMService.callLLM -> Error: ${error.message}`);
            throw new Error(
                `Failed to get response from LLM: ${error.message}`
            );
        }
    }

    /**
     * Format the task result using LLM
     */
    public async formatTaskResult(
        result: any,
        actionType: LLMEmailActionType
    ): Promise<string> {
        this.logger.debug(
            `LLMService.formatTaskResult -> Formatting result for ${actionType}`
        );

        let promptContent = "";

        switch (actionType) {
            case LLMEmailActionType.SEARCH_EMAILS:
                promptContent = `You searched for emails and found ${
                    result.count
                } matching emails. ${
                    result.count > 0 ? "Here's a summary:" : ""
                }`;
                if (result.count > 0) {
                    result.emails.forEach((email, index) => {
                        promptContent += `\n\n${index + 1}. From: ${
                            email.from
                        }`;
                        promptContent += `\n   Subject: ${email.subject}`;
                        promptContent += `\n   Date: ${email.date}`;
                        if (email.snippet) {
                            promptContent += `\n   Snippet: ${email.snippet}`;
                        }
                    });
                }
                break;

            case LLMEmailActionType.COUNT_EMAILS:
                promptContent = `I counted your emails based on your criteria. Found ${result.counts} emails.`;
                break;

            case LLMEmailActionType.VIEW_EMAIL:
                if (result.email) {
                    promptContent = `Here is the email you requested:\n\n`;
                    promptContent += `From: ${result.email.from}\n`;
                    promptContent += `To: ${result.email.to}\n`;
                    promptContent += `Subject: ${result.email.subject}\n`;
                    promptContent += `Date: ${result.email.date}\n\n`;
                    promptContent += `${
                        result.email.bodyText ||
                        result.email.bodyHtml ||
                        "No content available"
                    }`;
                } else {
                    promptContent = `Could not find the requested email.`;
                }
                break;

            case LLMEmailActionType.SEND_EMAIL:
                promptContent = `Email has been sent to ${
                    result.to
                } with subject "${result.subject || "(No Subject)"}".`;
                break;

            default:
                promptContent = `The operation completed but I'm not sure how to format the result: ${JSON.stringify(
                    result
                )}`;
        }

        try {
            const response = await this.http.post(this.apiUrl, {
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${this.apiKey}`,
                },
                data: {
                    input: `You are an email assistant. Format this information into a friendly, conversational response: ${promptContent}`,
                    temperature: 0.7,
                    max_tokens: 500,
                },
            });

            if (response.statusCode !== 200 || !response.content) {
                return promptContent; // Fall back to unformatted content
            }

            const data = JSON.parse(response.content);
            return typeof data.output === "string"
                ? data.output
                : promptContent;
        } catch (error) {
            this.logger.error(
                `LLMService.formatTaskResult -> Error: ${error.message}`
            );
            return promptContent; // Fall back to unformatted content
        }
    }

    // /**
    //  * Process a summarization request
    //  */
    // public async processSummarizeTask(
    //     taskRequest: string
    // ): Promise<ISummarizeParams> {
    //     this.logger.debug(
    //         `LLMService.processSummarizeTask -> Processing task: ${taskRequest}`
    //     );

    //     const prompt = `You are an assistant that helps extract structured parameters from user requests to summarize chat messages.

    //         Based on the user's instruction, extract the following parameters:
    //         1. The time frame of messages to summarize (today, this week, specific date range, unread messages)
    //         2. The participants whose messages should be included (specific usernames, if mentioned)
    //         3. The email recipient (if mentioned)
    //         4. The user's intention or specific request

    //         For the request: "${taskRequest}"

    //         Respond in this JSON format only:
    //         {
    //         "action": "summarize",
    //         "timeframe": {
    //             "type": "today" | "week" | "custom" | "unread",
    //             "startDate": "YYYY-MM-DD" (optional, only for custom timeframe),
    //             "endDate": "YYYY-MM-DD" (optional, only for custom timeframe)
    //         },
    //         "participants": ["username1", "username2"] (optional, only if specific users are mentioned),
    //         "recipient_email": "email@example.com" (optional, only if an email recipient is mentioned),
    //         "user_intention": "brief description of what the user wants" (optional)
    //         }

    //         VERY IMPORTANT:
    //         - If no timeframe is specified, default to "today"
    //         - Parse references to users like "@username" and extract just the username
    //         - Only include parameters that were actually mentioned in the request
    //         - Extract email addresses accurately when present
    //         - For dates, convert relative terms (like "last week", "yesterday") to actual date ranges`;

    //     try {
    //         const response = await this.http.post(this.apiUrl, {
    //             headers: {
    //                 "Content-Type": "application/json",
    //                 Authorization: `Bearer ${this.apiKey}`,
    //             },
    //             data: {
    //                 input: prompt,
    //                 temperature: 0.1,
    //                 max_tokens: 1000,
    //             },
    //         });

    //         if (response.statusCode !== 200) {
    //             const errorContent =
    //                 typeof response.content === "string"
    //                     ? response.content
    //                     : "No content returned";
    //             this.logger.error(
    //                 `LLMService.processSummarizeTask -> Error: ${errorContent}`
    //             );
    //             throw new Error(
    //                 `LLM API returned status ${response.statusCode}`
    //             );
    //         }

    //         if (!response.content) {
    //             throw new Error("Empty response from LLM API");
    //         }

    //         const data = JSON.parse(response.content);
    //         if (!data.output) {
    //             throw new Error("Invalid response from LLM API");
    //         }

    //         // Extract the JSON from the response
    //         const jsonMatch = data.output.match(/\{[\s\S]*\}/);
    //         if (!jsonMatch) {
    //             throw new Error("Could not extract JSON from LLM response");
    //         }

    //         const llmResponse = JSON.parse(jsonMatch[0]);

    //         // Set defaults if timeframe is missing
    //         if (!llmResponse.timeframe) {
    //             llmResponse.timeframe = { type: "today" };
    //         }

    //         return llmResponse as ISummarizeParams;
    //     } catch (error) {
    //         this.logger.error(
    //             `LLMService.processSummarizeTask -> Error: ${error.message}`
    //         );
    //         // Return a default structure on error
    //         return {
    //             action: "summarize",
    //             timeframe: { type: "today" },
    //         };
    //     }
    // }

    // public async processSummarizeTask(
    //     taskRequest: string
    // ): Promise<ISummarizeParams> {
    //     this.logger.debug(
    //         `LLMService.processSummarizeTask -> Processing task: ${taskRequest}`
    //     );

    //     const prompt = `You are an assistant that extracts structured parameters from user instructions for summarizing chat messages.
    //         Extract the following from the instruction:
    //         - Time frame (e.g., "today", "this week", a custom date range, or "unread"). If not specified, default to "today".
    //         - Participants (if mentioned, extract usernames without "@" symbols).
    //         - Email recipient (if mentioned).
    //         - A brief description of the user’s request.

    //         Instruction: "${taskRequest}"

    //         Respond strictly in JSON format. For example:
    //         {
    //         "action": "summarize",
    //         "timeframe": {"type": "week", "startDate": "2025-03-20", "endDate": "2025-03-26"},
    //         "participants": ["user1", "user2"],
    //         "recipient_email": "p@gmail.com",
    //         "user_intention": "Summarize weekly chat messages and email them"
    //         }`;

    //     try {
    //         const body = {
    //             messages: [
    //                 {
    //                     role: "system",
    //                     content: prompt,
    //                 },
    //             ],
    //             temperature: 0.1,
    //             max_tokens: 1000,
    //         };

    //         const response = await this.http.post(this.apiUrl, {
    //             headers: {
    //                 "Content-Type": "application/json",
    //                 Authorization: `Bearer ${this.apiKey}`,
    //             },
    //             content: JSON.stringify(body),
    //         });

    //         if (response.statusCode !== 200) {
    //             const errorContent =
    //                 typeof response.content === "string"
    //                     ? response.content
    //                     : "No content returned";
    //             this.logger.error(
    //                 `LLMService.processSummarizeTask -> Error: ${errorContent}`
    //             );
    //             throw new Error(
    //                 `LLM API returned status ${response.statusCode}`
    //             );
    //         }

    //         if (!response.content) {
    //             throw new Error("Empty response from LLM API");
    //         }

    //         const data = JSON.parse(response.content);
    //         if (
    //             !data ||
    //             !data.choices ||
    //             !data.choices[0] ||
    //             !data.choices[0].message ||
    //             !data.choices[0].message.content
    //         ) {
    //             throw new Error("Invalid response format from LLM API");
    //         }

    //         const outputText = data.choices[0].message.content;
    //         const jsonMatch = outputText.match(/\{[\s\S]*\}/);
    //         if (!jsonMatch) {
    //             throw new Error("Could not extract JSON from LLM response");
    //         }

    //         const llmResponse = JSON.parse(jsonMatch[0]);
    //         if (!llmResponse.timeframe) {
    //             llmResponse.timeframe = { type: "today" };
    //         }

    //         return llmResponse as ISummarizeParams;
    //     } catch (error: any) {
    //         this.logger.error(
    //             `LLMService.processSummarizeTask -> Error: ${error.message}`
    //         );
    //         return {
    //             action: "summarize",
    //             timeframe: { type: "today" },
    //         };
    //     }
    // }

    public async processSummarizeTask(
        taskRequest: string
    ): Promise<ISummarizeParams> {
        this.logger.debug(
            `LLMService.processSummarizeTask -> Processing task: ${taskRequest}`
        );

        const prompt = `You are an assistant that extracts structured parameters from user instructions for summarizing chat messages.
            Extract the following from the instruction:
            - Time frame (e.g., "today", "this week", a custom date range, or "unread"). If not specified, default to "today".
            - Participants (if mentioned, extract usernames without the "@" symbol).
            - Email recipient (if mentioned).
            - A brief description of the user’s request.

            Instruction: "${taskRequest}"

            Respond strictly in JSON format. For example:
            {
            "action": "summarize",
            "timeframe": { "type": "week", "startDate": "YYYY-MM-DD", "endDate": "YYYY-MM-DD" },
            "participants": ["username1", "username2"],
            "recipient_email": "email@example.com",
            "user_intention": "Summarize weekly chat messages and email them"
            }`;

        try {
            // Use 'input' instead of 'messages'
            const body = {
                input: prompt,
                stop: ["<|eot_id|>", "<|end_of_text|>", "<|eom_id|>"],
                temperature: 0.1,
                max_tokens: 1000,
            };

            const response = await this.http.post(this.apiUrl, {
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${this.apiKey}`,
                },
                content: JSON.stringify(body),
            });

            if (response.statusCode !== 200) {
                const errorContent =
                    typeof response.content === "string"
                        ? response.content
                        : "No content returned";
                this.logger.error(
                    `LLMService.processSummarizeTask -> Error: ${errorContent}`
                );
                throw new Error(
                    `LLM API returned status ${response.statusCode}`
                );
            }

            if (!response.content) {
                throw new Error("Empty response from LLM API");
            }

            const data = JSON.parse(response.content);
            if (!data.output) {
                throw new Error("Invalid response from LLM API");
            }

            // Extract the JSON from the response
            const jsonMatch = data.output.match(/\{[\s\S]*\}/);
            if (!jsonMatch) {
                throw new Error("Could not extract JSON from LLM response");
            }

            const llmResponse = JSON.parse(jsonMatch[0]);

            // Set default timeframe if missing
            if (!llmResponse.timeframe) {
                llmResponse.timeframe = { type: "today" };
            }

            return llmResponse as ISummarizeParams;
        } catch (error: any) {
            this.logger.error(
                `LLMService.processSummarizeTask -> Error: ${error.message}`
            );
            // Return a default structure on error
            return {
                action: "summarize",
                timeframe: { type: "today" },
            };
        }
    }

    // /**
    //  * Generate a summary of messages
    //  */
    // public async generateSummary(
    //     messages: string,
    //     roomName: string
    // ): Promise<string> {
    //     this.logger.debug(`LLMService.generateSummary -> Generating summary`);

    //     const prompt = `You are an assistant that creates comprehensive but concise summaries of chat conversations.

    //         Below is a chat conversation from a room named "${roomName}".
    //         Create a professional and well-structured summary that captures:
    //         1. Key topics discussed
    //         2. Important decisions or agreements made
    //         3. Action items or tasks assigned to people
    //         4. Important questions raised and their answers (if available)
    //         5. Any deadlines or important dates mentioned

    //         Your summary should be well-organized, using bullet points or sections where appropriate,
    //         and should maintain a professional tone suitable for a business context.

    //         CONVERSATION:
    //         ${messages}

    //         SUMMARY:`;

    //     try {
    //         return await this.callLLM(prompt);
    //     } catch (error) {
    //         this.logger.error(
    //             `LLMService.generateSummary -> Error: ${error.message}`
    //         );
    //         throw new Error("Failed to generate summary of messages");
    //     }
    // }

    /**
     * Generate a summary of messages
     */
    public async generateSummary(
        messages: string,
        roomName: string
    ): Promise<string> {
        this.logger.debug(`LLMService.generateSummary -> Generating summary`);

        const prompt = `You are an assistant that creates comprehensive but concise summaries of chat conversations.

            Below is a chat conversation from a room named "${roomName}".
            Create a professional and well-structured summary that captures:
            1. Key topics discussed
            2. Important decisions or agreements made
            3. Action items or tasks assigned
            4. Important questions raised and their answers (if available)
            5. Any deadlines or important dates mentioned

            Your summary should be organized (using bullet points or sections) and maintain a professional tone.

            CONVERSATION:
            ${messages}

            SUMMARY:`;

        try {
            return await this.callLLM(prompt);
        } catch (error) {
            this.logger.error(
                `LLMService.generateSummary -> Error: ${error.message}`
            );
            // Instead of throwing an error, return a default summary template.
            return `Summary:
            - We encountered an error generating the summary.
            - Please refer to the attached conversation details for more information.

            Dear recipient@gmail.com,

            Here’s a summary of our recent discussion in [Channel/Room Name]:

            Key Topics Discussed:
            [Briefly summarize main topics]

            Important Decisions & Agreements:
            [Decision 1]
            [Decision 2]

            Action Items:
            [Person 1] to complete [Task] by [Deadline]
            [Person 2] to follow up on [Task] with [Team/Person]

            `;
        }
    }

    /**
     * Map string action to enum
     */
    private mapActionType(action: string): LLMEmailActionType {
        switch (action.toLowerCase()) {
            case "search-emails":
                return LLMEmailActionType.SEARCH_EMAILS;
            case "count-emails":
                return LLMEmailActionType.COUNT_EMAILS;
            case "view-email":
                return LLMEmailActionType.VIEW_EMAIL;
            case "send-email":
                return LLMEmailActionType.SEND_EMAIL;
            default:
                return LLMEmailActionType.UNKNOWN;
        }
    }
}
