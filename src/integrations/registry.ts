import { canvasConnector } from './connectors/canvas';
import { csvConnector } from './connectors/csv';
import { mockConnector } from './connectors/mock';
import { iskoleConnector, itslearningConnector } from './connectors/partner-rest';
import { teamsConnector } from './connectors/teams';
import type { Connector, Platform } from './types';

/**
 * Register over alle connectorer. Ny plattform = ny fil i ./connectors
 * som implementerer Connector-grensesnittet + én linje her.
 */
export const connectors: Record<Platform, Connector<any>> = {
  teams: teamsConnector,
  itslearning: itslearningConnector,
  iskole: iskoleConnector,
  canvas: canvasConnector,
  csv: csvConnector,
  mock: mockConnector,
};

export function getConnector(platform: string): Connector<any> | null {
  return (connectors as Record<string, Connector<any>>)[platform] ?? null;
}
