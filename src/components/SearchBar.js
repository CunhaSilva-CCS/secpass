import { StyleSheet, TextInput, View } from "react-native";

const defaultTheme = {
  cardSoft: "#F3F7FD",
  border: "#C7D7EE",
  text: "#0E1B2E",
  textMuted: "#66798F",
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
