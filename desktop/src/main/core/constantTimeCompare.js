// Copia identica de src/utils/constantTimeCompare.js (app mobile) - sem
// dependencia de React Native, nada a portar.
export const constantTimeCompare = (left, right) => {
  if (typeof left !== "string" || typeof right !== "string") {
    return false;
  }

  const maxLength = Math.max(left.length, right.length);
  let diff = left.length ^ right.length;

  for (let i = 0; i < maxLength; i += 1) {
    const leftCode = i < left.length ? left.charCodeAt(i) : 0;
    const rightCode = i < right.length ? right.charCodeAt(i) : 0;
    diff |= leftCode ^ rightCode;
  }

  return diff === 0;
};
