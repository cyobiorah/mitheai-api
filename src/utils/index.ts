export const allowedOrigins = [
  "http://localhost:5173",
  "http://localhost:3001",
  "https://mitheai-app-git-kitchen-cyobiorahs-projects.vercel.app",
  "https://mitheai-api-git-kitchen-cyobiorahs-projects.vercel.app",
  "https://mitheai-app-git-dev-cyobiorahs-projects.vercel.app",
  "https://mitheai-api-git-dev-cyobiorahs-projects.vercel.app",
  "https://mitheai-app-git-staging-cyobiorahs-projects.vercel.app",
  "https://mitheai-api-git-staging-cyobiorahs-projects.vercel.app",
  // Add specific Vercel preview domains instead of wildcards
  "https://mitheai-app.vercel.app",
  "https://mitheai-api.vercel.app",
  // Add production domains if different
  "https://app.mitheai.com",
  "https://api.mitheai.com",
  "https://www.skedlii.xyz",
  "https://skedlii.xyz",
  "https://staging.skedlii.xyz",
];

export function sanitizeAccount(account: any) {
  const { accessToken, idToken, refreshToken, ...rest } = account;

  const metadata = { ...rest.metadata };
  if (metadata?.profile) {
    const { longLivedToken, ...cleanProfile } = metadata.profile;
    metadata.profile = cleanProfile;
  }

  return {
    ...rest,
    metadata,
  };
}
