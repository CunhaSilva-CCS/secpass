import { StyleSheet, TextInput, View } from "react-native";

type SearchTheme = {
  cardSoft: string;
  border: string;
  text: string;
  textMuted: string;
};

type SearchBarProps = {
  value: string;
  onChangeText: (value: string) => void;
  theme?: SearchTheme;
};

const defaultTheme: SearchTheme = {
  cardSoft: "#F3F7FD",
  border: "#C7D7EE",
  text: "#0E1B2E",
  textMuted: "#66798F",
};

export default function SearchBar({
  value,
  onChangeText,
  theme = defaultTheme,
}: SearchBarProps) {
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