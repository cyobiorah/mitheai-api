import { ContentItem, User, SocialPlatform } from '../types';

type ContentState = 'draft' | 'ready' | 'pending' | 'posted' | 'failed' | 'analyzed' | 'archived';

interface StateTransitionResult {
  success: boolean;
  newState?: ContentState;
  error?: string;
}

export class ContentStateService {
  // Valid state transitions map
  private static validTransitions: Record<ContentState, ContentState[]> = {
    draft: ['ready', 'archived'],
    ready: ['pending', 'archived'],
    pending: ['posted', 'failed', 'archived'],
    posted: ['archived'],
    failed: ['ready', 'archived'],
    analyzed: ['archived'],
    archived: []
  };

  // Validate state transition
  static async validateStateTransition(
    currentState: ContentState,
    newState: ContentState,
    user: User,
    content: ContentItem
  ): Promise<StateTransitionResult> {
    // Check if transition is valid
    if (!this.validTransitions[currentState].includes(newState)) {
      return {
        success: false,
        error: `Invalid state transition from ${currentState} to ${newState}`,
      };
    }

    // Check user permissions
    if (!this.userCanTransition(user, content, newState)) {
      return {
        success: false,
        error: "User does not have permission for this transition",
      };
    }

    return {
      success: true,
      newState,
    };
  }

  // Check if user has permission
  private static userCanTransition(
    user: User,
    content: ContentItem,
    newState: ContentState
  ): boolean {
    // Individual account
    if (user.userType === "individual") {
      return true; // Individual users can manage their own content
    }

    // Organization account
    if (content.teamId && !user.teamIds?.includes(content.teamId)) {
      return false; // User must be in the team
    }

    // Add more org-specific checks here

    return true;
  }

  // Transition helpers
  static async transitionToReady(
    content: ContentItem
  ): Promise<StateTransitionResult> {
    // Validate content before marking as ready
    const validationResult = await this.validateContent(content);
    if (!validationResult.success) {
      return validationResult;
    }

    return {
      success: true,
      newState: "ready",
    };
  }

  private static async validateContent(
    content: ContentItem
  ): Promise<StateTransitionResult> {
    // Basic content validation
    if (!content.content?.trim()) {
      return {
        success: false,
        error: "Content cannot be empty",
      };
    }

    // Platform-specific validation
    if (
      content.metadata.socialPost?.platform === "twitter" &&
      content.content.length > 280
    ) {
      return {
        success: false,
        error: "Twitter content exceeds 280 characters",
      };
    }

    return {
      success: true,
    };
  }
}
