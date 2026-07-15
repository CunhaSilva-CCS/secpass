import { StyleSheet, TextInput, View } from "react-native";

const defaultTheme = {
  cardSoft: "#F5F8FC",
  border: "#D9E3F2",
  text: "#0D1B2A",
  textMuted: "#74849C",
};

export default function SearchBar({
  value,
  onChangeText,
  theme = defaultTheme,
}) {
  return (
    <View style={styles.wrapper}>
      <TextInput
        placeholder="Pesquisar por titulo ou usuario"
        placeholderTextColor={theme.textMuted}
        value={value}
        onChangeText={onChangeText}
        style={[
          styles.input,
          {
            backgroundColor: theme.cardSoft,
            borderColor: theme.border,
            color: theme.text,
          },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    marginBottom: 14,
  },
  input: {
    borderWidth: 1,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 14,
    fontSize: 15,
  },
});
