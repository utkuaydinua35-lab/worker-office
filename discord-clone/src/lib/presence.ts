// Pure presence rules, shared by server and client.
import type { UserStatusValue } from '@/lib/validators';

/**
 * What others see. A user with no open socket is offline whatever they chose;
 * one who chose OFFLINE ("invisible") stays offline while connected.
 */
export const effectiveStatus = (chosen: UserStatusValue, online: boolean): UserStatusValue =>
  online ? chosen : 'OFFLINE';
