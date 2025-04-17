import Joi from "joi";

export const scheduledPostValidationSchema = Joi.object({
  userId: Joi.string().length(24).required(),
  teamId: Joi.string().length(24),
  organizationId: Joi.string().length(24),
  content: Joi.string().required(),
  mediaUrls: Joi.array().items(Joi.string()),
  scheduledFor: Joi.date().required(),
  timezone: Joi.string().required(),
  status: Joi.string()
    .valid("scheduled", "processing", "completed", "failed", "cancelled")
    .required(),
  errorMessage: Joi.string(),
  platforms: Joi.array().items(
    Joi.object({
      platformId: Joi.string().required(),
      accountId: Joi.string().required(),
      status: Joi.string().valid("pending", "published", "failed").required(),
      publishedAt: Joi.date(),
      errorMessage: Joi.string(),
    })
  ),
  scheduledPostId: Joi.string().length(24),
  mediaType: Joi.string().required(),
});
