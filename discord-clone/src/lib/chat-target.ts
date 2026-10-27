// Where a chat lives: a server text channel or a direct-message conversation.
// Shared by the API routes, the socket layer and the chat UI.

export type ChatKind = 'channel' | 'conversation';

export interface ChatTarget {
  kind: ChatKind;
  id: string;
}

export const isChatKind = (value: unknown): value is ChatKind =>
  value === 'channel' || value === 'conversation';

/** List (GET) and create (POST) endpoint for a chat's messages. */
export const messagesUrl = ({ kind, id }: ChatTarget) =>
  kind === 'channel' ? `/api/channels/${id}/messages` : `/api/conversations/${id}/messages`;

/** Edit (PATCH) and delete (DELETE) endpoint for one message. */
export const messageUrl = (kind: ChatKind, messageId: string) =>
  kind === 'channel' ? `/api/messages/${messageId}` : `/api/direct-messages/${messageId}`;
