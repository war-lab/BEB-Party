import { DurableObject } from "cloudflare:workers";

// RoomDOの骨組みのみ。接続・状態遷移・アラームはPR2a/PR2bで実装する
export class RoomDO extends DurableObject {}
