/**
 * ReferenceField Component
 * Links an entry to another entry in a different collection.
 * Stores the referenced entry ID as the value.
 */

import { useState, useEffect } from 'react';
import styled from 'styled-components';
import { colors, spacing, typography, borders, shadows } from '../../shared/styles/design-tokens';
import { FieldWrapper } from './FieldWrapper';
import { api } from '../../lib/api';
import { Link2, Search, X, ExternalLink, Loader } from 'lucide-react';

const Container = styled.div`display: flex; flex-direction: column; gap: ${spacing[3]};`;

const Selected = styled.div`
  display: flex; align-items: center; gap: ${spacing[3]};
  padding: ${spacing[3]} ${spacing[4]};
  background: ${colors.accent[50]};
  border: 1px solid ${colors.accent[200]};
  border-radius: ${borders.radius.lg};

  .ref-info { flex: 1; }
  .ref-title { font-size: ${typography.fontSize.sm}; font-weight: 600; color: ${colors.gray[900]}; }
  .ref-meta { font-size: 12px; color: ${colors.gray[500]}; }

  button {
    padding: ${spacing[1.5]}; background: none; border: none; cursor: pointer;
    color: ${colors.gray[400]}; border-radius: ${borders.radius.md};
    &:hover { background: ${colors.accent[100]}; color: ${colors.gray[700]}; }
    svg { width: 16px; height: 16px; }
  }
`;

const SearchBox = styled.div`
  position: relative;
  input {
    width: 100%; padding: ${spacing[3]} ${spacing[4]} ${spacing[3]} ${spacing[10]};
    border: 1px solid ${colors.gray[300]}; border-radius: ${borders.radius.lg};
    font-size: ${typography.fontSize.sm}; font-family: ${typography.fontFamily.sans};
    &:focus { outline: none; border-color: ${colors.accent[500]}; box-shadow: 0 0 0 3px ${colors.accent[100]}; }
  }
  svg { position: absolute; left: ${spacing[3]}; top: 50%; transform: translateY(-50%); color: ${colors.gray[400]}; width: 18px; height: 18px; }
`;

const Dropdown = styled.div`
  border: 1px solid ${colors.gray[200]}; border-radius: ${borders.radius.lg};
  background: ${colors.white}; box-shadow: ${shadows.lg}; max-height: 240px; overflow-y: auto;
`;

const DropdownItem = styled.div`
  padding: ${spacing[3]} ${spacing[4]}; cursor: pointer;
  border-bottom: 1px solid ${colors.gray[50]};
  &:last-child { border-bottom: none; }
  &:hover { background: ${colors.gray[50]}; }
  .di-title { font-size: ${typography.fontSize.sm}; font-weight: 500; color: ${colors.gray[900]}; }
  .di-meta { font-size: 12px; color: ${colors.gray[500]}; }
`;

const EmptyMsg = styled.div`
  padding: ${spacing[4]}; text-align: center;
  font-size: ${typography.fontSize.sm}; color: ${colors.gray[400]};
`;

interface ReferenceFieldProps {
  name: string;
  label: string;
  value: string; // entry ID or slug
  onChange: (value: string) => void;
  required?: boolean;
  disabled?: boolean;
  helpText?: string;
  error?: string;
  referenceCollection?: string; // slug of the collection to reference
}

export function ReferenceField({
  name, label, value, onChange, required, disabled, helpText, error, referenceCollection,
}: ReferenceFieldProps) {
  const [entries, setEntries] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [selectedEntry, setSelectedEntry] = useState<any>(null);

  // Load entries from reference collection
  useEffect(() => {
    if (!referenceCollection) return;
    setLoading(true);
    api.getEntries(referenceCollection).then(({ data }) => {
      setEntries(data || []);
      // Resolve selected value
      if (value) {
        const found = (data || []).find((e: any) => e.id === value || e.slug === value);
        if (found) setSelectedEntry(found);
      }
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [referenceCollection]);

  // Update selected when value changes externally
  useEffect(() => {
    if (value && entries.length > 0) {
      const found = entries.find(e => e.id === value || e.slug === value);
      if (found) setSelectedEntry(found);
    } else if (!value) {
      setSelectedEntry(null);
    }
  }, [value, entries]);

  const filteredEntries = entries.filter(e =>
    (e.title || '').toLowerCase().includes(search.toLowerCase()) ||
    (e.slug || '').toLowerCase().includes(search.toLowerCase())
  );

  const handleSelect = (entry: any) => {
    setSelectedEntry(entry);
    onChange(entry.id);
    setIsOpen(false);
    setSearch('');
  };

  const handleClear = () => {
    setSelectedEntry(null);
    onChange('');
  };

  if (!referenceCollection) {
    return (
      <FieldWrapper label={label} name={name} required={required} error="No reference collection configured">
        <p style={{ fontSize: typography.fontSize.sm, color: colors.gray[500] }}>
          Configure the <code>referenceCollection</code> property for this field.
        </p>
      </FieldWrapper>
    );
  }

  return (
    <FieldWrapper
      label={label}
      name={name}
      required={required}
      helpText={helpText || `Links to an entry in "${referenceCollection}"`}
      error={error}
    >
      <Container>
        {selectedEntry ? (
          <Selected>
            <Link2 size={18} style={{ color: colors.accent[500], flexShrink: 0 }} />
            <div className="ref-info">
              <div className="ref-title">{selectedEntry.title || selectedEntry.slug}</div>
              <div className="ref-meta">{referenceCollection} / {selectedEntry.slug}</div>
            </div>
            <button onClick={handleClear} title="Remove reference" disabled={disabled}><X /></button>
          </Selected>
        ) : (
          <>
            <SearchBox>
              <Search />
              <input
                placeholder={`Search in ${referenceCollection}...`}
                value={search}
                onChange={e => { setSearch(e.target.value); setIsOpen(true); }}
                onFocus={() => setIsOpen(true)}
                disabled={disabled}
              />
            </SearchBox>

            {isOpen && (
              <Dropdown>
                {loading ? (
                  <EmptyMsg><Loader size={16} style={{ animation: 'spin 1s linear infinite' }} /></EmptyMsg>
                ) : filteredEntries.length === 0 ? (
                  <EmptyMsg>{search ? 'No entries match' : 'No entries in this collection'}</EmptyMsg>
                ) : (
                  filteredEntries.slice(0, 20).map(entry => (
                    <DropdownItem key={entry.id} onClick={() => handleSelect(entry)}>
                      <div className="di-title">{entry.title || 'Untitled'}</div>
                      <div className="di-meta">{entry.slug} · {entry.status}</div>
                    </DropdownItem>
                  ))
                )}
              </Dropdown>
            )}
          </>
        )}
      </Container>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </FieldWrapper>
  );
}
