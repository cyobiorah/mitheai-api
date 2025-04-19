import Joi from "joi";

export const contentValidationSchema = Joi.object({
  userId: Joi.string().length(24).required(),
  organizationId: Joi.string().length(24).required(),
  teamId: Joi.string().length(24),
  title: Joi.string().required(),
  body: Joi.string().required(),
  tags: Joi.array().items(Joi.string()),
  status: Joi.string()
    .valid("draft", "scheduled", "published", "archived")
    .required(),
  scheduledFor: Joi.date(),
  publishedAt: Joi.date(),
});
