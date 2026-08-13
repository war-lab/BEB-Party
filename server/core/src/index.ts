export { RoomDO } from "./room-do";

// Workerのルーティングの骨組みのみ。4ルートの実装はPR2aで行う
export default {
  async fetch(): Promise<Response> {
    return new Response("not implemented", { status: 501 });
  },
} satisfies ExportedHandler;
