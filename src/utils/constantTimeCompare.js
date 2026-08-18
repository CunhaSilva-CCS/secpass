export const constantTimeCompare = (left, right) => {
  if (typeof left !== "string" || typeof right !== "string") {
    return false;
  }

  if (left.length !== right.length) {
    return false;
  }

  let diff = 0;
  for (let index = 0; index < left.length; index += 1) {
    diff |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }

  return diff === 0;
};
