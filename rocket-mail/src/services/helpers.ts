/**
 * Format a date to a readable string
 * @param date The date to format
 * @returns Formatted date string (YYYY-MM-DD)
 */
export function formatDate(date: Date): string {
    return date.toISOString().split('T')[0];
}
