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
    private readonly requestTimeout = 30000; // 30 seconds timeout

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
            // Start a timer to track total request time
            const startTime = Date.now();
            this.logger.debug(`LLMService: Starting LLM API request at ${new Date().toISOString()}`);

            const response = await this.http.post(this.apiUrl, {
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${this.apiKey}`,
                },
                data: {
                    input: prompt,
                    temperature: 0.3,
                    max_tokens: 10000,
                },
                timeout: this.requestTimeout,
            });

            this.logger.debug(`1. response: ${JSON.stringify(response)}`);

            const totalTime = Date.now() - startTime;
            this.logger.debug(`LLMService: API request completed in ${totalTime}ms`);

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
            this.logger.debug("LLM Response Structure:", JSON.stringify(data));

            // The DeepInfra API returns results in a different format
            if (!data.results || !data.results[0] || !data.results[0].generated_text) {
                throw new Error("Invalid response structure from LLM API");
            }

            // Get the generated text from the first result
            const generatedText = data.results[0].generated_text;
            this.logger.debug("Generated Text:", generatedText);

            // Extract JSON from the response
            const jsonText = this.extractJsonFromText(generatedText);
            this.logger.debug("Extracted JSON Text:", jsonText);

            if (!jsonText) {
                throw new Error("Failed to extract valid JSON from LLM response");
            }

            // Parse the extracted JSON
            const llmResponse = JSON.parse(jsonText);
            this.logger.debug(`Parsed LLM Response: ${JSON.stringify(llmResponse)}`);

            // Map action string to enum
            const actionType = this.mapActionType(llmResponse.action);

            // For send-email action, make sure to map 'content' to 'body' for compatibility
            if (actionType === LLMEmailActionType.SEND_EMAIL &&
                llmResponse.parameters &&
                llmResponse.parameters.content &&
                !llmResponse.parameters.body) {

                llmResponse.parameters.body = llmResponse.parameters.content;
            }

            return {
                action: actionType,
                parameters: llmResponse.parameters || {},
                rationale: llmResponse.rationale || "No rationale provided",
                userGuidance: llmResponse.user_guidance || llmResponse.userGuidance,
            };
        } catch (error) {
            const errorMessage = `LLM request failed: ${error.message}`;
            this.logger.error(
                `LLMService.processEmailTask -> Error processing task: ${errorMessage}`
            );

            // Return a user-friendly error response
            return {
                action: LLMEmailActionType.UNKNOWN,
                parameters: {
                    error: error.message,
                },
                rationale: "An error occurred while processing your request.",
                userGuidance: "Please try again with a simpler request or the thing u are requesting may not be completely implemented."
            };
        }
    }

    private extractJsonFromText(text: string): string {
        if (!text || typeof text !== 'string') {
            this.logger.error("Invalid text provided to extractJsonFromText:", text);
            return '';
        }

        try {
            // Extract JSON from code block if present (remove markdown code block syntax)
            let jsonText = text;
            if (typeof jsonText === 'string' && jsonText.includes("```")) {
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
            if (typeof jsonText === 'string' && !jsonText.trim().startsWith('{')) {
                const jsonMatch = jsonText.match(/\{[\s\S]*\}/);
                if (jsonMatch && jsonMatch[0]) {
                    jsonText = jsonMatch[0];
                }
            }

            // If we still don't have valid JSON, try to extract any JSON-like content
            if (typeof jsonText === 'string' && !jsonText.trim().startsWith('{')) {
                const anyJsonMatch = text.match(/\{[\s\S]*?\}/g);
                if (anyJsonMatch && anyJsonMatch[0]) {
                    jsonText = anyJsonMatch[0];
                }
            }

            // If no JSON was found, return empty string
            if (typeof jsonText !== 'string' || !jsonText.trim().startsWith('{')) {
                return '';
            }

            // Verify the extracted text is valid JSON
            JSON.parse(jsonText); // This will throw if it's not valid JSON
            return jsonText;
        } catch (error) {
            this.logger.error(`Error extracting JSON from text: ${error.message}`);
            this.logger.debug("Original text:", text);
            return '';
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
            case "summarize-and-send":
                return LLMEmailActionType.SUMMARIZE_AND_SEND;
            case "get-report":
                return LLMEmailActionType.GET_REPORT;
            default:
                this.logger.debug(`Unknown action type: ${action}`);
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
                    temperature: 0.3,
                    max_tokens: 1000,
                },
                timeout: this.requestTimeout,
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
        const prompt = `
            You are a Rocket.Chat channel summarizer. You need to create a concise summary of the conversation in the "${channelName}" channel.
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
                timeout: this.requestTimeout,
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
