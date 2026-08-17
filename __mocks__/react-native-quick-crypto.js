// Mock manual do modulo nativo react-native-quick-crypto para o ambiente de
// testes (Jest roda em Node, sem bridge nativo). Usa o modulo `crypto` real
// do Node para produzir resultados corretos (PBKDF2, AES-CBC, HMAC), e
// envolve as saidas no mesmo Buffer usado pela lib real (@craftzdog/react-
// native-buffer) para manter compatibilidade com o codigo de producao.
const nodeCrypto = require("crypto");
const { Buffer } = require("@craftzdog/react-native-buffer");

module.exports = {
  pbkdf2Sync: (password, salt, iterations, keylen, digest) =>
    Buffer.from(
      nodeCrypto.pbkdf2Sync(password, salt, iterations, keylen, digest),
    ),

  randomBytes: (size) => Buffer.from(nodeCrypto.randomBytes(size)),

  createHash: (algorithm) => {
    const hash = nodeCrypto.createHash(algorithm);
    return {
      update(data) {
        hash.update(data);
        return this;
      },
      digest(encoding) {
        return hash.digest(encoding);
      },
    };
  },

  createHmac: (algorithm, key) => {
    const hmac = nodeCrypto.createHmac(algorithm, key);
    return {
      update(data) {
        hmac.update(data);
        return this;
      },
      digest(encoding) {
        return hmac.digest(encoding);
      },
    };
  },

  createCipheriv: (algorithm, key, iv) => {
    const cipher = nodeCrypto.createCipheriv(algorithm, key, iv);
    return {
      update: (data) => Buffer.from(cipher.update(data)),
      final: () => Buffer.from(cipher.final()),
    };
  },

  createDecipheriv: (algorithm, key, iv) => {
    const decipher = nodeCrypto.createDecipheriv(algorithm, key, iv);
    return {
      update: (data) => Buffer.from(decipher.update(data)),
      final: () => Buffer.from(decipher.final()),
    };
  },
};
