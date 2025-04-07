import { IHttp, ILogger } from "@rocket.chat/apps-engine/definition/accessors";
import {
    ILLMEmailAction,
    ILLMTaskRequest,
    ILLMTaskResult,
    LLMEmailActionType,
} from "../models/LLMTask";
import { ISummarizeParams } from "../models/SummarizeParams";
import { RocketMailApp } from "../../RocketMailApp";
import getIntentDetectionPrompt from "../constants/prompts/IntentDetectionPrompt";
import getSummarizePrompt from "../constants/prompts/SummarisePrompt";

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
            } catch (error) {
                this.logger.error("Failed to initialize LLM API key:", error);
            }
        }
    }

    /**
     * Process an email task using LLM
     */
    public async processEmailTask(
        taskRequest: ILLMTaskRequest
    ): Promise<ILLMEmailAction> {
        this.logger.debug(
            `LLMService.processEmailTask -> Processing task: ${taskRequest.task}`
        );

        const prompt = getIntentDetectionPrompt(taskRequest);

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

            this.logger.debug("LLM intent Response:", response);
            console.log("LLM intent Response:", response);

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

            // Debug the response structure
            this.logger.debug("LLM Response Structure:", JSON.stringify(data, null, 2));

            // The DeepInfra API returns results in a different format
            if (!data.results || !data.results[0] || !data.results[0].generated_text) {
                throw new Error("Invalid response structure from LLM API");
            }

            // Get the generated text from the first result
            const generatedText = data.results[0].generated_text;
            this.logger.debug("Generated Text:", generatedText);

            // Extract JSON from code block if present (remove markdown code block syntax)
            let jsonText = generatedText;
            if (jsonText.includes("```")) {
                // Extract content between code block markers
                const match = jsonText.match(/```(?:json)?\n([\s\S]*?)\n```/);
                if (match && match[1]) {
                    jsonText = match[1];
                } else {
                    // Try to find just the content after the opening code block
                    const simpleMatch = jsonText.match(/```(?:json)?\n([\s\S]*)/);
                    if (simpleMatch && simpleMatch[1]) {
                        jsonText = simpleMatch[1].replace(/\n```$/, '');
                    }
                }
            }

            // Try to find JSON object in the response text
            if (!jsonText.trim().startsWith('{')) {
                const jsonMatch = jsonText.match(/\{[\s\S]*\}/);
                if (jsonMatch && jsonMatch[0]) {
                    jsonText = jsonMatch[0];
                }
            }

            this.logger.debug("Extracted JSON Text:", jsonText);

            // Parse the extracted JSON
            let llmResponse;
            try {
                llmResponse = JSON.parse(jsonText);
            } catch (parseError) {
                this.logger.error("Error parsing LLM JSON:", parseError);
                this.logger.debug("Failed JSON Text:", jsonText);
                throw new Error(`Could not parse JSON from LLM response: ${parseError.message}`);
            }

            this.logger.debug(`LLMService.processEmailTask -> LLM Response: ${JSON.stringify(llmResponse)}`);

            // Parse the LLM's response into our action format
            const actionType = this.mapActionType(llmResponse.action);
            const emailAction: ILLMEmailAction = {
                action: actionType,
                parameters: llmResponse.parameters || {},
                rationale: llmResponse.rationale || ''
            };

            // If there's user guidance provided, add it to the action
            if (llmResponse.user_guidance) {
                emailAction.userGuidance = llmResponse.user_guidance;
            }

            // Special handling for summarize action - map to appropriate existing command
            if (emailAction.action === LLMEmailActionType.SUMMARIZE) {
                const type = emailAction.parameters.type;

                if (type === "email_report") {
                    // Map to report command
                    emailAction.action = LLMEmailActionType.SUMMARIZE;
                    // Ensure days parameter exists, default to 7 if not specified
                    if (!emailAction.parameters.days || isNaN(parseInt(String(emailAction.parameters.days)))) {
                        emailAction.parameters.days = 7;
                    }
                }
            }

            // For send email action, ensure parameters are properly formatted
            if (emailAction.action === LLMEmailActionType.SEND_EMAIL) {
                // Ensure to/recipient is always in array format
                if (typeof emailAction.parameters.to === "string") {
                    emailAction.parameters.to = [emailAction.parameters.to];
                }

                // Handle case where a user explicitly wants no subject
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
                `LLMService.processEmailTask -> Error processing task: ${error}`
            );
            return {
                action: LLMEmailActionType.UNKNOWN,
                parameters: {
                    error: error.message,
                },
            };
        }
    }

    /**
     * Map string action to LLMEmailActionType enum
     */
    private mapActionType(action: string): LLMEmailActionType {
        switch (action) {
            case "search-emails":
                return LLMEmailActionType.SEARCH_EMAILS;
            case "count-emails":
                return LLMEmailActionType.COUNT_EMAILS;
            case "view-email":
                return LLMEmailActionType.VIEW_EMAIL;
            case "send-email":
                return LLMEmailActionType.SEND_EMAIL;
            case "summarize":
                return LLMEmailActionType.SUMMARIZE;
            default:
                return LLMEmailActionType.UNKNOWN;
        }
    }

    /**
     * Process a summarize task using LLM
     */
    public async processSummarizeTask(
        instruction: string
    ): Promise<ISummarizeParams> {
        this.logger.debug(
            `LLMService.processSummarizeTask -> Processing instruction: ${instruction}`
        );

        const prompt = getSummarizePrompt(instruction);

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
                throw new Error(
                    `LLM API returned status ${response.statusCode}`
                );
            }

            if (!response.content) {
                throw new Error("Empty response from LLM API");
            }

            const data = JSON.parse(response.content);

            // Debug the response structure
            this.logger.debug("LLM Response Structure:", JSON.stringify(data, null, 2));

            // The DeepInfra API returns results in a different format
            if (!data.results || !data.results[0] || !data.results[0].generated_text) {
                throw new Error("Invalid response structure from LLM API");
            }

            // Get the generated text from the first result
            const generatedText = data.results[0].generated_text;
            this.logger.debug("Generated Text:", generatedText);

            // Extract JSON from code block if present (remove markdown code block syntax)
            let jsonText = generatedText;
            if (jsonText.includes("```")) {
                // Extract content between code block markers
                const match = jsonText.match(/```(?:json)?\n([\s\S]*?)\n```/);
                if (match && match[1]) {
                    jsonText = match[1];
                } else {
                    // Try to find just the content after the opening code block
                    const simpleMatch = jsonText.match(/```(?:json)?\n([\s\S]*)/);
                    if (simpleMatch && simpleMatch[1]) {
                        jsonText = simpleMatch[1].replace(/\n```$/, '');
                    }
                }
            }

            // Try to find JSON object in the response text
            if (!jsonText.trim().startsWith('{')) {
                const jsonMatch = jsonText.match(/\{[\s\S]*\}/);
                if (jsonMatch && jsonMatch[0]) {
                    jsonText = jsonMatch[0];
                }
            }

            this.logger.debug("Extracted JSON Text:", jsonText);

            // Parse the extracted JSON
            let llmResponse;
            try {
                llmResponse = JSON.parse(jsonText);
            } catch (parseError) {
                this.logger.error("Error parsing LLM JSON:", parseError);
                this.logger.debug("Failed JSON Text:", jsonText);
                throw new Error(`Could not parse JSON from LLM response: ${parseError.message}`);
            }

            this.logger.debug(`LLMService.processSummarizeTask -> LLM Response: ${JSON.stringify(llmResponse)}`);

            return llmResponse;
        } catch (error) {
            this.logger.error(
                `LLMService.processSummarizeTask -> Error processing instruction: ${error}`
            );
            // Return default parameters
            return {
                timeframe: {
                    type: "today",
                },
                participants: [],
                keywords: [],
                format: "paragraph",
                maxLength: 0,
                recipient_email: "",
            };
        }
    }

    /**
     * Generate a summary using LLM
     */
    public async generateSummary(
        messages: string,
        channelName: string
    ): Promise<string> {
        this.logger.debug(
            `LLMService.generateSummary -> Generating summary for channel: ${channelName}`
        );

        const prompt = `You are a chat summarization assistant.
            Summarize the following conversation from the "${channelName}" channel in a clear, concise manner.
            Focus on the main topics discussed, important decisions made, and action items.
            Structure the summary as a coherent paragraph.

            Here's the conversation:
            ${messages}

            Provide a summary that captures the key points, main discussion threads, and any important outcomes.
            Make sure the summary is clear to someone who wasn't part of the original conversation.`;

        try {
            const response = await this.http.post(this.apiUrl, {
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${this.apiKey}`,
                },
                data: {
                    input: prompt,
                    temperature: 0.3,
                    max_tokens: 1000,
                },
            });

            if (response.statusCode !== 200) {
                throw new Error(
                    `LLM API returned status ${response.statusCode}`
                );
            }

            if (!response.content) {
                throw new Error("Empty response from LLM API");
            }

            const data = JSON.parse(response.content);

            // Debug the response structure
            this.logger.debug("LLM Response Structure:", JSON.stringify(data, null, 2));

            // The DeepInfra API returns results in a different format
            if (!data.results || !data.results[0] || !data.results[0].generated_text) {
                throw new Error("Invalid response structure from LLM API");
            }

            // Get the generated text from the first result
            const generatedText = data.results[0].generated_text;
            this.logger.debug("Generated Text:", generatedText);

            // Extract JSON from code block if present (remove markdown code block syntax)
            let jsonText = generatedText;
            if (jsonText.includes("```")) {
                // Extract content between code block markers
                const match = jsonText.match(/```(?:json)?\n([\s\S]*?)\n```/);
                if (match && match[1]) {
                    jsonText = match[1];
                } else {
                    // Try to find just the content after the opening code block
                    const simpleMatch = jsonText.match(/```(?:json)?\n([\s\S]*)/);
                    if (simpleMatch && simpleMatch[1]) {
                        jsonText = simpleMatch[1].replace(/\n```$/, '');
                    }
                }
            }

            // Try to find JSON object in the response text
            if (!jsonText.trim().startsWith('{')) {
                const jsonMatch = jsonText.match(/\{[\s\S]*\}/);
                if (jsonMatch && jsonMatch[0]) {
                    jsonText = jsonMatch[0];
                }
            }

            this.logger.debug("Extracted JSON Text:", jsonText);

            // Parse the extracted JSON
            let llmResponse;
            try {
                llmResponse = JSON.parse(jsonText);
            } catch (parseError) {
                this.logger.error("Error parsing LLM JSON:", parseError);
                this.logger.debug("Failed JSON Text:", jsonText);
                throw new Error(`Could not parse JSON from LLM response: ${parseError.message}`);
            }

            this.logger.debug(`LLMService.generateSummary -> LLM Response: ${JSON.stringify(llmResponse)}`);

            // Ensure we have a valid string before doing any operations
            const outputStr = typeof llmResponse === 'string' ? llmResponse : '';
            const summary = outputStr
                ? outputStr.replace(/^Summary:|\bSummary\b:/i, "").trim()
                : "Failed to generate summary due to an error.";

            return summary;
        } catch (error) {
            this.logger.error(
                `LLMService.generateSummary -> Error generating summary: ${error}`
            );
            return "Failed to generate summary due to an error.";
        }
    }
}
