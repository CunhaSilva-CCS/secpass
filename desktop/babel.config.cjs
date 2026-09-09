// So usado pelo Jest - o build/dev de verdade do app passa pelo electron-vite
// (Vite/Rollup), que ja entende import/export nativamente e nao usa Babel.
module.exports = {
  presets: [["@babel/preset-env", { targets: { node: "current" } }]],
};
