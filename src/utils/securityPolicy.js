export const validateAccessPasswordPolicy = (password) => {
  if (!password || password.length < 10) {
    return "Senha deve ter pelo menos 10 caracteres.";
  }

  if (!/[A-Z]/.test(password)) {
    return "Senha deve incluir ao menos 1 letra maiuscula.";
  }

  if (!/[a-z]/.test(password)) {
    return "Senha deve incluir ao menos 1 letra minuscula.";
  }

  if (!/[0-9]/.test(password)) {
    return "Senha deve incluir ao menos 1 numero.";
  }

  if (!/[^A-Za-z0-9]/.test(password)) {
    return "Senha deve incluir ao menos 1 caractere especial.";
  }

  return null;
};
