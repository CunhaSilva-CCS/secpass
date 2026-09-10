import React from "react";

// Porta visual de src/components/BrandLogo.tsx (app mobile) pra CSS/HTML -
// o icone nao e uma imagem, e um cadeado desenhado com formas (arco +
// corpo com fechadura), pra ficar identico ao logo do cofre no Android.
export default function BrandLogo({ showWordmark = true }) {
  return (
    <div className="brand-logo">
      <div className="brand-mark">
        <div className="brand-shackle" />
        <div className="brand-body">
          <div className="brand-keyhole-dot" />
          <div className="brand-keyhole-wedge" />
        </div>
      </div>
      {showWordmark && (
        <div className="brand-wordmark-wrap">
          <span className="brand-wordmark">SecPass</span>
          <span className="brand-tagline">Cofre de Senhas</span>
        </div>
      )}
    </div>
  );
}
