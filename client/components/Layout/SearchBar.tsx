import { useState } from 'react';

import { SEARCH_PLACEHOLDER } from '../../app/config';

export function SearchBar() {
  const [query, setQuery] = useState('');

  return (
    <div className="search-wrapper relative">
      <input
        type="text"
        className="search-box w-52"
        placeholder={SEARCH_PLACEHOLDER}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      {query && (
        <button
          className="text-muted hover:text-foreground absolute top-1/2 right-2 -translate-y-1/2 text-lg"
          onClick={() => setQuery('')}
          aria-label="Clear search"
          type="button"
        >
          &times;
        </button>
      )}
    </div>
  );
}
