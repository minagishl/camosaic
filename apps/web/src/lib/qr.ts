import qrcode from "qrcode-generator";

/** Inline SVG of a QR code for `text`. Only ever built from our own join URL. */
export function joinQr(text: string): string {
  const code = qrcode(0, "M");
  code.addData(text);
  code.make();
  return code.createSvgTag({ scalable: true, margin: 0 });
}
