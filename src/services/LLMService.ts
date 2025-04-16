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
import * as SettingsUtil from "../utils/SettingsUtil";

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
                this.apiKey = await SettingsUtil.getDeepInfraApiKey(this.app);
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
            if (actionType === LLMEmailActionType.SEND_EMAIL) {
                if (llmResponse.content && !llmResponse.body) {
                    llmResponse.body = llmResponse.content;
                    delete llmResponse.content;
                }
            }

            return {
                action: actionType,
                ...llmResponse,
            };
        } catch (error) {
            this.logger.error(
                `LLMService.processEmailTask -> Error processing task: ${error}`
            );
            throw new Error(`Failed to process task: ${error.message}`);
        }
    }

    private extractJsonFromText(text: string): string {
        // Try to find JSON object in the text
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch && jsonMatch[0]) {
            try {
                // Validate that it's valid JSON by parsing it
                JSON.parse(jsonMatch[0]);
                return jsonMatch[0];
            } catch (e) {
                // Not valid JSON, continue with other extraction methods
            }
        }

        // Try to extract from code block
        const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
        if (codeBlockMatch && codeBlockMatch[1]) {
            try {
                // Check if the content of the code block is valid JSON
                JSON.parse(codeBlockMatch[1]);
                return codeBlockMatch[1];
            } catch (e) {
                // Not valid JSON, continue with other extraction methods
            }
        }

        // As a last resort, try to find anything that looks like JSON
        const lastResortMatch = text.match(/(\{[\s\S]*?\})/g);
        if (lastResortMatch) {
            for (const potentialJson of lastResortMatch) {
                try {
                    JSON.parse(potentialJson);
                    return potentialJson;
                } catch (e) {
                    // Continue to the next potential JSON
                }
            }
        }

        return "";
    }

    /**
     * Map string action to LLMEmailActionType enum
     */
    private mapActionType(action: string): LLMEmailActionType {
        const normalizedAction = action.toLowerCase().trim();

        switch (normalizedAction) {
            case "send-email":
            // case "send_email":
            // case "sendemail":
                return LLMEmailActionType.SEND_EMAIL;
            case "search-emails":
                return LLMEmailActionType.SEARCH_EMAILS;
            case "count-emails":
                return LLMEmailActionType.COUNT_EMAILS;
            case "view-email":
                return LLMEmailActionType.VIEW_EMAIL;
            case "summarize":
                return LLMEmailActionType.SUMMARIZE;
            case "summarize-and-send":
                return LLMEmailActionType.SUMMARIZE_AND_SEND;
            case "get-report":
                return LLMEmailActionType.GET_REPORT;
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

            // Return the summarize parameters based on the ISummarizeParams interface
            return llmResponse as ISummarizeParams;
        } catch (error) {
            this.logger.error(
                `LLMService.processSummarizeTask -> Error processing task: ${error}`
            );
            throw new Error(`Failed to process summarize task: ${error.message}`);
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

        const prompt = `You are an AI assistant tasked with summarizing a Rocket.Chat conversation from the channel "${channelName}".
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
