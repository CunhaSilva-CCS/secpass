export const constantTimeCompare = (left, right) => {
  if (typeof left !== "string" || typeof right !== "string") {
    return false;
  }

  const maxLength = Math.max(left.length, right.length);
  let diff = left.length ^ right.length;

  for (let index = 0; index < maxLength; index += 1) {
    const leftChar = index < left.length ? left.charCodeAt(index) : 0;
    const rightChar = index < right.length ? right.charCodeAt(index) : 0;
    diff |= leftChar ^ rightChar;
  }

  return diff === 0;
};
