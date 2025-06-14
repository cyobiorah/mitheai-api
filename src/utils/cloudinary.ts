// utils/cloudinary.ts

import cloudinary from "cloudinary";
import streamifier from "streamifier";
import { platformConstraints } from "../config/platformConstraints";
import axios from "axios";

// Run once globally
cloudinary.v2.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME!,
  api_key: process.env.CLOUDINARY_API_KEY!,
  api_secret: process.env.CLOUDINARY_API_SECRET!,
});

type CloudinaryUploadOptions = {
  folder: string;
  publicId: string;
  transformations?: {
    image?: {
      width?: number;
      height?: number;
      crop?: "fill" | "fit" | "limit" | "scale";
    };
    video?: {
      width?: number;
      height?: number;
      quality?: "auto" | "good" | "eco";
    };
  };
};

export function uploadToCloudinaryBuffer(
  file: Express.Multer.File,
  { folder, publicId, transformations }: CloudinaryUploadOptions
): Promise<{
  secure_url: string;
  public_id: string;
  resource_type: string;
}> {
  return new Promise((resolve, reject) => {
    const isImage = file.mimetype.startsWith("image/");
    const isVideo = file.mimetype.startsWith("video/");

    const transformation = isImage
      ? transformations?.image ?? {}
      : isVideo
      ? {
          ...transformations?.video,
          flags: "progressive", // improves compatibility
        }
      : {};

    const uploadStream = cloudinary.v2.uploader.upload_stream(
      {
        folder,
        public_id: publicId,
        resource_type: "auto",
        transformation,
      },
      (error, result) => {
        if (error) return reject(error as Error);
        resolve({
          secure_url: result?.secure_url!,
          public_id: result?.public_id!,
          resource_type: result?.resource_type!,
        });
      }
    );

    streamifier.createReadStream(file.buffer).pipe(uploadStream);
  });
}

// export async function uploadUrlToCloudinary(url: string) {
//   const response = await axios.get(url, { responseType: "arraybuffer" });
//   const buffer = Buffer.from(response.data, "binary");

//   const result = await cloudinary.v2.uploader.upload_stream({
//     resource_type: "auto",
//     folder: "threads-media",
//   });

//   console.log({ result });
//   return result.secure_url;
// }

export async function uploadUrlToCloudinary(url: string): Promise<string> {
  const response = await axios.get(url, { responseType: "arraybuffer" });
  const buffer = Buffer.from(response.data, "binary");

  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.v2.uploader.upload_stream(
      {
        resource_type: "auto",
        folder: "threads-media",
      },
      (error, result) => {
        if (error) {
          return reject(error as Error);
        }
        if (!result?.secure_url) {
          return reject(new Error("No secure_url returned from Cloudinary"));
        }
        resolve(result.secure_url);
      }
    );

    uploadStream.end(buffer); // Pipe buffer into the stream
  });
}

export async function fetchCloudinaryFileBuffer(
  publicId: string,
  fileType?: "image" | "video"
): Promise<{
  buffer: Buffer;
  mimetype: string;
}> {
  const url = `https://res.cloudinary.com/${
    process.env.CLOUDINARY_CLOUD_NAME
  }/${fileType ?? "image"}/upload/${publicId}`;

  const response = await axios.get(url, {
    responseType: "arraybuffer",
  });

  const contentType = response.headers["content-type"];

  return {
    buffer: Buffer.from(response.data),
    mimetype: contentType,
  };
}

/**
 * Parses an aspect ratio string (e.g., "16:9", "1.91:1", "4:5") into a numerical value.
 * @param {string} arString - The aspect ratio string.
 * @returns {number | null} The numerical aspect ratio, or null if parsing fails.
 */
