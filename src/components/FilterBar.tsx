import React from "react";
import TextInput from "ink-text-input";
import { Box, Text } from "../ink";

export function FilterBar(props: {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (value: string) => void;
}): React.ReactNode {
  return (
    <Box flexDirection="column">
      <Text color="yellow">Filter mode</Text>
      <Text dimColor>
        Examples: level = &quot;error&quot;, request.method = &quot;GET&quot; and not exists(.user.id), span.[].name like &quot;db*&quot;
      </Text>
      <Box>
        <Text>filter&gt; </Text>
        <TextInput value={props.value} onChange={props.onChange} onSubmit={props.onSubmit} />
      </Box>
    </Box>
  );
}
