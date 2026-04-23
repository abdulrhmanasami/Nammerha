/// GraphQL Subscription Queries — Real-time Event Streams
///
/// These subscriptions use the `graphql-ws` protocol over WebSocket.
/// The backend dispatches events via PostgreSQL LISTEN/NOTIFY → EventEmitter.
///
/// Available channels:
///   1. `notificationReceived` — User-scoped notification stream
///   2. `projectUpdated` — Project-scoped update stream (per project ID)
class SubscriptionQueries {
  /// Real-time notification stream.
  ///
  /// Filters server-side: only delivers notifications for the authenticated
  /// user (matched by `context.user.user_id`).
  ///
  /// Returns: `Notification { notificationId, type, title, body, data, ... }`
  static const String notificationReceived = r'''
    subscription OnNotificationReceived {
      notificationReceived {
        notificationId
        userId
        type
        title
        body
        data
        channel
        isRead
        createdAt
      }
    }
  ''';

  /// Real-time project update stream.
  ///
  /// Filters server-side: only delivers updates for the specified project ID.
  /// Use this on the project detail screen to get live status changes,
  /// funding updates, and spatial proof submissions.
  ///
  /// Returns: `Project { projectId, title, status, fundedPercentage, ... }`
  static const String projectUpdated = r'''
    subscription OnProjectUpdated($projectId: ID!) {
      projectUpdated(projectId: $projectId) {
        projectId
        title
        status
        totalEstimatedCost
        totalFundedAmount
        fundedPercentage
        updatedAt
      }
    }
  ''';
}