export function parseAspectRatio(arString: string) {
  if (!arString) return null;
  if (arString.includes(":")) {
    const parts = arString.split(":");
    if (parts.length === 2) {
      const num1 = parseFloat(parts[0]);
      const num2 = parseFloat(parts[1]);
      if (!isNaN(num1) && !isNaN(num2) && num2 !== 0) {
        return num1 / num2;
      }
    }
  }
  const floatVal = parseFloat(arString);
  if (!isNaN(floatVal)) {
    return floatVal;
  }
  return null;
}

/**
 * Finds the minimum and maximum numerical aspect ratios from an array of aspect ratio strings.
 * @param {string[]} arStrings - Array of aspect ratio strings.
 * @returns {{ min: number | null, max: number | null }}
 */
function getMinMaxAR(arStrings: string[]) {
  if (!arStrings || arStrings.length === 0) return { min: null, max: null };
  const numericalARs = arStrings
    .map(parseAspectRatio)
    .filter((ar) => ar !== null);
  if (numericalARs.length === 0) return { min: null, max: null };
  return {
    min: Math.min(...numericalARs),
    max: Math.max(...numericalARs),
  };
}

/**
 * Selects a target aspect ratio string for cropping, preferring recommended ones.
 * @param {number} originalAR - The original aspect ratio of the image.
 * @param {number} minAR - The minimum allowed numerical aspect ratio.
 * @param {number} maxAR - The maximum allowed numerical aspect ratio.
 * @param {string[]} allowedARStrings - Array of allowed aspect ratio strings.
 * @param {string[]} recommendedARStrings - (Optional) Array of recommended aspect ratio strings.
 * @returns {string} The target aspect ratio string for cropping.
 */
function getTargetCropAR(
  originalAR: number,
  minAR: number,
  maxAR: number,
  allowedARStrings: string[],
  recommendedARStrings?: string[]
): string {
  // Default to the extreme allowed if no better match from recommended
  let targetARString = originalAR < minAR ? String(minAR) : String(maxAR);

  // Try to find a recommended AR that is closest or appropriate
  if (recommendedARStrings && recommendedARStrings.length > 0) {
    const recommendedNumericalARs = recommendedARStrings
      .map((s) => ({ str: s, val: parseAspectRatio(s) }))
      .filter((ar) => ar.val !== null);
    if (originalAR < minAR) {
      // Too tall, prefer portrait recommended ARs
      const portraitRecommended = recommendedNumericalARs.filter(
        (ar: any) => ar.val <= 1.0
      );
      if (portraitRecommended.length > 0) {
        // Find the recommended portrait AR closest to minAR (e.g. 4:5)
        portraitRecommended.sort(
          (a: any, b: any) => Math.abs(a.val - minAR) - Math.abs(b.val - minAR)
        );
        targetARString = portraitRecommended[0].str;
      }
    } else {
      // Too wide, prefer landscape recommended ARs
      const landscapeRecommended = recommendedNumericalARs.filter(
        (ar: any) => ar.val >= 1.0
      );
      if (landscapeRecommended.length > 0) {
        // Find the recommended landscape AR closest to maxAR (e.g. 1.91:1 or 16:9)
        landscapeRecommended.sort(
          (a: any, b: any) => Math.abs(a.val - maxAR) - Math.abs(b.val - maxAR)
        );
        targetARString = landscapeRecommended[0].str;
      }
    }
  } else {
    // Fallback if no recommended, find the closest allowed AR string
    const allowedNumericalARs = allowedARStrings
      .map((s) => ({ str: s, val: parseAspectRatio(s) }))
      .filter((ar) => ar.val !== null);
    if (originalAR < minAR) {
      const closest = allowedNumericalARs
        .filter((ar: any) => ar.val >= minAR)
        .sort((a: any, b: any) => a.val - b.val)[0];
      if (closest) targetARString = closest.str;
    } else {
      const closest = allowedNumericalARs
        .filter((ar: any) => ar.val <= maxAR)
        .sort((a: any, b: any) => b.val - a.val)[0];
      if (closest) targetARString = closest.str;
    }
  }
  return targetARString;
}

