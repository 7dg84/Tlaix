/**
 * Puente entre el interceptor de axios y el modal de autenticación de React.
 *
 * El interceptor no puede usar hooks, así que deja aquí la petición de apertura.
 * El proveedor registra un listener al montarse y consume también las peticiones
 * que hayan llegado antes (por ejemplo, durante la carga inicial).
 */

export type AuthModalReason = "profile" | "login" | "required" | "expired";

type AuthModalListener = (reason: AuthModalReason) => void;

/**
 * Prioridad de los motivos: si el modal ya está abierto, solo se actualiza
 * cuando el nuevo motivo es más urgente. Así un 401 no degrada el aviso de
 * sesión expirada a un simple "inicia sesión".
 */
const PRIORITY: Record<AuthModalReason, number> = {
  profile: 0,
  login: 1,
  required: 2,
  expired: 3,
};

let listener: AuthModalListener | null = null;
let pendingReason: AuthModalReason | null = null;
let isOpen = false;
let currentReason: AuthModalReason | null = null;

/**
 * Solicita abrir el modal. Si ya está abierto con un motivo igual o más
 * prioritario, no hace nada.
 */
export function requestAuthModal(reason: AuthModalReason = "expired"): void {
  if (isOpen) {
    if (currentReason && PRIORITY[reason] <= PRIORITY[currentReason]) return;
    currentReason = reason;
    listener?.(reason);
    return;
  }

  isOpen = true;
  currentReason = reason;

  if (listener) {
    listener(reason);
  } else {
    // El proveedor todavía no se ha montado: se entrega al registrarse.
    pendingReason = reason;
  }
}

/**
 * Registra el listener del proveedor y entrega cualquier petición pendiente.
 * Devuelve la función de limpieza para el `useEffect`.
 */
export function registerAuthModalListener(
  nextListener: AuthModalListener
): () => void {
  listener = nextListener;

  if (pendingReason) {
    const reason = pendingReason;
    pendingReason = null;
    isOpen = true;
    currentReason = reason;
    nextListener(reason);
  }

  return () => {
    if (listener === nextListener) {
      listener = null;
      isOpen = false;
      currentReason = null;
    }
  };
}

/** El modal se cerró: la siguiente petición de autenticación puede abrirlo otra vez. */
export function notifyAuthModalClosed(): void {
  isOpen = false;
  currentReason = null;
}

/** Solo para tests: deja el almacén en su estado inicial. */
export function resetAuthModalStore(): void {
  listener = null;
  pendingReason = null;
  isOpen = false;
  currentReason = null;
}
