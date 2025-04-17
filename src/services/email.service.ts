import * as SibApiV3Sdk from "@getbrevo/brevo";
import dotenv from "dotenv";

dotenv.config();

const apiInstance = new SibApiV3Sdk.TransactionalEmailsApi();

// Debug: Log API key (first 10 chars only for security)
const apiKey = process.env.BREVO_API_KEY ?? "";
console.log("Using Brevo API Key (first 10 chars):", apiKey.substring(0, 10));
console.log("Template ID:", process.env.BREVO_INVITATION_TEMPLATE_ID);

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
  console.log("Preparing to send invitation email to:", to);

  // Remove trailing slash from WEBAPP_URL if present
  const baseUrl =
    process.env.WEBAPP_URL?.replace(/\/$/, "") ?? "http://localhost:5173";
  const invitationLink = `${baseUrl}/accept-invitation?token=${invitationToken}`;

  console.log("Email parameters:", {
    firstName,
    lastName,
    organizationName,
    invitationLink,
  });

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
    console.log("Sending email with template ID:", sendSmtpEmail.templateId);
    const result = await apiInstance.sendTransacEmail(sendSmtpEmail);
    console.log("Email sent successfully. Message ID:", result.body.messageId);
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
  console.log("Preparing to send welcome email to:", to);

  // Remove trailing slash from WEBAPP_URL if present
  const baseUrl =
    process.env.WEBAPP_URL?.replace(/\/$/, "") ?? "http://localhost:5173";
  const loginLink = `${baseUrl}/login`;

  console.log("Welcome email parameters:", {
    firstName,
    lastName,
    userType,
    organizationName,
    loginLink,
  });

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
    console.log(
      "Sending welcome email with template ID:",
      sendSmtpEmail.templateId
    );
    const result = await apiInstance.sendTransacEmail(sendSmtpEmail);
    // console.log({ result });
    // console.log(
    //   "Welcome email sent successfully. Message ID:",
    //   result.body.messageId
    // );
    return result;
  } catch (error) {
    console.error("Error sending welcome email:", error);
    throw error;
  }
};
