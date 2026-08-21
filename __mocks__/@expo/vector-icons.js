const React = require("react");
const { View } = require("react-native");

// @expo/vector-icons loads its font asynchronously and triggers a setState
// after mount, which react-test-renderer flags as an act() warning in every
// test that renders an icon. Icons carry no assertable text, so tests only
// need a stable, synchronous stand-in.
const makeIconStub = (name) => {
  const IconStub = ({ testID }) =>
    React.createElement(View, { testID: testID || `icon-${name}` });
  IconStub.displayName = name;
  return IconStub;
};

module.exports = new Proxy(
  {},
  {
    get: (_target, iconSetName) => makeIconStub(String(iconSetName)),
  },
);
