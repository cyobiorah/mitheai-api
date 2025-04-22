import Joi from "joi";

export const teamValidationSchema = Joi.object({
  name: Joi.string().required(),
  organizationId: Joi.string().length(24).required(),
  memberIds: Joi.array().items(Joi.string().length(24)),
});

export const validateTeamCreate = (data: any) =>
  Joi.object({
    name: Joi.string().min(2).max(100).required(),
    description: Joi.string().max(500).optional(),
    organizationId: Joi.string().length(24).required(),
  }).validate(data);

export const validateTeamUpdate = (data: any) =>
  Joi.object({
    name: Joi.string().min(2).max(100).optional(),
    description: Joi.string().max(500).optional(),
    // settings, permissions, etc. can be added here
  }).validate(data);