// export function getCloudinaryTransformations(
//   fileMimeType: string,
//   metadata?: { width?: number; height?: number },
//   platform: string = "general"
// ): {
//   transformation: Record<string, any> | undefined;
// } {
//   const platformKey = platform.toLowerCase();
//   const platformConfig =
//     platformConstraints[platformKey] || platformConstraints.general;

//   if (!platformConfig) {
//     // Should not happen if platformConstraints.general exists, but as a safeguard.
//     return { transformation: undefined };
//   }

//   const isImage = fileMimeType.startsWith("image/");
//   const isVideo = fileMimeType.startsWith("video/");

//   if (isImage && platformConfig.image) {
//     const imageConstraints = platformConfig.image;
//     const imageWidth = metadata?.width;
//     const imageHeight = metadata?.height;

//     if (!imageWidth || !imageHeight) {
//       return { transformation: undefined }; // Cannot process without dimensions
//     }

//     const originalAR = imageWidth / imageHeight;
//     const maxWidth = imageConstraints.maxDimensions?.width;
//     const maxHeight = imageConstraints.maxDimensions?.height;

//     // Determine min/max accepted aspect ratios for the platform
//     const { min: minAcceptedAR, max: maxAcceptedAR } = getMinMaxAR(
//       imageConstraints.aspectRatios || []
//     );

//     let isAROutOfRange = false;
//     if (minAcceptedAR !== null && maxAcceptedAR !== null) {
//       isAROutOfRange = originalAR < minAcceptedAR || originalAR > maxAcceptedAR;
//     }

//     const isTooLargeInDimensions =
//       (maxWidth && imageWidth > maxWidth) ||
//       (maxHeight && imageHeight > maxHeight);

//     // If aspect ratio is acceptable (or not defined for platform) AND dimensions are within limits, no transformation needed.
//     if (!isAROutOfRange && !isTooLargeInDimensions) {
//       return { transformation: undefined };
//     }

//     let transformParams: Record<string, any> = { fetch_format: "auto" };

//     if (isAROutOfRange && minAcceptedAR !== null && maxAcceptedAR !== null) {
//       // Aspect ratio is out of range, needs cropping to a supported AR.
//       transformParams.aspect_ratio = getTargetCropAR(
//         originalAR,
//         minAcceptedAR,
//         maxAcceptedAR,
//         imageConstraints.aspectRatios || [],
//         imageConstraints.recommendedAspectRatios || []
//       );
//       transformParams.crop = "fill";
//       // When cropping to a new AR, usually one dimension is primary.
//       // Let's use maxWidth if available, Cloudinary will calculate height based on AR.
//       // If only maxHeight is available, that could be an alternative strategy.
//       if (maxWidth) {
//         transformParams.width = maxWidth;
//       } else if (maxHeight) {
//         // This case is less common for AR enforcement but possible.
//         // If we only have maxHeight, and we set AR, width will be derived.
//         // However, we also need to ensure the derived width doesn't exceed a potential maxWidth.
//         // For simplicity now, we prioritize width for AR cropping.
//         // A more complex logic might be needed if only height is constrained with AR.
//         transformParams.height = maxHeight; // Or adjust based on platform preference
//       }
//       transformParams.gravity = "auto";
//     } else if (isTooLargeInDimensions) {
//       // Aspect ratio is acceptable (or no AR constraints), but the image is too large.
//       // Scale it down, preserving its aspect ratio.
//       transformParams.crop = "limit";
//       if (maxWidth) transformParams.width = maxWidth;
//       if (maxHeight) transformParams.height = maxHeight;
//     } else {
//       // This case should ideally be caught by the first check (no transformation)
//       // but if somehow reached, means no transformation is determined to be needed.
//       return { transformation: undefined };
//     }

