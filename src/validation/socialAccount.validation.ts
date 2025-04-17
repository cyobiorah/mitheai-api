import Joi from "joi";

export const socialAccountValidationSchema = Joi.object({
  userId: Joi.string().length(24).required(),
  organizationId: Joi.string().length(24),
  teamId: Joi.string().length(24),
  platform: Joi.string()
    .valid("twitter", "facebook", "linkedin", "instagram", "threads")
    .required(),
  platformAccountId: Joi.string().required(),
  accountType: Joi.string().valid("personal", "business").required(),
  accountName: Joi.string().required(),
  accountId: Joi.string().required(),
  accessToken: Joi.string().required(),
  refreshToken: Joi.string(),
  tokenExpiry: Joi.date().allow(null),
  lastRefreshed: Joi.date().required(),
  status: Joi.string()
    .valid("active", "expired", "revoked", "error")
    .required(),
  metadata: Joi.object(),
  permissions: Joi.object(),
  welcomeTweetSent: Joi.boolean(),
});

export const validateSocialAccountCreate = (data: any) =>
  Joi.object({
    platform: Joi.string()
      .valid("twitter", "facebook", "linkedin", "instagram", "threads")
      .required(),
    platformAccountId: Joi.string().required(),
    accountType: Joi.string().valid("personal", "business").required(),
    accountName: Joi.string().required(),
    accountId: Joi.string().required(),
    accessToken: Joi.string().required(),
    refreshToken: Joi.string().optional(),
    tokenExpiry: Joi.date().optional(),
    lastRefreshed: Joi.date().required(),
    status: Joi.string()
      .valid("active", "expired", "revoked", "error")
      .required(),
    organizationId: Joi.string().length(24).optional(),
    teamId: Joi.string().length(24).optional(),
    metadata: Joi.object().optional(),
    permissions: Joi.object().optional(),
    welcomeTweetSent: Joi.boolean().optional(),
  }).validate(data);

export const validateSocialAccountUpdate = (data: any) =>
  Joi.object({
    accessToken: Joi.string().optional(),
    refreshToken: Joi.string().optional(),
    tokenExpiry: Joi.date().optional(),
    lastRefreshed: Joi.date().optional(),
    status: Joi.string()
      .valid("active", "expired", "revoked", "error")
      .optional(),
    metadata: Joi.object().optional(),
    permissions: Joi.object().optional(),
    welcomeTweetSent: Joi.boolean().optional(),
  }).validate(data);
