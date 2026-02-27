export type AuthStatus = 'loading' | 'unauthenticated' | 'forbidden' | 'ok';

export interface RemoteAuthUser {
  id: number;
  username: string;
  is_admin: boolean;
  display_name?: string;
  email?: string;
  avatar?: number | string;
}

export interface RemoteAuthState {
  authenticated?: boolean;
  has_game_access?: boolean;
  user?: RemoteAuthUser;
}

export interface AppAccountProfile {
  userId: number;
  username: string;
  isAdmin: boolean;
  displayName: string;
  email: string;
  avatarId: number;
}

export interface AppAccountState {
  isAuthenticated: boolean;
  profile: AppAccountProfile | null;
}
