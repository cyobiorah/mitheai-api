import * as SibApiV3Sdk from "@getbrevo/brevo";
import dotenv from "dotenv";

dotenv.config();

const apiInstance = new SibApiV3Sdk.TransactionalEmailsApi();

// Debug: Log API key (first 10 chars only for security)
const apiKey = process.env.BREVO_API_KEY ?? "";

apiInstance.setApiKey(SibApiV3Sdk.TransactionalEmailsApiApiKeys.apiKey, apiKey);

// Default sender configuration
const DEFAULT_SENDER = {
  email: process.env.EMAIL_SENDER_ADDRESS ?? "cyobiorah@gmail.com",
  name: process.env.EMAIL_SENDER_NAME ?? "MitheAI",
};

interface SendInvitationEmailParams {
  to: string;
  firstName: string;
  lastName: string;
  invitationToken: string;
  organizationName: string;
}

export const sendInvitationEmail = async ({
  to,
  firstName,
  lastName,
  invitationToken,
  organizationName,
}: SendInvitationEmailParams) => {
  // Remove trailing slash from WEBAPP_URL if present
  const baseUrl =
    process.env.WEBAPP_URL?.replace(/\/$/, "") ?? "http://localhost:5173";
  const invitationLink = `${baseUrl}/accept-invitation?token=${invitationToken}`;

  const sendSmtpEmail = new SibApiV3Sdk.SendSmtpEmail();

  sendSmtpEmail.to = [{ email: to, name: `${firstName} ${lastName}` }];
  sendSmtpEmail.templateId = Number(process.env.BREVO_INVITATION_TEMPLATE_ID);
  sendSmtpEmail.sender = DEFAULT_SENDER;
  sendSmtpEmail.params = {
    firstName,
    lastName,
    organizationName,
    invitationLink,
  };

  try {
    const result = await apiInstance.sendTransacEmail(sendSmtpEmail);
    return result;
  } catch (error) {
    console.error("Error sending email:", error);
    throw error;
  }
};

interface SendWelcomeEmailParams {
  to: string;
  firstName: string;
  lastName: string;
  userType: "individual" | "organization";
  organizationName?: string;
}

export const sendWelcomeEmail = async ({
  to,
  firstName,
  lastName,
  userType,
  organizationName,
}: SendWelcomeEmailParams) => {
  // Remove trailing slash from WEBAPP_URL if present
  const baseUrl =
    process.env.WEBAPP_URL?.replace(/\/$/, "") ?? "http://localhost:5173";
  const loginLink = `${baseUrl}/login`;

  const sendSmtpEmail = new SibApiV3Sdk.SendSmtpEmail();

  sendSmtpEmail.to = [{ email: to, name: `${firstName} ${lastName}` }];
  sendSmtpEmail.templateId = Number(process.env.BREVO_WELCOME_TEMPLATE_ID);
  sendSmtpEmail.sender = DEFAULT_SENDER;
  sendSmtpEmail.params = {
    firstName,
    lastName,
    userType,
    organizationName: organizationName ?? "",
    loginLink,
    dashboardLink: `${baseUrl}/`,
  };

  try {
    const result = await apiInstance.sendTransacEmail(sendSmtpEmail);
    return result;
  } catch (error) {
    console.error("Error sending welcome email:", error);
    throw error;
  }
};
