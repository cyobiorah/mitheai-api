import * as crypto from "crypto";
import redisService from "../../services/redis.service";

export class FacebookController {
//   static async directAuth(req: any, res: any) {
//     try {
//       const { user } = req;
//       if (!user) {
//         return res.status(401).json({ error: "Unauthorized" });
//       }

//       // Generate a unique state ID
//       const stateId = crypto.randomBytes(16).toString("hex");

//       // Create state data object
//       const stateData = {
//         uid: req.user.uid,
//         email: req.user.email,
//         organizationId: req.user.organizationId,
//         currentTeamId: req.user.currentTeamId,
//         timestamp: Date.now(),
//       };

//       // Store in Redis with 10 minute expiration
//       await redisService.set(`facebook:${stateId}`, stateData, 600);

//       // Return the full URL with state parameter
//       const baseUrl = process.env.API_URL;

//       // Construct the Facebook auth URL with state parameter
//       const authUrl = `${baseUrl}/api/social-accounts/facebook?state=${stateId}`;

//       console.log(
//         `Facebook direct-auth: Generated state ID ${stateId} for user ${req.user.uid}`
//       );
//       console.log(`Facebook direct-auth: Redirecting to ${authUrl}`);

//       res.send(authUrl);
//     } catch (error) {
//       console.error("Error in Facebook direct-auth:", error);
//       res.status(500).json({ error: "Internal server error" });
//     }
//   }
}
