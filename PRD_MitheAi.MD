# MitheAI Product Requirements Document (PRD)

---

## 1. Overview

MitheAI is a SaaS platform for AI-powered content creation, management, and social media publishing. It is designed for organizations, teams, and individuals, providing seamless scheduling, analytics, and robust social account management with strict uniqueness and flexible ownership models.

---

## 2. Goals & Objectives

- Enable organizations and individuals to create, schedule, and publish AI-generated and manual content.
- Integrate with major social platforms (Twitter, Facebook, LinkedIn, Instagram, Threads).
- Provide robust team and organization management with clear user roles.
- Enforce unique social account linking at the database level.
- Offer analytics and dashboard features.
- Support bulk actions, content scheduling, and platform-specific settings.

---

## 3. Core Features

### 3.1 Authentication & Authorization

- JWT-based authentication.
- Role-based access: `super_admin`, `org_owner`, `admin`, `user`.
- Registration, login, password reset.

### 3.2 Organization & Team Management

- Organization creation, invitation, onboarding.
- Teams under organizations.
- Default team assignment for new users.
- Member management (add/remove, roles).

### 3.3 User Management

- Profile management.
- User settings (theme, notifications, permissions).
- Every account (individual or org) is always a user with a unique `userId` (`ObjectId`).

### 3.4 Social Account Management

- Link/unlink social accounts (Twitter, Facebook, etc.).
- Unique constraint: a social account cannot be linked to multiple users/orgs/teams.
- Ownership model: user, team, organization (with explicit `ownershipLevel`).
- Permissions for actions (post, schedule, analyze).
- All social accounts reference a `userId` (`ObjectId`), even for org/team accounts.

### 3.5 Content Management

- Create, edit, delete content.
- AI-powered content suggestions and generation.
- Tagging, scheduling, and bulk actions.

### 3.6 Social Posting

- Schedule and publish content to connected social accounts.
- Track status and errors.
- Welcome post automation.

### 3.7 Analytics Dashboard

- Track performance of posts and accounts.
- Visualizations for engagement, reach, etc.

### 3.8 Platform Integrations

- OAuth for all supported platforms.
- Token refresh and expiration handling.

---

## 4. Technical Requirements

- **Backend:** Node.js, TypeScript, Express.js
- **Database:** MongoDB (ObjectId for all IDs and references)
- **Frontend:** React (TypeScript)
- **AI Integration:** OpenAI API
- **Deployment:** Docker, cloud-ready
- **Security:** Environment variables for secrets, HTTPS, input validation

---

## 5. Non-Functional Requirements

- **Scalability:** Support for thousands of orgs/users.
- **Reliability:** Graceful error handling, retries for failed posts.
- **Maintainability:** Feature-based code organization.
- **Performance:** Sub-second API response times.

---

## 6. MVP Scope

- Authentication
- Organization/team/user management
- Social account linking (with uniqueness constraint)
- Content creation and scheduling
- Basic analytics dashboard

---

## 7. Future Enhancements

- Advanced analytics
- Platform-specific settings
- Account transfer between users/orgs
- More AI features (image, video content)
- Mobile app

---


mitheai-api/
├── PRD_MitheAi.MD
├── package.json
├── tsconfig.json
├── .env.example
├── .gitignore
├── README.md
├── src/
│   ├── app.ts
│   ├── server.ts
│   ├── config/
│   │   └── db.ts
│   ├── models/
│   │   ├── user.model.ts
│   │   ├── organization.model.ts
│   │   ├── team.model.ts
│   │   ├── socialAccount.model.ts
│   │   ├── content.model.ts
│   │   ├── socialPost.model.ts
│   │   └── scheduledPost.model.ts
│   ├── routes/
│   │   └── index.ts
│   ├── controllers/
│   ├── services/
│   ├── middlewares/
│   ├── utils/
│   └── validation/
└── tests/