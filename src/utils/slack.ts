import axios from "axios";

const SLACK_WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL;

export async function logToSlack(message: string) {
  if (!SLACK_WEBHOOK_URL) {
    console.warn("SLACK_WEBHOOK_URL not configured.");
    return;
  }

  try {
    await axios.post(SLACK_WEBHOOK_URL, {
      text: message,
    });
  } catch (err) {
    console.error("Error sending message to Slack:", err);
  }
}