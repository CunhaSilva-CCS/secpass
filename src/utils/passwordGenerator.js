import * as ExpoCrypto from "expo-crypto";

const CHARS =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%";
const PASSWORD_LENGTH = 16;
// Discard bytes above this threshold so `byte % CHARS.length` stays unbiased.
const MAX_UNBIASED_BYTE = Math.floor(256 / CHARS.length) * CHARS.length;

export const generatePassword = () => {
  let password = "";

  while (password.length < PASSWORD_LENGTH) {
    const randomBytes = ExpoCrypto.getRandomBytes(
      PASSWORD_LENGTH - password.length,
    );

    for (const byte of randomBytes) {
      if (byte < MAX_UNBIASED_BYTE) {
        password += CHARS.charAt(byte % CHARS.length);
      }
    }
  }

  return password;
};