//     // If after AR crop, the image is still too large for the *other* dimension constraint not directly set by AR crop
//     // (e.g. cropped to AR using width, but resulting height > maxHeight), add a subsequent limit.
//     // Cloudinary handles chained transformations. This can be done by adding another transformation component if needed,
//     // or ensuring the initial crop/resize considers both. `crop: "fill"` with `width` and `aspect_ratio` should produce
//     // an image of that width and AR. We then need to ensure this fits maxHeight.
//     // A simpler Cloudinary approach for this is to set width, height, AR, and crop mode like `fill` or `thumb`.
//     // Let's refine the AR cropping part to ensure it fits within BOTH maxWidth and maxHeight after AR adjustment.
//     if (transformParams.crop === "fill" && transformParams.aspect_ratio) {
//       // If we set width and AR, height is determined. Check if this height > maxHeight.
//       // If we set height and AR, width is determined. Check if this width > maxWidth.
//       // Cloudinary's `c_fill,w_W,h_H,ar_AR` will fill WxH using AR, potentially letterboxing/pillarboxing if W/H doesn't match AR.
//       // To strictly crop to AR and then fit:
//       // 1. Crop to AR: `c_fill,ar_TARGET_AR,g_auto` (this might result in a large image)
//       // 2. Then scale: `c_limit,w_MAX_W,h_MAX_H`
//       // This would require chained transformations. The current SDK structure might not directly support complex chains in one object.
//       // For a single transformation object, if we crop to an aspect ratio, we also need to provide dimensions that respect that aspect ratio AND the max dimensions.

//       // Let's simplify: if cropping to an AR, also provide target dimensions that fit.
//       if (maxWidth && maxHeight) {
//         const targetARNumeric = parseAspectRatio(transformParams.aspect_ratio);
//         if (targetARNumeric) {
//           // Calculate dimensions for targetAR that fit within maxWidth, maxHeight
//           let targetWidth = maxWidth;
//           let targetHeight = Math.round(maxWidth / targetARNumeric);

//           if (targetHeight > maxHeight) {
//             targetHeight = maxHeight;
//             targetWidth = Math.round(maxHeight * targetARNumeric);
//             // Re-check if this new targetWidth exceeds maxWidth (can happen with extreme ARs)
//             if (targetWidth > maxWidth) targetWidth = maxWidth;
//           }
//           transformParams.width = targetWidth;
//           transformParams.height = targetHeight;
//         }
//       } else if (maxWidth) {
//         transformParams.width = maxWidth; // Height will be auto-adjusted by Cloudinary based on AR
//       } else if (maxHeight) {
//         transformParams.height = maxHeight; // Width will be auto-adjusted
//       }
//     }

//     // If no transformParams were set (e.g. only metadata missing), return undefined.
//     if (
//       Object.keys(transformParams).length === 1 &&
//       transformParams.fetch_format === "auto"
//     ) {
//       return { transformation: undefined };
//     }

//     return { transformation: transformParams };
//   }

//   if (isVideo && platformConfig.video) {
//     const videoConstraints = platformConfig.video;
//     const videoWidth = metadata?.width;
//     const videoHeight = metadata?.height;

//     // Similar logic can be applied for video aspect ratios and dimensions if needed.
//     // For now, using the simpler dimension limiting logic from before.
//     const maxWidth = videoConstraints.maxDimensions?.width;
//     const maxHeight = videoConstraints.maxDimensions?.height;

//     if (
//       (maxWidth && videoWidth && videoWidth > maxWidth) ||
//       (maxHeight && videoHeight && videoHeight > maxHeight)
//     ) {
//       let transformParams: Record<string, any> = {
//         crop: "limit",
//         fetch_format: "auto", // Or specific video format like "mp4"
//         flags: "progressive", // For video
//         dpr: "auto",
//       };
//       if (maxWidth) transformParams.width = maxWidth;
//       if (maxHeight) transformParams.height = maxHeight;
//       return { transformation: transformParams };
//     }
//     // Potentially add video-specific aspect ratio handling here too, similar to images.
//   }

//   return { transformation: undefined };
// }

