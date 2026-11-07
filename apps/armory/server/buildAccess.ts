import {
  canReadSharedResource,
  type ReadAccessContext,
  type VisibilityRow,
} from './loadoutAccess.ts';

export type BuildVisibilityRow = VisibilityRow;

export function canReadBuild(row: BuildVisibilityRow, context: ReadAccessContext): boolean;
export function canReadBuild(
  row: BuildVisibilityRow,
  sessionUserId: string | null,
  isGameAdmin: boolean,
  shareToken?: string | null,
): boolean;
export function canReadBuild(
  row: BuildVisibilityRow,
  sessionUserIdOrContext: string | null | ReadAccessContext,
  isGameAdmin?: boolean,
  shareToken?: string | null,
): boolean {
  const context: ReadAccessContext =
    typeof sessionUserIdOrContext === 'object' && sessionUserIdOrContext !== null
      ? sessionUserIdOrContext
      : {
          sessionUserId: sessionUserIdOrContext,
          isGameAdmin: isGameAdmin ?? false,
          shareToken,
        };

  return canReadSharedResource(row, context);
}

/** An unlisted loadout's token also opens the owner's public and unlisted builds linked to it. */
export function loadoutGrantsBuild(
  loadout: VisibilityRow,
  build: BuildVisibilityRow,
  shareToken: string | null | undefined,
): boolean {
  if ((loadout.visibility ?? 'private') !== 'unlisted') return false;
  if (build.clerk_user_id !== loadout.clerk_user_id) return false;
  const buildVis = build.visibility ?? 'private';
  if (buildVis !== 'public' && buildVis !== 'unlisted') return false;
  return canReadSharedResource(loadout, { sessionUserId: null, isGameAdmin: false, shareToken });
}
