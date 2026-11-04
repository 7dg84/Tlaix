import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  notifyAuthModalClosed,
  registerAuthModalListener,
  requestAuthModal,
  resetAuthModalStore,
} from "./auth-modal";

describe("auth-modal store", () => {
  beforeEach(() => {
    resetAuthModalStore();
  });

  it("entrega al listener una petición hecha antes de montarse", () => {
    const listener = vi.fn();

    requestAuthModal("expired");
    expect(listener).not.toHaveBeenCalled();

    const unregister = registerAuthModalListener(listener);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith("expired");

    unregister();
  });

  it("solo actualiza el motivo cuando el nuevo es más prioritario", () => {
    const listener = vi.fn();
    const unregister = registerAuthModalListener(listener);

    requestAuthModal("login");
    requestAuthModal("required");
    requestAuthModal("expired");
    requestAuthModal("required");

    expect(listener.mock.calls).toEqual([
      ["login"],
      ["required"],
      ["expired"],
    ]);

    unregister();
  });

  it("ignora peticiones repetidas con el mismo motivo", () => {
    const listener = vi.fn();
    const unregister = registerAuthModalListener(listener);

    requestAuthModal("login");
    requestAuthModal("login");
    requestAuthModal("login");

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith("login");

    unregister();
  });

  it("permite reabrir con el mismo motivo después de cerrar", () => {
    const listener = vi.fn();
    const unregister = registerAuthModalListener(listener);

    requestAuthModal("login");
    notifyAuthModalClosed();
    requestAuthModal("login");

    expect(listener).toHaveBeenCalledTimes(2);

    unregister();
  });

  it("deja de notificar al desregistrar y conserva la petición pendiente", () => {
    const first = vi.fn();
    const unregister = registerAuthModalListener(first);
    unregister();

    requestAuthModal("required");
    expect(first).toHaveBeenCalledTimes(0);

    const second = vi.fn();
    const unregisterSecond = registerAuthModalListener(second);
    expect(second).toHaveBeenCalledWith("required");

    unregisterSecond();
  });

  it("usa `expired` como motivo por defecto", () => {
    const listener = vi.fn();
    const unregister = registerAuthModalListener(listener);

    requestAuthModal();

    expect(listener).toHaveBeenCalledWith("expired");

    unregister();
  });
});
