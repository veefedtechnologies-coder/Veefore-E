import React, { useState, useEffect, useRef } from 'react';
import { useQuery } from 'react-query';
import { Search, X, Clock, User, Shield, CreditCard, Ticket, Webhook, Megaphone, ExternalLink } from 'lucide-react';
import { apiClient as api } from '../../services/api';
import { clsx } from 'clsx';

interface SearchResult {
  id: string;
  type: string;
  title: string;
  description: string;
  url: string;
  score: number;
  metadata: any;
  highlighted: {
    title: string;
    description: string;
  };
}

interface GlobalSearchProps {
  isOpen: boolean;
  onClose: () => void;
  onResultClick?: (result: SearchResult) => void;
}

export const GlobalSearch: React.FC<GlobalSearchProps> = ({ isOpen, onClose, onResultClick }) => {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);

  // Search query
  const { data: searchData, isLoading: searchLoading } = useQuery({
    queryKey: ['global-search', query],
    queryFn: () => api.get('/search', {
      params: { q: query, limit: 10 }
    }).then(res => res.data),
    enabled: query.length >= 2,
    staleTime: 30000
  });

  // Suggestions query
  const { data: suggestionsData } = useQuery({
    queryKey: ['search-suggestions', query],
    queryFn: () => api.get('/search/suggestions', {
      params: { q: query, limit: 5 }
    }).then(res => res.data),
    enabled: query.length >= 2 && showSuggestions,
    staleTime: 60000
  });

  const results: SearchResult[] = searchData?.data?.results || [];
  const suggestions: string[] = suggestionsData?.data || [];

  // Focus input when modal opens
  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  // Handle keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;

      switch (e.key) {
        case 'Escape':
          onClose();
          break;
        case 'ArrowDown':
          e.preventDefault();
          setSelectedIndex(prev => Math.min(prev + 1, results.length - 1));
          break;
        case 'ArrowUp':
          e.preventDefault();
          setSelectedIndex(prev => Math.max(prev - 1, 0));
          break;
        case 'Enter':
          e.preventDefault();
          if (results[selectedIndex]) {
            handleResultClick(results[selectedIndex]);
          }
          break;
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, results, selectedIndex, onClose]);

  // Reset selected index when results change
  useEffect(() => {
    setSelectedIndex(0);
  }, [results]);

  const handleResultClick = (result: SearchResult) => {
    if (onResultClick) {
      onResultClick(result);
    } else {
      window.location.href = result.url;
    }
    onClose();
  };

  const handleSuggestionClick = (suggestion: string) => {
    setQuery(suggestion);
    setShowSuggestions(false);
  };

  const getEntityIcon = (type: string) => {
    switch (type) {
      case 'user':
        return <User className="h-4 w-4" />;
      case 'admin':
        return <Shield className="h-4 w-4" />;
      case 'subscription':
        return <CreditCard className="h-4 w-4" />;
      case 'ticket':
        return <Ticket className="h-4 w-4" />;
      case 'webhook':
        return <Webhook className="h-4 w-4" />;
      case 'banner':
        return <Megaphone className="h-4 w-4" />;
      default:
        return <Search className="h-4 w-4" />;
    }
  };

  const getEntityColor = (type: string) => {
    switch (type) {
      case 'user':
        return 'text-blue-600 bg-blue-100';
      case 'admin':
        return 'text-purple-600 bg-purple-100';
      case 'subscription':
        return 'text-green-600 bg-green-100';
      case 'ticket':
        return 'text-orange-600 bg-orange-100';
      case 'webhook':
        return 'text-indigo-600 bg-indigo-100';
      case 'banner':
        return 'text-pink-600 bg-pink-100';
      default:
        return 'text-gray-600 bg-gray-100';
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex min-h-screen items-start justify-center p-4 pt-16">
        {/* Backdrop */}
        <div
          className="fixed inset-0 bg-black bg-opacity-50"
          onClick={onClose}
        />
        
        {/* Search Modal */}
        <div className="relative w-full max-w-2xl bg-white rounded-lg shadow-xl">
          {/* Search Input */}
          <div className="flex items-center p-4 border-b border-gray-200">
            <Search className="h-5 w-5 text-gray-400 mr-3" />
            <input
              ref={inputRef}
              type="text"
              placeholder="Search users, admins, subscriptions, tickets..."
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setShowSuggestions(true);
              }}
              onFocus={() => setShowSuggestions(true)}
              className="flex-1 text-lg border-none outline-none"
            />
            <button
              onClick={onClose}
              className="ml-3 p-1 text-gray-400 hover:text-gray-600"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Search Results */}
          <div className="max-h-96 overflow-y-auto">
            {query.length < 2 ? (
              <div className="p-8 text-center text-gray-500">
                <Search className="h-12 w-12 mx-auto mb-4 text-gray-300" />
                <p>Type at least 2 characters to search</p>
              </div>
            ) : searchLoading ? (
              <div className="p-8 text-center text-gray-500">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
                <p>Searching...</p>
              </div>
            ) : results.length === 0 ? (
              <div className="p-8 text-center text-gray-500">
                <Search className="h-12 w-12 mx-auto mb-4 text-gray-300" />
                <p>No results found for "{query}"</p>
              </div>
            ) : (
              <div ref={resultsRef} className="py-2">
                {results.map((result, index) => (
                  <div
                    key={`${result.type}-${result.id}`}
                    className={clsx(
                      'flex items-center p-4 hover:bg-gray-50 cursor-pointer border-l-4',
                      index === selectedIndex
                        ? 'bg-blue-50 border-blue-500'
                        : 'border-transparent'
                    )}
                    onClick={() => handleResultClick(result)}
                  >
                    <div className={clsx(
                      'flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center mr-3',
                      getEntityColor(result.type)
                    )}>
                      {getEntityIcon(result.type)}
                    </div>
                    
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <h3 className="text-sm font-medium text-gray-900 truncate">
                          <span dangerouslySetInnerHTML={{ __html: result.highlighted.title }} />
                        </h3>
                        <div className="flex items-center space-x-2">
                          <span className="text-xs text-gray-500 capitalize">
                            {result.type}
                          </span>
                          <ExternalLink className="h-3 w-3 text-gray-400" />
                        </div>
                      </div>
                      <p className="text-sm text-gray-500 mt-1">
                        <span dangerouslySetInnerHTML={{ __html: result.highlighted.description }} />
                      </p>
                      {result.metadata && (
                        <div className="flex items-center space-x-4 mt-2 text-xs text-gray-400">
                          {result.metadata.email && (
                            <span>{result.metadata.email}</span>
                          )}
                          {result.metadata.status && (
                            <span className="capitalize">{result.metadata.status}</span>
                          )}
                          {result.metadata.role && (
                            <span className="capitalize">{result.metadata.role}</span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Search Suggestions */}
          {showSuggestions && suggestions.length > 0 && query.length >= 2 && (
            <div className="border-t border-gray-200 p-2">
              <div className="text-xs text-gray-500 mb-2 px-2">Suggestions</div>
              {suggestions.map((suggestion, index) => (
                <button
                  key={index}
                  onClick={() => handleSuggestionClick(suggestion)}
                  className="w-full text-left px-2 py-1 text-sm text-gray-600 hover:bg-gray-100 rounded"
                >
                  <Clock className="h-3 w-3 inline mr-2" />
                  {suggestion}
                </button>
              ))}
            </div>
          )}

          {/* Footer */}
          <div className="border-t border-gray-200 p-3 text-xs text-gray-500">
            <div className="flex items-center justify-between">
              <span>Press Enter to select, ↑↓ to navigate, Esc to close</span>
              <span>{results.length} results</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
