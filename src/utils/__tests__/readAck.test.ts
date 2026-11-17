import { describe, expect, it } from 'vitest';
import { ackListForUser } from '../readAck';

describe('ackListForUser', () => {
  const data = {
    gradesAckIds: ['old'],
    gradesAckByUser: { mama: ['a', 'b'], papa: ['c'] },
  };

  it('liefert nur die eigenen Bestätigungen plus Altbestand', () => {
    expect(ackListForUser(data, 'gradesAckIds', 'gradesAckByUser', 'mama').sort()).toEqual(['a', 'b', 'old']);
    expect(ackListForUser(data, 'gradesAckIds', 'gradesAckByUser', 'papa').sort()).toEqual(['c', 'old']);
  });

  it('Abhaken durch eine Person gilt nicht für eine andere', () => {
    expect(ackListForUser(data, 'gradesAckIds', 'gradesAckByUser', 'oma')).toEqual(['old']);
  });

  it('ohne Benutzer oder Daten nur Altbestand bzw. leer', () => {
    expect(ackListForUser(data, 'gradesAckIds', 'gradesAckByUser', null)).toEqual(['old']);
    expect(ackListForUser(undefined, 'gradesAckIds', 'gradesAckByUser', 'mama')).toEqual([]);
  });
});
