import React from "react";
import TextInput from "ink-text-input";
import { Box, Text } from "../ink";
import { buildInlineCompletion, extractActiveQueryFragment } from "../lib/queryAutocomplete";

export function QueryBar(props: {
  value: string;
  suggestions: string[];
  selectedSuggestionIndex: number;
  onChange: (value: string) => void;
  onSubmit: (value: string) => void;
}): React.ReactNode {
  const visibleSuggestions = props.suggestions.slice(0, 5);
  const activeSuggestion = visibleSuggestions[props.selectedSuggestionIndex] ?? "";
  const activeFragment = extractActiveQueryFragment(props.value);
  const inlineCompletion = buildInlineCompletion(props.value, activeSuggestion);
  return (
    <Box flexDirection="column">
      <Text color="cyan">Query mode</Text>
      <Text dimColor>
        Examples: level = &quot;error&quot;, exists(user.id), level in (&quot;warn&quot;,&quot;error&quot;), message =~ /health/
      </Text>
      <Box>
        <Text>query&gt; </Text>
        <TextInput value={props.value} onChange={props.onChange} onSubmit={props.onSubmit} />
        {inlineCompletion ? <Text dimColor>{inlineCompletion}</Text> : null}
      </Box>
      <Text dimColor>
        Tab/Shift+Tab cycles suggestions. Enter applies current query. Fragment: {activeFragment || "none"} · hint: {activeSuggestion || "none"}
      </Text>
      <Box flexDirection="column">
        {visibleSuggestions.map((item, index) => (
          <Text
            key={item}
            dimColor={index !== props.selectedSuggestionIndex}
            color={index === props.selectedSuggestionIndex ? "cyan" : undefined}
          >
            {index === props.selectedSuggestionIndex ? ">" : " "} {item}
          </Text>
        ))}
      </Box>
    </Box>
  );
}
