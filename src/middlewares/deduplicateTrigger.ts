export const shouldSkipTrigger = (
  source: "qstash" | "cron",
  interval: number
): boolean => {
  const now = new Date();
  const minutes = now.getMinutes();

  if (source === "qstash" && minutes % interval !== 0) {
    return true;
  }

  if (source === "cron" && minutes % interval !== 0) {
    return true;
  }

  return false;
};
