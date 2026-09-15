import React, { useEffect, useMemo, useRef } from "react";
import clipboard from "clipboardy";
import { Box, useApp, useInput } from "../ink";
import { DetailPane } from "../components/DetailPane";
import { FilterBar } from "../components/FilterBar";
import { Footer } from "../components/Footer";
import { FullscreenLayout } from "../components/FullscreenLayout";
import { Header } from "../components/Header";
import { HelpModal } from "../components/HelpModal";
import { LogList } from "../components/LogList";
import { QueryBar } from "../components/QueryBar";
import { SearchBar } from "../components/SearchBar";
import { useTerminalSize } from "../hooks/useTerminalSize";
import { copyCurrentJsonValue, copyCurrentKey, copyCurrentPath, createDetailSearch } from "../lib/detailActions";
import { buildFilter, isLegacyFilterExpression, parseFilterExpression } from "../lib/filter";
import { applyEntryBatch } from "../lib/ingestState";
import { flattenJsonTree } from "../lib/jsonTree";
import { computePaneWidths } from "../lib/layout";
import { sliceListWindow } from "../lib/listWindow";
import { renderMainLine } from "../lib/mainLineTemplate";
import { createMergedSourceState } from "../lib/mergedSource";
import { buildQuery } from "../lib/query";
import { applySuggestionToQuery, buildQuerySuggestions } from "../lib/queryAutocomplete";
import { startSourceManager } from "../lib/sourceManager";
import { createTextSearch } from "../lib/textSearch";
import { useAppState, useAppStateStore, useSetAppState } from "../state/AppState";
import type { AppState, JsonTreeRow, LogEntry, NormalizedLevel, SourceState } from "../types";

const LEVEL_KEY_MAP: Record<string, NormalizedLevel> = {
  "1": "trace",
  "2": "debug",
  "3": "info",
  "4": "warn",
  "5": "error",
  "6": "fatal",
};

function matchesLevelFilter(entry: LogEntry, levels: NormalizedLevel[]): boolean {
  return levels.length === 0 || levels.includes(entry.levelNormalized as NormalizedLevel);
}

function getVisibleEntries(source: SourceState | undefined): LogEntry[] {
  if (!source) return [];
  const filter = buildFilter(source.filter);
  const query = buildQuery(source.query);
  const filtered = source.entries.filter(
    entry => filter(entry) && query(entry) && matchesLevelFilter(entry, source.levelFilter),
  );
  return source.reverse ? [...filtered].reverse() : filtered;
}

function updateCurrentSource(state: AppState, updater: (source: SourceState) => SourceState): AppState {
  if (state.sources.length === 0) return state;
  return {
    ...state,
    sources: state.sources.map((source, index) =>
      index === state.activeSourceIndex ? updater(source) : source,
    ),
  };
}

async function copyValue(value: string, setState: ReturnType<typeof useSetAppState>) {
  try {
    await clipboard.write(value);
    setState(prev => ({ ...prev, statusLine: `Copied: ${value}` }));
  } catch (error) {
    setState(prev => ({
      ...prev,
      statusLine: `Clipboard failed: ${error instanceof Error ? error.message : String(error)}`,
    }));
  }
}

