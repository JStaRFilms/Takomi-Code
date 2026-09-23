import * as Effect from "effect/Effect";
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
 * every write is budgeted before it reaches the transport.
 *
 * The transport applies its own native backpressure (a write resolves once the
 * frame is flushed), so bytes are counted as outstanding from budget check
 * until the write settles. The high-water mark is the peak outstanding load
 * offered to the transport, including writes that later fail.
 */
export function withWebSocketBackpressure(
  socket: Socket.Socket,
  options?: {
    readonly bufferedBytesLimit?: number;
    readonly onSummary?: (diagnostics: WebSocketOutputDiagnostics) => void;
  },
): Socket.Socket {
  const limit = options?.bufferedBytesLimit ?? WS_BUFFERED_BYTES_LIMIT;
  let outstandingBytes = 0;
  let highWaterBytes = 0;
  let acceptedFrameBytes = 0;
  let lastSuccessfulFrameAtMs: number | null = null;
  let closedForBackpressure = false;

  const summarize = Effect.gen(function* () {
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
  });

  const budgetedWrite =
    (write: Socket.Writer["write"], now: () => number) =>
    (frame: Uint8Array | string | Socket.CloseEvent): Effect.Effect<void, Socket.SocketError> => {
      if (Socket.isCloseEvent(frame)) return write(frame);
      const bytes = frameBytes(frame);
      if (closedForBackpressure) return Effect.void;
      if (outstandingBytes + bytes > limit) {
        closedForBackpressure = true;
        return Effect.logWarning("websocket client exceeded output buffer budget", {
          outstandingBytes,
          attemptedFrameBytes: bytes,
          bufferedBytesHighWater: highWaterBytes,
          bufferedBytesLimit: limit,
          closeCode: WS_BACKPRESSURE_CLOSE_CODE,
          closeReason: WS_BACKPRESSURE_CLOSE_REASON,
        }).pipe(
          Effect.andThen(
            write(new Socket.CloseEvent(WS_BACKPRESSURE_CLOSE_CODE, WS_BACKPRESSURE_CLOSE_REASON)),
          ),
        );
      }
      outstandingBytes += bytes;
      highWaterBytes = Math.max(highWaterBytes, outstandingBytes);
      return write(frame).pipe(
        Effect.tap(() =>
          Effect.sync(() => {
            acceptedFrameBytes = Math.min(Number.MAX_SAFE_INTEGER, acceptedFrameBytes + bytes);
            lastSuccessfulFrameAtMs = now();
          }),
        ),
        Effect.ensuring(
          Effect.sync(() => {
            outstandingBytes -= bytes;
          }),
        ),
        Effect.asVoid,
      );
    };

  return Socket.make({
    reader: socket.reader.pipe(Effect.ensuring(summarize)),
    writer: socket.writer.pipe(
      Effect.flatMap((writer) =>
        Effect.clockWith((clock) => {
          const budgeted = budgetedWrite(writer.write, () => clock.currentTimeMillisUnsafe());
          return Effect.succeed({
            write: budgeted,
            writeAll: (frames) => Effect.forEach(frames, budgeted, { discard: true }),
          });
        }),
      ),
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
