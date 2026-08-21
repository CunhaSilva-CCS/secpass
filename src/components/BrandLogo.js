import { StyleSheet, Text, View } from "react-native";

const defaultTheme = {
  accent: "#8A6A1F",
  primaryText: "#FFFBF2",
  text: "#211A10",
  textSoft: "#584A34",
  card: "#FFFCF5",
  border: "#E3D6B8",
};

// A marca e um cadeado com um furo de fechadura de verdade (circulo + cunha)
// vazado no corpo, em vez de iniciais - o mesmo motivo que da nome ao app
//("SecPass") ja aparece ao lado, no wordmark, entao repetir "SP" dentro do
// icone era redundante.
export default function BrandLogo({
  theme = defaultTheme,
  size = "regular",
  showWordmark = true,
}) {
  const compact = size === "compact";
  const markSize = compact ? 38 : 50;
  const shackleSize = compact ? 18 : 24;
  const bodyHeight = compact ? 24 : 30;
  const keyholeDot = compact ? 4 : 5;
  const keyholeWedge = compact ? 4 : 5;

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
          <View
            style={[
              styles.keyholeDot,
              {
                width: keyholeDot,
                height: keyholeDot,
                borderRadius: keyholeDot / 2,
                backgroundColor: theme.card,
              },
            ]}
          />
          <View
            style={[
              styles.keyholeWedge,
              {
                borderLeftWidth: keyholeWedge / 2,
                borderRightWidth: keyholeWedge / 2,
                borderTopWidth: keyholeWedge,
                borderTopColor: theme.card,
              },
            ]}
          />
        </View>
      </View>

      {showWordmark && (
        <View style={styles.wordmarkWrap}>
          <Text style={[styles.wordmark, { color: theme.text }]}>SecPass</Text>
          <Text style={[styles.tagline, { color: theme.textSoft }]}>
            Cofre de Senhas
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
  keyholeDot: {},
  keyholeWedge: {
    width: 0,
    height: 0,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
    marginTop: -1,
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
