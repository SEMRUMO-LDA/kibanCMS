/**
 * WeeklyScheduleField
 * Visual editor for a weekly recurring schedule. Stores value as:
 *   { mon: [{ start:"09:00", end:"18:00" }], tue: [...], ... }
 * Replaces the raw JSON textarea for weekly_schedule on bookable resources/tours.
 */

import { useMemo } from 'react';
import styled from 'styled-components';
import { Plus, X, Copy } from 'lucide-react';
import { colors, spacing, typography, borders, animations } from '../../shared/styles/design-tokens';
import { FieldWrapper } from './FieldWrapper';

type DayKey = 'sun' | 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat';
interface Window { start: string; end: string }
type WeeklySchedule = Partial<Record<DayKey, Window[]>>;

const DAYS: { key: DayKey; label: string }[] = [
  { key: 'mon', label: 'Mon' },
  { key: 'tue', label: 'Tue' },
  { key: 'wed', label: 'Wed' },
  { key: 'thu', label: 'Thu' },
  { key: 'fri', label: 'Fri' },
  { key: 'sat', label: 'Sat' },
  { key: 'sun', label: 'Sun' },
];

const Container = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${spacing[2]};
  padding: ${spacing[3]};
  background: ${colors.gray[50]};
  border: 1px solid ${colors.gray[200]};
  border-radius: ${borders.radius.md};
`;

const DayRow = styled.div`
  display: grid;
  grid-template-columns: 80px 1fr;
  gap: ${spacing[3]};
  padding: ${spacing[2]};
  background: ${colors.white};
  border: 1px solid ${colors.gray[200]};
  border-radius: ${borders.radius.md};
`;

const DayLabel = styled.div`
  font-size: ${typography.fontSize.sm};
  font-weight: ${typography.fontWeight.semibold};
  color: ${colors.gray[900]};
  display: flex;
  align-items: center;
`;

const WindowsColumn = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${spacing[2]};
`;

const WindowRow = styled.div`
  display: flex;
  align-items: center;
  gap: ${spacing[2]};
  flex-wrap: wrap;
`;

const TimeInput = styled.input`
  padding: ${spacing[1]} ${spacing[2]};
  font-size: ${typography.fontSize.sm};
  font-family: ${typography.fontFamily.sans};
  color: ${colors.gray[900]};
  background: ${colors.white};
  border: 1px solid ${colors.gray[300]};
  border-radius: ${borders.radius.md};
  width: 110px;
  transition: border ${animations.duration.fast} ${animations.easing.out};

  &:focus {
    outline: none;
    border-color: ${colors.accent[500]};
    box-shadow: 0 0 0 3px ${colors.focus};
  }
`;

const Dash = styled.span`
  color: ${colors.gray[500]};
  font-size: ${typography.fontSize.sm};
`;

const MutedButton = styled.button`
  display: inline-flex;
  align-items: center;
  gap: ${spacing[1]};
  padding: ${spacing[1]} ${spacing[2]};
  background: ${colors.white};
  color: ${colors.gray[600]};
  border: 1px solid ${colors.gray[300]};
  border-radius: ${borders.radius.md};
  font-size: ${typography.fontSize.xs};
  font-weight: ${typography.fontWeight.medium};
  font-family: ${typography.fontFamily.sans};
  cursor: pointer;
  transition: all ${animations.duration.fast} ${animations.easing.out};

  &:hover {
    border-color: ${colors.gray[400]};
    color: ${colors.gray[900]};
  }
`;

const AddButton = styled(MutedButton)`
  background: ${colors.gray[900]};
  color: ${colors.white};
  border-color: ${colors.gray[900]};
  &:hover { opacity: 0.85; color: ${colors.white}; }
`;

const ClosedLabel = styled.span`
  font-size: ${typography.fontSize.xs};
  color: ${colors.gray[500]};
  font-style: italic;
`;

const Toolbar = styled.div`
  display: flex;
  justify-content: flex-end;
  gap: ${spacing[2]};
  margin-top: ${spacing[1]};
`;

