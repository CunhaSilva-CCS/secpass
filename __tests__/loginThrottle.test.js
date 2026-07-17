import {
  applyLockDecay,
  computeFailedLoginState,
  getLockRemainingSeconds,
  isLoginLocked,
  LOCK_LEVEL_DECAY_MS,
  MAX_LOGIN_ATTEMPTS,
} from "../src/utils/loginThrottle";

describe("loginThrottle", () => {
  it("nao bloqueia antes do limite de tentativas", () => {
    const state = computeFailedLoginState({
      failedAttempts: MAX_LOGIN_ATTEMPTS - 2,
      lockLevel: 0,
      nowMs: 1000,
    });

    expect(state.justLocked).toBe(false);
    expect(state.failedAttempts).toBe(MAX_LOGIN_ATTEMPTS - 1);
    expect(state.remainingAttempts).toBe(1);
    expect(state.lockUntil).toBe(0);
  });

  it("bloqueia no limite com backoff inicial de 30s", () => {
    const nowMs = 1000;
    const state = computeFailedLoginState({
      failedAttempts: MAX_LOGIN_ATTEMPTS - 1,
      lockLevel: 0,
      nowMs,
    });

    expect(state.justLocked).toBe(true);
    expect(state.lockLevel).toBe(1);
    expect(state.lockDurationSeconds).toBe(30);
    expect(state.lockUntil).toBe(nowMs + 30000);
  });

  it("aplica bloqueio progressivo no segundo ciclo", () => {
    const nowMs = 5000;
    const state = computeFailedLoginState({
      failedAttempts: MAX_LOGIN_ATTEMPTS - 1,
      lockLevel: 1,
      nowMs,
    });

    expect(state.justLocked).toBe(true);
    expect(state.lockLevel).toBe(2);
    expect(state.lockDurationSeconds).toBe(60);
    expect(state.lockUntil).toBe(nowMs + 60000);
  });

  it("detecta bloqueio ativo e calcula tempo restante", () => {
    const lockUntil = 20000;

    expect(isLoginLocked(lockUntil, 15000)).toBe(true);
    expect(getLockRemainingSeconds(lockUntil, 15000)).toBe(5);
    expect(isLoginLocked(lockUntil, 25000)).toBe(false);
    expect(getLockRemainingSeconds(lockUntil, 25000)).toBe(0);
  });

  it("nao aplica decay quando lock ainda esta ativo", () => {
    const state = applyLockDecay({
      failedAttempts: 0,
      lockLevel: 2,
      lockUntil: 10000,
      nowMs: 9000,
    });

    expect(state).toEqual({
      failedAttempts: 0,
      lockLevel: 2,
      lockUntil: 10000,
    });
  });

  it("aplica decay imediato de um nivel ao expirar lock", () => {
    const state = applyLockDecay({
      failedAttempts: 1,
      lockLevel: 3,
      lockUntil: 10000,
      nowMs: 10001,
    });

    expect(state).toEqual({
      failedAttempts: 0,
      lockLevel: 2,
      lockUntil: 10000,
    });
  });

  it("reduz multiplos niveis apos longo periodo", () => {
    const state = applyLockDecay({
      failedAttempts: 0,
      lockLevel: 3,
      lockUntil: 10000,
      nowMs: 10000 + LOCK_LEVEL_DECAY_MS * 3,
    });

    expect(state).toEqual({
      failedAttempts: 0,
      lockLevel: 0,
      lockUntil: 0,
    });
  });
});
