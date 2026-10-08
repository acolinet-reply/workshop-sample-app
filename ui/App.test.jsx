import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { BookingForm, findOverlapHint } from './App.jsx';

const room = { id: 'cedar', name: 'Cedar', capacity: 4 };
const date = '2030-06-12';

const existingBooking = {
  id: 'existing-1',
  roomId: 'cedar',
  title: 'Design review',
  organizer: 'Sam Rivera',
  startTime: '2030-06-12T10:00:00Z',
  endTime: '2030-06-12T11:00:00Z',
};

function setTimes(startValue, endValue) {
  fireEvent.change(screen.getByTestId('booking-form-start-time'), { target: { value: startValue } });
  fireEvent.change(screen.getByTestId('booking-form-end-time'), { target: { value: endValue } });
}

afterEach(cleanup);

describe('findOverlapHint (req-inline-advisory-hint)', () => {
  test('returns the conflicting booking for a strictly overlapping range', () => {
    const hint = findOverlapHint([existingBooking], 'cedar', '10:30', '11:30', date);
    expect(hint).toBe(existingBooking);
  });

  test('returns null when the range does not overlap anything', () => {
    expect(findOverlapHint([existingBooking], 'cedar', '08:00', '09:00', date)).toBeNull();
  });

  test('returns null for a back-to-back range starting exactly when the existing booking ends', () => {
    expect(findOverlapHint([existingBooking], 'cedar', '11:00', '12:00', date)).toBeNull();
  });

  test('returns null for a back-to-back range ending exactly when the existing booking starts', () => {
    expect(findOverlapHint([existingBooking], 'cedar', '09:00', '10:00', date)).toBeNull();
  });

  test('returns null while either time field is incomplete', () => {
    expect(findOverlapHint([existingBooking], 'cedar', '', '11:30', date)).toBeNull();
  });

  test('returns null for a different room even with an identical overlapping window', () => {
    expect(findOverlapHint([existingBooking], 'maple', '10:30', '11:30', date)).toBeNull();
  });
});

describe('BookingForm inline advisory hint (story-inline-advisory-hint)', () => {
  test('shows a non-blocking hint naming the conflicting booking, keeping Confirm enabled', () => {
    render(<BookingForm room={room} date={date} bookings={[existingBooking]} onBooked={vi.fn()} />);
    setTimes('10:30', '11:30');
    expect(screen.getByTestId('booking-form-overlap-hint').textContent).toBe(
      'cedar is already booked 10:00-11:00 for "Design review".'
    );
    expect(screen.getByRole('button', { name: /confirm booking/i }).disabled).toBe(false);
  });

  test('shows no hint for a non-overlapping range', () => {
    render(<BookingForm room={room} date={date} bookings={[existingBooking]} onBooked={vi.fn()} />);
    setTimes('08:00', '09:00');
    expect(screen.queryByTestId('booking-form-overlap-hint')).toBeNull();
  });

  test('shows no hint for a back-to-back range starting when the existing booking ends', () => {
    render(<BookingForm room={room} date={date} bookings={[existingBooking]} onBooked={vi.fn()} />);
    setTimes('11:00', '12:00');
    expect(screen.queryByTestId('booking-form-overlap-hint')).toBeNull();
  });
});

describe('BookingForm 409 conflict display (story-browser-conflict-display)', () => {
  beforeEach(() => {
    global.fetch = vi.fn();
  });

  test('renders the server conflict message and preserves typed field values', async () => {
    global.fetch.mockResolvedValue({
      ok: false,
      json: async () => ({ error: 'cedar is already booked 09:00-10:00 for "Design review".' }),
    });
    render(<BookingForm room={room} date={date} bookings={[]} onBooked={vi.fn()} />);
    fireEvent.change(screen.getByPlaceholderText(/product brainstorm/i), { target: { value: 'Budget sync' } });
    fireEvent.change(screen.getByPlaceholderText(/alex morgan/i), { target: { value: 'Jamie Lee' } });

    fireEvent.click(screen.getByRole('button', { name: /confirm booking/i }));

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toBe('cedar is already booked 09:00-10:00 for "Design review".');
    expect(screen.getByPlaceholderText(/product brainstorm/i).value).toBe('Budget sync');
    expect(screen.getByPlaceholderText(/alex morgan/i).value).toBe('Jamie Lee');
  });
});

describe('BookingForm success path (story-preserve-success-path regression)', () => {
  beforeEach(() => {
    global.fetch = vi.fn();
  });

  test('resets the controlled start/end time inputs after a successful booking', async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'new-1', roomId: 'cedar', title: 'Budget sync', organizer: 'Jamie Lee', startTime: '2030-06-12T13:00:00Z', endTime: '2030-06-12T14:00:00Z' }),
    });
    const onBooked = vi.fn();
    render(<BookingForm room={room} date={date} bookings={[]} onBooked={onBooked} />);
    fireEvent.change(screen.getByPlaceholderText(/product brainstorm/i), { target: { value: 'Budget sync' } });
    fireEvent.change(screen.getByPlaceholderText(/alex morgan/i), { target: { value: 'Jamie Lee' } });
    setTimes('13:00', '14:00');

    fireEvent.click(screen.getByRole('button', { name: /confirm booking/i }));

    await vi.waitFor(() => expect(onBooked).toHaveBeenCalledTimes(1));
    expect(screen.getByTestId('booking-form-start-time').value).toBe('09:00');
    expect(screen.getByTestId('booking-form-end-time').value).toBe('10:00');
  });
});
