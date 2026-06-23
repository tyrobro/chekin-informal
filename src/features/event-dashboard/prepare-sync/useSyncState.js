import { useReducer } from 'react';

export const initialSyncState = {
  phase: 'idle',
  synced: 0,
  total: 0,
  policy: null,
  errorSynced: null,
};

export function syncReducer(state, action) {
  const prev = state[action.eventId] ?? initialSyncState;

  switch (action.type) {
    case 'SYNC_START':
      return {
        ...state,
        [action.eventId]: {
          phase: 'syncing',
          synced: 0,
          total: action.total,
          policy: action.policy,
          errorSynced: null,
        },
      };
    case 'SYNC_PROGRESS':
      return {
        ...state,
        [action.eventId]: { ...prev, phase: 'syncing', synced: action.synced },
      };
    case 'SYNC_SUCCESS':
      return {
        ...state,
        [action.eventId]: { ...prev, phase: 'success', synced: action.synced },
      };
    case 'SYNC_ERROR':
      return {
        ...state,
        [action.eventId]: {
          ...prev,
          phase: 'error',
          errorSynced: action.synced,
        },
      };
    case 'SYNC_RETRY':
      return {
        ...state,
        [action.eventId]: { ...prev, phase: 'syncing', synced: prev.errorSynced },
      };
    default:
      return state;
  }
}

export function useSyncState() {
  const [phases, dispatch] = useReducer(syncReducer, {});

  const getSyncState = (eventId) => phases[eventId] ?? initialSyncState;

  const startSync = (eventId, policy, total) =>
    dispatch({ type: 'SYNC_START', eventId, policy, total });

  const handleProgress = (eventId, payload) =>
    dispatch({ type: 'SYNC_PROGRESS', eventId, synced: payload.synced });

  const handleSuccess = (eventId, payload) =>
    dispatch({ type: 'SYNC_SUCCESS', eventId, synced: payload.synced });

  const handleError = (eventId, payload) =>
    dispatch({ type: 'SYNC_ERROR', eventId, synced: payload.synced });

  const retrySync = (eventId) =>
    dispatch({ type: 'SYNC_RETRY', eventId });

  return {
    getSyncState,
    startSync,
    handleProgress,
    handleSuccess,
    handleError,
    retrySync,
  };
}
