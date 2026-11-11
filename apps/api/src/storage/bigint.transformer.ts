import { ValueTransformer } from 'typeorm';

// Postgres returns bigint as string; counters here stay well under 2^53.
export const bigintNumber: ValueTransformer = {
  from: (v: string | number | null) => (v == null ? null : Number(v)),
  to: (v: number | null) => v,
};
