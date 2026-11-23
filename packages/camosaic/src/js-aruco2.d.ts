declare module "js-aruco2/src/aruco.js" {
  interface Marker {
    id: number;
    corners: Array<{ x: number; y: number }>;
    hammingDistance: number;
  }
  class Detector {
    constructor(config?: { dictionaryName?: string; maxHammingDistance?: number });
    detectImage(width: number, height: number, data: Uint8ClampedArray): Marker[];
  }
  const AR: {
    DICTIONARIES: Record<string, { nBits: number; tau?: number; codeList: number[] }>;
    Detector: typeof Detector;
  };
  export { AR };
  const module: { AR: typeof AR };
  export default module;
}

declare module "js-aruco2/src/cv.js" {
  export const CV: { grayscale(image: unknown, dst: unknown): unknown; adaptiveThreshold(src: unknown, dst: unknown, kernel: number, threshold: number): unknown; findContours(image: unknown, binary: unknown[]): unknown };
  const module: { CV: { grayscale(image: unknown, dst: unknown): unknown; adaptiveThreshold(src: unknown, dst: unknown, kernel: number, threshold: number): unknown; findContours(image: unknown, binary: unknown[]): unknown } };
  export default module;
}
