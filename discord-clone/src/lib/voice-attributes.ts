// LiveKit participant attribute keys, shared by the token/mute APIs and the voice UI.
export const SERVER_MUTED_ATTRIBUTE = 'serverMuted';
export const SERVER_DEAFENED_ATTRIBUTE = 'serverDeafened';
export const ROLE_ATTRIBUTE = 'role';
export const OWNER_ATTRIBUTE = 'owner';
/** Set on the music bot's participant: no role, can't be server-muted. */
export const BOT_ATTRIBUTE = 'bot';
/** The music bot's LiveKit identity (people's identity is their user id). */
export const BOT_IDENTITY = 'music-bot';
