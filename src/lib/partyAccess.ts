/** Party statuses that may still use party endpoints. Revoked/declined/left parties lose access. */
export function partyStatusAllowsAccess(status: string | null | undefined): boolean {
  return status === 'pending' || status === 'joined';
}
