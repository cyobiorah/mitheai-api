import { Router } from "express";
// import { createInvitation } from '../controllers/invitations.controller';

const router = Router();

// Test route for email (remove in production)
router.post("/test-invitation-email", async (req, res) => {
  console.log("Test route hit");
  console.log("Request body:", req.body);

  try {
    const testData = {
      email: req.body.email || "test@example.com",
      firstName: req.body.firstName || "Test",
      lastName: req.body.lastName || "User",
      role: req.body.role || "user",
      organizationId: req.body.organizationId,
      teamIds: req.body.teamIds || [],
    };

    console.log("Test data:", testData);

    // Create a mock request object with user data
    const mockReq = {
      body: testData,
      user: {
        uid: "test-user-id",
        email: "test@example.com",
      },
    };

    console.log("Mock request:", mockReq);
    // await createInvitation(mockReq as any, res);
  } catch (error: any) {
    console.error("Test email error:", error);
    res.status(500).json({
      error: "Failed to send test email",
      details: error.message,
      stack: process.env.NODE_ENV === "development" ? error.stack : undefined,
    });
  }
});

export default router;
