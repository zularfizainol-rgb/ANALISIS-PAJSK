export interface AggregatePajskData {
  tahun: number;
  aliran: string;
  jumlahPelajar: number;
  gredA: number;
  gredB: number;
  gredC: number;
  gredD: number;
  gredE: number;
  gredTL: number;
}

export type ViewMode = 'yearly' | 'comparison';
