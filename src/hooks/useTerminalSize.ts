import { useEffect, useState } from "react";

export function readTerminalSize(stdout: { columns?: number; rows?: number }): {
  columns: number;
  rows: number;
} {
  return {
    columns: stdout.columns ?? 100,
    rows: stdout.rows ?? 30,
  };
}

export function useTerminalSize(): { columns: number; rows: number } {
  const read = () => readTerminalSize(process.stdout);
  const [size, setSize] = useState(read);
  useEffect(() => {
    const onResize = () => setSize(read());
    process.stdout.on("resize", onResize);
    return () => {
      process.stdout.off("resize", onResize);
    };
  }, []);
  return size;
}
