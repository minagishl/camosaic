import type { Pose, WireMessage } from "../types";

export function isWireMessage(value: unknown): value is WireMessage {
  if (!value || typeof value !== "object") return false;
  const msg = value as Record<string, unknown>;
  if (typeof msg.t !== "string") return false;
  switch (msg.t) {
    case "join":
    case "ping": return true;
    case "markers": return typeof msg.visible === "boolean";
    case "size": return validSize({ w: msg.w, h: msg.h });
    case "hello": return Number.isInteger(msg.slot) && Number(msg.slot) >= 0 && Number(msg.slot) < 5 &&
      Number.isFinite(msg.hue) && Number(msg.hue) >= 0 && Number(msg.hue) <= 360 && validSize(msg.stage) && Number.isFinite(msg.now);
    case "stage": return validSize(msg.stage);
    case "scene": return ["grid", "gradient", "plasma", "clock", "image", "video"].includes(String(msg.scene)) &&
      typeof msg.videoUrl === "string" && msg.videoUrl.length <= 4096 &&
      (msg.image === null || (typeof msg.image === "string" && msg.image.length <= 8_000_000)) && Number.isFinite(msg.epoch);
    case "pose": return (msg.m === null || validPose(msg.m)) && Number.isFinite(msg.now);
    default: return false;
  }
}

function validSize(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const size = value as Record<string, unknown>;
  return Number.isFinite(size.w) && Number.isFinite(size.h) &&
    Number(size.w) > 0 && Number(size.h) > 0 && Number(size.w) <= 100_000 && Number(size.h) <= 100_000;
}

function validPose(value: unknown): value is Pose {
  return Array.isArray(value) && value.length === 6 && value.every(Number.isFinite);
}

export function serializeMessage(message: WireMessage): string {
  if (!isWireMessage(message)) throw new TypeError("Cannot serialize an invalid Camosaic message.");
  return JSON.stringify(message);
}

export function deserializeMessage(data: string): WireMessage {
  const parsed: unknown = JSON.parse(data);
  if (!isWireMessage(parsed)) throw new TypeError("Invalid Camosaic message.");
  return parsed;
}
