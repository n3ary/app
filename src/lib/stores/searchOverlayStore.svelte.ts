/*
 * searchOverlayStore — open/close singleton for the station search
 * overlay rendered inside Header. Lets any view trigger the overlay
 * (e.g. the Stations empty state's "Search stations" button) without
 * threading callbacks through AppLayout + Header.
 */

class SearchOverlayStore {
  isOpen = $state(false);

  open(): void {
    this.isOpen = true;
  }

  close(): void {
    this.isOpen = false;
  }
}

export const searchOverlayStore = new SearchOverlayStore();
