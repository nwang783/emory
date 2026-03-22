const PREFIX = '[Emory:RemoteIngest]'

export type RemoteIngestDebugPayload = Record<string, unknown>

export function logRemoteIngest(event: string, payload?: RemoteIngestDebugPayload): void {
  if (typeof console === 'undefined') return
  if (payload && Object.keys(payload).length > 0) {
    console.info(PREFIX, event, payload)
  } else {
    console.info(PREFIX, event)
  }
}

/** Structured JSON in the Electron main terminal (remote-ingest service + renderer diagnostics). */
export function logRemoteIngestTerminal(payload: RemoteIngestDebugPayload): void {
  if (typeof window === 'undefined' || !window.emoryApi?.remoteIngest?.logTerminalEvent) return
  try {
    void window.emoryApi.remoteIngest.logTerminalEvent(payload)
  } catch {
    // ignore
  }
}
