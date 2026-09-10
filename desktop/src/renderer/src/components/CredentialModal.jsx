import React, { useState } from "react";
import { EyeIcon, EyeOffIcon } from "./icons.jsx";

export default function CredentialModal({ initialItem, onClose, onSaved }) {
  const [title, setTitle] = useState(initialItem?.title || "");
  const [username, setUsername] = useState(initialItem?.username || "");
  const [password, setPassword] = useState(initialItem?.password || "");
  const [showPassword, setShowPassword] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const handleGenerate = async () => {
    const generated = await window.secpass.generatePassword();
    setPassword(generated);
    setShowPassword(true);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setIsSaving(true);
    try {
      const items = initialItem
        ? await window.secpass.updateItem(initialItem.id, title, username, password)
        : await window.secpass.addItem(title, username, password);
      onSaved(items);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <form className="modal-card" onMouseDown={(event) => event.stopPropagation()} onSubmit={handleSubmit}>
        <h2 className="modal-title">{initialItem ? "Editar credencial" : "Nova credencial"}</h2>

        <label className="field-label" htmlFor="cred-title">
          Titulo
        </label>
        <input
          id="cred-title"
          className="text-input"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          required
          autoFocus
        />

        <label className="field-label" htmlFor="cred-username">
          Usuario / email
        </label>
        <input
          id="cred-username"
          className="text-input"
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          required
        />

        <label className="field-label" htmlFor="cred-password">
          Senha
        </label>
        <div className="generate-row">
          <div className="password-field">
            <input
              id="cred-password"
              className="text-input"
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
            <button
              type="button"
              className="reveal-toggle"
              onClick={() => setShowPassword((prev) => !prev)}
              aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
            >
              {showPassword ? <EyeOffIcon /> : <EyeIcon />}
            </button>
          </div>
          <button type="button" className="small-icon-button" onClick={handleGenerate}>
            Gerar
          </button>
        </div>

        <div className="modal-actions">
          <button type="button" className="secondary-button" onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" className="primary-button" disabled={isSaving}>
            Salvar
          </button>
        </div>
      </form>
    </div>
  );
}
