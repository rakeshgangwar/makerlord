export type Grade = 'verified' | 'sourced' | 'inferred';

export type Evidence =
  | { url: string; fetchedAt: string }
  | { toolCall: string };

export interface FeasibilityClaim {
  claim: string;
  grade: Grade;
  evidence?: Evidence;
}

export interface PriorArt {
  title: string;
  url: string;
  parts: string[];
}

export type Verdict =
  | 'buildable' | 'buildable-with-caveats'
  | 'buy-instead' | 'out-of-envelope';

export interface Feasibility {
  verdict: Verdict;
  claims: FeasibilityClaim[];
  priorArt: PriorArt[];
  roughCost?: { value: number; currency: string; grade: Grade };
}