interface WeeklyScheduleFieldProps {
  name: string;
  label: string;
  value: unknown;
  onChange: (value: WeeklySchedule) => void;
  required?: boolean;
  disabled?: boolean;
  helpText?: string;
  error?: string;
}

function parseValue(value: unknown): WeeklySchedule {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value as WeeklySchedule;
  if (typeof value === 'string' && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed as WeeklySchedule;
    } catch { /* fall through */ }
  }
  return {};
}

export function WeeklyScheduleField({
  name,
  label,
  value,
  onChange,
  required,
  disabled,
  helpText,
  error,
}: WeeklyScheduleFieldProps) {
  const schedule = useMemo(() => parseValue(value), [value]);

  const update = (next: WeeklySchedule) => {
    // Drop days with empty window arrays to keep JSON clean
    const clean: WeeklySchedule = {};
    for (const day of DAYS) {
      const windows = next[day.key];
      if (windows && windows.length > 0) clean[day.key] = windows;
    }
    onChange(clean);
  };

  const addWindow = (day: DayKey) => {
    const windows = schedule[day] || [];
    const defaultWindow: Window = windows.length > 0
      ? { start: windows[windows.length - 1].end, end: '18:00' }
      : { start: '09:00', end: '18:00' };
    update({ ...schedule, [day]: [...windows, defaultWindow] });
  };

  const removeWindow = (day: DayKey, index: number) => {
    const windows = (schedule[day] || []).filter((_, i) => i !== index);
    update({ ...schedule, [day]: windows });
  };

  const editWindow = (day: DayKey, index: number, key: 'start' | 'end', next: string) => {
    const windows = [...(schedule[day] || [])];
    windows[index] = { ...windows[index], [key]: next };
    update({ ...schedule, [day]: windows });
  };

  const applyWeekdays = () => {
    // Copy Monday's schedule to Tue-Fri
    const mon = schedule.mon;
    if (!mon || mon.length === 0) return;
    update({ ...schedule, tue: mon, wed: mon, thu: mon, fri: mon });
  };

  const clearAll = () => {
    if (!confirm('Clear all windows for every day?')) return;
    update({});
  };

  return (
    <FieldWrapper label={label} name={name} required={required} helpText={helpText} error={error}>
      <Container>
        {DAYS.map(day => {
          const windows = schedule[day.key] || [];
          return (
            <DayRow key={day.key}>
              <DayLabel>{day.label}</DayLabel>
              <WindowsColumn>
                {windows.length === 0 && <ClosedLabel>Closed</ClosedLabel>}
                {windows.map((w, i) => (
                  <WindowRow key={i}>
                    <TimeInput
                      type="time"
                      value={w.start}
                      onChange={e => editWindow(day.key, i, 'start', e.target.value)}
                      disabled={disabled}
                      aria-label={`${day.label} window ${i + 1} start`}
                    />
                    <Dash>→</Dash>
                    <TimeInput
                      type="time"
                      value={w.end}
                      onChange={e => editWindow(day.key, i, 'end', e.target.value)}
                      disabled={disabled}
                      aria-label={`${day.label} window ${i + 1} end`}
                    />
                    <MutedButton
                      type="button"
                      onClick={() => removeWindow(day.key, i)}
                      disabled={disabled}
                      aria-label={`Remove ${day.label} window ${i + 1}`}
                    >
                      <X size={12} />
                    </MutedButton>
                  </WindowRow>
                ))}
                <WindowRow>
                  <AddButton type="button" onClick={() => addWindow(day.key)} disabled={disabled}>
                    <Plus size={12} /> Add window
                  </AddButton>
                </WindowRow>
              </WindowsColumn>
            </DayRow>
          );
        })}

        <Toolbar>
          <MutedButton type="button" onClick={applyWeekdays} disabled={disabled} title="Copy Monday to Tue-Fri">
            <Copy size={12} /> Apply Mon → Tue-Fri
          </MutedButton>
          <MutedButton type="button" onClick={clearAll} disabled={disabled}>
            Clear all
          </MutedButton>
        </Toolbar>
      </Container>
    </FieldWrapper>
  );
}
