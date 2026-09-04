import { Image, StyleSheet, Text, View } from "react-native";

type CreditTheme = { textMuted: string; cardSoft: string; border: string };
type CortexisCreditProps = { theme: CreditTheme };

const defaultTheme: CreditTheme = { textMuted: "#66798F", cardSoft: "#F3F7FD", border: "#D7E2F3" };

export default function CortexisCredit({ theme = defaultTheme }: CortexisCreditProps) {
  return (
    <View style={styles.wrap}>
      <Text style={[styles.label, { color: theme.textMuted }]}>Desenvolvido por</Text>
      <View style={[styles.badge, { backgroundColor: theme.cardSoft, borderColor: theme.border }]}>
        <Image source={require("../../cortexis-tech-logo.png")} style={styles.logo} resizeMode="contain" accessibilityLabel="Cortexis Tech" />
      </View>
      <Text style={[styles.domain, { color: theme.textMuted }]}>cortexis.com</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: 28, marginBottom: 8, alignItems: "center", gap: 8 },
  label: { fontSize: 11, fontWeight: "600", letterSpacing: 0.6, textTransform: "uppercase" },
  badge: { borderWidth: 1, borderRadius: 12, overflow: "hidden", padding: 8 },
  logo: { width: 96, height: 69 },
  domain: { fontSize: 11, fontWeight: "600", letterSpacing: 0.4 },
});