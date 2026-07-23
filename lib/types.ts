// Shared data-model types. These mirror the JSON shapes under
// /public/data. Status is one of five values, produced by the aggregation
// script and never hand-set in the UI.

export type Status = 'Active' | 'Escalating' | 'Quiet' | 'Dormant' | 'Concluded';

export interface Headline {
  title: string;
  source: string;
  date: string;
}

export interface Movement {
  id: string;
  name: string;
  status: Status;
  active: boolean;
  region: string;
  location: string;
  year: number;
  logged: string;
  articleCount: number;
  updated: string;
  description: string;
  latestHeadlines: Headline[];
}

export interface MovementsIndex {
  lastUpdated: string | null;
  movements: Movement[];
}

export interface Article {
  title: string;
  source: string;
  url: string;
  date: string;
  excerpt: string;
}

export interface TimelineEvent {
  date: string;
  title: string;
  body: string;
}

export interface BackgroundBlock {
  type: 'h' | 'p';
  text: string;
}

export interface LegalCase {
  name: string;
  court: string;
  status: Status;
  label: string;
  summary: string;
  updated: string;
}

export interface Source {
  name: string;
  type: string;
  note: string;
}
