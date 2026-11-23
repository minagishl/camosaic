import { describe, expect, it } from "vitest";
import * as root from "camosaic";
import * as core from "camosaic/core";
import * as react from "camosaic/react";

describe("published package entry points", () => {
  it("exposes core and React APIs from the package root", () => {
    expect(root.createHost).toBeTypeOf("function");
    expect(root.createChild).toBeTypeOf("function");
    expect(root.detectTags).toBeTypeOf("function");
    expect(root.useCamosaic).toBeTypeOf("function");
    expect(root.useCamera).toBeTypeOf("function");
  });

  it("supports core and React subpath imports", () => {
    expect(core.detectTags).toBeTypeOf("function");
    expect(core.createHost).toBeTypeOf("function");
    expect(react.useCamosaic).toBeTypeOf("function");
    expect(react.CamosaicCanvas).toBeTypeOf("function");
  });
});
