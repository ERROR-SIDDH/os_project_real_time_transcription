import sseEmitter from '@/lib/events';
import { NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ roomId: string }> }
) {
  const { roomId } = await params;

  if (!roomId || !/^\d{6}$/.test(roomId)) {
    return new Response('Invalid room ID', { status: 400 });
  }

  const stream = new ReadableStream({
    start(controller) {
      const eventName = `message:${roomId}`;

      const handler = (data: string) => {
        controller.enqueue(`data: ${data}\n\n`);
      };

      sseEmitter.on(eventName, handler);

      // Heartbeat to keep connection alive
      const intervalId = setInterval(() => {
        controller.enqueue(': heartbeat\n\n');
      }, 30000); // every 30 seconds

      // Clean up when client disconnects
      request.signal.addEventListener('abort', () => {
        sseEmitter.off(eventName, handler);
        clearInterval(intervalId);
        controller.close();
      });
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
