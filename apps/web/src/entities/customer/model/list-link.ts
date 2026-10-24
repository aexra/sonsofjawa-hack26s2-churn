interface CustomerLinkState {
  listSearch: string;
}

export const customerLinkState = (listSearch: string): CustomerLinkState => ({ listSearch });

export const listPathFrom = (state: unknown): string => {
  const search =
    typeof state === 'object' && state !== null && 'listSearch' in state
      ? (state as CustomerLinkState).listSearch
      : '';
  return `/customers${search}`;
};