export function LogScreen(): React.ReactNode {
  const { exit } = useApp();
  const size = useTerminalSize();
  const store = useAppStateStore();
  const setState = useSetAppState();
  const sources = useAppState(state => state.sources);
  const activeSourceIndex = useAppState(state => state.activeSourceIndex);
  const mergedView = useAppState(state => state.mergedView);
  const mergeIgnored = useAppState(state => state.mergeIgnored);
  const mergedSelectedIndex = useAppState(state => state.mergedSelectedIndex);
  const mergedFollow = useAppState(state => state.mergedFollow);
  const mergedReverse = useAppState(state => state.mergedReverse);
  const mergedFilter = useAppState(state => state.mergedFilter);
  const mergedQuery = useAppState(state => state.mergedQuery);
  const mergedLevelFilter = useAppState(state => state.mergedLevelFilter);
  const mergedExpandedPaths = useAppState(state => state.mergedExpandedPaths);
  const mergedDetailCursor = useAppState(state => state.mergedDetailCursor);
  const focusMode = useAppState(state => state.focusMode);
  const detailMode = useAppState(state => state.detailMode);
  const filterDraft = useAppState(state => state.filterDraft);
  const queryDraft = useAppState(state => state.queryDraft);
  const querySuggestionIndex = useAppState(state => state.querySuggestionIndex);
  const detailSearchDraft = useAppState(state => state.detailSearchDraft);
  const detailSearchTerm = useAppState(state => state.detailSearchTerm);
  // Subscribes to trigger re-render on change; the value itself isn't read here.
  const _detailSearchMatches = useAppState(state => state.detailSearchMatches);
  const startupStatus = useAppState(state => state.startupStatus);
  const statusLine = useAppState(state => state.statusLine);
  const fps = useAppState(state => state.fps);
  const lastFlushSize = useAppState(state => state.lastFlushSize);
  const showHelp = useAppState(state => state.showHelp);
  const config = useAppState(state => state.config);

  const baseSource = sources[activeSourceIndex];
  const activeSource = useMemo(
    () =>
      mergedView
        ? createMergedSourceState(sources, {
            selectedIndex: mergedSelectedIndex,
            follow: mergedFollow,
            reverse: mergedReverse,
            filter: mergedFilter,
            query: mergedQuery,
            levelFilter: mergedLevelFilter,
            expandedPaths: mergedExpandedPaths,
            detailCursor: mergedDetailCursor,
          })
        : baseSource,
    [
      baseSource,
      mergedDetailCursor,
      mergedExpandedPaths,
      mergedFilter,
      mergedLevelFilter,
      mergedFollow,
      mergedQuery,
      mergedReverse,
      mergedSelectedIndex,
      mergedView,
      sources,
    ],
  );
  const visibleEntries = useMemo(() => getVisibleEntries(activeSource), [activeSource]);
  const selectedIndex = Math.min(activeSource?.selectedIndex ?? 0, Math.max(0, visibleEntries.length - 1));
  const visibleCount = Math.max(8, size.rows - 12);
  const paneWidths = computePaneWidths(size.columns);
  const listWidth = paneWidths.listWidth;
  const sourceWidth = mergedView ? 12 : 0;
  const listColumns = useMemo(() => {
    const timeWidth = 24;
    const levelWidth = 8;
    const gap = 2;
    const messageWidth = Math.max(
      18,
      listWidth - timeWidth - levelWidth - gap - 4 - (mergedView ? sourceWidth + 1 : 0),
    );
    return config.columns.map(column =>
      column.key === "message" ? { ...column, width: messageWidth } : column,
    );
  }, [config.columns, listWidth, mergedView, sourceWidth]);
  const { startIndex: start, window: visibleWindow } = useMemo(
    () =>
      sliceListWindow({
        entries: visibleEntries,
        selectedIndex,
        maxRows: visibleCount,
        mergedView,
      }),
    [mergedView, selectedIndex, visibleCount, visibleEntries],
  );
  const selectedEntry = visibleEntries[selectedIndex];
  const jsonRows: JsonTreeRow[] = useMemo(() => {
    if (!selectedEntry || selectedEntry.kind !== "json" || detailMode !== "tree") return [];
    return flattenJsonTree(selectedEntry.jsonValue, new Set(activeSource?.expandedPaths ?? ["root"]));
  }, [activeSource?.expandedPaths, detailMode, selectedEntry]);
  const textSearch = useMemo(
    () => createTextSearch(selectedEntry?.raw ?? "", detailSearchTerm),
    [detailSearchTerm, selectedEntry?.raw],
  );
  const detailSearch = useMemo(
    () => createDetailSearch(jsonRows, detailSearchTerm),
    [jsonRows, detailSearchTerm],
  );
  const detailMatches =
    selectedEntry?.kind === "json" && detailMode === "tree"
      ? detailSearch.matches
      : textSearch.matches;
  const activeFilterText = mergedView ? mergedFilter : activeSource?.filter ?? "";
  const activeLevelFilter = mergedView ? mergedLevelFilter : activeSource?.levelFilter ?? [];
  const detailModeHint =
    !selectedEntry
      ? "m tree/raw"
      : selectedEntry.kind === "json"
      ? detailMode === "tree"
        ? "Space fold"
        : "m tree/raw"
      : "raw text";
  const querySuggestions = useMemo(
    () => buildQuerySuggestions(activeSource?.entries ?? [], queryDraft),
    [activeSource?.entries, queryDraft],
  );
  const selectedSuggestionIndex = Math.min(
    querySuggestionIndex,
    Math.max(0, querySuggestions.length - 1),
  );
  const formatMessage = useMemo(
    () => (entry: LogEntry) => renderMainLine(entry, config),
    [config],
  );
  const renderCountRef = useRef(0);
  const lastPerfRef = useRef({ count: 0, at: Date.now() });
  const pendingYankRef = useRef(false);
  renderCountRef.current += 1;

  useEffect(() => {
    const cleanup = startSourceManager(
      store.getState().sources.map(source => source.spec),
      config,
      {
        onBatch(sourceId, entries, droppedCount) {
          setState(prev => ({
            ...prev,
            lastFlushSize: entries.length,
            sources: prev.sources.map(source => {
              if (source.spec.id !== sourceId) return source;
              const updatedSource = applyEntryBatch(source, entries, prev.config.maxEntries);
              updatedSource.droppedCount = Math.max(updatedSource.droppedCount, droppedCount);
              const filteredLength = getVisibleEntries(updatedSource).length;
              if (updatedSource.follow) {
                updatedSource.selectedIndex = Math.max(0, filteredLength - 1);
              } else {
                updatedSource.selectedIndex = Math.min(
                  updatedSource.selectedIndex,
                  Math.max(0, filteredLength - 1),
                );
              }
              return updatedSource;
            }),
            statusLine: `Flushed ${entries.length} entries from ${sourceId}`,
          }));
        },
        onStatus(message) {
          setState(prev => ({ ...prev, statusLine: message }));
        },
      },
    );
    return cleanup;
  }, [config, setState, store]);

  useEffect(() => {
    const now = Date.now();
    const elapsed = now - lastPerfRef.current.at;
    if (elapsed <= 0) return;
    const rendered = renderCountRef.current - lastPerfRef.current.count;
    const nextFps = rendered > 0 ? Math.round((rendered * 1000) / elapsed) : fps;
    lastPerfRef.current = { count: renderCountRef.current, at: now };
    if (nextFps !== fps && nextFps > 0) {
      setState(prev => ({ ...prev, fps: nextFps }));
    }
  }, [selectedIndex, focusMode, detailMode, detailSearchTerm, lastFlushSize, fps, setState]);

  useEffect(() => {
    setState(prev =>
      prev.detailSearchMatches === detailMatches ? prev : { ...prev, detailSearchMatches: detailMatches },
    );
  }, [detailMatches, setState]);

  useInput((input, key) => {
    if (focusMode === "filter") {
      if (key.escape) {
        setState(prev => ({ ...prev, focusMode: "list", filterDraft: "" }));
      }
      return;
    }

    if (focusMode === "query") {
      if (key.tab) {
        if (querySuggestions.length === 0) return;
        const nextIndex = key.shift
          ? (querySuggestionIndex - 1 + querySuggestions.length) % querySuggestions.length
          : (querySuggestionIndex + 1) % querySuggestions.length;
        setState(prev => ({
          ...prev,
          querySuggestionIndex: nextIndex,
        }));
        return;
      }
      if (key.rightArrow || (key.ctrl && input === "y")) {
        const suggestion = querySuggestions[selectedSuggestionIndex];
        if (!suggestion) return;
        setState(prev => ({
          ...prev,
          queryDraft: applySuggestionToQuery(prev.queryDraft, suggestion),
        }));
        return;
      }
      if (key.escape) {
        setState(prev => ({ ...prev, focusMode: "list", queryDraft: "", querySuggestionIndex: 0 }));
      }
      return;
    }

    if (focusMode === "search") {
      if (key.escape) {
        setState(prev => ({ ...prev, focusMode: "detail", detailSearchDraft: "" }));
      }
      return;
    }

    if (input === "q") {
      exit();
      return;
    }

    if (input === "?") {
      setState(prev => ({ ...prev, showHelp: !prev.showHelp }));
      return;
    }

    if (showHelp && (key.escape || input === "?")) {
      setState(prev => ({ ...prev, showHelp: false }));
      return;
    }

    if (input in LEVEL_KEY_MAP) {
      const level = LEVEL_KEY_MAP[input];
      setState(prev => {
        if (prev.mergedView) {
          const next = prev.mergedLevelFilter.includes(level)
            ? prev.mergedLevelFilter.filter(item => item !== level)
            : [...prev.mergedLevelFilter, level];
          return {
            ...prev,
            mergedLevelFilter: next,
            mergedSelectedIndex: 0,
            mergedFollow: false,
            statusLine: next.length > 0 ? `Level filter: ${next.join(", ")}` : "Level filter cleared",
          };
        }
        return updateCurrentSource(prev, source => {
          const next = source.levelFilter.includes(level)
            ? source.levelFilter.filter(item => item !== level)
            : [...source.levelFilter, level];
          return {
            ...source,
            levelFilter: next,
            selectedIndex: 0,
            follow: false,
          };
        });
      });
      return;
    }

    if (input === "R") {
      setState(prev =>
        prev.mergedView
          ? { ...prev, mergedReverse: !prev.mergedReverse }
          : updateCurrentSource(prev, source => ({ ...source, reverse: !source.reverse })),
      );
      return;
    }

    if (input === "F") {
      setState(prev => ({
        ...prev,
        focusMode: "filter",
        filterDraft: prev.mergedView ? prev.mergedFilter : baseSource?.filter ?? "",
      }));
      return;
    }

    if (input === "Q") {
      setState(prev => ({
        ...prev,
        focusMode: "query",
        queryDraft: prev.mergedView ? prev.mergedQuery : baseSource?.query ?? "",
        querySuggestionIndex: 0,
      }));
      return;
    }

    if (input === "M" && sources.length > 1) {
      setState(prev => ({ ...prev, mergedView: !prev.mergedView, statusLine: !prev.mergedView ? "Merged view enabled" : "Merged view disabled" }));
      return;
    }

    if (input === "/" && focusMode === "detail") {
      setState(prev => ({
        ...prev,
        focusMode: "search",
        detailSearchDraft: prev.detailSearchTerm,
      }));
      return;
    }

    if (key.tab && !key.shift) {
      setState(prev => ({
        ...prev,
        activeSourceIndex: (prev.activeSourceIndex + 1) % Math.max(1, prev.sources.length),
        mergedView: false,
      }));
      return;
    }

    if (key.tab && key.shift) {
      setState(prev => ({
        ...prev,
        activeSourceIndex: (prev.activeSourceIndex - 1 + Math.max(1, prev.sources.length)) % Math.max(1, prev.sources.length),
        mergedView: false,
      }));
      return;
    }

    if (input === "m") {
      setState(prev => ({ ...prev, detailMode: prev.detailMode === "tree" ? "raw" : "tree" }));
      return;
    }

    if (key.return) {
      setState(prev => ({ ...prev, focusMode: prev.focusMode === "list" ? "detail" : "list" }));
      return;
    }

    if (focusMode === "detail") {
      if (pendingYankRef.current) {
        pendingYankRef.current = false;
        const row = jsonRows[activeSource?.detailCursor ?? 0];
        if (!row) return;
        if (input === "y") {
          void copyValue(copyCurrentJsonValue(row), setState);
          return;
        }
        if (input === "p") {
          void copyValue(copyCurrentPath(row), setState);
          return;
        }
        if (input === "k") {
          void copyValue(copyCurrentKey(row), setState);
          return;
        }
      }

        if (selectedEntry?.kind === "json" && detailMode === "tree") {
        if (key.upArrow || input === "k") {
          setState(prev =>
            prev.mergedView
              ? { ...prev, mergedDetailCursor: Math.max(0, prev.mergedDetailCursor - 1) }
              : updateCurrentSource(prev, source => ({ ...source, detailCursor: Math.max(0, source.detailCursor - 1) })),
          );
          return;
        }
        if (key.downArrow || input === "j") {
          setState(prev =>
            prev.mergedView
              ? {
                  ...prev,
                  mergedDetailCursor: Math.min(
                    Math.max(0, jsonRows.length - 1),
                    prev.mergedDetailCursor + 1,
                  ),
                }
              : updateCurrentSource(prev, source => ({ ...source, detailCursor: Math.min(Math.max(0, jsonRows.length - 1), source.detailCursor + 1) })),
          );
          return;
        }
        if (input === " " || input === "l" || input === "h") {
          const row = jsonRows[activeSource?.detailCursor ?? 0];
          if (!row?.expandable) return;
          setState(prev => {
            if (prev.mergedView) {
              const expanded = new Set(prev.mergedExpandedPaths);
              if (expanded.has(row.path)) expanded.delete(row.path); else expanded.add(row.path);
              return { ...prev, mergedExpandedPaths: [...expanded] };
            }
            return updateCurrentSource(prev, source => {
              const expanded = new Set(source.expandedPaths);
              if (expanded.has(row.path)) expanded.delete(row.path); else expanded.add(row.path);
              return { ...source, expandedPaths: [...expanded] };
            });
          });
          return;
        }
        if (input === "C") {
          setState(prev =>
            prev.mergedView
              ? { ...prev, mergedExpandedPaths: ["root"] }
              : updateCurrentSource(prev, source => ({ ...source, expandedPaths: ["root"] })),
          );
          return;
        }
        if (input === "E") {
          const expandedPaths = jsonRows.filter(row => row.expandable).map(row => row.path);
          setState(prev =>
            prev.mergedView
              ? { ...prev, mergedExpandedPaths: expandedPaths }
              : updateCurrentSource(prev, source => ({ ...source, expandedPaths })),
          );
          return;
        }
        if (input === "n") {
          setState(prev =>
            prev.mergedView
              ? {
                  ...prev,
                  mergedDetailCursor:
                    selectedEntry?.kind === "json" && detailMode === "tree"
                      ? detailSearch.next(prev.mergedDetailCursor)
                      : textSearch.next(prev.mergedDetailCursor),
                }
              : updateCurrentSource(prev, source => ({
                  ...source,
                  detailCursor:
                    selectedEntry?.kind === "json" && detailMode === "tree"
                      ? detailSearch.next(source.detailCursor)
                      : textSearch.next(source.detailCursor),
                })),
          );
          return;
        }
        if (input === "N") {
          setState(prev =>
            prev.mergedView
              ? {
                  ...prev,
                  mergedDetailCursor:
                    selectedEntry?.kind === "json" && detailMode === "tree"
                      ? detailSearch.prev(prev.mergedDetailCursor)
                      : textSearch.prev(prev.mergedDetailCursor),
                }
              : updateCurrentSource(prev, source => ({
                  ...source,
                  detailCursor:
                    selectedEntry?.kind === "json" && detailMode === "tree"
                      ? detailSearch.prev(source.detailCursor)
                      : textSearch.prev(source.detailCursor),
                })),
          );
          return;
        }
        if (input === "y") {
          pendingYankRef.current = true;
          setState(prev => ({ ...prev, statusLine: "Yank pending: yy value, yp path, yk key" }));
          return;
        }
      }
      if (key.escape) {
        setState(prev => ({ ...prev, focusMode: "list" }));
      }
      return;
    }

    if (input === "g") {
      setState(prev =>
        prev.mergedView
          ? { ...prev, mergedSelectedIndex: 0, mergedFollow: false }
          : updateCurrentSource(prev, source => ({ ...source, selectedIndex: 0, follow: false })),
      );
      return;
    }

    if (input === "G") {
      setState(prev =>
        prev.mergedView
          ? {
              ...prev,
              mergedSelectedIndex: Math.max(0, visibleEntries.length - 1),
              mergedFollow: true,
            }
          : updateCurrentSource(prev, source => ({ ...source, selectedIndex: Math.max(0, getVisibleEntries(source).length - 1), follow: true })),
      );
      return;
    }

    if (key.pageUp) {
      setState(prev =>
        prev.mergedView
          ? {
              ...prev,
              mergedSelectedIndex: Math.max(0, prev.mergedSelectedIndex - 10),
              mergedFollow: false,
            }
          : updateCurrentSource(prev, source => ({ ...source, selectedIndex: Math.max(0, source.selectedIndex - 10), follow: false })),
      );
      return;
    }

    if (key.pageDown) {
      setState(prev =>
        prev.mergedView
          ? {
              ...prev,
              mergedSelectedIndex: Math.min(
                Math.max(0, visibleEntries.length - 1),
                prev.mergedSelectedIndex + 10,
              ),
              mergedFollow:
                Math.min(Math.max(0, visibleEntries.length - 1), prev.mergedSelectedIndex + 10) ===
                Math.max(0, visibleEntries.length - 1),
            }
          : updateCurrentSource(prev, source => {
              const max = Math.max(0, getVisibleEntries(source).length - 1);
              const next = Math.min(max, source.selectedIndex + 10);
              return { ...source, selectedIndex: next, follow: next === max };
            }),
      );
      return;
    }

    if (key.upArrow || input === "k") {
      setState(prev =>
        prev.mergedView
          ? {
              ...prev,
              mergedSelectedIndex: Math.max(0, prev.mergedSelectedIndex - 1),
              mergedFollow: false,
            }
          : updateCurrentSource(prev, source => ({ ...source, selectedIndex: Math.max(0, source.selectedIndex - 1), follow: false })),
      );
      return;
    }

    if (key.downArrow || input === "j") {
      setState(prev =>
        prev.mergedView
          ? {
              ...prev,
              mergedSelectedIndex: Math.min(
                Math.max(0, visibleEntries.length - 1),
                prev.mergedSelectedIndex + 1,
              ),
              mergedFollow:
                Math.min(Math.max(0, visibleEntries.length - 1), prev.mergedSelectedIndex + 1) ===
                Math.max(0, visibleEntries.length - 1),
            }
          : updateCurrentSource(prev, source => {
              const max = Math.max(0, getVisibleEntries(source).length - 1);
              const next = Math.min(max, source.selectedIndex + 1);
              return { ...source, selectedIndex: next, follow: next === max };
            }),
      );
    }
  });

  return (
    <FullscreenLayout
      header={
        <Header
          source={activeSource}
          activeIndex={activeSourceIndex}
          totalSources={sources.length}
          mergedView={mergedView}
          mergeIgnored={mergeIgnored}
          columns={size.columns}
          sourceLabels={sources.map(source => source.spec.label)}
          mergedFilterActive={Boolean(mergedFilter)}
          mergedQueryActive={Boolean(mergedQuery)}
          mergedReverseActive={mergedReverse}
          mergedFollowActive={mergedFollow}
          visibleEntries={visibleEntries.length}
          activeFilterText={activeFilterText}
          levelFilterText={activeLevelFilter.join(",")}
        />
      }
      body={
        <Box flexDirection="row">
          <Box width={listWidth} flexDirection="column">
            <LogList
              entries={visibleWindow}
              selectedIndex={selectedIndex}
              startIndex={start}
              columns={listColumns}
              showSourceLabel={mergedView}
              sourceWidth={sourceWidth}
              formatMessage={formatMessage}
            />
          </Box>
          <Box width={paneWidths.gap} />
          <Box width={paneWidths.detailWidth} flexDirection="column">
            {focusMode === "filter" ? (
              <FilterBar
                value={filterDraft}
                onChange={value => setState(prev => ({ ...prev, filterDraft: value }))}
                onSubmit={value =>
                  setState(prev => {
                    try {
                      if (value.trim() && !isLegacyFilterExpression(value)) {
                        parseFilterExpression(value);
                      }
                    } catch (error) {
                      return {
                        ...prev,
                        focusMode: "list",
                        filterDraft: "",
                        statusLine: `Filter error: ${error instanceof Error ? error.message : String(error)}`,
                      };
                    }
                    if (prev.mergedView) {
                      return {
                        ...prev,
                        focusMode: "list",
                        filterDraft: "",
                        mergedFilter: value,
                        mergedSelectedIndex: 0,
                        mergedFollow: false,
                      };
                    }
                    return updateCurrentSource(
                      { ...prev, focusMode: "list", filterDraft: "" },
                      source => ({
                        ...source,
                        filter: value,
                        selectedIndex: 0,
                        follow: false,
                      }),
                    );
                  })
                }
              />
            ) : focusMode === "query" ? (
              <QueryBar
                value={queryDraft}
                suggestions={querySuggestions}
                selectedSuggestionIndex={selectedSuggestionIndex}
                onChange={value => setState(prev => ({ ...prev, queryDraft: value }))}
                onSubmit={value =>
                  setState(prev => {
                    if (prev.mergedView) {
                      return {
                        ...prev,
                        focusMode: "list",
                        queryDraft: "",
                        querySuggestionIndex: 0,
                        mergedQuery: value,
                        mergedSelectedIndex: 0,
                        mergedFollow: false,
                      };
                    }
                    return updateCurrentSource(
                      {
                        ...prev,
                        focusMode: "list",
                        queryDraft: "",
                        querySuggestionIndex: 0,
                      },
                      source => ({
                        ...source,
                        query: value,
                        selectedIndex: 0,
                        follow: false,
                      }),
                    );
                  })
                }
              />
            ) : focusMode === "search" ? (
              <SearchBar
                value={detailSearchDraft}
                onChange={value => setState(prev => ({ ...prev, detailSearchDraft: value }))}
                onSubmit={value =>
                  setState(prev => {
                    const matches =
                      selectedEntry?.kind === "json" && detailMode === "tree"
                        ? createDetailSearch(jsonRows, value).matches
                        : createTextSearch(selectedEntry?.raw ?? "", value).matches;
                    const nextCursor = matches[0] ?? 0;
                    if (prev.mergedView) {
                      return {
                        ...prev,
                        focusMode: "detail",
                        detailSearchDraft: "",
                        detailSearchTerm: value,
                        detailSearchMatches: matches,
                        mergedDetailCursor: nextCursor,
                      };
                    }
                    return updateCurrentSource(
                      {
                        ...prev,
                        focusMode: "detail",
                        detailSearchDraft: "",
                        detailSearchTerm: value,
                        detailSearchMatches: matches,
                      },
                      source => ({
                        ...source,
                        detailCursor: nextCursor,
                      }),
                    );
                  })
                }
              />
            ) : (
              <DetailPane
                entry={selectedEntry}
                detailMode={detailMode}
                jsonRows={jsonRows}
                jsonCursor={activeSource?.detailCursor ?? 0}
                searchTerm={detailSearchTerm}
                searchMatches={detailMatches}
                detailCursor={activeSource?.detailCursor ?? 0}
                mergedView={mergedView}
                paneWidth={paneWidths.detailWidth}
                paneHeight={visibleCount}
              />
            )}
          </Box>
        </Box>
      }
      footer={
        <Footer
          statusLine={statusLine}
          startupStatus={startupStatus}
          fps={fps}
          follow={activeSource?.follow ?? false}
          reverse={activeSource?.reverse ?? false}
          focusMode={focusMode}
          query={activeSource?.query ?? ""}
          search={detailSearchTerm}
          mergedView={mergedView}
          mergeIgnored={mergeIgnored}
          sourceCount={sources.length}
          mergedFilter={mergedFilter}
          mergedQuery={mergedQuery}
          detailModeHint={detailModeHint}
          columns={size.columns}
        />
      }
      overlay={showHelp ? <HelpModal /> : undefined}
    />
  );
}
