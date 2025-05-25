export interface PlatformMediaConstraints {
  maxFileSizeMB?: number;
  allowedMediaTypes?: string[]; // e.g., ["image/jpeg", "image/png", "video/mp4"]
  image?: {
    maxDimensions?: { width: number; height: number };
    minDimensions?: { width: number; height: number };
    aspectRatios?: string[]; // e.g., ["1:1", "4:5", "1.91:1"]
    recommendedAspectRatios?: string[];
  };
  video?: {
    maxDurationSeconds?: number;
    minDurationSeconds?: number;
    maxDimensions?: { width: number; height: number };
    minDimensions?: { width: number; height: number };
    aspectRatios?: string[]; // e.g., ["1:1", "4:5", "16:9", "9:16"]
    recommendedAspectRatios?: string[];
    maxBitrateKbps?: number;
  };
}

export interface AllPlatformConstraints {
  [platformKey: string]: PlatformMediaConstraints;
}

export const platformConstraints: AllPlatformConstraints = {
  instagram: {
    maxFileSizeMB: 100, // General guidance, actual limits can vary by post type (feed, story, reel)
    allowedMediaTypes: [
      "image/jpeg",
      "image/png",
      "video/mp4",
      "image/gif",
      "image/webp",
      "video/quicktime",
      "video/webm",
      "image/HEIC",
    ],
    image: {
      minDimensions: { width: 320, height: 320 },
      maxDimensions: { width: 1080, height: 1350 },
      aspectRatios: ["1.91:1", "4:5", "1:1"],
      recommendedAspectRatios: ["1:1", "4:5"],
    },
    video: {
      minDurationSeconds: 3,
      maxDurationSeconds: 60, // For feed videos, Reels up to 90s, Stories up to 60s per segment
      aspectRatios: ["1.91:1", "4:5", "1:1", "9:16"],
      recommendedAspectRatios: ["4:5", "9:16"],
      maxBitrateKbps: 5000, // Recommended for 1080p
    },
  },
  tiktok: {
    maxFileSizeMB: 287, // For < 60s videos, larger for longer ones
    allowedMediaTypes: [
      "image/jpeg",
      "image/png",
      "video/mp4",
      "image/gif",
      "image/webp",
      "video/quicktime",
      "video/webm",
      "image/HEIC",
    ],
    video: {
      minDurationSeconds: 3,
      maxDurationSeconds: 600, // Up to 10 minutes, previously 3 minutes
      minDimensions: { width: 360, height: 360 }, // No strict min, but recommended for quality
      recommendedAspectRatios: ["9:16"],
      aspectRatios: ["9:16", "1:1"], // Primarily 9:16, allows 1:1
    },
  },
  twitter: {
    // Now X
    maxFileSizeMB: 512,
    allowedMediaTypes: [
      "image/jpeg",
      "image/png",
      "image/gif",
      "image/webp",
      "video/mp4",
      "video/quicktime",
      "video/webm",
      "image/HEIC",
    ],
    image: {
      maxDimensions: { width: 4096, height: 4096 }, // Max 5MB for images
      aspectRatios: ["16:9", "1:1", "3:4", "2:1"], // Wide range, but 16:9 or 1:1 common
      recommendedAspectRatios: ["16:9", "1:1"],
    },
    video: {
      minDurationSeconds: 0.5,
      maxDurationSeconds: 140,
      minDimensions: { width: 32, height: 32 },
      maxDimensions: { width: 1920, height: 1200 }, // or 1200x1900
      aspectRatios: ["1:2.39", "2.39:1"], // Between 1:2.39 and 2.39:1
      recommendedAspectRatios: ["16:9", "1:1"],
      maxBitrateKbps: 25000, // 25 Mbps
    },
  },
  facebook: {
    maxFileSizeMB: 4000, // 4GB for videos
    allowedMediaTypes: [
      "image/jpeg",
      "image/png",
      "image/gif",
      "image/webp",
      "video/mp4",
      "video/quicktime",
      "video/webm",
      "image/HEIC",
    ],
    image: {
      // FB is very flexible with image dimensions and aspect ratios
      recommendedAspectRatios: ["1.91:1", "1:1", "4:5", "9:16"],
    },
    video: {
      maxDurationSeconds: 240 * 60, // 240 minutes
      recommendedAspectRatios: ["16:9", "1:1", "4:5", "9:16", "2:3"],
      maxBitrateKbps: 8000, // For 1080p
    },
  },
  linkedin: {
    maxFileSizeMB: 5120, // 5GB for videos
    allowedMediaTypes: [
      "image/jpeg",
      "image/png",
      "image/gif",
      "image/webp",
      "video/mp4",
      "video/quicktime",
      "video/webm",
      "image/HEIC",
    ],
    image: {
      maxDimensions: { width: 7680, height: 4320 },
      recommendedAspectRatios: ["1.91:1", "1:1"], // e.g. blog post link images, company page images
    },
    video: {
      minDurationSeconds: 3,
      maxDurationSeconds: 10 * 60, // 10 minutes for native video
      maxDimensions: { width: 4096, height: 2304 },
      recommendedAspectRatios: ["16:9", "9:16", "1:1"],
    },
  },
  // Generic fallback or for platforms with no specific constraints known
  general: {
    maxFileSizeMB: 100,
    allowedMediaTypes: [
      "image/jpeg",
      "image/png",
      "video/mp4",
      "image/gif",
      "image/webp",
      "video/quicktime",
      "video/webm",
      "image/HEIC",
    ],
    image: {
      minDimensions: { width: 320, height: 320 },
      maxDimensions: { width: 1080, height: 1350 },
      aspectRatios: ["1.91:1", "4:5", "1:1"],
      recommendedAspectRatios: ["1:1", "4:5"],
    },
    video: {
      minDurationSeconds: 3,
      maxDurationSeconds: 60,
      aspectRatios: ["1.91:1", "4:5", "1:1", "9:16"],
      recommendedAspectRatios: ["4:5", "9:16"],
      maxBitrateKbps: 5000,
    },
  },
};

// Helper function to get constraints for a given platform, defaulting to general
export const getPlatformConstraints = (
  platform: string
): PlatformMediaConstraints => {
  return (
    platformConstraints[platform.toLowerCase()] || platformConstraints.general
  );
};
