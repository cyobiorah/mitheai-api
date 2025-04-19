export const validationError = (error: any) => {
  const errors = Object.entries(error.errors).reduce(
    (acc, [key, value]: [string, any]) => {
      acc[key] = value.message;
      return acc;
    },
    {} as Record<string, string>
  );
  return errors;
};
