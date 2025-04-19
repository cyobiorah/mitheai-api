import Joi from "joi";

export const userValidationSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().min(8).required(),
  firstName: Joi.string().required(),
  lastName: Joi.string().required(),
  role: Joi.string()
    .valid("super_admin", "org_owner", "admin", "user")
    .required(),
  status: Joi.string().valid("active", "invited", "inactive").required(),
  userType: Joi.string().valid("individual", "organization").required(),
  teamIds: Joi.array().items(Joi.string().length(24)),
  organizationId: Joi.string().length(24),
});

export const validateUpdateProfile = (data: any) =>
  Joi.object({
    firstName: Joi.string().min(1).max(50).optional(),
    lastName: Joi.string().min(1).max(50).optional(),
    avatar: Joi.string().uri().optional(),
    bio: Joi.string().max(500).optional(),
  }).validate(data);

export const validateChangePassword = (data: any) =>
  Joi.object({
    currentPassword: Joi.string().required(),
    newPassword: Joi.string().min(8).required(),
  }).validate(data);
