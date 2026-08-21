import { StyleSheet, TextInput, View } from "react-native";

const defaultTheme = {
  cardSoft: "#F6EFDF",
  border: "#D8C89E",
  text: "#211A10",
  textMuted: "#7A6C52",
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
