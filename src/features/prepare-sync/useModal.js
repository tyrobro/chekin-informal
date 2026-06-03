import { useState } from 'react';

/**
 * Manages the active modal state for the prepare-sync flow.
 *
 * @returns {{
 *   activeModal: { type: 'prepare' | 'resync', eventId: string } | null,
 *   openPrepareModal: (eventId: string) => void,
 *   openResyncModal: (eventId: string) => void,
 *   closeModal: () => void,
 * }}
 */
export function useModal() {
  const [activeModal, setActiveModal] = useState(null);

  const openPrepareModal = (eventId) => {
    setActiveModal({ type: 'prepare', eventId });
  };

  const openResyncModal = (eventId) => {
    setActiveModal({ type: 'resync', eventId });
  };

  const closeModal = () => {
    setActiveModal(null);
  };

  return {
    activeModal,
    openPrepareModal,
    openResyncModal,
    closeModal,
  };
}
