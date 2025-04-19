import Joi from "joi";

export const organizationValidationSchema = Joi.object({
  name: Joi.string().required(),
  ownerId: Joi.string().length(24).required(),
  defaultTeamId: Joi.string().length(24),
  memberIds: Joi.array().items(Joi.string().length(24)),
});

export const validateOrganizationCreate = (data: any) =>
  Joi.object({
    name: Joi.string().min(2).max(100).required(),
    description: Joi.string().max(500).optional(),
    type: Joi.string().valid("enterprise", "business", "startup").required(),
    settings: Joi.object().optional(),
    features: Joi.array().items(Joi.string()).optional(),
    permissions: Joi.array().items(Joi.string()).optional(),
    // ownerId is set from session, not from client
  }).validate(data);

export const validateOrganizationUpdate = (data: any) =>
  Joi.object({
    name: Joi.string().min(2).max(100).optional(),
    description: Joi.string().max(500).optional(),
    type: Joi.string().valid("enterprise", "business", "startup").optional(),
    settings: Joi.object().optional(),
    features: Joi.array().items(Joi.string()).optional(),
    permissions: Joi.array().items(Joi.string()).optional(),
  }).validate(data);
