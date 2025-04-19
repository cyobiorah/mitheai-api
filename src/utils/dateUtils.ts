/**
 * Date utility functions for handling timezones and date formatting
 */

/**
 * Convert a date to UTC based on the provided timezone
 * @param date The date to convert
 * @param timezone The timezone to convert from (e.g., "America/New_York")
 * @returns Date in UTC
 */
export function toUTC(date: Date, timezone?: string): Date {
  if (!timezone) {
    return new Date(date.toISOString());
  }

  try {
    // Create a formatter with the specified timezone
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
      second: "numeric",
      hour12: false,
    });

    // Format the date in the specified timezone
    const parts = formatter.formatToParts(date);

    // Extract date components
    const year = parseInt(
      parts.find((part) => part.type === "year")?.value ?? "0"
    );
    const month =
      parseInt(parts.find((part) => part.type === "month")?.value ?? "0") - 1;
    const day = parseInt(
      parts.find((part) => part.type === "day")?.value ?? "0"
    );
    const hour = parseInt(
      parts.find((part) => part.type === "hour")?.value ?? "0"
    );
    const minute = parseInt(
      parts.find((part) => part.type === "minute")?.value ?? "0"
    );
    const second = parseInt(
      parts.find((part) => part.type === "second")?.value ?? "0"
    );

    // Create a new date in UTC
    return new Date(Date.UTC(year, month, day, hour, minute, second));
  } catch (error) {
    console.error(
      `Error converting date to UTC with timezone ${timezone}:`,
      error
    );
    return new Date(date.toISOString());
  }
}

/**
 * Convert a UTC date to a local date in the specified timezone
 * @param utcDate The UTC date to convert
 * @param timezone The timezone to convert to (e.g., "America/New_York")
 * @returns Date in the specified timezone
 */
export function fromUTC(utcDate: Date, timezone: string): Date {
  try {
    // Create a formatter with the specified timezone
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
      second: "numeric",
      hour12: false,
    });

    // Get the parts of the formatted date
    const formattedDate = formatter.format(utcDate);

    // Parse the formatted date back to a Date object
    return new Date(formattedDate);
  } catch (error) {
    console.error(`Error converting UTC date to timezone ${timezone}:`, error);
    return utcDate;
  }
}

/**
 * Format a date for display in the specified timezone
 * @param date The date to format
 * @param timezone The timezone to format in (e.g., "America/New_York")
 * @param format Optional format specification
 * @returns Formatted date string with timezone indicator
 */
export function formatDateForTimezone(
  date: Date,
  timezone: string,
  format?: string
): string {
  try {
    // Default options for date formatting
    const options: Intl.DateTimeFormatOptions = {
      timeZone: timezone,
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
      hour12: true,
      timeZoneName: "short",
    };

    // Create a formatter with the specified timezone
    const formatter = new Intl.DateTimeFormat("en-US", options);

    // Format the date
    return formatter.format(date);
  } catch (error) {
    console.error(`Error formatting date for timezone ${timezone}:`, error);
    return date.toLocaleString() + " UTC";
  }
}

/**
 * Check if a timezone string is valid
 * @param timezone The timezone to check (e.g., "America/New_York")
 * @returns Boolean indicating if the timezone is valid
 */
export function isValidTimezone(timezone: string): boolean {
  try {
    Intl.DateTimeFormat("en-US", { timeZone: timezone });
    return true;
  } catch (error) {
    return false;
  }
}

/**
 * Get the current timezone offset in minutes for a specific timezone
 * @param timezone The timezone to get the offset for
 * @returns Offset in minutes
 */
export function getTimezoneOffset(timezone: string): number {
  try {
    const date = new Date();
    const utcDate = new Date(date.toUTCString());
    const tzDate = new Date(
      date.toLocaleString("en-US", { timeZone: timezone })
    );
    return (tzDate.getTime() - utcDate.getTime()) / 60000;
  } catch (error) {
    console.error(`Error getting timezone offset for ${timezone}:`, error);
    return 0;
  }
}

/**
 * Get a list of common timezones
 * @returns Array of timezone strings
 */
export function getCommonTimezones(): string[] {
  return [
    "UTC",
    "America/New_York", // Eastern Time
    "America/Chicago", // Central Time
    "America/Denver", // Mountain Time
    "America/Los_Angeles", // Pacific Time
    "America/Anchorage", // Alaska Time
    "Pacific/Honolulu", // Hawaii Time
    "Europe/London", // GMT
    "Europe/Paris", // Central European Time
    "Europe/Helsinki", // Eastern European Time
    "Asia/Dubai", // Gulf Standard Time
    "Asia/Kolkata", // India Standard Time
    "Asia/Shanghai", // China Standard Time
    "Asia/Tokyo", // Japan Standard Time
    "Australia/Sydney", // Australian Eastern Time
    "Pacific/Auckland", // New Zealand Standard Time
  ];
}