export function getCloudinaryTransformations(
  fileMimeType: string,
  metadata?: { width?: number; height?: number },
  platform: string = "general"
): {
  transformation: Record<string, any> | undefined;
} {
  const platformKey = platform.toLowerCase();
  const platformConfig =
    platformConstraints[platformKey] || platformConstraints.general;

  if (!platformConfig) {
    return { transformation: undefined };
  }

  const isImage = fileMimeType.startsWith("image/");
  const isVideo = fileMimeType.startsWith("video/");

  if (isImage && platformConfig.image) {
    const imageConstraints = platformConfig.image;
    const imageWidth = metadata?.width;
    const imageHeight = metadata?.height;

    if (!imageWidth || !imageHeight) {
      return { transformation: undefined };
    }

    const originalAR = imageWidth / imageHeight;
    const maxWidth = imageConstraints.maxDimensions?.width;
    const maxHeight = imageConstraints.maxDimensions?.height;

    const { min: minAcceptedAR, max: maxAcceptedAR } = getMinMaxAR(
      imageConstraints.aspectRatios || []
    );

    const isAROutOfRange =
      minAcceptedAR !== null &&
      maxAcceptedAR !== null &&
      (originalAR < minAcceptedAR || originalAR > maxAcceptedAR);

    const isTooLarge =
      (maxWidth && imageWidth > maxWidth) ||
      (maxHeight && imageHeight > maxHeight);

    if (!isAROutOfRange && !isTooLarge) {
      return { transformation: undefined };
    }

    const transformParams: Record<string, any> = {
      quality: 100,
    };

    if (isAROutOfRange && minAcceptedAR !== null && maxAcceptedAR !== null) {
      transformParams.aspect_ratio = getTargetCropAR(
        originalAR,
        minAcceptedAR,
        maxAcceptedAR,
        imageConstraints.aspectRatios || [],
        imageConstraints.recommendedAspectRatios || []
      );
      transformParams.crop = "fill";
      transformParams.gravity = "auto";
    } else if (isTooLarge) {
      transformParams.crop = "limit";
    }

    if (maxWidth) transformParams.width = maxWidth;
    if (maxHeight) transformParams.height = maxHeight;

    return { transformation: transformParams };
  }

  if (isVideo && platformConfig.video) {
    const videoConstraints = platformConfig.video;
    const videoWidth = metadata?.width;
    const videoHeight = metadata?.height;

    const maxWidth = videoConstraints.maxDimensions?.width;
    const maxHeight = videoConstraints.maxDimensions?.height;

    const isTooLarge =
      (maxWidth && videoWidth && videoWidth > maxWidth) ||
      (maxHeight && videoHeight && videoHeight > maxHeight);

    if (!isTooLarge) {
      return { transformation: undefined };
    }

    const transformParams: Record<string, any> = {
      quality: 100,
      crop: "limit",
    };

    if (maxWidth) transformParams.width = maxWidth;
    if (maxHeight) transformParams.height = maxHeight;

    return { transformation: transformParams };
  }

  return { transformation: undefined };
}

export function getMediaTypeFromUrl(url: string): string | null {
  const extensionToMime: Record<string, string> = {
    jpg: "IMAGE",
    jpeg: "IMAGE",
    png: "IMAGE",
    gif: "IMAGE",
    webp: "IMAGE",
    svg: "IMAGE",
    mp4: "VIDEO",
    mov: "VIDEO",
    avi: "VIDEO",
    webm: "VIDEO",
    mp3: "AUDIO",
    wav: "AUDIO",
    ogg: "AUDIO",
    pdf: "APPLICATION",
  };

  try {
    const pathname = new URL(url).pathname;
    const extensionMatch = pathname.match(/\.([a-zA-Z0-9]+)$/);
    const extension = extensionMatch?.[1]?.toLowerCase();

    if (extension && extensionToMime[extension]) {
      return extensionToMime[extension];
    }

    return null;
  } catch {
    return null;
  }
}
