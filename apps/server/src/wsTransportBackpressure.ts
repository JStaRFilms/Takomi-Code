import * as Clock from "effect/Clock";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Socket from "effect/unstable/socket/Socket";

export const WS_BUFFERED_BYTES_LIMIT = 4 * 1024 * 1024;
export const WS_BACKPRESSURE_CLOSE_CODE = 1013;
export const WS_BACKPRESSURE_CLOSE_REASON = "client output buffer exceeded";

export interface WebSocketOutputDiagnostics {
  readonly acceptedFrameBytes: number;
  readonly bufferedBytesHighWater: number;
  readonly bufferedBytesLimit: number;
  readonly lastSuccessfulFrameAtMs: number | null;
  readonly closeCode: number | null;
  readonly closeReason: string | null;
}

function frameBytes(frame: Uint8Array | string | Socket.CloseEvent): number {
  if (Socket.isCloseEvent(frame)) return 0;
  return typeof frame === "string" ? new TextEncoder().encode(frame).byteLength : frame.byteLength;
}

/**
 * Enforces one aggregate output budget at the actual WebSocket writer boundary.
 * RPC stream queues cannot drain into unbounded native socket memory because
 * every write checks the raw WebSocket's buffered bytes before enqueueing.
 */
export function withWebSocketBackpressure(
  socket: Socket.Socket,
  options?: {
    readonly bufferedBytesLimit?: number;
    readonly onSummary?: (diagnostics: WebSocketOutputDiagnostics) => void;
  },
): Socket.Socket {
  const limit = options?.bufferedBytesLimit ?? WS_BUFFERED_BYTES_LIMIT;
  let webSocket: globalThis.WebSocket | undefined;
  let highWaterBytes = 0;
  let acceptedFrameBytes = 0;
  let lastSuccessfulFrameAtMs: number | null = null;
  let closedForBackpressure = false;

  return Socket.make({
    runRaw: (handler, runOptions) =>
      socket
        .runRaw((message) => {
          const handled = handler(message);
          return Effect.serviceOption(Socket.WebSocket).pipe(
            Effect.tap((service) =>
              Effect.sync(() => {
                webSocket = Option.getOrUndefined(service);
              }),
            ),
            Effect.andThen(Effect.isEffect(handled) ? handled : Effect.void),
          );
        }, runOptions)
        .pipe(
          Effect.ensuring(
            Effect.gen(function* () {
              const diagnostics: WebSocketOutputDiagnostics = {
                acceptedFrameBytes,
                bufferedBytesHighWater: highWaterBytes,
                bufferedBytesLimit: limit,
                lastSuccessfulFrameAtMs,
                closeCode: closedForBackpressure ? WS_BACKPRESSURE_CLOSE_CODE : null,
                closeReason: closedForBackpressure ? WS_BACKPRESSURE_CLOSE_REASON : null,
              };
              options?.onSummary?.(diagnostics);
              if (highWaterBytes > 0 || acceptedFrameBytes > 0 || closedForBackpressure) {
                yield* Effect.logDebug("websocket transport output summary", diagnostics);
              }
              webSocket = undefined;
            }),
          ),
        ),
    writer: socket.writer.pipe(
      Effect.map((write) => (frame: Uint8Array | string | Socket.CloseEvent) => {
        if (Socket.isCloseEvent(frame)) return write(frame);
        const bufferedBytes = webSocket?.bufferedAmount ?? 0;
        highWaterBytes = Math.max(highWaterBytes, bufferedBytes);
        const bytes = frameBytes(frame);
        if (closedForBackpressure || bufferedBytes + bytes > limit) {
          if (closedForBackpressure) return Effect.void;
          closedForBackpressure = true;
          return Effect.logWarning("websocket client exceeded output buffer budget", {
            bufferedBytes,
            attemptedFrameBytes: bytes,
            bufferedBytesHighWater: highWaterBytes,
            bufferedBytesLimit: limit,
            closeCode: WS_BACKPRESSURE_CLOSE_CODE,
            closeReason: WS_BACKPRESSURE_CLOSE_REASON,
          }).pipe(
            Effect.andThen(
              write(
                new Socket.CloseEvent(WS_BACKPRESSURE_CLOSE_CODE, WS_BACKPRESSURE_CLOSE_REASON),
              ),
            ),
          );
        }
        return write(frame).pipe(
          Effect.andThen(Clock.currentTimeMillis),
          Effect.tap((now) =>
            Effect.sync(() => {
              acceptedFrameBytes = Math.min(Number.MAX_SAFE_INTEGER, acceptedFrameBytes + bytes);
              highWaterBytes = Math.max(highWaterBytes, bufferedBytes + bytes);
              lastSuccessfulFrameAtMs = now;
            }),
          ),
          Effect.asVoid,
        );
      }),
    ),
  });
}

export function withRequestWebSocketBackpressure<T extends object, E, R>(
  request: T & { readonly upgrade: Effect.Effect<Socket.Socket, E, R> },
): T & { readonly upgrade: Effect.Effect<Socket.Socket, E, R> } {
  const upgrade = request.upgrade.pipe(Effect.map(withWebSocketBackpressure));
  return new Proxy(request, {
    get: (target, property) =>
      property === "upgrade" ? upgrade : Reflect.get(target, property, target),
  });
}
