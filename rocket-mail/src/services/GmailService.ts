import { IHttp, ILogger } from '@rocket.chat/apps-engine/definition/accessors';
import { OAuthService } from '../email-providers/OAuth/OAuthService';
import { IEmailContent, IEmailDetails, IEmailSummary } from '../types/interfaces/IEmailService';
import { IEmailSearchParams, IEmailCountParams } from '../models/LLMTask';

export class GmailService {
    constructor(
        private readonly userId: string,
        private readonly oauthService: OAuthService,
        private readonly http: IHttp,
        private readonly logger: ILogger
    ) {}

    private async getAccessToken(): Promise<string> {
        return this.oauthService.getValidAccessToken(this.userId);
    }

    public async sendEmail(emailContent: IEmailContent): Promise<boolean> {
        this.logger.debug('GmailService.sendEmail -> Preparing to send email');

        try {
            const accessToken = await this.getAccessToken();

            // Create MIME message
            const emailLines: string[] = [];
            emailLines.push(`From: ${emailContent.from}`);
            emailLines.push(`To: ${emailContent.to}`);
            emailLines.push(`Subject: ${emailContent.subject || '(No Subject)'}`);
            emailLines.push('MIME-Version: 1.0');

            if (emailContent.html) {
                emailLines.push('Content-Type: multipart/alternative; boundary="boundary_text"');
                emailLines.push('');
                emailLines.push('--boundary_text');
                emailLines.push('Content-Type: text/plain; charset="UTF-8"');
                emailLines.push('Content-Transfer-Encoding: 7bit');
                emailLines.push('');
                emailLines.push(emailContent.text || '');
                emailLines.push('');
                emailLines.push('--boundary_text');
                emailLines.push('Content-Type: text/html; charset="UTF-8"');
                emailLines.push('Content-Transfer-Encoding: 7bit');
                emailLines.push('');
                emailLines.push(emailContent.html);
                emailLines.push('');
                emailLines.push('--boundary_text--');
            } else {
                emailLines.push('Content-Type: text/plain; charset="UTF-8"');
                emailLines.push('');
                emailLines.push(emailContent.text || '');
            }

            const email = emailLines.join('\r\n');
            const base64EncodedEmail = Buffer.from(email).toString('base64')
                .replace(/\+/g, '-')
                .replace(/\//g, '_')
                .replace(/=+$/, '');

            const response = await this.http.post('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json'
                },
                data: {
                    raw: base64EncodedEmail
                }
            });

            if (response.statusCode === 200) {
                this.logger.debug('GmailService.sendEmail -> Email sent successfully');
                return true;
            } else {
                this.logger.error(`GmailService.sendEmail -> Error: ${response.content}`);
                throw new Error(`Failed to send email: ${response.content}`);
            }
        } catch (error) {
            this.logger.error(`GmailService.sendEmail -> Error: ${error}`);
            throw new Error(`Failed to send email: ${error.message}`);
        }
    }

    public async getLastReceivedEmail(): Promise<IEmailDetails> {
        this.logger.debug('GmailService.getLastReceivedEmail -> Getting last received email');

        try {
            const accessToken = await this.getAccessToken();

            // First, get the list of messages (just 1)
            const listResponse = await this.http.get('https://gmail.googleapis.com/gmail/v1/users/me/messages', {
                headers: {
                    'Authorization': `Bearer ${accessToken}`
                },
                params: {
                    maxResults: '1',
                    q: 'in:inbox'
                }
            });

            if (listResponse.statusCode !== 200 || !listResponse.content) {
                throw new Error(`Failed to get messages: ${listResponse.content}`);
            }

            const listData = JSON.parse(listResponse.content);
            if (!listData.messages || listData.messages.length === 0) {
                throw new Error('No emails found in inbox');
            }

            // Get the full message
            const messageId = listData.messages[0].id;
            return await this.getEmailById(messageId);
        } catch (error) {
            this.logger.error(`GmailService.getLastReceivedEmail -> Error: ${error}`);
            throw new Error(`Failed to retrieve latest email: ${error.message}`);
        }
    }

    public async searchEmails(params: IEmailSearchParams): Promise<IEmailSummary[]> {
        this.logger.debug('GmailService.searchEmails -> Searching emails with params:', params);

        try {
            const accessToken = await this.getAccessToken();

            // Build Gmail query string
            let query = 'in:inbox';

            if (params.sender) {
                query += ` from:${params.sender}`;
            }

            if (params.subject) {
                query += ` subject:(${params.subject})`;
            }

            if (params.body) {
                query += ` ${params.body}`;
            }

            if (params.startDate) {
                const startDate = new Date(params.startDate);
                query += ` after:${startDate.getFullYear()}/${startDate.getMonth() + 1}/${startDate.getDate()}`;
            }

            if (params.endDate) {
                const endDate = new Date(params.endDate);
                query += ` before:${endDate.getFullYear()}/${endDate.getMonth() + 1}/${endDate.getDate()}`;
            }

            const limit = params.limit ? String(params.limit) : '20';

            // Get the list of messages
            const listResponse = await this.http.get('https://gmail.googleapis.com/gmail/v1/users/me/messages', {
                headers: {
                    'Authorization': `Bearer ${accessToken}`
                },
                params: {
                    maxResults: limit,
                    q: query
                }
            });

            if (listResponse.statusCode !== 200 || !listResponse.content) {
                throw new Error(`Failed to search messages: ${listResponse.content}`);
            }

            const listData = JSON.parse(listResponse.content);
            if (!listData.messages || listData.messages.length === 0) {
                return [];
            }

            // For each message ID, get the message metadata (not full content)
            const emails: IEmailSummary[] = [];

            // Use Promise.all to fetch all message details in parallel
            await Promise.all(listData.messages.slice(0, parseInt(limit)).map(async (message: any) => {
                try {
                    const metadataResponse = await this.http.get(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${message.id}`, {
                        headers: {
                            'Authorization': `Bearer ${accessToken}`
                        },
                        params: {
                            format: 'metadata',
                            metadataHeaders: 'From,Subject,Date'
                        }
                    });

                    if (metadataResponse.statusCode === 200 && metadataResponse.content) {
                        const metadata = JSON.parse(metadataResponse.content);
                        const headers = metadata.payload.headers;

                        const fromHeader = headers.find((h: any) => h.name === 'From');
                        const subjectHeader = headers.find((h: any) => h.name === 'Subject');
                        const dateHeader = headers.find((h: any) => h.name === 'Date');

                        emails.push({
                            id: metadata.id,
                            from: fromHeader ? fromHeader.value : 'Unknown',
                            subject: subjectHeader ? subjectHeader.value : '(No Subject)',
                            date: dateHeader ? dateHeader.value : 'Unknown Date'
                        });
                    }
                } catch (err) {
                    this.logger.error(`Error fetching email metadata: ${err}`);
                    // Continue with other emails
                }
            }));

            return emails;
        } catch (error) {
            this.logger.error(`GmailService.searchEmails -> Error: ${error}`);
            throw new Error(`Failed to search emails: ${error.message}`);
        }
    }

    public async countEmails(params: IEmailCountParams): Promise<Record<string, number>> {
        this.logger.debug('GmailService.countEmails -> Counting emails with params:', params);

        try {
            const accessToken = await this.getAccessToken();

            // Build Gmail query string
            let query = 'in:inbox';

            if (params.sender) {
                query += ` from:${params.sender}`;
            }

            if (params.startDate && params.endDate) {
                const startDate = new Date(params.startDate);
                const endDate = new Date(params.endDate);

                query += ` after:${startDate.getFullYear()}/${startDate.getMonth() + 1}/${startDate.getDate()}`;
                query += ` before:${endDate.getFullYear()}/${endDate.getMonth() + 1}/${endDate.getDate() + 1}`;

                // Get the list of messages
                const response = await this.http.get('https://gmail.googleapis.com/gmail/v1/users/me/messages', {
                    headers: {
                        'Authorization': `Bearer ${accessToken}`
                    },
                    params: {
                        q: query
                    }
                });

                if (response.statusCode !== 200 || !response.content) {
                    throw new Error(`Failed to count messages: ${response.content}`);
                }

                const data = JSON.parse(response.content);

                // Return the count by date range
                return {
                    [`${startDate.toISOString().split('T')[0]} to ${endDate.toISOString().split('T')[0]}`]:
                        data.resultSizeEstimate || (data.messages ? data.messages.length : 0)
                };
            } else {
                // If no date range specified, count emails from last 7 days
                const endDate = new Date();
                const results: Record<string, number> = {};

                // Count emails for each of the last 7 days
                for (let i = 6; i >= 0; i--) {
                    const day = new Date();
                    day.setDate(day.getDate() - i);

                    const dayQuery = `${query} after:${day.getFullYear()}/${day.getMonth() + 1}/${day.getDate()} before:${day.getFullYear()}/${day.getMonth() + 1}/${day.getDate() + 1}`;

                    const response = await this.http.get('https://gmail.googleapis.com/gmail/v1/users/me/messages', {
                        headers: {
                            'Authorization': `Bearer ${accessToken}`
                        },
                        params: {
                            q: dayQuery
                        }
                    });

                    if (response.statusCode === 200 && response.content) {
                        const data = JSON.parse(response.content);
                        const count = data.resultSizeEstimate || (data.messages ? data.messages.length : 0);

                        // Format date as YYYY-MM-DD
                        const dateKey = day.toISOString().split('T')[0];
                        results[dateKey] = count;
                    }
                }

                return results;
            }
        } catch (error) {
            this.logger.error(`GmailService.countEmails -> Error: ${error}`);
            throw new Error(`Failed to count emails: ${error.message}`);
        }
    }

    public async generateEmailReport(startDate: string, endDate: string): Promise<Record<string, any>> {
        this.logger.debug(`GmailService.generateEmailReport -> Generating report from ${startDate} to ${endDate}`);

        try {
            const accessToken = await this.getAccessToken();
            const report: Record<string, any> = {};

            // Set date range for queries
            const start = new Date(startDate);
            const end = new Date(endDate);
            const startFormatted = `${start.getFullYear()}/${start.getMonth() + 1}/${start.getDate()}`;
            const endFormatted = `${end.getFullYear()}/${end.getMonth() + 1}/${end.getDate() + 1}`;

            // 1. Count total emails received
            const receivedQuery = `in:inbox after:${startFormatted} before:${endFormatted}`;
            const receivedResponse = await this.http.get('https://gmail.googleapis.com/gmail/v1/users/me/messages', {
                headers: {
                    'Authorization': `Bearer ${accessToken}`
                },
                params: {
                    q: receivedQuery
                }
            });

            if (receivedResponse.statusCode === 200 && receivedResponse.content) {
                const receivedData = JSON.parse(receivedResponse.content);
                report.total_mails_received = receivedData.resultSizeEstimate ||
                    (receivedData.messages ? receivedData.messages.length : 0);
            } else {
                report.total_mails_received = 0;
            }

            // 2. Count unread emails
            const unreadQuery = `in:inbox is:unread after:${startFormatted} before:${endFormatted}`;
            const unreadResponse = await this.http.get('https://gmail.googleapis.com/gmail/v1/users/me/messages', {
                headers: {
                    'Authorization': `Bearer ${accessToken}`
                },
                params: {
                    q: unreadQuery
                }
            });

            if (unreadResponse.statusCode === 200 && unreadResponse.content) {
                const unreadData = JSON.parse(unreadResponse.content);
                report.unread_mails = unreadData.resultSizeEstimate ||
                    (unreadData.messages ? unreadData.messages.length : 0);
            } else {
                report.unread_mails = 0;
            }

            // 3. Count sent emails
            const sentQuery = `in:sent after:${startFormatted} before:${endFormatted}`;
            const sentResponse = await this.http.get('https://gmail.googleapis.com/gmail/v1/users/me/messages', {
                headers: {
                    'Authorization': `Bearer ${accessToken}`
                },
                params: {
                    q: sentQuery
                }
            });

            if (sentResponse.statusCode === 200 && sentResponse.content) {
                const sentData = JSON.parse(sentResponse.content);
                report.mails_sent = sentData.resultSizeEstimate ||
                    (sentData.messages ? sentData.messages.length : 0);
            } else {
                report.mails_sent = 0;
            }

            // 4. Count emails with attachments
            const attachmentQuery = `in:inbox has:attachment after:${startFormatted} before:${endFormatted}`;
            const attachmentResponse = await this.http.get('https://gmail.googleapis.com/gmail/v1/users/me/messages', {
                headers: {
                    'Authorization': `Bearer ${accessToken}`
                },
                params: {
                    q: attachmentQuery
                }
            });

            if (attachmentResponse.statusCode === 200 && attachmentResponse.content) {
                const attachmentData = JSON.parse(attachmentResponse.content);
                report.mails_with_attachments = attachmentData.resultSizeEstimate ||
                    (attachmentData.messages ? attachmentData.messages.length : 0);
            } else {
                report.mails_with_attachments = 0;
            }

            // 5. Count emails with deadline-related words in the subject
            const deadlineQuery = `in:inbox (subject:"deadline" OR subject:"due" OR subject:"by tomorrow") after:${startFormatted} before:${endFormatted}`;
            const deadlineResponse = await this.http.get('https://gmail.googleapis.com/gmail/v1/users/me/messages', {
                headers: {
                    'Authorization': `Bearer ${accessToken}`
                },
                params: {
                    q: deadlineQuery
                }
            });

            if (deadlineResponse.statusCode === 200 && deadlineResponse.content) {
                const deadlineData = JSON.parse(deadlineResponse.content);
                report.mails_with_deadlines = deadlineData.resultSizeEstimate ||
                    (deadlineData.messages ? deadlineData.messages.length : 0);
            } else {
                report.mails_with_deadlines = 0;
            }

            // 6. Count emails by category (using Gmail's categories)
            report.mails_by_category = {};

            // Common Gmail categories
            const categories = ['primary', 'social', 'promotions', 'updates', 'forums'];

            for (const category of categories) {
                const categoryQuery = `in:inbox category:${category} after:${startFormatted} before:${endFormatted}`;
                const categoryResponse = await this.http.get('https://gmail.googleapis.com/gmail/v1/users/me/messages', {
                    headers: {
                        'Authorization': `Bearer ${accessToken}`
                    },
                    params: {
                        q: categoryQuery
                    }
                });

                if (categoryResponse.statusCode === 200 && categoryResponse.content) {
                    const categoryData = JSON.parse(categoryResponse.content);
                    const count = categoryData.resultSizeEstimate ||
                        (categoryData.messages ? categoryData.messages.length : 0);

                    if (count > 0) {
                        report.mails_by_category[category] = count;
                    }
                }
            }

            return report;
        } catch (error) {
            this.logger.error(`GmailService.generateEmailReport -> Error: ${error}`);
            throw new Error(`Failed to generate email report: ${error.message}`);
        }
    }

    public async getEmailById(emailId: string): Promise<IEmailDetails> {
        this.logger.debug(`GmailService.getEmailById -> Getting email with ID: ${emailId}`);

        try {
            const accessToken = await this.getAccessToken();

            const response = await this.http.get(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${emailId}`, {
                headers: {
                    'Authorization': `Bearer ${accessToken}`
                },
                params: {
                    format: 'full'
                }
            });

            if (response.statusCode !== 200 || !response.content) {
                throw new Error(`Failed to get email: ${response.content}`);
            }

            const message = JSON.parse(response.content);
            const headers = message.payload.headers;

            const fromHeader = headers.find((h: any) => h.name === 'From');
            const toHeader = headers.find((h: any) => h.name === 'To');
            const subjectHeader = headers.find((h: any) => h.name === 'Subject');
            const dateHeader = headers.find((h: any) => h.name === 'Date');

            // Extract email body
            let content = '';

            const extractBody = (part: any): string => {
                if (part.mimeType === 'text/plain' && part.body.data) {
                    return Buffer.from(part.body.data, 'base64').toString('utf-8');
                }

                if (part.parts) {
                    for (const subPart of part.parts) {
                        const subContent = extractBody(subPart);
                        if (subContent) {
                            return subContent;
                        }
                    }
                }

                return '';
            };

            if (message.payload.body && message.payload.body.data) {
                content = Buffer.from(message.payload.body.data, 'base64').toString('utf-8');
            } else if (message.payload.parts) {
                content = extractBody(message.payload);
            }

            return {
                id: message.id,
                from: fromHeader ? fromHeader.value : 'Unknown',
                to: toHeader ? toHeader.value : 'Unknown',
                subject: subjectHeader ? subjectHeader.value : '(No Subject)',
                date: dateHeader ? dateHeader.value : 'Unknown',
                content: content || 'No content found'
            };
        } catch (error) {
            this.logger.error(`GmailService.getEmailById -> Error: ${error}`);
            throw new Error(`Failed to retrieve email: ${error.message}`);
        }
    }
}
