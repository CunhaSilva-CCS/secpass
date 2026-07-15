import { StyleSheet, Text, View } from "react-native";

const defaultTheme = {
  accent: "#0C66E4",
  primaryText: "#FFFFFF",
  text: "#0D1B2A",
  textSoft: "#4B5D79",
  card: "#FFFFFF",
  border: "#DCE5F3",
};

export default function BrandLogo({
  theme = defaultTheme,
  size = "regular",
  showWordmark = true,
}) {
  const compact = size === "compact";
  const markSize = compact ? 38 : 50;
  const shackleSize = compact ? 18 : 24;
  const bodyHeight = compact ? 24 : 30;
  const initialsSize = compact ? 11 : 13;

  return (
    <View style={styles.container}>
      <View
        style={[
          styles.mark,
          {
            width: markSize,
            borderColor: theme.border,
            backgroundColor: theme.card,
          },
        ]}
      >
        <View
          style={[
            styles.shackle,
            {
              width: shackleSize,
              height: shackleSize,
              borderColor: theme.accent,
            },
          ]}
        />
        <View
          style={[
            styles.body,
            {
              height: bodyHeight,
              backgroundColor: theme.accent,
            },
          ]}
        >
          <Text
            style={[
              styles.initials,
              { color: theme.primaryText, fontSize: initialsSize },
            ]}
          >
            SP
          </Text>
        </View>
      </View>

      {showWordmark && (
        <View style={styles.wordmarkWrap}>
          <Text style={[styles.wordmark, { color: theme.text }]}>SecPass</Text>
          <Text style={[styles.tagline, { color: theme.textSoft }]}>
            Security Vault
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  mark: {
    borderWidth: 1,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 4,
    paddingBottom: 5,
  },
  shackle: {
    borderWidth: 3,
    borderBottomWidth: 0,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    marginBottom: -2,
  },
  body: {
    width: "74%",
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  initials: {
    fontWeight: "800",
    letterSpacing: 0.3,
  },
  wordmarkWrap: {
    justifyContent: "center",
  },
  wordmark: {
    fontSize: 21,
    fontWeight: "800",
    letterSpacing: 0.2,
  },
  tagline: {
    marginTop: -1,
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
});
