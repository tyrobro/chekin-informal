/**
 * supabaseRealtime.js — lightweight Supabase Realtime WebSocket client.
 *
 * Implements the Supabase Realtime v2 protocol (Phoenix channels over WSS)
 * without the @supabase/supabase-js SDK, consistent with the project's
 * plain-fetch pattern.
 *
 * Protocol reference:
 *   wss://{project}.supabase.co/realtime/v1/websocket?apikey=...&vsn=1.0.0
 *   Heartbeat every 30 s on topic "phoenix" with event "heartbeat".
 *   Subscribe via { topic: "realtime:schema:table:filter", event: "phx_join" }
 *
 * Usage:
 *   const rt = createRealtimeClient();
 *   const unsub = rt.subscribe(
 *     'public',          // schema
 *     'checkin_events',  // table
 *     `event_id=eq.${id}`, // filter (PostgREST-style)
 *     (payload) => { ... }
 *   );
 *   // later:
 *   unsub();
 *   rt.disconnect();
 */

const SUPABASE_URL     = import.meta.env.VITE_SUPABASE_URL?.replace(/\/$/, '');
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

const WS_URL = SUPABASE_URL
  ? `${SUPABASE_URL.replace(/^https/, 'wss').replace(/^http/, 'ws')}/realtime/v1/websocket?apikey=${SUPABASE_ANON_KEY}&vsn=1.0.0`
  : null;

const HEARTBEAT_MS  = 30_000;
const MAX_RECONNECT = 5;
const RECONNECT_BASE_MS = 1_000; // exponential backoff base

/**
 * Connection status values exposed to consumers.
 * @typedef {'connecting' | 'connected' | 'disconnected' | 'error'} RealtimeStatus
 */

/**
 * Create a managed Realtime connection.
 * Returns an object with subscribe / disconnect / onStatusChange.
 */
export function createRealtimeClient() {
  let ws            = null;
  let heartbeatTimer = null;
  let reconnectTimer = null;
  let reconnectCount = 0;
  let intentionalClose = false;

  /** ref → callback */
  const channels = new Map();
  /** topic → ref */
  const topicRefs = new Map();

  let statusListeners = [];
  let currentStatus   = 'disconnected';

  // ── internal helpers ────────────────────────────────────────────────────

  function setStatus(s) {
    currentStatus = s;
    statusListeners.forEach((fn) => fn(s));
  }

  function send(msg) {
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
    }
  }

  function startHeartbeat() {
    heartbeatTimer = setInterval(() => {
      send({ topic: 'phoenix', event: 'heartbeat', payload: {}, ref: null });
    }, HEARTBEAT_MS);
  }

  function stopHeartbeat() {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }

  function joinChannel(topic) {
    const ref = crypto.randomUUID();
    topicRefs.set(topic, ref);
    send({
      topic,
      event:   'phx_join',
      payload: {
        config: {
          broadcast:  { self: false },
          presence:   { key: '' },
          postgres_changes: [
            { event: 'INSERT', schema: 'public' },
            { event: 'UPDATE', schema: 'public' },
          ],
        },
      },
      ref,
    });
  }

  function rejoinAll() {
    for (const topic of channels.keys()) {
      joinChannel(topic);
    }
  }

  // ── connection lifecycle ────────────────────────────────────────────────

  function connect() {
    if (!WS_URL) {
      console.warn('[supabaseRealtime] WS_URL is not set — realtime disabled');
      setStatus('error');
      return;
    }

    setStatus('connecting');
    ws = new WebSocket(WS_URL);

    ws.onopen = () => {
      reconnectCount = 0;
      setStatus('connected');
      startHeartbeat();
      rejoinAll();
    };

    ws.onmessage = (e) => {
      let msg;
      try { msg = JSON.parse(e.data); } catch { return; }

      // Dispatch to matching channel callbacks
      const cb = channels.get(msg.topic);
      if (cb && msg.event === 'postgres_changes' && msg.payload?.data) {
        cb(msg.payload.data);
      }
    };

    ws.onerror = () => {
      setStatus('error');
    };

    ws.onclose = () => {
      stopHeartbeat();
      if (intentionalClose) {
        setStatus('disconnected');
        return;
      }
      setStatus('error');
      if (reconnectCount < MAX_RECONNECT) {
        const delay = RECONNECT_BASE_MS * Math.pow(2, reconnectCount);
        reconnectCount += 1;
        reconnectTimer = setTimeout(connect, delay);
      }
    };
  }

  function disconnect() {
    intentionalClose = true;
    stopHeartbeat();
    clearTimeout(reconnectTimer);
    ws?.close();
    channels.clear();
    topicRefs.clear();
  }

  // ── public API ──────────────────────────────────────────────────────────

  /**
   * Subscribe to INSERT/UPDATE events on a table for a given event_id filter.
   *
   * @param {string} schema   — usually 'public'
   * @param {string} table
   * @param {string} filter   — PostgREST filter e.g. 'event_id=eq.123'
   * @param {(data: object) => void} callback
   * @returns {() => void} unsubscribe function
   */
  function subscribe(schema, table, filter, callback) {
    const topic = `realtime:${schema}:${table}:${filter}`;
    channels.set(topic, callback);

    if (ws?.readyState === WebSocket.OPEN) {
      joinChannel(topic);
    } else if (!ws || ws.readyState === WebSocket.CLOSED) {
      intentionalClose = false;
      connect();
    }
    // If CONNECTING, rejoinAll() fires in onopen.

    return () => {
      channels.delete(topic);
      topicRefs.delete(topic);
      // Send phx_leave if still connected
      send({ topic, event: 'phx_leave', payload: {}, ref: null });
    };
  }

  /**
   * Register a status change listener.
   * @param {(status: RealtimeStatus) => void} fn
   * @returns {() => void} deregister
   */
  function onStatusChange(fn) {
    statusListeners.push(fn);
    fn(currentStatus); // emit current state immediately
    return () => {
      statusListeners = statusListeners.filter((l) => l !== fn);
    };
  }

  return { subscribe, disconnect, onStatusChange };
}
