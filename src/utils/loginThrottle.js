export const MAX_LOGIN_ATTEMPTS = 5;
const BASE_LOCK_MS = 30 * 1000;
const MAX_LOCK_MS = 15 * 60 * 1000;
export const LOCK_LEVEL_DECAY_MS = 6 * 60 * 60 * 1000;

export const isLoginLocked = (lockUntil, nowMs = Date.now()) =>
  Number(lockUntil) > nowMs;

export const getLockRemainingSeconds = (lockUntil, nowMs = Date.now()) => {
  if (!isLoginLocked(lockUntil, nowMs)) {
    return 0;
  }

  return Math.ceil((Number(lockUntil) - nowMs) / 1000);
};

const getProgressiveLockMs = (nextLockLevel) => {
  const duration = BASE_LOCK_MS * 2 ** (nextLockLevel - 1);
  return Math.min(duration, MAX_LOCK_MS);
};

export const computeFailedLoginState = ({
  failedAttempts,
  lockLevel,
  nowMs = Date.now(),
}) => {
  const nextFailedAttempts = failedAttempts + 1;

  if (nextFailedAttempts < MAX_LOGIN_ATTEMPTS) {
    return {
      failedAttempts: nextFailedAttempts,
      lockLevel,
      lockUntil: 0,
      justLocked: false,
      remainingAttempts: MAX_LOGIN_ATTEMPTS - nextFailedAttempts,
      lockDurationSeconds: 0,
    };
  }

  const nextLockLevel = lockLevel + 1;
  const lockDurationMs = getProgressiveLockMs(nextLockLevel);

  return {
    failedAttempts: 0,
    lockLevel: nextLockLevel,
    lockUntil: nowMs + lockDurationMs,
    justLocked: true,
    remainingAttempts: 0,
    lockDurationSeconds: Math.ceil(lockDurationMs / 1000),
  };
};

export const applyLockDecay = ({
  failedAttempts,
  lockLevel,
  lockUntil,
  nowMs = Date.now(),
}) => {
  if (isLoginLocked(lockUntil, nowMs)) {
    return {
      failedAttempts,
      lockLevel,
      lockUntil,
    };
  }

  if (!lockLevel) {
    return {
      failedAttempts,
      lockLevel,
      lockUntil: 0,
    };
  }

  const elapsedSinceUnlock = Math.max(0, nowMs - Number(lockUntil || 0));
  const stepsToReduce =
    1 + Math.floor(elapsedSinceUnlock / LOCK_LEVEL_DECAY_MS);
  const nextLockLevel = Math.max(0, lockLevel - stepsToReduce);

  return {
    failedAttempts: 0,
    lockLevel: nextLockLevel,
    lockUntil: nextLockLevel > 0 ? lockUntil : 0,
  };
};
