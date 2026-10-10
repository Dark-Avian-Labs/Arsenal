import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';

import { SEARCH_PLACEHOLDER } from '../../app/config';
import { searchScaffoldPages, type SearchItem } from '../../lib/scaffoldSearch';
import { MaterialSymbol } from '../ui/MaterialSymbol';

export function SearchBar() {
  const navigate = useNavigate();
  const resultsId = 'sentinel-search-results';
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchItem[]>([]);
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (event: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  function runSearch(value: string) {
    const next = searchScaffoldPages(value);
    setResults(next);
    setOpen(value.trim().length > 0);
  }

  function goTo(item: SearchItem) {
    navigate(item.path);
    setQuery('');
    setResults([]);
    setOpen(false);
  }

  function submitFirstMatch() {
    const first = results[0] ?? searchScaffoldPages(query)[0];
    if (first) goTo(first);
  }

  return (
    <div ref={wrapperRef} className="relative">
      <form
        className="search-wrapper relative"
        role="search"
        onSubmit={(event) => {
          event.preventDefault();
          submitFirstMatch();
        }}
      >
        <input
          id="sentinel-header-search"
          name="search"
          type="search"
          autoComplete="off"
          className="search-box w-52"
          placeholder={SEARCH_PLACEHOLDER}
          aria-label="Search"
          aria-expanded={open}
          aria-controls={resultsId}
          aria-autocomplete="list"
          value={query}
          onChange={(event) => {
            const value = event.target.value;
            setQuery(value);
            runSearch(value);
          }}
          onFocus={() => {
            if (query.trim()) setOpen(true);
          }}
        />
        {query ? (
          <button
            type="button"
            className="text-muted hover:text-foreground absolute top-1/2 right-2 -translate-y-1/2 text-lg"
            onClick={() => {
              setQuery('');
              setResults([]);
              setOpen(false);
            }}
            aria-label="Clear search"
          >
            <MaterialSymbol name="close" style={{ fontSize: 20 }} />
          </button>
        ) : null}
      </form>

      {open ? (
        <div
          id={resultsId}
          role="region"
          aria-label="Search results"
          className="search-results absolute top-full right-0 z-50 mt-1 w-72"
        >
          {results.length === 0 ? (
            <div className="text-muted p-3 text-center text-sm">No matches</div>
          ) : (
            <ul className="custom-scroll max-h-80 overflow-y-auto py-1">
              {results.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    className="hover:bg-glass-hover flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left"
                    onClick={() => goTo(item)}
                  >
                    <span className="text-foreground text-sm">{item.title}</span>
                    <span className="text-muted text-xs">{item.hint}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
