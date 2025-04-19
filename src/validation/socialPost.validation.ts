import Joi from "joi";

export const socialPostValidationSchema = Joi.object({
  userId: Joi.string().length(24).required(),
  organizationId: Joi.string().length(24),
  teamId: Joi.string().length(24),
  content: Joi.string().required(),
  mediaUrls: Joi.array().items(Joi.string()),
  platforms: Joi.array().items(
    Joi.object({
      platform: Joi.string()
        .valid("twitter", "facebook", "linkedin", "instagram", "threads")
        .required(),
      accountId: Joi.string().required(),
      status: Joi.string().valid("pending", "published", "failed").required(),
      publishedAt: Joi.date(),
      errorMessage: Joi.string(),
    })
  ),
  tags: Joi.array().items(Joi.string()),
  scheduledFor: Joi.date(),
  status: Joi.string()
    .valid("draft", "scheduled", "published", "failed")
    .required(),
  errorMessage: Joi.string(),
});
