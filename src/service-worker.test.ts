import { describe, expect, it, vi } from "vitest";
import { getServiceWorkerUrl, registerServiceWorker } from "./service-worker";

describe("service worker registration", () => {
  it("builds the service worker URL from the Vite base path", () => {
    expect(getServiceWorkerUrl("/stegosavr/")).toBe("/stegosavr/sw.js");
    expect(getServiceWorkerUrl("/stegosavr")).toBe("/stegosavr/sw.js");
  });

  it("registers on load when service workers are supported", () => {
    const register = vi.fn().mockResolvedValue(undefined);

    registerServiceWorker(
      { serviceWorker: { register } },
      {
        addEventListener(type, listener) {
          expect(type).toBe("load");
          listener();
        },
      },
      "/stegosavr/",
    );

    expect(register).toHaveBeenCalledWith("/stegosavr/sw.js");
  });

  it("does nothing when service workers are unsupported", () => {
    const addEventListener = vi.fn();

    registerServiceWorker({}, { addEventListener }, "/stegosavr/");

    expect(addEventListener).not.toHaveBeenCalled();
  });
});
